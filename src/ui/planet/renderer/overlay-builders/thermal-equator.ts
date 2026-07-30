import * as THREE from "three"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import {
	appendProjectedSegment,
	createLineSegments,
	unwrapLongitudeSequence,
} from "@/ui/planet/renderer/overlay-builders/shared"
import type { GenesisViewMode } from "@/ui/planet/renderer/types"

function buildThermalEquatorLine(
	controlPoints: THREE.Vector3[],
	pointsCount: number,
	color: number,
	visible: boolean,
	adjustPoint?: (point: THREE.Vector3) => void,
) {
	const curve = new THREE.CatmullRomCurve3(
		controlPoints,
		false,
		"catmullrom",
		0.5,
	)
	const smoothPoints = curve.getPoints(pointsCount * 4)
	for (const point of smoothPoints) adjustPoint?.(point)
	const geometry = new THREE.BufferGeometry().setFromPoints(smoothPoints)
	const material = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity: 0.9,
		depthWrite: false,
	})
	const line = new THREE.Line(geometry, material)
	line.visible = visible
	return line
}

export function buildGlobeThermalEquator(
	points: [number, number][],
	viewMode: GenesisViewMode,
	elevationVisible: boolean,
) {
	const radius = elevationVisible ? 1.05 : 1.02
	const controlPoints = points.map(([lonDeg, latDeg]) => {
		const lon = THREE.MathUtils.degToRad(lonDeg)
		const lat = THREE.MathUtils.degToRad(latDeg)
		const cosLat = Math.cos(lat)
		return new THREE.Vector3(
			radius * cosLat * Math.cos(lon),
			radius * cosLat * Math.sin(lon),
			radius * Math.sin(lat),
		)
	})

	return buildThermalEquatorLine(
		controlPoints,
		points.length,
		0xff3333,
		viewMode === "globe",
		(point) => point.normalize().multiplyScalar(radius),
	)
}

export function buildMapThermalEquator(
	points: [number, number][],
	projectionLatitudeDeg: number,
	viewMode: GenesisViewMode,
) {
	const projection = createMapProjection(0, projectionLatitudeDeg)
	const unwrappedPoints = unwrapLongitudeSequence(
		points.map(
			([lonDeg, latDeg]) =>
				[
					THREE.MathUtils.degToRad(lonDeg),
					THREE.MathUtils.degToRad(latDeg),
				] as [number, number],
		),
	)
	const controlPoints = unwrappedPoints.map(
		([lon, lat]) => new THREE.Vector3(lon, lat, 0.002),
	)
	const curve = new THREE.CatmullRomCurve3(
		controlPoints,
		false,
		"catmullrom",
		0.5,
	)
	const smoothPoints = curve.getPoints(points.length * 4)
	const positions: number[] = []
	let previous: THREE.Vector3 | null = null
	for (const point of smoothPoints) {
		point.z = 0.002
		if (previous) {
			appendProjectedSegment(
				positions,
				projection,
				{ lon: previous.x, lat: previous.y },
				{ lon: point.x, lat: point.y },
				0.002,
			)
		}
		previous = point
	}
	return createLineSegments(positions, 0xff3333, 0.9, viewMode === "map")
}
