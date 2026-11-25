import * as THREE from "three"
import { OASES } from "@/model/geography/terrain/groundwater/oases"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { uiWaterSymbols } from "@/ui/components/tokens"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import type {
	BuildGlobeWaterSymbolsInput,
	BuildMapWaterSymbolsInput,
	WaterSymbolData,
} from "@/ui/genesis/renderer/types"
import {
	WATER_DOT_COLORS,
	WATER_DOT_KEYS,
} from "@/ui/genesis/shared/region-colors/palette"

function keyIndex(key: (typeof WATER_DOT_KEYS)[number]): number {
	return WATER_DOT_KEYS.indexOf(key)
}

export function buildWaterSymbolData({
	r_xyz,
	spring,
	oasis,
	isLand,
}: {
	r_xyz: Float32Array
	spring: Uint8Array
	oasis: Uint8Array
	isLand: Uint8Array
}): WaterSymbolData {
	const key: number[] = []
	const side: number[] = []
	const positions: number[] = []
	const push = ({
		region,
		dot,
		offset,
	}: {
		region: number
		dot: (typeof WATER_DOT_KEYS)[number]
		offset: number
	}) => {
		positions.push(
			r_xyz[3 * region],
			r_xyz[3 * region + 1],
			r_xyz[3 * region + 2],
		)
		key.push(keyIndex(dot))
		side.push(offset)
	}
	for (let r = 0; r < isLand.length; r++) {
		if (!isLand[r]) continue
		const springKind = SPRINGS.kinds[spring[r]]
		const oasisKind = OASES.kinds[oasis[r]]
		const hasSpring = springKind !== "none"
		const hasOasis = oasisKind !== "none"
		if (hasSpring)
			push({ region: r, dot: springKind, offset: hasOasis ? -1 : 0 })
		if (hasOasis) push({ region: r, dot: oasisKind, offset: hasSpring ? 1 : 0 })
	}
	return {
		r_xyz: Float32Array.from(positions),
		key: Uint8Array.from(key),
		side: Int8Array.from(side),
	}
}

const DOT_SIDES = 10

function dotTriangles({
	data,
	keyIndex: wanted,
}: {
	data: WaterSymbolData
	keyIndex: number
}): THREE.Vector3[] {
	const triangles: THREE.Vector3[] = []
	for (let i = 0; i < data.key.length; i++) {
		if (data.key[i] !== wanted) continue
		const center = new THREE.Vector3(
			data.r_xyz[3 * i],
			data.r_xyz[3 * i + 1],
			data.r_xyz[3 * i + 2],
		).normalize()
		const helper =
			Math.abs(center.z) > 0.9
				? new THREE.Vector3(1, 0, 0)
				: new THREE.Vector3(0, 0, 1)
		const east = new THREE.Vector3().crossVectors(helper, center).normalize()
		const north = new THREE.Vector3().crossVectors(center, east).normalize()
		const shifted = center
			.clone()
			.addScaledVector(east, data.side[i] * uiWaterSymbols.radiusRad * 1.1)
			.normalize()
		const outline: THREE.Vector3[] = []
		for (let k = 0; k < DOT_SIDES; k++) {
			const angle = (2 * Math.PI * k) / DOT_SIDES
			outline.push(
				shifted
					.clone()
					.addScaledVector(east, Math.cos(angle) * uiWaterSymbols.radiusRad)
					.addScaledVector(north, Math.sin(angle) * uiWaterSymbols.radiusRad)
					.normalize(),
			)
		}
		for (let k = 0; k < DOT_SIDES; k++)
			triangles.push(shifted, outline[k], outline[(k + 1) % DOT_SIDES])
	}
	return triangles
}

function colorHex(index: number): number {
	const [r, g, b] = WATER_DOT_COLORS[WATER_DOT_KEYS[index]]
	return new THREE.Color(r, g, b).getHex()
}

function createDots({
	positions,
	color,
	visible,
}: {
	positions: number[]
	color: number
	visible: boolean
}): THREE.Mesh | null {
	if (positions.length === 0) return null
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
	)
	const material = new THREE.MeshBasicMaterial({
		color,
		side: THREE.DoubleSide,
		depthWrite: false,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.visible = visible
	return mesh
}

function collect(dots: Array<THREE.Mesh | null>): THREE.Group | null {
	const present = dots.filter((dot): dot is THREE.Mesh => dot !== null)
	if (present.length === 0) return null
	const group = new THREE.Group()
	for (const dot of present) group.add(dot)
	return group
}

export function buildGlobeWaterSymbols({
	data,
	viewMode,
	elevationVisible,
}: BuildGlobeWaterSymbolsInput): THREE.Group | null {
	const radius = elevationVisible
		? uiWaterSymbols.raisedGlobeRadius
		: uiWaterSymbols.globeRadius
	return collect(
		WATER_DOT_KEYS.map((_, index) =>
			createDots({
				positions: dotTriangles({ data, keyIndex: index }).flatMap((point) =>
					point.clone().multiplyScalar(radius).toArray(),
				),
				color: colorHex(index),
				visible: viewMode === "globe",
			}),
		),
	)
}

export function buildMapWaterSymbols({
	data,
	viewMode,
	projectionLatitudeDeg,
}: BuildMapWaterSymbolsInput): THREE.Group | null {
	const projection = createMapProjection(0, projectionLatitudeDeg)
	return collect(
		WATER_DOT_KEYS.map((_, index) => {
			const triangles = dotTriangles({ data, keyIndex: index })
			const positions: number[] = []
			for (let i = 0; i < triangles.length; i += 3) {
				const center = projection.projectCartesian(
					triangles[i].x,
					triangles[i].y,
					triangles[i].z,
				)
				for (let k = 0; k < 3; k++) {
					const point = projection.projectCartesian(
						triangles[i + k].x,
						triangles[i + k].y,
						triangles[i + k].z,
					)
					let lon = point.lon
					if (lon - center.lon > Math.PI) lon -= 2 * Math.PI
					else if (center.lon - lon > Math.PI) lon += 2 * Math.PI
					positions.push(
						...projection.projectRadians(
							lon,
							point.lat,
							uiWaterSymbols.mapDepth,
						),
					)
				}
			}
			return createDots({
				positions,
				color: colorHex(index),
				visible: viewMode === "map",
			})
		}),
	)
}
