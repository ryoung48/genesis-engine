import * as THREE from "three"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import type {
	BuildGlobeDotsInput,
	BuildMapDotsInput,
	DotSymbolData,
} from "@/ui/genesis/renderer/types"

const DOT_SIDES = 10
const RING_SIDES = 28
const RING_SCALE = 1
const RING_INNER = 0.6
const SIDE_SPACING = 1.1
const NO_RINGS: ReadonlySet<number> = new Set()

function dotTriangles({
	data,
	keyIndex,
	radiusRad,
	ring,
}: {
	data: DotSymbolData
	keyIndex: number
	radiusRad: number
	ring: boolean
}): THREE.Vector3[] {
	const triangles: THREE.Vector3[] = []
	for (let i = 0; i < data.key.length; i++) {
		if (data.key[i] !== keyIndex) continue
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
			.addScaledVector(east, data.side[i] * radiusRad * SIDE_SPACING)
			.normalize()
		const sides = ring ? RING_SIDES : DOT_SIDES
		const outerRad = ring ? radiusRad * RING_SCALE : radiusRad
		const around = (rad: number, k: number) => {
			const angle = (2 * Math.PI * k) / sides
			return shifted
				.clone()
				.addScaledVector(east, Math.cos(angle) * rad)
				.addScaledVector(north, Math.sin(angle) * rad)
				.normalize()
		}
		if (ring) {
			const innerRad = outerRad * RING_INNER
			for (let k = 0; k < sides; k++) {
				const outerA = around(outerRad, k)
				const outerB = around(outerRad, k + 1)
				const innerA = around(innerRad, k)
				const innerB = around(innerRad, k + 1)
				triangles.push(outerA, outerB, innerA, innerA, outerB, innerB)
			}
			continue
		}
		for (let k = 0; k < sides; k++)
			triangles.push(shifted, around(outerRad, k), around(outerRad, k + 1))
	}
	return triangles
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

function rgbHex(rgb: readonly [number, number, number]): number {
	return new THREE.Color(rgb[0], rgb[1], rgb[2]).getHex()
}

function buildGlobeDots({
	data,
	colors,
	ringKeys,
	radiusRad,
	globeRadius,
	viewMode,
}: BuildGlobeDotsInput): THREE.Group | null {
	return collect(
		colors.map((color, keyIndex) =>
			createDots({
				positions: dotTriangles({
					data,
					keyIndex,
					radiusRad,
					ring: ringKeys.has(keyIndex),
				}).flatMap((point) =>
					point.clone().multiplyScalar(globeRadius).toArray(),
				),
				color,
				visible: viewMode === "globe",
			}),
		),
	)
}

function buildMapDots({
	data,
	colors,
	ringKeys,
	radiusRad,
	mapDepth,
	viewMode,
	projectionLatitudeDeg,
}: BuildMapDotsInput): THREE.Group | null {
	const projection = createMapProjection(0, projectionLatitudeDeg)
	return collect(
		colors.map((color, keyIndex) => {
			const triangles = dotTriangles({
				data,
				keyIndex,
				radiusRad,
				ring: ringKeys.has(keyIndex),
			})
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
					positions.push(...projection.projectRadians(lon, point.lat, mapDepth))
				}
			}
			return createDots({ positions, color, visible: viewMode === "map" })
		}),
	)
}

export const DOT_SYMBOLS = {
	rgbHex,
	noRings: NO_RINGS,
	buildGlobeDots,
	buildMapDots,
}
