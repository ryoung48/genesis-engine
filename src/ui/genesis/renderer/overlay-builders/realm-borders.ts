import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import {
	appendProjectedSegment,
	TERRAIN_ELEVATION_SCALE,
} from "@/ui/genesis/renderer/overlay-builders/shared"
import type {
	CreateBorderLinesParams,
	GenesisViewMode,
	RealmBorderLayer,
	RealmBordersSpec,
} from "@/ui/genesis/renderer/types"

interface RealmBoundarySide {
	r0: number
	r1: number
	landRegions: number[]
	from: number
	to: number
}

const GLOBE_LAYER_RADIUS_STEP = 0.0008
const MAP_LAYER_Z_STEP = 0.001
const GLOBE_DASH_SIZE = 0.005
const MAP_DASH_SIZE = 0.003
const DASH_GAP_RATIO = 0.5
const MARKER_OUTLINE_SCALE = 1.45
const OUTLINE_COLOR = new THREE.Color(0.04, 0.04, 0.04)

function createCircleTexture(): THREE.CanvasTexture | null {
	if (typeof document === "undefined") return null
	const size = 64
	const canvas = document.createElement("canvas")
	canvas.width = size
	canvas.height = size
	const context = canvas.getContext("2d")
	if (!context) return null
	context.beginPath()
	context.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
	context.fillStyle = "white"
	context.fill()
	return new THREE.CanvasTexture(canvas)
}

function createGlobeMarkers(
	layer: RealmBorderLayer,
	spec: RealmBordersSpec,
	radiusFor: (region: number) => number,
): THREE.Points[] {
	if (layer.markerRegions.length === 0) return []
	const { r_xyz } = spec.world.mesh
	const positions = new Float32Array(layer.markerRegions.length * 3)
	layer.markerRegions.forEach((region, index) => {
		const x = r_xyz[3 * region]
		const y = r_xyz[3 * region + 1]
		const z = r_xyz[3 * region + 2]
		const scale = radiusFor(region) / (Math.hypot(x, y, z) || 1)
		positions[3 * index] = x * scale
		positions[3 * index + 1] = y * scale
		positions[3 * index + 2] = z * scale
	})
	const texture = createCircleTexture()
	const make = (color: THREE.Color, size: number, order: number) => {
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
		const points = new THREE.Points(
			geometry,
			new THREE.PointsMaterial({
				color,
				size,
				sizeAttenuation: true,
				...(texture ? { map: texture, alphaTest: 0.5 } : {}),
				transparent: true,
				depthWrite: false,
			}),
		)
		points.renderOrder = order
		return points
	}
	return [
		make(OUTLINE_COLOR, layer.globeMarkerSize * MARKER_OUTLINE_SCALE, 10),
		make(
			new THREE.Color(
				layer.markerColor[0],
				layer.markerColor[1],
				layer.markerColor[2],
			),
			layer.globeMarkerSize,
			11,
		),
	]
}

function createMapMarkers(
	layer: RealmBorderLayer,
	spec: RealmBordersSpec,
	projection: ReturnType<typeof createMapProjection>,
	z: number,
): THREE.InstancedMesh[] {
	if (layer.markerRegions.length === 0) return []
	const { r_xyz } = spec.world.mesh
	const count = layer.markerRegions.length
	const geometry = new THREE.CircleGeometry(1, 20)
	const fill = new THREE.InstancedMesh(
		geometry,
		new THREE.MeshBasicMaterial({
			color: new THREE.Color(
				layer.markerColor[0],
				layer.markerColor[1],
				layer.markerColor[2],
			),
			depthWrite: false,
		}),
		count,
	)
	const outline = new THREE.InstancedMesh(
		geometry,
		new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, depthWrite: false }),
		count,
	)
	const matrix = new THREE.Matrix4()
	const position = new THREE.Vector3()
	const scale = new THREE.Vector3()
	const rotation = new THREE.Quaternion()
	layer.markerRegions.forEach((region, index) => {
		const length =
			Math.hypot(
				r_xyz[3 * region],
				r_xyz[3 * region + 1],
				r_xyz[3 * region + 2],
			) || 1
		const geo = projection.projectCartesian(
			r_xyz[3 * region] / length,
			r_xyz[3 * region + 1] / length,
			r_xyz[3 * region + 2] / length,
		)
		const projected = projection.projectRadians(geo.lon, geo.lat, z)
		position.set(projected[0], projected[1], projected[2])
		scale.set(layer.mapMarkerRadius, layer.mapMarkerRadius, 1)
		fill.setMatrixAt(index, matrix.compose(position, rotation, scale))
		position.z = z - 0.0002
		scale.set(
			layer.mapMarkerRadius * MARKER_OUTLINE_SCALE,
			layer.mapMarkerRadius * MARKER_OUTLINE_SCALE,
			1,
		)
		outline.setMatrixAt(index, matrix.compose(position, rotation, scale))
	})
	fill.instanceMatrix.needsUpdate = true
	outline.instanceMatrix.needsUpdate = true
	return [outline, fill]
}

function chainBoundarySides(sides: RealmBoundarySide[]): RealmBoundarySide[] {
	const incident = new Map<number, number[]>()
	sides.forEach((side, index) => {
		for (const vertex of [side.from, side.to]) {
			const list = incident.get(vertex)
			if (list) list.push(index)
			else incident.set(vertex, [index])
		}
	})
	const used = new Uint8Array(sides.length)
	const ordered: RealmBoundarySide[] = []
	const walk = (startIndex: number, startVertex: number) => {
		let index = startIndex
		let vertex = startVertex
		while (index >= 0) {
			used[index] = 1
			const side = sides[index]
			const forward = side.from === vertex
			ordered.push(forward ? side : { ...side, from: side.to, to: side.from })
			vertex = forward ? side.to : side.from
			index = incident.get(vertex)?.find((candidate) => !used[candidate]) ?? -1
		}
	}
	for (const [vertex, list] of incident)
		if (list.length === 1 && !used[list[0]]) walk(list[0], vertex)
	for (let index = 0; index < sides.length; index++)
		if (!used[index]) walk(index, sides[index].from)
	return ordered
}

function forEachRealmBoundarySide(
	spec: RealmBordersSpec,
	layer: RealmBorderLayer,
	visit: (side: RealmBoundarySide) => void,
) {
	const { mesh, provinces } = spec.world
	if (!provinces) return
	const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t } = mesh
	const { regionProvince } = provinces
	const sides: RealmBoundarySide[] = []
	for (let side = 0; side < numSides; side++) {
		const opposite = halfedges[side]
		if (opposite < 0 || side > opposite) continue
		const r0 = s_begin_r[side]
		const r1 = s_begin_r[opposite]
		const land0 = regionProvince[r0] >= 0
		const land1 = regionProvince[r1] >= 0
		if (!land0 && !land1) continue
		if (land0 && land1) {
			const realm0 = layer.regionRealm[r0]
			const realm1 = layer.regionRealm[r1]
			if (realm0 === realm1) continue
			if (
				layer.regionGroup &&
				(realm0 < 0 ||
					realm1 < 0 ||
					layer.regionGroup[r0] !== layer.regionGroup[r1])
			)
				continue
		} else if (layer.regionGroup || layer.regionRealm[land0 ? r0 : r1] < 0)
			continue
		const from = s_inner_t[side]
		const to = s_outer_t[side]
		if (from < 0 || to < 0) continue
		sides.push({
			r0,
			r1,
			landRegions: land0 && land1 ? [r0, r1] : [land0 ? r0 : r1],
			from,
			to,
		})
	}
	for (const side of chainBoundarySides(sides)) visit(side)
}

function createBorderLines({
	positions,
	layer,
	canvas,
	dashSize,
}: CreateBorderLinesParams): LineSegments2 | null {
	if (positions.length === 0) return null
	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(positions)
	const material = new LineMaterial({
		color: new THREE.Color(layer.color[0], layer.color[1], layer.color[2]),
		linewidth: layer.linewidth,
		resolution: new THREE.Vector2(
			canvas.clientWidth || 1,
			canvas.clientHeight || 1,
		),
		transparent: true,
		opacity: 1,
		depthWrite: false,
		dashed: layer.dashed,
		dashSize,
		gapSize: dashSize * DASH_GAP_RATIO,
	})
	const lines = new LineSegments2(geometry, material)
	lines.computeLineDistances()
	return lines
}

export function buildGlobeRealmBorders(
	spec: RealmBordersSpec,
	viewMode: GenesisViewMode,
	canvas: HTMLCanvasElement,
	elevationVisible: boolean,
): THREE.Group | null {
	const { elevation, mesh } = spec.world
	const { t_xyz } = mesh
	const baseRadius = elevationVisible ? 1.006 : 1.003
	const group = new THREE.Group()
	spec.layers.forEach((layer, index) => {
		const positions: number[] = []
		forEachRealmBoundarySide(spec, layer, ({ landRegions, from, to }) => {
			const averageElevation =
				landRegions.reduce((sum, region) => sum + elevation[region], 0) /
				landRegions.length
			const elevationFactor = elevationVisible
				? averageElevation > 0
					? averageElevation * TERRAIN_ELEVATION_SCALE
					: averageElevation * TERRAIN_ELEVATION_SCALE * 0.3
				: 0
			const radius =
				baseRadius + GLOBE_LAYER_RADIUS_STEP * (index + 1) + elevationFactor
			positions.push(
				t_xyz[3 * from] * radius,
				t_xyz[3 * from + 1] * radius,
				t_xyz[3 * from + 2] * radius,
				t_xyz[3 * to] * radius,
				t_xyz[3 * to + 1] * radius,
				t_xyz[3 * to + 2] * radius,
			)
		})
		const lines = createBorderLines({
			positions,
			layer,
			canvas,
			dashSize: GLOBE_DASH_SIZE,
		})
		if (lines) group.add(lines)
		const markerRadius = (region: number) => {
			const averageElevation = elevation[region]
			const elevationFactor = elevationVisible
				? averageElevation > 0
					? averageElevation * TERRAIN_ELEVATION_SCALE
					: averageElevation * TERRAIN_ELEVATION_SCALE * 0.3
				: 0
			return (
				baseRadius +
				GLOBE_LAYER_RADIUS_STEP * (index + 1) +
				0.0004 +
				elevationFactor
			)
		}
		for (const marker of createGlobeMarkers(layer, spec, markerRadius))
			group.add(marker)
	})
	if (group.children.length === 0) return null
	group.visible = viewMode === "globe"
	return group
}

export function buildMapRealmBorders(
	spec: RealmBordersSpec,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	viewMode: GenesisViewMode,
	canvas: HTMLCanvasElement,
): THREE.Group | null {
	const { t_xyz } = spec.world.mesh
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const group = new THREE.Group()
	spec.layers.forEach((layer, index) => {
		const positions: number[] = []
		const z = 0.02 + MAP_LAYER_Z_STEP * index
		forEachRealmBoundarySide(spec, layer, ({ from, to }) => {
			const a = projection.projectCartesian(
				t_xyz[3 * from],
				t_xyz[3 * from + 1],
				t_xyz[3 * from + 2],
			)
			const b = projection.projectCartesian(
				t_xyz[3 * to],
				t_xyz[3 * to + 1],
				t_xyz[3 * to + 2],
			)
			appendProjectedSegment(
				positions,
				projection,
				{ lon: a.lon, lat: a.lat },
				{ lon: b.lon, lat: b.lat },
				z,
			)
		})
		const lines = createBorderLines({
			positions,
			layer,
			canvas,
			dashSize: MAP_DASH_SIZE,
		})
		if (lines) group.add(lines)
		for (const marker of createMapMarkers(layer, spec, projection, z + 0.0005))
			group.add(marker)
	})
	if (group.children.length === 0) return null
	group.visible = viewMode === "map"
	return group
}
