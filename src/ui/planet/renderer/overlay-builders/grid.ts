import * as THREE from "three"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import {
	appendProjectedSegment,
	createLineSegments,
} from "@/ui/planet/renderer/overlay-builders/shared"
import type { GenesisViewMode } from "@/ui/planet/renderer/types"

export function buildGlobeGrid(
	spacingDeg: number,
	gridVisible: boolean,
	viewMode: GenesisViewMode,
	elevationVisible: boolean,
): THREE.LineSegments {
	const spacing = Math.max(2.5, spacingDeg)
	const radius = elevationVisible ? 1.018 : 1.008
	const latStep = THREE.MathUtils.degToRad(3)
	const lonStep = THREE.MathUtils.degToRad(3)
	const positions: number[] = []

	for (let latDeg = -90 + spacing; latDeg < 90; latDeg += spacing) {
		const lat = THREE.MathUtils.degToRad(latDeg)
		let previous: [number, number, number] | null = null
		for (let lon = -Math.PI; lon <= Math.PI + 0.0001; lon += lonStep) {
			const cosLat = Math.cos(lat)
			const point: [number, number, number] = [
				radius * cosLat * Math.cos(lon),
				radius * cosLat * Math.sin(lon),
				radius * Math.sin(lat),
			]
			if (previous) positions.push(...previous, ...point)
			previous = point
		}
	}

	for (let lonDeg = -180; lonDeg < 180; lonDeg += spacing) {
		const lon = THREE.MathUtils.degToRad(lonDeg)
		let previous: [number, number, number] | null = null
		for (let lat = -Math.PI / 2; lat <= Math.PI / 2 + 0.0001; lat += latStep) {
			const cosLat = Math.cos(lat)
			const point: [number, number, number] = [
				radius * cosLat * Math.cos(lon),
				radius * cosLat * Math.sin(lon),
				radius * Math.sin(lat),
			]
			if (previous) positions.push(...previous, ...point)
			previous = point
		}
	}

	return createLineSegments(
		positions,
		0xe2e8f0,
		0.28,
		gridVisible && viewMode === "globe",
	)!
}

export function buildMapGrid(
	spacingDeg: number,
	projectionLatitudeDeg: number,
	gridVisible: boolean,
	viewMode: GenesisViewMode,
): THREE.LineSegments {
	const spacing = Math.max(2.5, spacingDeg)
	const lonStep = Math.max(2.5, spacing / 2)
	const latStep = Math.max(2.5, spacing / 2)
	const positions: number[] = []
	const projection = createMapProjection(0, projectionLatitudeDeg)

	for (let latDeg = -90 + spacing; latDeg < 90; latDeg += spacing) {
		let previous: { lon: number; lat: number } | null = null
		for (let lonDeg = -180; lonDeg <= 180 + 0.001; lonDeg += lonStep) {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			const lat = THREE.MathUtils.degToRad(latDeg)
			const cosLat = Math.cos(lat)
			const current = projection.projectCartesian(
				cosLat * Math.cos(lon),
				cosLat * Math.sin(lon),
				Math.sin(lat),
			)
			if (previous)
				appendProjectedSegment(positions, projection, previous, current, 0.001)
			previous = current
		}
	}

	for (let lonDeg = -180; lonDeg < 180; lonDeg += spacing) {
		let previous: { lon: number; lat: number } | null = null
		for (let latDeg = -90; latDeg <= 90 + 0.001; latDeg += latStep) {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			const lat = THREE.MathUtils.degToRad(latDeg)
			const cosLat = Math.cos(lat)
			const current = projection.projectCartesian(
				cosLat * Math.cos(lon),
				cosLat * Math.sin(lon),
				Math.sin(lat),
			)
			if (previous)
				appendProjectedSegment(positions, projection, previous, current, 0.001)
			previous = current
		}
	}

	return createLineSegments(
		positions,
		0xf8fafc,
		0.22,
		gridVisible && viewMode === "map",
	)!
}
