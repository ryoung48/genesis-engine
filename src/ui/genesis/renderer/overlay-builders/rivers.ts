import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import { TERRAIN_ELEVATION_SCALE } from "@/ui/genesis/renderer/overlay-builders/shared"
import type { GenesisViewMode, RiverData } from "@/ui/genesis/renderer/types"

function buildRiverGroup(
	rivers: RiverData,
	canvas: HTMLCanvasElement,
	riverMaterials: LineMaterial[],
	toPosition: (
		lonDeg: number,
		latDeg: number,
		elev: number,
	) => [number, number, number],
) {
	const group = new THREE.Group()
	const width = canvas.clientWidth || 1
	const height = canvas.clientHeight || 1
	const minWidth = 0.25
	const maxWidth = 1.0
	const binStep = 0.05
	const logMin = Math.log(1 + rivers.minFlow)
	const logMax = Math.log(1 + rivers.maxFlow)
	const logRange = logMax - logMin || 1

	function flowToWidth(flow: number) {
		const t = Math.max(0, (Math.log(1 + flow) - logMin) / logRange)
		return minWidth + (maxWidth - minWidth) * t
	}

	const toBin = (lineWidth: number) =>
		Math.max(
			minWidth,
			Math.min(maxWidth, Math.round(lineWidth / binStep) * binStep),
		)

	const batchedPositions = new Map<number, number[]>()

	const appendSegments = (
		positions: [number, number, number][],
		flows: number[],
	) => {
		if (positions.length < 2) return
		const widths = flows.map((flow) => flowToWidth(flow))
		let segmentStart = 0
		let currentBin = toBin(widths[0])

		const flushSegment = (start: number, end: number, binnedWidth: number) => {
			if (end <= start) return
			let binPositions = batchedPositions.get(binnedWidth)
			if (!binPositions) {
				binPositions = []
				batchedPositions.set(binnedWidth, binPositions)
			}
			for (let index = start; index < end; index++) {
				const a = positions[index]
				const b = positions[index + 1]
				binPositions.push(a[0], a[1], a[2], b[0], b[1], b[2])
			}
		}

		for (let index = 1; index < positions.length; index++) {
			const nextBin = toBin(widths[index])
			if (nextBin !== currentBin) {
				flushSegment(segmentStart, index, currentBin)
				segmentStart = index
				currentBin = nextBin
			}
		}
		flushSegment(segmentStart, positions.length - 1, currentBin)
	}

	for (const polyline of rivers.lines) {
		if (polyline.length < 2) continue
		const flowValues = polyline.map(([, , flow]) => flow)
		let positions: [number, number, number][]
		let smoothFlows: number[]

		if (polyline.length >= 3) {
			const controlPoints = polyline.map(([lon, lat, , elev]) => {
				const [x, y, z] = toPosition(lon, lat, elev)
				return new THREE.Vector3(x, y, z)
			})
			const curve = new THREE.CatmullRomCurve3(
				controlPoints,
				false,
				"catmullrom",
				0.5,
			)
			const smoothPointCount = polyline.length * 3
			const smoothed = curve.getPoints(smoothPointCount)
			positions = smoothed.map((point) => [point.x, point.y, point.z])
			smoothFlows = smoothed.map((_, index) => {
				const t = index / smoothPointCount
				const step = t * (polyline.length - 1)
				const lower = Math.floor(step)
				const upper = Math.min(lower + 1, polyline.length - 1)
				return (
					flowValues[lower] +
					(flowValues[upper] - flowValues[lower]) * (step - lower)
				)
			})
		} else {
			positions = polyline.map(([lon, lat, , elev]) =>
				toPosition(lon, lat, elev),
			)
			smoothFlows = flowValues
		}

		appendSegments(positions, smoothFlows)
	}

	for (const [binnedWidth, positions] of batchedPositions) {
		if (positions.length < 6) continue
		const t = (binnedWidth - minWidth) / (maxWidth - minWidth)
		const baseOpacity = 0.55 + t * 0.4
		const material = new LineMaterial({
			color: 0x8fc4e8,
			opacity: baseOpacity,
			linewidth: binnedWidth,
			transparent: true,
			depthWrite: false,
			worldUnits: false,
		})
		material.userData.baseWidth = binnedWidth
		material.userData.baseOpacity = baseOpacity
		material.resolution.set(width, height)
		riverMaterials.push(material)

		const geometry = new LineSegmentsGeometry()
		geometry.setPositions(positions)
		const line = new LineSegments2(geometry, material)
		line.computeLineDistances()
		group.add(line)
	}

	return group
}

export function buildGlobeRivers(
	rivers: RiverData,
	canvas: HTMLCanvasElement,
	riverMaterials: LineMaterial[],
	globeRiverMaterials: LineMaterial[],
	riversVisible: boolean,
	viewMode: GenesisViewMode,
	elevationVisible: boolean,
) {
	const lift = elevationVisible ? 0.003 : 0.0015
	const group = buildRiverGroup(
		rivers,
		canvas,
		globeRiverMaterials,
		(lonDeg, latDeg, elev) => {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			const lat = THREE.MathUtils.degToRad(latDeg)
			const cosLat = Math.cos(lat)
			const elevationFactor = elevationVisible
				? elev > 0
					? elev * TERRAIN_ELEVATION_SCALE
					: elev * TERRAIN_ELEVATION_SCALE * 0.3
				: 0
			const radius = 1 + elevationFactor + lift
			return [
				radius * cosLat * Math.cos(lon),
				radius * cosLat * Math.sin(lon),
				radius * Math.sin(lat),
			]
		},
	)
	group.visible = riversVisible && viewMode === "globe"
	for (const mat of globeRiverMaterials) riverMaterials.push(mat)
	return group
}

export function buildMapRivers(
	rivers: RiverData,
	canvas: HTMLCanvasElement,
	riverMaterials: LineMaterial[],
	mapRiverMaterials: LineMaterial[],
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	riversVisible: boolean,
	viewMode: GenesisViewMode,
) {
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const group = new THREE.Group()
	const width = canvas.clientWidth || 1
	const height = canvas.clientHeight || 1
	const minWidth = 0.25
	const maxWidth = 1.0
	const binStep = 0.05
	const logMin = Math.log(1 + rivers.minFlow)
	const logMax = Math.log(1 + rivers.maxFlow)
	const logRange = logMax - logMin || 1

	function flowToWidth(flow: number) {
		const t = Math.max(0, (Math.log(1 + flow) - logMin) / logRange)
		return minWidth + (maxWidth - minWidth) * t
	}

	const toBin = (lineWidth: number) =>
		Math.max(
			minWidth,
			Math.min(maxWidth, Math.round(lineWidth / binStep) * binStep),
		)

	const MAP_LON_SEAM_THRESHOLD = 2

	function splitMapPoints(
		points: [number, number, number][],
		flows: number[],
	): { points: [number, number, number][]; flows: number[] }[] {
		if (points.length < 2) return points.length === 0 ? [] : [{ points, flows }]
		const segments: { points: [number, number, number][]; flows: number[] }[] =
			[{ points: [points[0]], flows: [flows[0]] }]
		for (let i = 1; i < points.length; i++) {
			const current = points[i]
			const previous = points[i - 1]
			if (Math.abs(current[0] - previous[0]) > MAP_LON_SEAM_THRESHOLD) {
				segments.push({ points: [current], flows: [flows[i]] })
				continue
			}
			segments[segments.length - 1].points.push(current)
			segments[segments.length - 1].flows.push(flows[i])
		}
		return segments.filter((s) => s.points.length >= 2)
	}

	const batchedPositions = new Map<number, number[]>()

	const appendSegments = (
		points: [number, number, number][],
		flows: number[],
	) => {
		if (points.length < 2) return
		const widths = flows.map((flow) => flowToWidth(flow))
		let segmentStart = 0
		let currentBin = toBin(widths[0])

		const flushSegment = (start: number, end: number, binnedWidth: number) => {
			if (end <= start) return
			let binPositions = batchedPositions.get(binnedWidth)
			if (!binPositions) {
				binPositions = []
				batchedPositions.set(binnedWidth, binPositions)
			}
			for (let index = start; index < end; index++) {
				const a = points[index]
				const b = points[index + 1]
				binPositions.push(a[0], a[1], a[2], b[0], b[1], b[2])
			}
		}

		for (let index = 1; index < points.length; index++) {
			const nextBin = toBin(widths[index])
			if (nextBin !== currentBin) {
				flushSegment(segmentStart, index, currentBin)
				segmentStart = index
				currentBin = nextBin
			}
		}
		flushSegment(segmentStart, points.length - 1, currentBin)
	}

	for (const polyline of rivers.lines) {
		if (polyline.length < 2) continue
		const flowValues = polyline.map(([, , flow]) => flow)

		const lonLatPoints: [number, number, number][] = polyline.map(
			([lon, lat]) => {
				const [x, y] = projection.projectDegrees(lon, lat, 0.003)
				return [x, y, 0.003]
			},
		)

		const segments = splitMapPoints(lonLatPoints, flowValues)

		for (const segment of segments) {
			if (segment.points.length >= 3) {
				const controlPoints = segment.points.map(
					([x, y, z]) => new THREE.Vector3(x, y, z),
				)
				const curve = new THREE.CatmullRomCurve3(
					controlPoints,
					false,
					"catmullrom",
					0.5,
				)
				const smoothPointCount = segment.points.length * 3
				const smoothed = curve.getPoints(smoothPointCount)
				const smoothPositions = smoothed.map(
					(p) => [p.x, p.y, p.z] as [number, number, number],
				)
				const smoothFlows = smoothed.map((_, index) => {
					const t = index / smoothPointCount
					const step = t * (segment.points.length - 1)
					const lower = Math.floor(step)
					const upper = Math.min(lower + 1, segment.points.length - 1)
					return (
						segment.flows[lower] +
						(segment.flows[upper] - segment.flows[lower]) * (step - lower)
					)
				})
				appendSegments(smoothPositions, smoothFlows)
			} else {
				appendSegments(segment.points, segment.flows)
			}
		}
	}

	for (const [binnedWidth, positions] of batchedPositions) {
		if (positions.length < 6) continue
		const t = (binnedWidth - minWidth) / (maxWidth - minWidth)
		const material = new LineMaterial({
			color: 0x8fc4e8,
			opacity: 0.55 + t * 0.4,
			linewidth: binnedWidth,
			transparent: true,
			depthWrite: false,
			worldUnits: false,
		})
		material.userData.baseWidth = binnedWidth
		material.resolution.set(width, height)
		mapRiverMaterials.push(material)

		const geometry = new LineSegmentsGeometry()
		geometry.setPositions(positions)
		const line = new LineSegments2(geometry, material)
		line.computeLineDistances()
		group.add(line)
	}

	group.visible = riversVisible && viewMode === "map"
	for (const mat of mapRiverMaterials) riverMaterials.push(mat)
	return group
}

// sine of the arrowhead half-angle (~30°)
