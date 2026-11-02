import * as THREE from "three"
import type {
	WindArrowData,
	WindGrid,
} from "@/model/climate/weather/wind/types"
import { uiWindMap } from "@/ui/components/tokens"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import {
	appendProjectedSegment,
	createLineSegments,
	DEG2RAD,
} from "@/ui/genesis/renderer/overlay-builders/shared"
import type {
	BuildGlobeWindArrowsInput,
	BuildMapWindArrowsInput,
} from "@/ui/genesis/renderer/types"

export function buildWindArrowData(grid: WindGrid): WindArrowData {
	const lat: number[] = []
	const lon: number[] = []
	const u: number[] = []
	const v: number[] = []
	const speed: number[] = []
	const rows = uiWindMap.columns / 2
	for (let row = 0; row < rows; row++) {
		const latitude = -90 + ((row + 0.5) * 180) / rows
		const gridRow = Math.round(latitude + 90)
		for (let column = 0; column < uiWindMap.columns; column++) {
			const longitude = -180 + ((column + 0.5) * 360) / uiWindMap.columns
			const gridColumn = Math.round(longitude + 180) % grid.width
			const index = gridRow * grid.width + gridColumn
			lat.push(latitude)
			lon.push(longitude)
			u.push(grid.u[index])
			v.push(grid.v[index])
			speed.push(grid.speed[index])
		}
	}
	return {
		lat: Float32Array.from(lat),
		lon: Float32Array.from(lon),
		u: Float32Array.from(u),
		v: Float32Array.from(v),
		speed: Float32Array.from(speed),
	}
}

function buildWindSegments(data: WindArrowData): THREE.Vector3[] {
	const positions: THREE.Vector3[] = []
	const fullLength =
		((2 * Math.PI) / uiWindMap.columns) * uiWindMap.fullLengthFraction
	for (let i = 0; i < data.lat.length; i++) {
		const lat = data.lat[i] * DEG2RAD
		const lon = data.lon[i] * DEG2RAD
		const u = data.u[i]
		const v = data.v[i]
		const speed = data.speed[i]
		if (!Number.isFinite(u + v + speed + lat + lon) || speed <= 0) continue
		const magnitude = Math.hypot(u, v)
		if (magnitude === 0) continue
		const center = new THREE.Vector3(
			Math.cos(lat) * Math.cos(lon),
			Math.cos(lat) * Math.sin(lon),
			Math.sin(lat),
		)
		const direction = new THREE.Vector3(
			-u * Math.sin(lon) - v * Math.sin(lat) * Math.cos(lon),
			u * Math.cos(lon) - v * Math.sin(lat) * Math.sin(lon),
			v * Math.cos(lat),
		).divideScalar(magnitude)
		const perpendicular = new THREE.Vector3().crossVectors(center, direction)
		const length = fullLength * Math.min(1, speed / uiWindMap.maxSpeedMs)
		const tail = center
			.clone()
			.addScaledVector(direction, -length / 2)
			.normalize()
		const tip = center
			.clone()
			.addScaledVector(direction, length / 2)
			.normalize()
		const head = length * uiWindMap.headLengthFraction
		const base = tip
			.clone()
			.addScaledVector(direction, -Math.cos(uiWindMap.headHalfAngleRad) * head)
		const spread = Math.sin(uiWindMap.headHalfAngleRad) * head
		positions.push(
			tail,
			tip,
			tip,
			base.clone().addScaledVector(perpendicular, spread).normalize(),
			tip,
			base.clone().addScaledVector(perpendicular, -spread).normalize(),
		)
	}
	return positions
}

export function buildGlobeWindArrows({
	data,
	viewMode,
	elevationVisible,
}: BuildGlobeWindArrowsInput): THREE.LineSegments | null {
	const radius = elevationVisible
		? uiWindMap.raisedGlobeRadius
		: uiWindMap.globeRadius
	const positions = buildWindSegments(data).flatMap((point) =>
		point.clone().multiplyScalar(radius).toArray(),
	)
	return createLineSegments(
		positions,
		new THREE.Color(uiWindMap.arrowColor).getHex(),
		1,
		viewMode === "globe",
	)
}

export function buildMapWindArrows({
	data,
	viewMode,
	projectionLatitudeDeg,
}: BuildMapWindArrowsInput): THREE.LineSegments | null {
	const projection = createMapProjection(0, projectionLatitudeDeg)
	const segments = buildWindSegments(data)
	const positions: number[] = []
	for (let i = 0; i < segments.length; i += 2) {
		const start = segments[i]
		const end = segments[i + 1]
		appendProjectedSegment(
			positions,
			projection,
			projection.projectCartesian(start.x, start.y, start.z),
			projection.projectCartesian(end.x, end.y, end.z),
			uiWindMap.mapDepth,
		)
	}
	return createLineSegments(
		positions,
		new THREE.Color(uiWindMap.arrowColor).getHex(),
		1,
		viewMode === "map",
	)
}
