import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { SerializedGenesisWorld } from "@/model/transport/types"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import type {
	BuildSelectedProvinceBorderGlobeParams,
	BuildSelectedProvinceBorderMapParams,
	CollectProvinceBorderMapPositionsParams,
	CreateLineSegmentsParams,
} from "@/ui/planet/renderer/types"

const TERRAIN_ELEVATION_SCALE = 0.04

interface ProvinceBoundarySide {
	r0: number
	r1: number
	tInner: number
	tOuter: number
}

function forEachProvinceBoundarySide(
	world: SerializedGenesisWorld,
	province: number,
	visit: (side: ProvinceBoundarySide) => void,
) {
	const { mesh } = world
	const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t } = mesh
	const { regionProvince } = world.provinces!

	for (let side = 0; side < numSides; side++) {
		const opposite = halfedges[side]
		if (opposite < 0 || side > opposite) continue
		const r0 = s_begin_r[side]
		const r1 = s_begin_r[opposite]
		const provinceA = regionProvince[r0]
		const provinceB = regionProvince[r1]
		if (
			provinceA === provinceB ||
			(provinceA !== province && provinceB !== province)
		) {
			continue
		}

		const tInner = s_inner_t[side]
		const tOuter = s_outer_t[side]
		if (tInner < 0 || tOuter < 0) continue

		visit({ r0, r1, tInner, tOuter })
	}
}

function createLineSegments({
	positions,
	color,
	opacity,
	visible,
	opts,
}: CreateLineSegmentsParams) {
	if (positions.length === 0) return null
	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(positions)
	const material = new LineMaterial({
		color,
		linewidth: opts?.lineWidth ?? 4,
		resolution: new THREE.Vector2(
			opts?.resolution?.[0] ?? 1,
			opts?.resolution?.[1] ?? 1,
		),
		transparent: true,
		opacity,
		depthWrite: false,
		depthTest: false,
	})
	const lines = new LineSegments2(geometry, material)
	lines.computeLineDistances()
	lines.visible = visible
	lines.renderOrder = 997
	return lines
}

function appendProjectedSegment(
	positions: number[],
	projection: ReturnType<typeof createMapProjection>,
	start: { lon: number; lat: number },
	end: { lon: number; lat: number },
	z: number,
) {
	const a = projection.projectRadians(start.lon, start.lat, z)
	const b = projection.projectRadians(end.lon, end.lat, z)
	positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
}

export function collectProvinceBorderGlobePositions(
	world: SerializedGenesisWorld,
	province: number,
	radiusBoost: number,
	elevationVisible: boolean,
) {
	if (!world.provinces) return []
	const positions: number[] = []
	const { elevation, mesh } = world
	const { t_xyz } = mesh
	const baseRadius = elevationVisible ? 1.006 : 1.003

	forEachProvinceBoundarySide(world, province, ({ r0, r1, tInner, tOuter }) => {
		const averageElevation = (elevation[r0] + elevation[r1]) * 0.5
		const elevationFactor = elevationVisible
			? averageElevation > 0
				? averageElevation * TERRAIN_ELEVATION_SCALE
				: averageElevation * TERRAIN_ELEVATION_SCALE * 0.3
			: 0
		const radius = baseRadius + radiusBoost + elevationFactor
		positions.push(
			t_xyz[3 * tInner] * radius,
			t_xyz[3 * tInner + 1] * radius,
			t_xyz[3 * tInner + 2] * radius,
			t_xyz[3 * tOuter] * radius,
			t_xyz[3 * tOuter + 1] * radius,
			t_xyz[3 * tOuter + 2] * radius,
		)
	})

	return positions
}

export function collectProvinceBorderMapPositions({
	world,
	province,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	zBoost,
}: CollectProvinceBorderMapPositionsParams) {
	if (!world.provinces) return []
	const positions: number[] = []
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { t_xyz } = world.mesh
	const z = 0.003 + zBoost

	const writeSegment = (
		lon0: number,
		lat0: number,
		lon1: number,
		lat1: number,
	) => {
		appendProjectedSegment(
			positions,
			projection,
			{ lon: lon0, lat: lat0 },
			{ lon: lon1, lat: lat1 },
			z,
		)
	}

	forEachProvinceBoundarySide(world, province, ({ tInner, tOuter }) => {
		const a = projection.projectCartesian(
			t_xyz[3 * tInner],
			t_xyz[3 * tInner + 1],
			t_xyz[3 * tInner + 2],
		)
		const b = projection.projectCartesian(
			t_xyz[3 * tOuter],
			t_xyz[3 * tOuter + 1],
			t_xyz[3 * tOuter + 2],
		)
		let lon0 = a.lon
		let lon1 = b.lon
		if (Math.abs(lon1 - lon0) > Math.PI) {
			if (lon0 < lon1) lon0 += 2 * Math.PI
			else lon1 += 2 * Math.PI
			writeSegment(lon0, a.lat, lon1, b.lat)
			writeSegment(lon0 - 2 * Math.PI, a.lat, lon1 - 2 * Math.PI, b.lat)
		} else {
			writeSegment(lon0, a.lat, lon1, b.lat)
		}
	})

	return positions
}

export function buildSelectedProvinceBorderGlobe({
	world,
	province,
	viewMode,
	elevationVisible,
	opts,
}: BuildSelectedProvinceBorderGlobeParams) {
	const positions = collectProvinceBorderGlobePositions(
		world,
		province,
		opts?.radiusBoost ?? 0,
		elevationVisible,
	)
	return createLineSegments({
		positions,
		color: opts?.color ?? 0xf8fafc,
		opacity: opts?.opacity ?? 0.95,
		visible: viewMode === "globe",
		opts: { lineWidth: opts?.lineWidth, resolution: opts?.resolution },
	})
}

export function buildSelectedProvinceBorderMap({
	world,
	province,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	viewMode,
	opts,
}: BuildSelectedProvinceBorderMapParams) {
	const positions = collectProvinceBorderMapPositions({
		world,
		province,
		centerLongitudeDeg,
		projectionLatitudeDeg,
		zBoost: opts?.zBoost ?? 0,
	})
	return createLineSegments({
		positions,
		color: opts?.color ?? 0xf8fafc,
		opacity: opts?.opacity ?? 0.95,
		visible: viewMode === "map",
		opts: { lineWidth: opts?.lineWidth, resolution: opts?.resolution },
	})
}
