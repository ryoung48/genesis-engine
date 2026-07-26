import * as THREE from "three"
import type { Eu4ProvinceFillGeometry } from "@/model/earth"
import { darkenPoliticalAtElevation } from "../screen/display/color-helpers"
import { createMapProjection } from "./map-projection"
import { repeatMapPositions } from "./overlay-builders"
import type {
	BuildStripeMeshParams,
	BuildEu4NationFillGlobeParams,
	BuildEu4NationFillMapParams,
	BuildEu4OccupationStripesGlobeParams,
	BuildEu4OccupationStripesMapParams,
} from "./types"

/** lon/lat (degrees) -> elevation in km, same convention as elevation_km
 * (sea level ~= 0, negative underwater). Optional -- when omitted, fill
 * colors render flat with no relief shading. See
 * create-genesis-scene.ts's buildElevationLookup for the caller-side
 * nearest-mesh-region implementation. */
export type ElevationKmForLonLat = (lonDeg: number, latDeg: number) => number

// Paints nation territory for Earth-imported worlds by filling the real EU4
// province polygons (scripts/build-eu4-province-borders.py's fill-geometry
// export) instead of coloring the procedural planet mesh's own Voronoi
// cells -- see eu4-nation-border-overlay.ts for the sibling border-line
// renderer this is designed to sit underneath. Triangulation is performed
// offline in that script; the browser consumes prebuilt triangle lists.

/** Raw EU4 province id -> nation fill color (0-1 RGB), or null to fall back
 * to FALLBACK_COLOR. Left to the caller (GenesisView.tsx) so this module
 * doesn't need to know about FoldedState/nationColorByTag -- same
 * decoupling as buildEu4NationBorderContext's realIdToNation map. */
export type ColorForRawId = (rawId: number) => [number, number, number] | null

const FALLBACK_COLOR: [number, number, number] = [0.75, 0.75, 0.75]

interface TriangulatedGroup {
	provinceId: number
	// Flat [lon, lat, lon, lat, ...] triangle-list vertices (3 per triangle),
	// degrees, emitted offline by build-eu4-province-borders.py.
	positionsLonLatDeg: Float32Array
}

// The triangle groups are emitted offline already flattened by province id.
// We still cache the sliced views so downstream code can keep the same
// per-group walk without rebuilding the array of descriptors every render.
const triangulatedGroupsCache = new WeakMap<
	Eu4ProvinceFillGeometry,
	TriangulatedGroup[]
>()

function getTriangulatedGroups(
	geometry: Eu4ProvinceFillGeometry,
): TriangulatedGroup[] {
	let cached = triangulatedGroupsCache.get(geometry)
	if (!cached) {
		cached = new Array<TriangulatedGroup>(geometry.triangleGroupCount)
		for (let i = 0; i < geometry.triangleGroupCount; i++) {
			const start = geometry.trianglePointOffset[i] * 2
			const end = geometry.trianglePointOffset[i + 1] * 2
			cached[i] = {
				provinceId: geometry.triangleProvinceId[i],
				positionsLonLatDeg: geometry.trianglePointsLonLatDeg.subarray(
					start,
					end,
				),
			}
		}
		triangulatedGroupsCache.set(geometry, cached)
	}
	return cached
}

// lon/lat (degrees) -> unit sphere xyz, matching
// eu4-nation-border-overlay.ts's lonLatToXyz convention.
function lonLatDegToXyz(
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

// Flattened [lon, lat, ...] across every triangulated group, in the same
// vertex order buildEu4NationFillGlobe/Map iterate -- the shared basis both
// the position cache and the elevation cache key their per-vertex work
// against, so the two stay index-aligned without recomputing the walk.
function flattenGroupLonLat(groups: TriangulatedGroup[]): Float32Array {
	let vertexCount = 0
	for (const group of groups) vertexCount += group.positionsLonLatDeg.length / 2
	const flat = new Float32Array(vertexCount * 2)
	let offset = 0
	for (const group of groups) {
		flat.set(group.positionsLonLatDeg, offset)
		offset += group.positionsLonLatDeg.length
	}
	return flat
}

const groupLonLatCache = new WeakMap<Eu4ProvinceFillGeometry, Float32Array>()

function getGroupLonLat(
	geometry: Eu4ProvinceFillGeometry,
	groups: TriangulatedGroup[],
): Float32Array {
	let cached = groupLonLatCache.get(geometry)
	if (!cached) {
		cached = flattenGroupLonLat(groups)
		groupLonLatCache.set(geometry, cached)
	}
	return cached
}

// Vertex positions depend only on the (static) province geometry plus a
// radius/projection, never on nation ownership -- so they're cached and
// only recomputed when the radius/projection actually changes, instead of
// on every timeline scrub tick (which only changes which nation owns which
// province, not where any vertex sits). Single-slot: the hot path (scrub
// with a fixed camera/view) always hits it; a real radius/pan change just
// costs one recompute, same as before this cache existed.
let globePositionCache: {
	geometry: Eu4ProvinceFillGeometry
	radius: number
	positions: Float32Array
} | null = null

function getGlobePositions(
	geometry: Eu4ProvinceFillGeometry,
	lonLat: Float32Array,
	radius: number,
): Float32Array {
	if (
		globePositionCache &&
		globePositionCache.geometry === geometry &&
		globePositionCache.radius === radius
	)
		return globePositionCache.positions
	const positions = new Float32Array((lonLat.length / 2) * 3)
	for (let i = 0, vi = 0; i < lonLat.length; i += 2, vi++) {
		const [x, y, z] = lonLatDegToXyz(lonLat[i], lonLat[i + 1], radius)
		positions[3 * vi] = x
		positions[3 * vi + 1] = y
		positions[3 * vi + 2] = z
	}
	globePositionCache = { geometry, radius, positions }
	return positions
}

let mapPositionCache: {
	geometry: Eu4ProvinceFillGeometry
	z: number
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	positions: Float32Array
} | null = null

function getMapPositions(
	geometry: Eu4ProvinceFillGeometry,
	lonLat: Float32Array,
	projection: ReturnType<typeof createMapProjection>,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	z: number,
): Float32Array {
	if (
		mapPositionCache &&
		mapPositionCache.geometry === geometry &&
		mapPositionCache.z === z &&
		mapPositionCache.centerLongitudeDeg === centerLongitudeDeg &&
		mapPositionCache.projectionLatitudeDeg === projectionLatitudeDeg
	)
		return mapPositionCache.positions
	const base = new Float32Array((lonLat.length / 2) * 3)
	for (let i = 0, vi = 0; i < lonLat.length; i += 2, vi++) {
		const lonRad = THREE.MathUtils.degToRad(lonLat[i])
		const latRad = THREE.MathUtils.degToRad(lonLat[i + 1])
		const [x, y, zPos] = projection.projectRadians(lonRad, latRad, z)
		base[3 * vi] = x
		base[3 * vi + 1] = y
		base[3 * vi + 2] = zPos
	}
	// Tripled here (once per radius/projection change) rather than in every
	// buildEu4NationFillMap call, so a plain color-only rebuild (the common
	// timeline-scrub case) doesn't redo this copy either.
	const positions = Float32Array.from(
		repeatMapPositions(Array.from(base), projection.repeatWidth),
	)
	mapPositionCache = {
		geometry,
		z,
		centerLongitudeDeg,
		projectionLatitudeDeg,
		positions,
	}
	return positions
}

// Per-vertex elevation depends only on province geometry + the world's
// terrain (elevationKmForLonLat, itself cached per mesh in
// create-genesis-scene.ts) -- never on nation ownership/time -- so the
// expensive nearest-mesh-region search behind it runs once per geometry
// per elevation source, not on every scrub tick.
const elevationCache = new WeakMap<
	Eu4ProvinceFillGeometry,
	WeakMap<ElevationKmForLonLat, Float32Array>
>()

function getVertexElevations(
	geometry: Eu4ProvinceFillGeometry,
	lonLat: Float32Array,
	elevationKmForLonLat: ElevationKmForLonLat,
): Float32Array {
	let byFn = elevationCache.get(geometry)
	if (!byFn) {
		byFn = new WeakMap()
		elevationCache.set(geometry, byFn)
	}
	let cached = byFn.get(elevationKmForLonLat)
	if (!cached) {
		const vertexCount = lonLat.length / 2
		cached = new Float32Array(vertexCount)
		for (let i = 0, vi = 0; i < lonLat.length; i += 2, vi++)
			cached[vi] = elevationKmForLonLat(lonLat[i], lonLat[i + 1])
		byFn.set(elevationKmForLonLat, cached)
	}
	return cached
}

// The only genuinely per-rebuild-cheap work: a color lookup + optional
// elevation-darken per vertex (no trig, no spatial search) -- everything
// expensive above is cached and reused across timeline scrub ticks.
function buildVertexColors(
	groups: TriangulatedGroup[],
	colorForRawId: ColorForRawId,
	elevations: Float32Array | null,
): Float32Array {
	let vertexCount = 0
	for (const group of groups) vertexCount += group.positionsLonLatDeg.length / 2
	const colors = new Float32Array(vertexCount * 3)
	let vi = 0
	for (const group of groups) {
		const baseColor = colorForRawId(group.provinceId) ?? FALLBACK_COLOR
		const count = group.positionsLonLatDeg.length / 2
		for (let n = 0; n < count; n++) {
			const color = elevations
				? darkenPoliticalAtElevation(baseColor, elevations[vi])
				: baseColor
			colors[3 * vi] = color[0]
			colors[3 * vi + 1] = color[1]
			colors[3 * vi + 2] = color[2]
			vi++
		}
	}
	return colors
}

/** Recolors an existing fill mesh in place (just the "color" vertex
 * attribute) instead of rebuilding it -- for when only nation ownership
 * changed (e.g. a timeline scrub tick) and the mesh's positions are still
 * valid for the current radius/projection. Skips the BufferGeometry/
 * Material/Mesh allocation and the position buffer's GPU re-upload that a
 * full buildEu4NationFillGlobe/Map call would otherwise redo every tick
 * even though the position data hasn't changed. Caller (create-genesis-
 * scene.ts) is responsible for knowing when this is valid to call --
 * i.e. the mesh was actually built from this same geometry/radius. */
export function updateEu4NationFillGlobeColors(
	mesh: THREE.Mesh,
	geometry: Eu4ProvinceFillGeometry,
	colorForRawId: ColorForRawId,
	elevationKmForLonLat?: ElevationKmForLonLat,
) {
	const groups = getTriangulatedGroups(geometry)
	const lonLat = getGroupLonLat(geometry, groups)
	const elevations = elevationKmForLonLat
		? getVertexElevations(geometry, lonLat, elevationKmForLonLat)
		: null
	const colors = buildVertexColors(groups, colorForRawId, elevations)
	const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute
	;(attr.array as Float32Array).set(colors)
	attr.needsUpdate = true
}

/** Map-mode counterpart of updateEu4NationFillGlobeColors -- same
 * in-place recolor, tripled to match the antimeridian-repeated position
 * buffer (see getMapPositions/repeatMapPositions). */
export function updateEu4NationFillMapColors(
	mesh: THREE.Mesh,
	geometry: Eu4ProvinceFillGeometry,
	colorForRawId: ColorForRawId,
	elevationKmForLonLat?: ElevationKmForLonLat,
) {
	const groups = getTriangulatedGroups(geometry)
	const lonLat = getGroupLonLat(geometry, groups)
	const elevations = elevationKmForLonLat
		? getVertexElevations(geometry, lonLat, elevationKmForLonLat)
		: null
	const colors = repeatTripledColors(
		buildVertexColors(groups, colorForRawId, elevations),
	)
	const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute
	;(attr.array as Float32Array).set(colors)
	attr.needsUpdate = true
}

function buildColoredMesh(
	positions: Float32Array,
	colors: Float32Array,
	visible: boolean,
): { mesh: THREE.Mesh } | null {
	if (positions.length === 0) return null
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
	// transparent + depthWrite:false (opacity is still 1, fully opaque
	// visually) puts this mesh in three.js's back-to-front-sorted transparent
	// render queue alongside the border LineMaterials in
	// eu4-nation-border-overlay.ts, rather than the depth-tested opaque
	// queue terrainMesh renders in -- letting the caller stack fill-under-
	// borders purely via small radius/z offsets (see create-genesis-scene.ts)
	// without fighting the terrain's own depth values.
	const material = new THREE.MeshBasicMaterial({
		vertexColors: true,
		transparent: true,
		opacity: 1,
		depthWrite: false,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.visible = visible
	// Explicit, rather than relying on the transparent queue's automatic
	// back-to-front distance sort against the border LineSegments2 objects
	// (which default to renderOrder 0) -- guarantees the fill always draws
	// before borders regardless of how close their radius/z offsets are.
	mesh.renderOrder = -1
	return { mesh }
}

export function buildEu4NationFillGlobe({
	geometry,
	colorForRawId,
	viewMode,
	visible,
	radius,
	elevationKmForLonLat,
}: BuildEu4NationFillGlobeParams): { mesh: THREE.Mesh } | null {
	const groups = getTriangulatedGroups(geometry)
	const lonLat = getGroupLonLat(geometry, groups)
	const positions = getGlobePositions(geometry, lonLat, radius)
	const elevations = elevationKmForLonLat
		? getVertexElevations(geometry, lonLat, elevationKmForLonLat)
		: null
	const colors = buildVertexColors(groups, colorForRawId, elevations)
	// positions is a shared cached array, read-only here -- safe for
	// multiple BufferAttributes/geometries to reference the same
	// underlying Float32Array (disposing a geometry only frees its GPU
	// buffer, not the JS array), so no defensive copy needed.
	return buildColoredMesh(positions, colors, viewMode === "globe" && visible)
}

export function buildEu4NationFillMap({
	geometry,
	colorForRawId,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	viewMode,
	visible,
	z,
	elevationKmForLonLat,
}: BuildEu4NationFillMapParams): { mesh: THREE.Mesh } | null {
	const groups = getTriangulatedGroups(geometry)
	const lonLat = getGroupLonLat(geometry, groups)
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const positions = getMapPositions(
		geometry,
		lonLat,
		projection,
		centerLongitudeDeg,
		projectionLatitudeDeg,
		z,
	)
	const elevations = elevationKmForLonLat
		? getVertexElevations(geometry, lonLat, elevationKmForLonLat)
		: null
	const colors = buildVertexColors(groups, colorForRawId, elevations)
	// positions is already tripled (see getMapPositions) and shared/cached --
	// same read-only sharing as buildEu4NationFillGlobe, no copy needed.
	return buildColoredMesh(
		positions,
		repeatTripledColors(colors),
		viewMode === "map" && visible,
	)
}

// ── International organization territory highlight ──
//
// Unlike the fill overlay above (which always covers every province, falling
// back to FALLBACK_COLOR for anything colorForRawId doesn't resolve), this
// draws a solid single-color mesh over ONLY an organization's current member
// provinces -- everywhere else is left untouched so non-member nations keep
// showing whatever the current map mode already renders underneath.
//
// This subset-mesh approach (buildOrgFillGlobe/Map, buildOrgStripesGlobe/Map)
// was removed: the underlying EU4 province-polygon triangulation
// (eu4-province-borders-fills.json) only covers ~85% of provinces, so a mesh
// built from it always left visible gaps. Org highlighting is now done
// entirely at the region level (GenesisView.tsx's withOrgHighlight /
// computeOrgStripeOverlay), which has no coverage gap and gets correct
// elevation shading for free from the terrain's own material.

// repeatMapPositions triples the position array (original + two horizontal
// copies); the parallel color attribute needs the same tripling to stay
// index-aligned with it.
function repeatTripledColors(colors: Float32Array): Float32Array {
	const out = new Float32Array(colors.length * 3)
	out.set(colors, 0)
	out.set(colors, colors.length)
	out.set(colors, colors.length * 2)
	return out
}

// ── Occupation-stripe overlay (contested provinces) ──
//
// Reuses the exact same triangulated/positioned geometry as the fill
// overlay above (getTriangulatedGroups/getGroupLonLat/getGlobePositions/
// getMapPositions) so stripes trace the same real province shapes fill
// colors do, instead of the coarser mesh-region-baked stripe this replaces
// (see mesh-builders.ts's onBeforeCompile terrain-shader stripe hack,
// which sits *underneath* this fill overlay on the globe and gets fully
// occluded there). A discard-based ShaderMaterial with depthTest:false and
// a very high renderOrder, mirroring mesh-builders.ts's
// buildMapOccupationOverlay -- draws last, on top of fill and borders
// alike, and is invisible (discarded) everywhere except the diagonal
// stripe band of contested provinces.

function buildStripeAttributes(
	groups: TriangulatedGroup[],
	colorForRawId: ColorForRawId,
): { colors: Float32Array; mask: Float32Array; hasAny: boolean } | null {
	let vertexCount = 0
	for (const group of groups) vertexCount += group.positionsLonLatDeg.length / 2
	const colors = new Float32Array(vertexCount * 3)
	const mask = new Float32Array(vertexCount)
	let vi = 0
	let hasAny = false
	for (const group of groups) {
		const color = colorForRawId(group.provinceId)
		const count = group.positionsLonLatDeg.length / 2
		if (color) {
			hasAny = true
			for (let n = 0; n < count; n++) {
				colors[3 * vi] = color[0]
				colors[3 * vi + 1] = color[1]
				colors[3 * vi + 2] = color[2]
				mask[vi] = 1
				vi++
			}
		} else {
			vi += count
		}
	}
	return hasAny ? { colors, mask, hasAny } : null
}

function buildStripeMesh({
	positions,
	colors,
	mask,
	stripeVertexShader,
	stripeFragmentShader,
	visible,
}: BuildStripeMeshParams): { mesh: THREE.Mesh } | null {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setAttribute("stripeColor", new THREE.BufferAttribute(colors, 3))
	geometry.setAttribute("stripeMask", new THREE.BufferAttribute(mask, 1))
	const material = new THREE.ShaderMaterial({
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		side: THREE.DoubleSide,
		vertexShader: stripeVertexShader,
		fragmentShader: stripeFragmentShader,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.visible = visible
	// Matches buildMapOccupationOverlay's renderOrder -- always drawn last,
	// on top of fill (-1) and borders (0/1) alike.
	mesh.renderOrder = 1000
	return { mesh }
}

const GLOBE_STRIPE_VERTEX_SHADER = `
	attribute vec3 stripeColor;
	attribute float stripeMask;
	varying vec3 vStripeColor;
	varying float vStripeMask;
	varying vec3 vPos;
	void main() {
		vStripeColor = stripeColor;
		vStripeMask = stripeMask;
		vPos = position;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

// lon/lat-from-position + stripe formula matches mesh-builders.ts's terrain
// onBeforeCompile hack exactly, so the stripe band looks the same whether
// it's coming from that path or this one.
const GLOBE_STRIPE_FRAGMENT_SHADER = `
	varying vec3 vStripeColor;
	varying float vStripeMask;
	varying vec3 vPos;
	void main() {
		if (vStripeMask < 0.5) discard;
		float lon = atan(vPos.y, vPos.x);
		float lat = asin(clamp(vPos.z / length(vPos), -1.0, 1.0));
		float stripe = fract((lon + lat) * 100.0);
		if (stripe <= 0.25 || stripe >= 0.75) discard;
		gl_FragColor = vec4(vStripeColor, 0.9);
	}
`

const MAP_STRIPE_VERTEX_SHADER = `
	attribute vec3 stripeColor;
	attribute float stripeMask;
	varying vec3 vStripeColor;
	varying float vStripeMask;
	varying vec2 vStripePos;
	void main() {
		vStripeColor = stripeColor;
		vStripeMask = stripeMask;
		vStripePos = position.xy;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

// Matches buildMapOccupationOverlay's stripe formula exactly.
const MAP_STRIPE_FRAGMENT_SHADER = `
	varying vec3 vStripeColor;
	varying float vStripeMask;
	varying vec2 vStripePos;
	void main() {
		if (vStripeMask < 0.5) discard;
		float stripe = fract((vStripePos.x + vStripePos.y) * 150.0);
		if (stripe <= 0.25 || stripe >= 0.75) discard;
		gl_FragColor = vec4(vStripeColor, 0.9);
	}
`

export function buildEu4OccupationStripesGlobe({
	geometry,
	colorForRawId,
	viewMode,
	visible,
	radius,
}: BuildEu4OccupationStripesGlobeParams): { mesh: THREE.Mesh } | null {
	const groups = getTriangulatedGroups(geometry)
	const attrs = buildStripeAttributes(groups, colorForRawId)
	if (!attrs) return null
	const lonLat = getGroupLonLat(geometry, groups)
	const positions = getGlobePositions(geometry, lonLat, radius)
	return buildStripeMesh({
		positions,
		colors: attrs.colors,
		mask: attrs.mask,
		stripeVertexShader: GLOBE_STRIPE_VERTEX_SHADER,
		stripeFragmentShader: GLOBE_STRIPE_FRAGMENT_SHADER,
		visible: viewMode === "globe" && visible,
	})
}

export function buildEu4OccupationStripesMap({
	geometry,
	colorForRawId,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	viewMode,
	visible,
	z,
}: BuildEu4OccupationStripesMapParams): { mesh: THREE.Mesh } | null {
	const groups = getTriangulatedGroups(geometry)
	const attrs = buildStripeAttributes(groups, colorForRawId)
	if (!attrs) return null
	const lonLat = getGroupLonLat(geometry, groups)
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const positions = getMapPositions(
		geometry,
		lonLat,
		projection,
		centerLongitudeDeg,
		projectionLatitudeDeg,
		z,
	)
	// positions is already tripled (see getMapPositions); the stripe
	// attributes need the same tripling to stay index-aligned with it.
	return buildStripeMesh({
		positions,
		colors: repeatTripledColors(attrs.colors),
		mask: repeatTripledMask(attrs.mask),
		stripeVertexShader: MAP_STRIPE_VERTEX_SHADER,
		stripeFragmentShader: MAP_STRIPE_FRAGMENT_SHADER,
		visible: viewMode === "map" && visible,
	})
}

function repeatTripledMask(mask: Float32Array): Float32Array {
	const out = new Float32Array(mask.length * 3)
	out.set(mask, 0)
	out.set(mask, mask.length)
	out.set(mask, mask.length * 2)
	return out
}
