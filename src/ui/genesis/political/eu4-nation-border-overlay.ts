import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { Eu4ProvinceBorderGeometry } from "@/model/history/earth/data-source/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import { repeatMapPositions } from "@/ui/genesis/renderer/overlay-builders"
import type {
	BuildEu4SelectedProvinceBorderGlobeParams,
	BuildEu4SelectedProvinceBorderMapParams,
	CollectEu4NationBorderMapPositionsParams,
	CollectEu4ProvinceBorderMapPositionsParams,
	GenesisViewMode,
} from "@/ui/genesis/renderer/types"

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
	// True when this segment's provinceB is the raw -1 sentinel written by
	// build-eu4-province-borders.py for a genuine coastline/dataset edge
	// (no neighboring province at all -- see NO_NEIGHBOR_PROVINCE_ID there).
	// Without this, such a segment resolves to nationB = -1 via realIdToNation's
	// `?? -1` fallback -- the exact same value a real, currently-*unowned*
	// province resolves to -- so a coastline edge along an unowned/wasteland
	// province wrongly satisfied `nationA === nationB` (-1 === -1) and got
	// dropped, producing real gaps in the coastline border. A genuine
	// no-neighbor edge must always draw regardless of ownership.
	isNoNeighborEdge = false,
): boolean {
	if (isNoNeighborEdge) return true
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

// Per-segment endpoint xyz, cached per (geometry, radius) -- segment
// coordinates never change once loaded (only which segments count as a
// "border" does, via nation ownership), so recomputing lonLatToXyz for
// every one of ~167k segments on every timeline scrub tick was pure waste.
// Flat Float32Array(segmentCount*6): [ax,ay,az,bx,by,bz] per segment.
const globeSegmentXyzCache = new WeakMap<
	Eu4ProvinceBorderGeometry,
	Map<number, Float32Array>
>()

function getGlobeSegmentXyz(
	geometry: Eu4ProvinceBorderGeometry,
	radius: number,
): Float32Array {
	let byRadius = globeSegmentXyzCache.get(geometry)
	if (!byRadius) {
		byRadius = new Map()
		globeSegmentXyzCache.set(geometry, byRadius)
	}
	let cached = byRadius.get(radius)
	if (!cached) {
		const { segmentCount, segmentLonLatDeg } = geometry
		cached = new Float32Array(segmentCount * 6)
		for (let i = 0; i < segmentCount; i++) {
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
			const o = 6 * i
			cached[o] = a[0]
			cached[o + 1] = a[1]
			cached[o + 2] = a[2]
			cached[o + 3] = b[0]
			cached[o + 4] = b[1]
			cached[o + 5] = b[2]
		}
		byRadius.set(radius, cached)
	}
	return cached
}

// Map-mode counterpart. Variable-length per segment (appendProjectedSegment
// emits 2 points normally, 4 when a segment straddles the antimeridian), so
// this uses the same offset-table convention as
// eu4-nation-fill-overlay.ts/data-source.ts's fill-ring records: `offset[i]`
// is the float-index into `positions` where segment i's points begin, with
// `segmentCount + 1` entries. Independent of centerLongitudeDeg/
// projectionLatitudeDeg -- createMapProjection's projectRadians (unlike
// projectDegrees) doesn't rotate by center, it only scales, so those two
// params don't affect this cache's contents (confirmed by
// collectEu4AllNationBorderMapPositions never passing them through to
// appendProjectedSegment either, historically).
interface MapSegmentCache {
	positions: Float32Array
	offset: Int32Array
}

const mapSegmentCache = new WeakMap<
	Eu4ProvinceBorderGeometry,
	Map<number, MapSegmentCache>
>()

function getMapSegmentCache(
	geometry: Eu4ProvinceBorderGeometry,
	z: number,
): MapSegmentCache {
	let byZ = mapSegmentCache.get(geometry)
	if (!byZ) {
		byZ = new Map()
		mapSegmentCache.set(geometry, byZ)
	}
	let cached = byZ.get(z)
	if (!cached) {
		const { segmentCount, segmentLonLatDeg } = geometry
		const projection = createMapProjection(0, 0)
		const offset = new Int32Array(segmentCount + 1)
		const chunks: number[] = []
		for (let i = 0; i < segmentCount; i++) {
			offset[i] = chunks.length
			appendProjectedSegment(
				chunks,
				projection,
				segmentLonLatDeg[4 * i],
				segmentLonLatDeg[4 * i + 1],
				segmentLonLatDeg[4 * i + 2],
				segmentLonLatDeg[4 * i + 3],
				z,
			)
		}
		offset[segmentCount] = chunks.length
		cached = { positions: Float32Array.from(chunks), offset }
		byZ.set(z, cached)
	}
	return cached
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
	const xyz = getGlobeSegmentXyz(geometry, radius)
	const positions: number[] = []
	const { realIdToNation, realIdToSovereign, rebelPairs } = context
	const { segmentCount, segmentProvinceA, segmentProvinceB } = geometry
	for (let i = 0; i < segmentCount; i++) {
		const provinceA = segmentProvinceA[i]
		const provinceB = segmentProvinceB[i]
		const nationA = realIdToNation.get(provinceA) ?? -1
		const nationB = realIdToNation.get(provinceB) ?? -1
		const sovereignA = realIdToSovereign.get(provinceA) ?? -1
		const sovereignB = realIdToSovereign.get(provinceB) ?? -1
		if (
			!isNationBorder(
				nationA,
				nationB,
				sovereignA,
				sovereignB,
				rebelPairs,
				provinceB < 0,
			)
		)
			continue
		const o = 6 * i
		positions.push(
			xyz[o],
			xyz[o + 1],
			xyz[o + 2],
			xyz[o + 3],
			xyz[o + 4],
			xyz[o + 5],
		)
	}
	return positions
}

function collectEu4AllNationBorderMapPositions(
	geometry: Eu4ProvinceBorderGeometry,
	context: Eu4NationBorderContext,
	z: number,
) {
	const { positions: cachedPositions, offset } = getMapSegmentCache(geometry, z)
	const positions: number[] = []
	const { realIdToNation, realIdToSovereign, rebelPairs } = context
	const { segmentCount, segmentProvinceA, segmentProvinceB } = geometry
	for (let i = 0; i < segmentCount; i++) {
		const provinceA = segmentProvinceA[i]
		const provinceB = segmentProvinceB[i]
		const nationA = realIdToNation.get(provinceA) ?? -1
		const nationB = realIdToNation.get(provinceB) ?? -1
		const sovereignA = realIdToSovereign.get(provinceA) ?? -1
		const sovereignB = realIdToSovereign.get(provinceB) ?? -1
		if (
			!isNationBorder(
				nationA,
				nationB,
				sovereignA,
				sovereignB,
				rebelPairs,
				provinceB < 0,
			)
		)
			continue
		for (let k = offset[i]; k < offset[i + 1]; k++)
			positions.push(cachedPositions[k])
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
	// centerLongitudeDeg/projectionLatitudeDeg aren't threaded into the
	// cached collector below -- see getMapSegmentCache's doc comment: this
	// map projection mode doesn't rotate by center, only scale, so segment
	// positions are the same regardless (repeatWidth is likewise a fixed
	// constant, not center-dependent).
	const positions = repeatMapPositions(
		collectEu4AllNationBorderMapPositions(geometry, context, z),
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

export function collectEu4NationBorderMapPositions({
	geometry,
	realIdToNation,
	nation,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	z,
}: CollectEu4NationBorderMapPositionsParams) {
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

export function collectEu4ProvinceBorderMapPositions({
	geometry,
	provinceRealId,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	z,
}: CollectEu4ProvinceBorderMapPositionsParams) {
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

export function buildEu4SelectedProvinceBorderGlobe({
	geometry,
	provinceRealId,
	viewMode,
	radius,
	resolution,
	opts,
}: BuildEu4SelectedProvinceBorderGlobeParams) {
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

export function buildEu4SelectedProvinceBorderMap({
	geometry,
	provinceRealId,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	viewMode,
	z,
	resolution,
	opts,
}: BuildEu4SelectedProvinceBorderMapParams) {
	const positions = collectEu4ProvinceBorderMapPositions({
		geometry,
		provinceRealId,
		centerLongitudeDeg,
		projectionLatitudeDeg,
		z,
	})
	return buildThickLineSegments2(
		positions,
		opts.color,
		opts.opacity,
		opts.lineWidth,
		resolution,
		viewMode === "map",
	)
}
