import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import {
	appendProjectedSegment,
	HIERARCHY_DEPTH_COLORS,
	HierarchyNode,
} from "@/ui/genesis/renderer/overlay-builders/shared"
import type { GenesisViewMode } from "@/ui/genesis/renderer/types"

function collectHierarchyNodes(
	world: SerializedGenesisWorld,
	selectedNationId: number,
): HierarchyNode[] | null {
	if (!world.nations || !world.provinces) return null
	const { assignment, depth, parent } = world.nations
	const { seeds } = world.provinces
	const { r_xyz } = world.mesh
	const provinceCount = assignment.length
	const nodes: HierarchyNode[] = []

	for (let p = 0; p < provinceCount; p++) {
		if (assignment[p] !== selectedNationId) continue
		const seedRegion = seeds[p]
		const len = Math.sqrt(
			r_xyz[3 * seedRegion] ** 2 +
				r_xyz[3 * seedRegion + 1] ** 2 +
				r_xyz[3 * seedRegion + 2] ** 2,
		)
		const scale = len > 0 ? 1 / len : 1
		nodes.push({
			provinceId: p,
			seedRegion,
			depth: depth[p],
			parentProvinceId: parent[p],
			xyz: [
				r_xyz[3 * seedRegion] * scale,
				r_xyz[3 * seedRegion + 1] * scale,
				r_xyz[3 * seedRegion + 2] * scale,
			],
		})
	}
	return nodes
}

function depthColor(d: number): [number, number, number] {
	return HIERARCHY_DEPTH_COLORS[Math.min(d, HIERARCHY_DEPTH_COLORS.length - 1)]
}

/** Rank-based color: counties (deepest) = gold, capitals = color by tier */
function rankColor(depth: number, maxDepth: number): [number, number, number] {
	return depthColor(maxDepth - depth)
}

function createCircleTexture(): THREE.CanvasTexture | null {
	if (typeof document === "undefined") return null
	const size = 64
	const cvs = document.createElement("canvas")
	cvs.width = size
	cvs.height = size
	const ctx = cvs.getContext("2d")!
	ctx.beginPath()
	ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
	ctx.fillStyle = "white"
	ctx.fill()
	return new THREE.CanvasTexture(cvs)
}

export function buildGlobeHierarchyOverlay(
	world: SerializedGenesisWorld,
	selectedNationId: number,
	viewMode: GenesisViewMode,
	canvas: HTMLCanvasElement,
	elevationVisible: boolean,
): THREE.Group | null {
	const nodes = collectHierarchyNodes(world, selectedNationId)
	if (!nodes || nodes.length === 0) return null

	const provinceIndex = new Map<number, HierarchyNode>()
	for (const node of nodes) provinceIndex.set(node.provinceId, node)

	const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)
	const uniformRadius = elevationVisible ? 1.025 : 1.01

	const dotPositions: number[] = []
	const dotColors: number[] = []
	const linePositions: number[] = []
	const lineColors: number[] = []

	for (const node of nodes) {
		const [r, g, b] = rankColor(node.depth, maxDepth)
		const x = node.xyz[0] * uniformRadius
		const y = node.xyz[1] * uniformRadius
		const z = node.xyz[2] * uniformRadius

		dotPositions.push(x, y, z)
		dotColors.push(r, g, b)

		if (node.parentProvinceId >= 0) {
			const parentNode = provinceIndex.get(node.parentProvinceId)
			if (parentNode) {
				linePositions.push(
					x,
					y,
					z,
					parentNode.xyz[0] * uniformRadius,
					parentNode.xyz[1] * uniformRadius,
					parentNode.xyz[2] * uniformRadius,
				)
				const [pr, pg, pb] = rankColor(parentNode.depth, maxDepth)
				lineColors.push(r, g, b, pr, pg, pb)
			}
		}
	}

	const group = new THREE.Group()
	const w = canvas.clientWidth || 1
	const h = canvas.clientHeight || 1

	if (dotPositions.length > 0) {
		const geo = new THREE.BufferGeometry()
		geo.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(new Float32Array(dotPositions), 3),
		)
		geo.setAttribute(
			"color",
			new THREE.Float32BufferAttribute(new Float32Array(dotColors), 3),
		)
		const circleTex = createCircleTexture()
		const mat = new THREE.PointsMaterial({
			size: 0.012,
			sizeAttenuation: true,
			vertexColors: true,
			...(circleTex ? { map: circleTex, alphaTest: 0.5 } : {}),
			depthWrite: false,
			transparent: true,
			opacity: 0.95,
		})
		group.add(new THREE.Points(geo, mat))
	}

	if (linePositions.length > 0) {
		const geom = new LineSegmentsGeometry()
		geom.setPositions(linePositions)
		geom.setColors(lineColors)
		const mat = new LineMaterial({
			vertexColors: true,
			linewidth: 1.8,
			resolution: new THREE.Vector2(w, h),
			transparent: true,
			opacity: 0.7,
			depthWrite: false,
		})
		const lines = new LineSegments2(geom, mat)
		lines.computeLineDistances()
		group.add(lines)
	}

	group.visible = viewMode === "globe"
	return group
}

export function buildMapHierarchyOverlay(
	world: SerializedGenesisWorld,
	selectedNationId: number,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	viewMode: GenesisViewMode,
	canvas: HTMLCanvasElement,
): THREE.Group | null {
	const nodes = collectHierarchyNodes(world, selectedNationId)
	if (!nodes || nodes.length === 0) return null

	const provinceIndex = new Map<number, HierarchyNode>()
	for (const node of nodes) provinceIndex.set(node.provinceId, node)

	const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)

	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const z = 0.02
	const CIRCLE_RADIUS = 0.0025
	const linePositions: number[] = []
	const lineColors: number[] = []

	const group = new THREE.Group()
	const w = canvas.clientWidth || 1
	const h = canvas.clientHeight || 1

	for (const node of nodes) {
		const [r, g, b] = rankColor(node.depth, maxDepth)
		const projected = projection.projectCartesian(
			node.xyz[0],
			node.xyz[1],
			node.xyz[2],
		)
		const pos = projection.projectRadians(projected.lon, projected.lat, z)
		const circleGeo = new THREE.CircleGeometry(CIRCLE_RADIUS, 16)
		const circleMat = new THREE.MeshBasicMaterial({
			color: new THREE.Color(r, g, b),
			depthWrite: false,
		})
		const circle = new THREE.Mesh(circleGeo, circleMat)
		circle.position.set(pos[0], pos[1], pos[2])
		group.add(circle)

		if (node.parentProvinceId >= 0) {
			const parentNode = provinceIndex.get(node.parentProvinceId)
			if (parentNode) {
				const parentProjected = projection.projectCartesian(
					parentNode.xyz[0],
					parentNode.xyz[1],
					parentNode.xyz[2],
				)
				const lonDiff = Math.abs(parentProjected.lon - projected.lon)
				appendProjectedSegment(
					linePositions,
					projection,
					{ lon: projected.lon, lat: projected.lat },
					{ lon: parentProjected.lon, lat: parentProjected.lat },
					z,
				)
				const [pr, pg, pb] = rankColor(parentNode.depth, maxDepth)
				lineColors.push(r, g, b, pr, pg, pb)
				if (lonDiff > Math.PI) {
					lineColors.push(r, g, b, pr, pg, pb)
				}
			}
		}
	}

	if (linePositions.length > 0) {
		const geom = new LineSegmentsGeometry()
		geom.setPositions(linePositions)
		geom.setColors(lineColors)
		const mat = new LineMaterial({
			vertexColors: true,
			linewidth: 1.8,
			resolution: new THREE.Vector2(w, h),
			transparent: true,
			opacity: 0.7,
			depthWrite: false,
		})
		const lines = new LineSegments2(geom, mat)
		lines.computeLineDistances()
		group.add(lines)
	}

	group.visible = viewMode === "map"
	return group
}
