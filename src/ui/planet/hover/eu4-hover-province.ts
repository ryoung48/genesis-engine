import type { Eu4ProvinceFillGeometry } from "@/model/earth/history/data-source"
import { buildEu4ProvinceRingGroups } from "../renderer/eu4-province-geometry"

interface BoundingBox {
	minLon: number
	maxLon: number
	minLat: number
	maxLat: number
}

interface ProvincePolygon {
	provinceId: number
	exterior: Float32Array
	holes: Float32Array[]
	bbox: BoundingBox
}

const provincePolygonCache = new WeakMap<
	Eu4ProvinceFillGeometry,
	ProvincePolygon[]
>()

function buildBoundingBox(ring: Float32Array): BoundingBox {
	let minLon = Number.POSITIVE_INFINITY
	let maxLon = Number.NEGATIVE_INFINITY
	let minLat = Number.POSITIVE_INFINITY
	let maxLat = Number.NEGATIVE_INFINITY
	for (let i = 0; i < ring.length; i += 2) {
		const lon = ring[i]
		const lat = ring[i + 1]
		if (lon < minLon) minLon = lon
		if (lon > maxLon) maxLon = lon
		if (lat < minLat) minLat = lat
		if (lat > maxLat) maxLat = lat
	}
	return { minLon, maxLon, minLat, maxLat }
}

function getProvincePolygons(
	geometry: Eu4ProvinceFillGeometry,
): ProvincePolygon[] {
	let cached = provincePolygonCache.get(geometry)
	if (!cached) {
		cached = buildEu4ProvinceRingGroups(geometry).map((group) => ({
			provinceId: group.provinceId,
			exterior: group.exterior,
			holes: group.holes,
			bbox: buildBoundingBox(group.exterior),
		}))
		provincePolygonCache.set(geometry, cached)
	}
	return cached
}

function pointInRing(
	lonDeg: number,
	latDeg: number,
	ring: Float32Array,
): boolean {
	let inside = false
	let j = ring.length - 2
	for (let i = 0; i < ring.length; i += 2) {
		const xi = ring[i]
		const yi = ring[i + 1]
		const xj = ring[j]
		const yj = ring[j + 1]
		const intersects =
			yi > latDeg !== yj > latDeg &&
			lonDeg < ((xj - xi) * (latDeg - yi)) / (yj - yi || Number.EPSILON) + xi
		if (intersects) inside = !inside
		j = i
	}
	return inside
}

function bboxContains(
	bbox: BoundingBox,
	lonDeg: number,
	latDeg: number,
	marginDeg = 1e-6,
): boolean {
	return (
		lonDeg >= bbox.minLon - marginDeg &&
		lonDeg <= bbox.maxLon + marginDeg &&
		latDeg >= bbox.minLat - marginDeg &&
		latDeg <= bbox.maxLat + marginDeg
	)
}

export function findEu4ProvinceForLonLat(
	geometry: Eu4ProvinceFillGeometry,
	lonDeg: number,
	latDeg: number,
): number | null {
	const polygons = getProvincePolygons(geometry)
	for (const polygon of polygons) {
		for (const candidateLon of [lonDeg, lonDeg - 360, lonDeg + 360]) {
			if (!bboxContains(polygon.bbox, candidateLon, latDeg)) continue
			if (!pointInRing(candidateLon, latDeg, polygon.exterior)) continue
			if (
				polygon.holes.some((hole) => pointInRing(candidateLon, latDeg, hole))
			) {
				continue
			}
			return polygon.provinceId
		}
	}
	return null
}
