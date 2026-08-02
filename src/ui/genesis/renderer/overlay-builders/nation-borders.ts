import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import { repeatMapPositions } from "@/ui/genesis/renderer/overlay-builders"
import {
	appendProjectedSegment,
	NationBoundarySide,
	TERRAIN_ELEVATION_SCALE,
} from "@/ui/genesis/renderer/overlay-builders/shared"
import type {
	BuildLandNationBordersGlobeParams,
	BuildLandNationBordersMapParams,
	CollectNationBorderMapPositionsParams,
} from "@/ui/genesis/renderer/types"

function forEachNationBoundarySide(
	world: SerializedGenesisWorld,
	nation: number,
	visit: (side: NationBoundarySide) => void,
) {
	if (!world.nations || !world.provinces) return
	const { mesh } = world
	const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t } = mesh
	const { regionProvince } = world.provinces

	for (let side = 0; side < numSides; side++) {
		const opposite = halfedges[side]
		if (opposite < 0 || side > opposite) continue
		const r0 = s_begin_r[side]
		const r1 = s_begin_r[opposite]
		const provinceA = regionProvince[r0]
		const provinceB = regionProvince[r1]
		const nationA = provinceA >= 0 ? world.nations.assignment[provinceA] : -1
		const nationB = provinceB >= 0 ? world.nations.assignment[provinceB] : -1
		if (nationA === nationB || (nationA !== nation && nationB !== nation))
			continue

		const tInner = s_inner_t[side]
		const tOuter = s_outer_t[side]
		if (tInner < 0 || tOuter < 0) continue

		visit({ r0, r1, tInner, tOuter, nationA, nationB })
	}
}

function forEachNationBorderSide(
	world: SerializedGenesisWorld,
	visit: (side: NationBoundarySide) => void,
) {
	if (!world.nations || !world.provinces) return
	const { mesh } = world
	const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t } = mesh
	const { regionProvince, desolate } = world.provinces
	const { assignment, sovereign, activeRebelWars } = world.nations

	// Build O(1) lookup for active rebel war pairs (attacker ↔ defender)
	const rebelPairs = new Set<number>()
	for (const war of activeRebelWars ?? []) {
		rebelPairs.add(war.attacker * 65536 + war.defender)
		rebelPairs.add(war.defender * 65536 + war.attacker)
	}

	for (let side = 0; side < numSides; side++) {
		const opposite = halfedges[side]
		if (opposite < 0 || side > opposite) continue
		const r0 = s_begin_r[side]
		const r1 = s_begin_r[opposite]
		const provinceA = regionProvince[r0]
		const provinceB = regionProvince[r1]
		// Skip borders between two desolate provinces (desolate can carry stale sovereign
		// values in snapshots, so we can't rely on the sovereign check alone)
		const desolateA = provinceA >= 0 ? desolate[provinceA] : 0
		const desolateB = provinceB >= 0 ? desolate[provinceB] : 0
		if (desolateA && desolateB) continue
		const nationA = provinceA >= 0 ? assignment[provinceA] : -1
		const nationB = provinceB >= 0 ? assignment[provinceB] : -1
		// A true ocean side (provinceA/B < 0, i.e. no province at all) always
		// resolves nationA/B to -1 regardless of the other side -- the exact
		// same sentinel an *unowned land* province resolves to. Without this
		// check, an ocean-vs-unowned-land side wrongly satisfied
		// `nationA === nationB` (-1 === -1) below and got skipped, leaving
		// gaps in the coastline wherever unclaimed/unowned land meets the
		// sea. Exactly one side being genuine ocean must always draw.
		const isCoastlineSide = provinceA < 0 !== provinceB < 0
		// Skip same nation
		if (!isCoastlineSide && nationA === nationB) continue
		// Skip vassals: same sovereign root means one is subordinate of the other
		const sovereignA = provinceA >= 0 ? sovereign[provinceA] : -1
		const sovereignB = provinceB >= 0 ? sovereign[provinceB] : -1
		if (!isCoastlineSide && sovereignA === sovereignB) continue
		// Skip active rebel wars: rebels are released before war starts so sovereigns differ,
		// but we still don't want a border between rebel and parent during the war
		if (
			nationA >= 0 &&
			nationB >= 0 &&
			rebelPairs.has(nationA * 65536 + nationB)
		)
			continue

		const tInner = s_inner_t[side]
		const tOuter = s_outer_t[side]
		if (tInner < 0 || tOuter < 0) continue

		visit({ r0, r1, tInner, tOuter, nationA, nationB })
	}
}

export function collectNationBorderGlobePositions(
	world: SerializedGenesisWorld,
	nation: number,
	radiusBoost: number,
	elevationVisible: boolean,
) {
	if (!world.nations || !world.provinces) return []
	const positions: number[] = []
	const { elevation, mesh } = world
	const { t_xyz } = mesh
	const baseRadius = elevationVisible ? 1.006 : 1.003

	forEachNationBoundarySide(world, nation, ({ r0, r1, tInner, tOuter }) => {
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

export function collectAllNationBorderGlobePositions(
	world: SerializedGenesisWorld,
	radiusBoost: number,
	elevationVisible: boolean,
) {
	if (!world.nations || !world.provinces) return []
	const positions: number[] = []
	const { elevation, mesh } = world
	const { t_xyz } = mesh
	const baseRadius = elevationVisible ? 1.006 : 1.003

	forEachNationBorderSide(world, ({ r0, r1, tInner, tOuter }) => {
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

export function collectNationBorderMapPositions({
	world,
	nation,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	zBoost,
}: CollectNationBorderMapPositionsParams) {
	if (!world.nations || !world.provinces) return []
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

	forEachNationBoundarySide(world, nation, ({ tInner, tOuter }) => {
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

export function collectAllNationBorderMapPositions(
	world: SerializedGenesisWorld,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	zBoost: number,
) {
	if (!world.nations || !world.provinces) return []
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

	forEachNationBorderSide(world, ({ tInner, tOuter }) => {
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

export function buildLandNationBordersGlobe({
	world,
	viewMode,
	visible,
	elevationVisible,
	resolution,
	opts,
}: BuildLandNationBordersGlobeParams): {
	lines: LineSegments2
	material: LineMaterial
} | null {
	const positions = collectAllLandNationBorderGlobePositions(
		world,
		elevationVisible,
	)
	return buildThickLineSegments2(
		positions,
		opts?.color ?? 0x7d556f,
		opts?.opacity ?? 0.9,
		opts?.lineWidth ?? 2,
		resolution,
		viewMode === "globe" && visible,
	)
}

export function buildLandNationBordersMap({
	world,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	viewMode,
	visible,
	resolution,
	opts,
}: BuildLandNationBordersMapParams): {
	lines: LineSegments2
	material: LineMaterial
} | null {
	const positions = repeatMapPositions(
		collectAllLandNationBorderMapPositions(
			world,
			centerLongitudeDeg,
			projectionLatitudeDeg,
		),
		createMapProjection(centerLongitudeDeg, projectionLatitudeDeg).repeatWidth,
	)
	return buildThickLineSegments2(
		positions,
		opts?.color ?? 0x7d556f,
		opts?.opacity ?? 0.9,
		opts?.lineWidth ?? 2,
		resolution,
		viewMode === "map" && visible,
	)
}

function collectAllLandNationBorderGlobePositions(
	world: SerializedGenesisWorld,
	elevationVisible: boolean,
) {
	if (!world.nations || !world.provinces) return []
	const positions: number[] = []
	const { elevation, isLand, mesh } = world
	const { regionProvince, desolate } = world.provinces
	const { t_xyz } = mesh
	const baseRadius = elevationVisible ? 1.004 : 1.001

	forEachNationBorderSide(world, ({ r0, r1, tInner, tOuter }) => {
		if (!isLand[r0] || !isLand[r1]) return
		const pA = regionProvince[r0]
		const pB = regionProvince[r1]
		if ((pA >= 0 && desolate[pA]) || (pB >= 0 && desolate[pB])) return
		const averageElevation = (elevation[r0] + elevation[r1]) * 0.5
		const elevationFactor = elevationVisible
			? averageElevation * TERRAIN_ELEVATION_SCALE
			: 0
		const radius = baseRadius + elevationFactor
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

function collectAllLandNationBorderMapPositions(
	world: SerializedGenesisWorld,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
) {
	if (!world.nations || !world.provinces) return []
	const positions: number[] = []
	const { isLand } = world
	const { regionProvince, desolate } = world.provinces
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { t_xyz } = world.mesh
	const z = 0.001

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

	forEachNationBorderSide(world, ({ r0, r1, tInner, tOuter }) => {
		if (!isLand[r0] || !isLand[r1]) return
		const pA = regionProvince[r0]
		const pB = regionProvince[r1]
		if ((pA >= 0 && desolate[pA]) || (pB >= 0 && desolate[pB])) return
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

function buildThickLineSegments2(
	positions: number[],
	color: number,
	opacity: number,
	lineWidth: number,
	resolution: [number, number],
	visible: boolean,
): { lines: LineSegments2; material: LineMaterial } | null {
	if (positions.length === 0) return null
	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(positions)
	const material = new LineMaterial({
		color,
		linewidth: lineWidth,
		resolution: new THREE.Vector2(resolution[0], resolution[1]),
		transparent: true,
		opacity,
		depthWrite: false,
	})
	material.userData.baseWidth = lineWidth
	const lines = new LineSegments2(geometry, material)
	lines.computeLineDistances()
	lines.visible = visible
	return { lines, material }
}
