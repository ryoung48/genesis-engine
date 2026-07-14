import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { Eu4ProvinceBorderGeometry } from "@/model/earth/history/data-source"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import { createMapProjection } from "./map-projection"
import { repeatMapPositions } from "./overlay-builders"
import type { GenesisViewMode } from "./types"

// Draws nation/province borders for Earth-imported worlds along the real EU4
// province boundary vectors (scripts/build-eu4-province-borders.py) instead
// of the procedural planet mesh's own Voronoi edges -- see
// overlay-builders.ts / province-overlay.ts for the procedural equivalents
// used when !world.isEarthImport.

/** Raw EU4 province id -> current owning nation id, built once per rebuild
 * from world.provinces.realIds (compact index -> real id) composed with
 * world.nations.assignment (compact index -> nation). -1 if unowned/unknown. */
export function buildRealIdToNation(
	world: SerializedGenesisWorld,
): Map<number, number> | null {
	if (!world.provinces?.realIds || !world.nations) return null
	const { realIds } = world.provinces
	const { assignment } = world.nations
	const map = new Map<number, number>()
	for (let compact = 0; compact < realIds.length; compact++) {
		const realId = realIds[compact]
		const nation = assignment[compact]
		if (nation >= 0) map.set(realId, nation)
	}
	return map
}

/** Raw EU4 province id -> sovereign root nation id (composed the same way as
 * buildRealIdToNation, from world.nations.sovereign). Two provinces with the
 * same sovereign root belong to the same overlord/vassal hierarchy even if
 * their direct nation ids differ, and must not draw a border between them --
 * mirrors forEachNationBorderSide's vassal-skip in overlay-builders.ts.
 * Without this, every vassal/subject border inside an otherwise-uniform
 * realm would render as a spurious internal line. */
function buildRealIdToSovereign(
	world: SerializedGenesisWorld,
): Map<number, number> | null {
	if (!world.provinces?.realIds || !world.nations?.sovereign) return null
	const { realIds } = world.provinces
	const { sovereign } = world.nations
	const map = new Map<number, number>()
	for (let compact = 0; compact < realIds.length; compact++) {
		const realId = realIds[compact]
		const root = sovereign[compact]
		if (root >= 0) map.set(realId, root)
	}
	return map
}

/** O(1) lookup for active rebel-war attacker/defender pairs, same encoding
 * as overlay-builders.ts's forEachNationBorderSide (nationA*65536+nationB in
 * both directions) -- rebels are released before the war starts, so their
 * sovereign root already differs from their parent's, but we still don't
 * want a border rendered between them while the war is in progress. */
function buildRebelPairs(world: SerializedGenesisWorld): Set<number> {
	const rebelPairs = new Set<number>()
	for (const war of world.nations?.activeRebelWars ?? []) {
		rebelPairs.add(war.attacker * 65536 + war.defender)
		rebelPairs.add(war.defender * 65536 + war.attacker)
	}
	return rebelPairs
}

function isNationBorder(
	nationA: number,
	nationB: number,
	sovereignA: number,
	sovereignB: number,
	rebelPairs: Set<number>,
): boolean {
	if (nationA === nationB) return false
	if (sovereignA === sovereignB) return false
	if (nationA >= 0 && nationB >= 0 && rebelPairs.has(nationA * 65536 + nationB))
		return false
	return true
}

interface Eu4NationBorderContext {
	realIdToNation: Map<number, number>
	realIdToSovereign: Map<number, number>
	rebelPairs: Set<number>
}

/** Bundles everything collectEu4AllNationBorder*Positions needs to decide
 * whether a segment is a real nation border, matching forEachNationBorderSide
 * (overlay-builders.ts) exactly: direct nation, vassal/subject sovereign
 * root, and active-rebel-war pairs. */
export function buildEu4NationBorderContext(
	world: SerializedGenesisWorld,
): Eu4NationBorderContext | null {
	const realIdToNation = buildRealIdToNation(world)
	if (!realIdToNation) return null
	return {
		realIdToNation,
		realIdToSovereign: buildRealIdToSovereign(world) ?? new Map(),
		rebelPairs: buildRebelPairs(world),
	}
}

// lon/lat (degrees) -> unit sphere xyz, matching the convention used
// elsewhere in the genesis pipeline (lat = asin(z), lon = atan2(y, x)).
function lonLatToXyz(
	lonDeg: number,
	latDeg: number,
	radius: number,
): [number, number, number] {
	const lon = (lonDeg * Math.PI) / 180
	const lat = (latDeg * Math.PI) / 180
	const cosLat = Math.cos(lat)
	return [
		Math.cos(lon) * cosLat * radius,
		Math.sin(lon) * cosLat * radius,
		Math.sin(lat) * radius,
	]
}

function appendProjectedSegment(
	positions: number[],
	projection: ReturnType<typeof createMapProjection>,
	lon0Deg: number,
	lat0Deg: number,
	lon1Deg: number,
	lat1Deg: number,
	z: number,
) {
	let lon0 = THREE.MathUtils.degToRad(lon0Deg)
	let lon1 = THREE.MathUtils.degToRad(lon1Deg)
	const lat0 = THREE.MathUtils.degToRad(lat0Deg)
	const lat1 = THREE.MathUtils.degToRad(lat1Deg)
	if (Math.abs(lon1 - lon0) > Math.PI) {
		if (lon0 < lon1) lon0 += 2 * Math.PI
		else lon1 += 2 * Math.PI
		const a = projection.projectRadians(lon0, lat0, z)
		const b = projection.projectRadians(lon1, lat1, z)
		const c = projection.projectRadians(lon0 - 2 * Math.PI, lat0, z)
		const d = projection.projectRadians(lon1 - 2 * Math.PI, lat1, z)
		positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
		positions.push(c[0], c[1], c[2], d[0], d[1], d[2])
		return
	}
	const a = projection.projectRadians(lon0, lat0, z)
	const b = projection.projectRadians(lon1, lat1, z)
	positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
}

function buildThickLineSegments2(
	positions: number[],
	color: number,
	opacity: number,
	lineWidth: number,
	resolution: readonly [number, number],
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

// ── All-nation borders (the always-on thin/thick border layers) ──

function collectEu4AllNationBorderGlobePositions(
	geometry: Eu4ProvinceBorderGeometry,
	context: Eu4NationBorderContext,
	radius: number,
) {
	const positions: number[] = []
	const { realIdToNation, realIdToSovereign, rebelPairs } = context
	const { segmentCount, segmentProvinceA, segmentProvinceB, segmentLonLatDeg } =
		geometry
	for (let i = 0; i < segmentCount; i++) {
		const provinceA = segmentProvinceA[i]
		const provinceB = segmentProvinceB[i]
		const nationA = realIdToNation.get(provinceA) ?? -1
		const nationB = realIdToNation.get(provinceB) ?? -1
		const sovereignA = realIdToSovereign.get(provinceA) ?? -1
		const sovereignB = realIdToSovereign.get(provinceB) ?? -1
		if (!isNationBorder(nationA, nationB, sovereignA, sovereignB, rebelPairs))
			continue
		const a = lonLatToXyz(
			segmentLonLatDeg[4 * i],
			segmentLonLatDeg[4 * i + 1],
			radius,
		)
		const b = lonLatToXyz(
			segmentLonLatDeg[4 * i + 2],
			segmentLonLatDeg[4 * i + 3],
			radius,
		)
		positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
	}
	return positions
}

function collectEu4AllNationBorderMapPositions(
	geometry: Eu4ProvinceBorderGeometry,
	context: Eu4NationBorderContext,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	z: number,
) {
	const positions: number[] = []
	const { realIdToNation, realIdToSovereign, rebelPairs } = context
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { segmentCount, segmentProvinceA, segmentProvinceB, segmentLonLatDeg } =
		geometry
	for (let i = 0; i < segmentCount; i++) {
		const provinceA = segmentProvinceA[i]
		const provinceB = segmentProvinceB[i]
		const nationA = realIdToNation.get(provinceA) ?? -1
		const nationB = realIdToNation.get(provinceB) ?? -1
		const sovereignA = realIdToSovereign.get(provinceA) ?? -1
		const sovereignB = realIdToSovereign.get(provinceB) ?? -1
		if (!isNationBorder(nationA, nationB, sovereignA, sovereignB, rebelPairs))
			continue
		appendProjectedSegment(
			positions,
			projection,
			segmentLonLatDeg[4 * i],
			segmentLonLatDeg[4 * i + 1],
			segmentLonLatDeg[4 * i + 2],
			segmentLonLatDeg[4 * i + 3],
			z,
		)
	}
	return positions
}

export function buildEu4NationBordersGlobe(
	geometry: Eu4ProvinceBorderGeometry,
	context: Eu4NationBorderContext,
	viewMode: GenesisViewMode,
	visible: boolean,
	radius: number,
	resolution: readonly [number, number],
	opts: { color: number; opacity: number; lineWidth: number },
) {
	const positions = collectEu4AllNationBorderGlobePositions(
		geometry,
		context,
		radius,
	)
	return buildThickLineSegments2(
		positions,
		opts.color,
		opts.opacity,
		opts.lineWidth,
		resolution,
		viewMode === "globe" && visible,
	)
}

export function buildEu4NationBordersMap(
	geometry: Eu4ProvinceBorderGeometry,
	context: Eu4NationBorderContext,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	viewMode: GenesisViewMode,
	visible: boolean,
	z: number,
	resolution: readonly [number, number],
	opts: { color: number; opacity: number; lineWidth: number },
) {
	const positions = repeatMapPositions(
		collectEu4AllNationBorderMapPositions(
			geometry,
			context,
			centerLongitudeDeg,
			projectionLatitudeDeg,
			z,
		),
		createMapProjection(centerLongitudeDeg, projectionLatitudeDeg).repeatWidth,
	)
	return buildThickLineSegments2(
		positions,
		opts.color,
		opts.opacity,
		opts.lineWidth,
		resolution,
		viewMode === "map" && visible,
	)
}

// ── Single-nation highlight border (one side of the edge is the nation) ──

export function collectEu4NationBorderGlobePositions(
	geometry: Eu4ProvinceBorderGeometry,
	realIdToNation: Map<number, number>,
	nation: number,
	radius: number,
) {
	const positions: number[] = []
	const { segmentCount, segmentProvinceA, segmentProvinceB, segmentLonLatDeg } =
		geometry
	for (let i = 0; i < segmentCount; i++) {
		const nationA = realIdToNation.get(segmentProvinceA[i]) ?? -1
		const nationB = realIdToNation.get(segmentProvinceB[i]) ?? -1
		if (nationA === nationB || (nationA !== nation && nationB !== nation))
			continue
		const a = lonLatToXyz(
			segmentLonLatDeg[4 * i],
			segmentLonLatDeg[4 * i + 1],
			radius,
		)
		const b = lonLatToXyz(
			segmentLonLatDeg[4 * i + 2],
			segmentLonLatDeg[4 * i + 3],
			radius,
		)
		positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
	}
	return positions
}

export function collectEu4NationBorderMapPositions(
	geometry: Eu4ProvinceBorderGeometry,
	realIdToNation: Map<number, number>,
	nation: number,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	z: number,
) {
	const positions: number[] = []
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { segmentCount, segmentProvinceA, segmentProvinceB, segmentLonLatDeg } =
		geometry
	for (let i = 0; i < segmentCount; i++) {
		const nationA = realIdToNation.get(segmentProvinceA[i]) ?? -1
		const nationB = realIdToNation.get(segmentProvinceB[i]) ?? -1
		if (nationA === nationB || (nationA !== nation && nationB !== nation))
			continue
		appendProjectedSegment(
			positions,
			projection,
			segmentLonLatDeg[4 * i],
			segmentLonLatDeg[4 * i + 1],
			segmentLonLatDeg[4 * i + 2],
			segmentLonLatDeg[4 * i + 3],
			z,
		)
	}
	return positions
}

// ── Single-province highlight border ──

export function collectEu4ProvinceBorderGlobePositions(
	geometry: Eu4ProvinceBorderGeometry,
	provinceRealId: number,
	radius: number,
) {
	const positions: number[] = []
	const { segmentCount, segmentProvinceA, segmentProvinceB, segmentLonLatDeg } =
		geometry
	for (let i = 0; i < segmentCount; i++) {
		if (
			segmentProvinceA[i] !== provinceRealId &&
			segmentProvinceB[i] !== provinceRealId
		)
			continue
		const a = lonLatToXyz(
			segmentLonLatDeg[4 * i],
			segmentLonLatDeg[4 * i + 1],
			radius,
		)
		const b = lonLatToXyz(
			segmentLonLatDeg[4 * i + 2],
			segmentLonLatDeg[4 * i + 3],
			radius,
		)
		positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
	}
	return positions
}

export function collectEu4ProvinceBorderMapPositions(
	geometry: Eu4ProvinceBorderGeometry,
	provinceRealId: number,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	z: number,
) {
	const positions: number[] = []
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { segmentCount, segmentProvinceA, segmentProvinceB, segmentLonLatDeg } =
		geometry
	for (let i = 0; i < segmentCount; i++) {
		if (
			segmentProvinceA[i] !== provinceRealId &&
			segmentProvinceB[i] !== provinceRealId
		)
			continue
		appendProjectedSegment(
			positions,
			projection,
			segmentLonLatDeg[4 * i],
			segmentLonLatDeg[4 * i + 1],
			segmentLonLatDeg[4 * i + 2],
			segmentLonLatDeg[4 * i + 3],
			z,
		)
	}
	return positions
}

export function buildEu4SelectedProvinceBorderGlobe(
	geometry: Eu4ProvinceBorderGeometry,
	provinceRealId: number,
	viewMode: GenesisViewMode,
	radius: number,
	resolution: readonly [number, number],
	opts: { color: number; opacity: number; lineWidth: number },
) {
	const positions = collectEu4ProvinceBorderGlobePositions(
		geometry,
		provinceRealId,
		radius,
	)
	return buildThickLineSegments2(
		positions,
		opts.color,
		opts.opacity,
		opts.lineWidth,
		resolution,
		viewMode === "globe",
	)
}

export function buildEu4SelectedProvinceBorderMap(
	geometry: Eu4ProvinceBorderGeometry,
	provinceRealId: number,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	viewMode: GenesisViewMode,
	z: number,
	resolution: readonly [number, number],
	opts: { color: number; opacity: number; lineWidth: number },
) {
	const positions = collectEu4ProvinceBorderMapPositions(
		geometry,
		provinceRealId,
		centerLongitudeDeg,
		projectionLatitudeDeg,
		z,
	)
	return buildThickLineSegments2(
		positions,
		opts.color,
		opts.opacity,
		opts.lineWidth,
		resolution,
		viewMode === "map",
	)
}
