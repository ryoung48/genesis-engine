import * as THREE from "three"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"

export function createLineSegments(
	positions: number[],
	color: number,
	opacity: number,
	visible: boolean,
) {
	if (positions.length === 0) return null
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
	)
	const material = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity,
		depthWrite: false,
	})
	const lines = new THREE.LineSegments(geometry, material)
	lines.visible = visible
	return lines
}

export function appendProjectedSegment(
	positions: number[],
	projection: ReturnType<typeof createMapProjection>,
	start: { lon: number; lat: number },
	end: { lon: number; lat: number },
	z: number,
) {
	let lon0 = start.lon
	let lon1 = end.lon
	if (Math.abs(lon1 - lon0) > Math.PI) {
		if (lon0 < lon1) lon0 += 2 * Math.PI
		else lon1 += 2 * Math.PI
		const a = projection.projectRadians(lon0, start.lat, z)
		const b = projection.projectRadians(lon1, end.lat, z)
		const c = projection.projectRadians(lon0 - 2 * Math.PI, start.lat, z)
		const d = projection.projectRadians(lon1 - 2 * Math.PI, end.lat, z)
		positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
		positions.push(c[0], c[1], c[2], d[0], d[1], d[2])
		return
	}
	const a = projection.projectRadians(lon0, start.lat, z)
	const b = projection.projectRadians(lon1, end.lat, z)
	positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
}

export function unwrapLongitudeSequence(
	points: [number, number][],
): [number, number][] {
	if (points.length === 0) return []
	const unwrapped: [number, number][] = [points[0]]
	for (let index = 1; index < points.length; index++) {
		const [lon, lat] = points[index]
		let adjustedLon = lon
		const previousLon = unwrapped[index - 1][0]
		while (adjustedLon - previousLon > Math.PI) adjustedLon -= 2 * Math.PI
		while (adjustedLon - previousLon < -Math.PI) adjustedLon += 2 * Math.PI
		unwrapped.push([adjustedLon, lat])
	}
	return unwrapped
}

export const TERRAIN_ELEVATION_SCALE = 0.04

// Per-depth colors: depth 0 = gold, 1 = orange, 2 = teal, 3 = blue, 4+ = purple
export const HIERARCHY_DEPTH_COLORS: ReadonlyArray<[number, number, number]> = [
	[1.0, 0.85, 0.2],
	[0.93, 0.52, 0.14],
	[0.2, 0.78, 0.55],
	[0.25, 0.55, 0.9],
	[0.68, 0.32, 0.88],
]

export interface HierarchyNode {
	provinceId: number
	seedRegion: number
	depth: number
	parentProvinceId: number
	xyz: [number, number, number]
}

export interface NationBoundarySide {
	r0: number
	r1: number
	tInner: number
	tOuter: number
	nationA: number
	nationB: number
}

// ---------------------------------------------------------------------------
// Wind arrow overlays
// ---------------------------------------------------------------------------

export const DEG2RAD = Math.PI / 180

export const MAP_X_SCALE = 2 / Math.PI

export const ARROW_SHAFT_DEG = 3.5

// angular length of the arrow shaft (degrees of lat)
export const ARROW_HEAD_DEG = 1.1

// angular length of each arrowhead wing
export const ARROW_HEAD_SPREAD = 0.5
