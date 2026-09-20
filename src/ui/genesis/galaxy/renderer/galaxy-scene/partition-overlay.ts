import { Delaunay } from "d3-delaunay"
import * as THREE from "three"
import { Text } from "troika-three-text"
import { GALAXY_IDENTITY } from "@/model/celestial/galaxy/galaxy-identity"
import type { Galaxy } from "@/model/celestial/galaxy/types"
import jedarFontUrl from "@/ui/assets/fonts/Jedar.otf"
import { uiPalette } from "@/ui/components/tokens"

// Nation-overlay defaults (unchanged). The cultures overlay passes higher
// values via PartitionOverlayInput so its partition fills read closer to
// their true palette color rather than a faint tint.
const TINT_ALPHA = 0.4
const BORDER_OPACITY = 0.85
const CULTURE_TINT_ALPHA = 0.68
const CULTURE_BORDER_OPACITY = 0.95
// World-space half-width of each side of a border (so the whole stroke is
// twice this) -- a fraction of the galaxy's own radius rather than a fixed
// pixel size, so it stays visually consistent across galaxy sizes and zoom
// levels (this is a real Mesh, not a screen-space line material).
const BORDER_HALF_WIDTH_FRACTION = 0.0018
const SECTOR_BORDER_HALF_WIDTH_FRACTION = 0.0015
const SECTOR_DOT_PERIOD_FRACTION = 0.008
// Diagonal culture-blend stripe wavelength, as a fraction of the galaxy's
// own radius -- one light + one dark band per this much world distance.
const STRIPE_PERIOD_FRACTION = 0.012
// Neutral fallback fill/border color for any system with no nation
// (r_edge/boundary systems) -- see this function's own doc comment on why
// every cell, claimed or not, gets SOME fill rather than being left blank.
const UNCLAIMED_COLOR: [number, number, number] = [0.14, 0.14, 0.16]
const LABEL_COLOR = "#f8fafc"
// Final font-size multipliers (of baseFontSize) at the smallest and largest
// nation -- a wide spread so a size-1 nation's label reads as clearly minor
// next to a multi-hundred-system empire's, not just a slight variation.
const LABEL_MIN_FONT_SCALE = 0.35
const LABEL_MAX_FONT_SCALE = 2.6
const LABEL_BASE_FONT_FRACTION = 0.008
// How far above its capital star each nation label sits, as a multiple of
// that label's own font size.
const LABEL_VERTICAL_OFFSET_SCALE = 0.9

// No geometric clip is applied to a cell's polygon or a border segment (see
// this file's own build doc comment on why a real boundary/gap-edge system's
// Voronoi cell can be legitimately huge) -- instead both the fill and the
// border meshes fade to fully transparent, per-fragment, as distance from
// the galaxy's center approaches/passes radius.max, or drops below
// radius.min (the empty core hole). Since there's no hard clip doing the
// real work here, this band has to be wide enough to actually finish fading
// an oversized cell out before it would otherwise become visible sticking
// out past the disk -- unlike a clip's mathematically exact boundary, a
// fade is inherently a "how much do we hide" tradeoff against "how much
// real territory dims near the edge."
const OUTER_FADE_START_FRACTION = 0.86
const OUTER_FADE_END_FRACTION = 1.05
// smoothstep(edge0, edge1, x) requires edge0 < edge1 -- the inner fade goes
// from fully transparent AT the hole (radius.min) up to fully opaque a bit
// further out, so its "start" (low edge, alpha 0) must be the SMALLER
// fraction and its "end" (high edge, alpha 1) the LARGER one, the opposite
// order from how they're named/used below (uInnerFadeStart is always the
// smaller value passed as smoothstep's first argument).
const INNER_FADE_END_FRACTION = 0.9
const INNER_FADE_START_FRACTION = 1.1

// The radial fade above only hides the disk's outer rim and core hole -- it
// can't follow the spiral, so a Voronoi cell that balloons across an inter-
// arm gap (its site has no near neighbour in that direction) still gets
// painted solid. This second fade fixes that: every fill/border vertex
// carries its distance to the real star it belongs to (a cell vertex's own
// circumradius, in practice), and fragments fade out past a few times the
// galaxy's median star spacing -- so tint pools around where stars actually
// are and dissolves in the gaps, tracing the arms instead of a flat annulus.
const SITE_FADE_START_SPACINGS = 2.2
const SITE_FADE_END_SPACINGS = 4.6

const RADIAL_FADE_GLSL = /* glsl */ `
	varying vec2 vPos;
	varying float vSiteDist;
	uniform float uInnerFadeStart;
	uniform float uInnerFadeEnd;
	uniform float uOuterFadeStart;
	uniform float uOuterFadeEnd;
	uniform float uSiteFadeStart;
	uniform float uSiteFadeEnd;
	float radialFade() {
		float dist = length(vPos);
		float disk = smoothstep(uInnerFadeStart, uInnerFadeEnd, dist) *
			(1.0 - smoothstep(uOuterFadeStart, uOuterFadeEnd, dist));
		float site = 1.0 - smoothstep(uSiteFadeStart, uSiteFadeEnd, vSiteDist);
		return disk * site;
	}
`

// Shared by both the fill and the border meshes -- both are just a flat
// vertex-colored triangle soup with the same radial alpha fade, so there's
// no need for two separate shader pairs.
const TINT_VERTEX_SHADER = /* glsl */ `
	attribute vec3 color;
	attribute float siteDist;
	varying vec3 vColor;
	varying vec2 vPos;
	varying float vSiteDist;
	void main() {
		vColor = color;
		vPos = position.xy;
		vSiteDist = siteDist;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const TINT_FRAGMENT_SHADER = /* glsl */ `
	varying vec3 vColor;
	uniform float uAlpha;
	${RADIAL_FADE_GLSL}
	void main() {
		gl_FragColor = vec4(vColor, uAlpha * radialFade());
	}
`

const SECTOR_VERTEX_SHADER = /* glsl */ `
	attribute float siteDist;
	attribute float chainDistance;
	attribute float across;
	varying vec2 vPos;
	varying float vSiteDist;
	varying float vChainDistance;
	varying float vAcross;
	void main() {
		vPos = position.xy;
		vSiteDist = siteDist;
		vChainDistance = chainDistance;
		vAcross = across;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const SECTOR_FRAGMENT_SHADER = /* glsl */ `
	varying float vChainDistance;
	varying float vAcross;
	uniform vec3 uColor;
	uniform float uPeriod;
	uniform float uHalfWidth;
	${RADIAL_FADE_GLSL}
	void main() {
		float along = mod(vChainDistance, uPeriod) - uPeriod * 0.5;
		float dot = 1.0 - smoothstep(uHalfWidth * 0.7, uHalfWidth, length(vec2(along, vAcross * uHalfWidth)));
		gl_FragColor = vec4(uColor, dot * 0.7 * radialFade());
	}
`

// The fill mesh's own shader pair: the shared tint above plus a diagonal
// border-bleed stripe. A cell whose system was flagged by the culture blend
// pass (blendAmt > 0) alternates between its own color and its secondary
// culture's color in world-space diagonal bands -- the galaxy-map analogue
// of the planet map's culture-blend stripes. blendAmt is 0 (and blendColor
// == color) for every cell in the nations overlay, so this reduces exactly
// to TINT_* there.
const FILL_VERTEX_SHADER = /* glsl */ `
	attribute vec3 color;
	attribute float siteDist;
	attribute vec3 blendColor;
	attribute float blendAmt;
	varying vec3 vColor;
	varying vec3 vBlendColor;
	varying float vBlendAmt;
	varying vec2 vPos;
	varying float vSiteDist;
	void main() {
		vColor = color;
		vBlendColor = blendColor;
		vBlendAmt = blendAmt;
		vPos = position.xy;
		vSiteDist = siteDist;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const FILL_FRAGMENT_SHADER = /* glsl */ `
	varying vec3 vColor;
	varying vec3 vBlendColor;
	varying float vBlendAmt;
	uniform float uAlpha;
	uniform float uStripeFreq;
	${RADIAL_FADE_GLSL}
	void main() {
		float stripe = step(0.5, fract((vPos.x + vPos.y) * uStripeFreq));
		vec3 c = mix(vColor, vBlendColor, stripe * step(0.0001, vBlendAmt));
		gl_FragColor = vec4(c, uAlpha * radialFade());
	}
`

function nextHalfedge(e: number): number {
	return e % 3 === 2 ? e - 2 : e + 1
}

function isClosedPolygon(
	polygon: readonly (readonly [number, number])[],
): boolean {
	if (polygon.length < 2) return false
	const [ax, ay] = polygon[0]!
	const [bx, by] = polygon[polygon.length - 1]!
	return ax === bx && ay === by
}

/** Cohen-Sutherland line-segment clip against an axis-aligned box -- ported
 * from galaxy-gen's own nation-overlay.ts clipSegment. Only needed here to
 * keep a border segment's raw circumcenter math from producing wild
 * coordinates outside the bbox d3-delaunay itself clips cells to. Returns
 * null if the segment falls entirely outside the box. */
function clipSegment(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	xmin: number,
	ymin: number,
	xmax: number,
	ymax: number,
): [number, number, number, number] | null {
	const INSIDE = 0
	const LEFT = 1
	const RIGHT = 2
	const BOTTOM = 4
	const TOP = 8
	const outCode = (x: number, y: number) => {
		let code = INSIDE
		if (x < xmin) code |= LEFT
		else if (x > xmax) code |= RIGHT
		if (y < ymin) code |= BOTTOM
		else if (y > ymax) code |= TOP
		return code
	}
	let ax = x0
	let ay = y0
	let bx = x1
	let by = y1
	let outA = outCode(ax, ay)
	let outB = outCode(bx, by)
	for (;;) {
		if (!(outA | outB)) return [ax, ay, bx, by]
		if (outA & outB) return null
		const out = outA || outB
		let x = 0
		let y = 0
		if (out & TOP) {
			x = ax + ((bx - ax) * (ymax - ay)) / (by - ay)
			y = ymax
		} else if (out & BOTTOM) {
			x = ax + ((bx - ax) * (ymin - ay)) / (by - ay)
			y = ymin
		} else if (out & RIGHT) {
			y = ay + ((by - ay) * (xmax - ax)) / (bx - ax)
			x = xmax
		} else {
			y = ay + ((by - ay) * (xmin - ax)) / (bx - ax)
			x = xmin
		}
		if (out === outA) {
			ax = x
			ay = y
			outA = outCode(ax, ay)
		} else {
			bx = x
			by = y
			outB = outCode(bx, by)
		}
	}
}

interface RawBorderEdge {
	p1x: number
	p1y: number
	p2x: number
	p2y: number
	regionLo: number
	regionHi: number
	/** Unit perpendicular (NOT yet scaled to borderHalfWidth) pointing from
	 * the segment toward whichever real system owns regionLo -- comparable
	 * across every edge in the same (regionLo, regionHi) pair-group
	 * regardless of which of that edge's own two systems happened to own
	 * which region, which is what lets buildChainRibbon average adjacent
	 * edges' directions into one shared joint perpendicular. */
	dirX: number
	dirY: number
	/** Distance from each endpoint to a star of one of its two flanking
	 * systems (its own circumradius) -- feeds the per-vertex site fade. */
	d1: number
	d2: number
}

interface BorderChain {
	regionLo: number
	regionHi: number
	vertices: { x: number; y: number }[]
	/** One per edge between consecutive vertices -- segmentDirs.length is
	 * always vertices.length - 1. */
	segmentDirs: { x: number; y: number }[]
	/** Parallel to vertices -- each vertex's distance to its nearest flanking
	 * star (see RawBorderEdge.d1/d2). */
	vertexDists: number[]
}

/**
 * Groups raw border edges by the pair of regions they separate, then
 * stitches each group's edges into continuous polyline chains wherever two
 * edges share an endpoint -- the standard "edges to boundary chains"
 * recipe (see galaxy-gen's own model/utilities/voronoi/index.ts VORONOI.
 * boundary, which does the same forward/backward stitching, just against a
 * different edge representation). A chain only ends where a third region's
 * edge appears at that vertex (a genuine tripoint) or where the underlying
 * edge set is itself disconnected, never in the middle of an otherwise-
 * continuous boundary.
 */
function buildBorderChains(edges: readonly RawBorderEdge[]): BorderChain[] {
	const pointKey = (x: number, y: number) => `${x.toFixed(3)}:${y.toFixed(3)}`

	const groups = new Map<string, RawBorderEdge[]>()
	for (const edge of edges) {
		const key = `${edge.regionLo}:${edge.regionHi}`
		const group = groups.get(key)
		if (group) group.push(edge)
		else groups.set(key, [edge])
	}

	const chains: BorderChain[] = []
	for (const [key, groupEdges] of groups) {
		const [regionLo, regionHi] = key.split(":").map(Number) as [number, number]
		const used = new Uint8Array(groupEdges.length)
		const endpointMap = new Map<
			string,
			{ edgeIndex: number; end: "p1" | "p2" }[]
		>()
		for (let i = 0; i < groupEdges.length; i++) {
			const e = groupEdges[i]!
			for (const [end, x, y] of [
				["p1", e.p1x, e.p1y],
				["p2", e.p2x, e.p2y],
			] as const) {
				const k = pointKey(x, y)
				const list = endpointMap.get(k)
				if (list) list.push({ edgeIndex: i, end })
				else endpointMap.set(k, [{ edgeIndex: i, end }])
			}
		}

		for (let startIdx = 0; startIdx < groupEdges.length; startIdx++) {
			if (used[startIdx]) continue
			used[startIdx] = 1
			const e0 = groupEdges[startIdx]!
			const vertices = [
				{ x: e0.p1x, y: e0.p1y },
				{ x: e0.p2x, y: e0.p2y },
			]
			const segmentDirs = [{ x: e0.dirX, y: e0.dirY }]
			const vertexDists = [e0.d1, e0.d2]

			for (let extended = true; extended; ) {
				extended = false
				const last = vertices[vertices.length - 1]!
				for (const cand of endpointMap.get(pointKey(last.x, last.y)) ?? []) {
					if (used[cand.edgeIndex]) continue
					const e = groupEdges[cand.edgeIndex]!
					used[cand.edgeIndex] = 1
					const isP1 = cand.end === "p1"
					vertices.push(isP1 ? { x: e.p2x, y: e.p2y } : { x: e.p1x, y: e.p1y })
					segmentDirs.push({ x: e.dirX, y: e.dirY })
					vertexDists.push(isP1 ? e.d2 : e.d1)
					extended = true
					break
				}
			}
			for (let extended = true; extended; ) {
				extended = false
				const first = vertices[0]!
				for (const cand of endpointMap.get(pointKey(first.x, first.y)) ?? []) {
					if (used[cand.edgeIndex]) continue
					const e = groupEdges[cand.edgeIndex]!
					used[cand.edgeIndex] = 1
					const isP1 = cand.end === "p1"
					vertices.unshift(
						isP1 ? { x: e.p2x, y: e.p2y } : { x: e.p1x, y: e.p1y },
					)
					segmentDirs.unshift({ x: e.dirX, y: e.dirY })
					vertexDists.unshift(isP1 ? e.d2 : e.d1)
					extended = true
					break
				}
			}

			chains.push({ regionLo, regionHi, vertices, segmentDirs, vertexDists })
		}
	}
	return chains
}

/**
 * Tessellates one border chain into a two-toned ribbon: at every interior
 * joint, the perpendicular used is the average of its two adjacent
 * segments' own directions (renormalized to borderHalfWidth) -- an
 * approximate but simple and robust miter join, shared identically by both
 * segments meeting there, which is what makes consecutive quads connect
 * with no gap and no crossing regardless of the angle between them. An
 * endpoint (no second adjacent segment) just uses its one segment's own
 * direction.
 */
function buildChainRibbon(
	chain: BorderChain,
	halfWidth: number,
	colorLo: readonly [number, number, number],
	colorHi: readonly [number, number, number],
	positions: number[],
	colors: number[],
	dists: number[],
): void {
	const n = chain.vertices.length
	if (n < 2) return
	const perp: { x: number; y: number }[] = new Array(n)
	for (let i = 0; i < n; i++) {
		let dx = 0
		let dy = 0
		if (i > 0) {
			dx += chain.segmentDirs[i - 1]!.x
			dy += chain.segmentDirs[i - 1]!.y
		}
		if (i < n - 1) {
			dx += chain.segmentDirs[i]!.x
			dy += chain.segmentDirs[i]!.y
		}
		const len = Math.hypot(dx, dy) || 1
		perp[i] = { x: (dx / len) * halfWidth, y: (dy / len) * halfWidth }
	}

	const [rLo, gLo, bLo] = colorLo
	const [rHi, gHi, bHi] = colorHi
	for (let i = 0; i < n - 1; i++) {
		const a = chain.vertices[i]!
		const b = chain.vertices[i + 1]!
		const pa = perp[i]!
		const pb = perp[i + 1]!
		const di = chain.vertexDists[i]!
		const dj = chain.vertexDists[i + 1]!
		// Matches the a/b-derived vertex order of both quad-pairs pushed below.
		for (let k = 0; k < 2; k++) dists.push(di, dj, dj, di, dj, di)

		positions.push(
			a.x,
			a.y,
			0,
			b.x,
			b.y,
			0,
			b.x + pb.x,
			b.y + pb.y,
			0,
			a.x,
			a.y,
			0,
			b.x + pb.x,
			b.y + pb.y,
			0,
			a.x + pa.x,
			a.y + pa.y,
			0,
		)
		for (let k = 0; k < 6; k++) colors.push(rLo, gLo, bLo)

		positions.push(
			a.x,
			a.y,
			0,
			b.x,
			b.y,
			0,
			b.x - pb.x,
			b.y - pb.y,
			0,
			a.x,
			a.y,
			0,
			b.x - pb.x,
			b.y - pb.y,
			0,
			a.x - pa.x,
			a.y - pa.y,
			0,
		)
		for (let k = 0; k < 6; k++) colors.push(rHi, gHi, bHi)
	}
}

export interface PartitionOverlayResult {
	group: THREE.Group
	dispose(): void
}

export interface PartitionOverlayInput {
	galaxy: Pick<Galaxy, "numSystems" | "r_xy" | "r_edge" | "radius">
	/** Partition index per system, -1 for edge/unassigned. */
	assignment: Int32Array
	/** Interleaved rgb (0-1) per partition. */
	colors: Float32Array
	/** Capital system index per partition. */
	seeds: Int32Array
	/** System count per partition. */
	size: Int32Array
	/** Display name for a partition index (nation vs. culture naming). */
	labelText: (partitionIndex: number) => string
	/** [JUSTIFICATION] Only the cultures overlay carries a border bleed; the
	 * nations overlay passes nothing and every cell renders a flat fill. */
	blend?: { secondary: Int32Array; weight: Float32Array }
	/** [JUSTIFICATION] Both default to the nation-overlay values; the cultures
	 * overlay overrides them to render more opaque. */
	fillAlpha?: number
	borderAlpha?: number
	/** [JUSTIFICATION] Defaults on for nations; the cultures overlay turns the
	 * two-toned border ribbons off and conveys boundaries via blend stripes. */
	showBorders?: boolean
	// [JUSTIFICATION] Only the nations overlay renders sector boundaries.
	sectorAssignment?: Int32Array
}

/**
 * Builds a galaxy partition overlay (nations or cultures) -- a flat color
 * fill over every system's own Voronoi cell, a two-toned border strip along
 * every cell edge where the two neighboring systems belong to different
 * partitions (or one is unassigned), and one camera-facing name label per
 * partition, centered on its capital and sized by partition size. When
 * `blend` is supplied (cultures), a flagged cell additionally renders
 * diagonal secondary-color stripes.
 *
 * Loosely follows galaxy-gen's own scaled/renderer/geometry/nation-overlay.ts
 * (same d3-delaunay-based Voronoi approach, same "fill every cell, unclaimed
 * included, with a neutral fallback color" rule so nothing reads as a hard-
 * edged gap), but with one addition galaxy-gen doesn't need: unlike that
 * codebase's plain circular point placement, GALAXY_PACKING.place layers a
 * full density-wave transform (eccentric per-radius ellipses, a radius-
 * dependent tilt, and a perturbation term) on top to paint spiral arms,
 * which creates genuinely sparse inter-arm gaps ANYWHERE in the disk, not
 * just near its two radii. A system sitting at the edge of such a gap has
 * no close real neighbor in that direction, so its true Voronoi cell
 * legitimately balloons out to meet whatever real point is next closest.
 * Rather than geometrically clipping that shape away (which either distorts
 * it or requires real polygon-vs-disk boolean ops), both the fill and the
 * border meshes fade to fully transparent, per-fragment, based on distance
 * from the galaxy's center -- see RADIAL_FADE_GLSL and its own uniforms --
 * so an oversized cell simply dissolves into nothing well before it would
 * otherwise poke out past the disk or into the empty core hole.
 *
 * Each border edge is a single quad-pair mesh split exactly down its own
 * true centerline (the real Voronoi edge itself -- no offset copies): one
 * triangle pair colored by the system on one side, one by the system on the
 * other. Splitting at the shared centerline (rather than drawing two
 * independently-offset parallel lines, which an earlier version of this
 * file did) is what keeps adjacent edges meeting cleanly at a shared
 * Voronoi vertex -- every edge's near corner is exactly that vertex, so
 * there's no arbitrary sideways offset for two unrelated edges' strokes to
 * cross into an "X", and no gap between them either.
 *
 * Labels reuse the same troika-three-text setup as body-name-label.ts, but
 * need no per-frame billboarding -- this view's camera is a fixed top-down
 * orthographic projection (see GalaxyRendererThree's adjustCamera), so text
 * laid flat in the XY plane already faces it.
 */
export function buildPartitionOverlay(
	input: PartitionOverlayInput,
): PartitionOverlayResult {
	const {
		galaxy,
		assignment,
		colors: partitionColors,
		seeds,
		size,
		blend,
	} = input
	const labelText = input.labelText
	const fillAlpha = input.fillAlpha ?? TINT_ALPHA
	const borderAlpha = input.borderAlpha ?? BORDER_OPACITY
	const showBorders = input.showBorders ?? true
	const sectorAssignment = input.sectorAssignment
	const { numSystems, r_xy, r_edge, radius } = galaxy

	// Generous bbox for d3-delaunay's own clip -- just needs to comfortably
	// exceed the fade zone below so nothing gets truncated before the shader
	// fade gets a chance to hide it.
	const xmin = -radius.max * 1.5
	const ymin = -radius.max * 1.5
	const xmax = radius.max * 1.5
	const ymax = radius.max * 1.5

	// uInnerFadeStart must be the SMALLER value (smoothstep's low edge,
	// alpha 0) and uInnerFadeEnd the LARGER one (high edge, alpha 1) -- see
	// INNER_FADE_END_FRACTION/INNER_FADE_START_FRACTION's own comment.
	const innerFadeStart = radius.min * INNER_FADE_END_FRACTION
	const innerFadeEnd = radius.min * INNER_FADE_START_FRACTION
	const outerFadeStart = radius.max * OUTER_FADE_START_FRACTION
	const outerFadeEnd = radius.max * OUTER_FADE_END_FRACTION
	const borderHalfWidth = radius.max * BORDER_HALF_WIDTH_FRACTION
	const stripeFreq = 1 / Math.max(radius.max * STRIPE_PERIOD_FRACTION, 1e-6)
	const colorFor = (partition: number): readonly [number, number, number] =>
		partition >= 0
			? [
					partitionColors[3 * partition]!,
					partitionColors[3 * partition + 1]!,
					partitionColors[3 * partition + 2]!,
				]
			: UNCLAIMED_COLOR

	const indices = Array.from({ length: numSystems }, (_, i) => i)
	const delaunay = Delaunay.from(
		indices,
		(i) => r_xy[2 * i]!,
		(i) => r_xy[2 * i + 1]!,
	)
	const voronoi = delaunay.voronoi([xmin, ymin, xmax, ymax])

	// Median nearest-neighbour distance among real systems -- the scale the
	// site fade (see SITE_FADE_*) is expressed in, so it adapts to galaxy
	// size and star count without a hand-tuned world-space constant.
	const spacings: number[] = []
	for (let i = 0; i < numSystems; i++) {
		if (r_edge[i]) continue
		let nearest = Number.POSITIVE_INFINITY
		for (const j of delaunay.neighbors(i)) {
			if (r_edge[j]) continue
			const dx = r_xy[2 * i]! - r_xy[2 * j]!
			const dy = r_xy[2 * i + 1]! - r_xy[2 * j + 1]!
			nearest = Math.min(nearest, Math.hypot(dx, dy))
		}
		if (Number.isFinite(nearest)) spacings.push(nearest)
	}
	spacings.sort((a, b) => a - b)
	const medianSpacing = Math.max(
		spacings[spacings.length >> 1] ?? radius.max * 0.02,
		radius.max * 1e-4,
	)
	const siteFadeStart = medianSpacing * SITE_FADE_START_SPACINGS
	const siteFadeEnd = medianSpacing * SITE_FADE_END_SPACINGS

	// --- borders ---
	// Every raw Voronoi edge between two differently-owned systems is
	// collected first (with a per-edge "which real system sits on the lower-
	// index region's side" direction), then edges belonging to the SAME pair
	// of neighboring regions are stitched together into continuous polyline
	// chains wherever they share an endpoint (see buildBorderChains) --
	// exactly the two regions any real border, cartographically, actually
	// separates: a chain only ends where a third region appears (a genuine
	// tripoint), never in the middle of an otherwise-continuous boundary.
	// Each chain is then tessellated into a ribbon (buildChainRibbon) with a
	// shared, averaged perpendicular at every interior joint, so consecutive
	// segments connect with no gap and no "X" crossing -- unlike extruding
	// each edge as an independent quad (what an earlier version of this file
	// did), which only ever meets its neighbors at a single shared point,
	// not along a shared edge, leaving visible gaps between segments meeting
	// at anything but a perfectly straight angle.
	const { triangles, halfedges } = delaunay
	const { circumcenters } = voronoi
	const rawBorderEdges: RawBorderEdge[] = []
	const rawSectorEdges: RawBorderEdge[] = []
	for (let s = 0; showBorders && s < halfedges.length; s++) {
		const opposite = halfedges[s]!
		if (opposite === -1 || s >= opposite) continue
		const sysA = triangles[s]!
		const sysB = triangles[nextHalfedge(s)]!
		const na = assignment[sysA]!
		const nb = assignment[sysB]!
		const sa = sectorAssignment?.[sysA] ?? -1
		const sb = sectorAssignment?.[sysB] ?? -1
		const sectorBoundary = na >= 0 && na === nb && sa !== sb
		if (na === nb && !sectorBoundary) continue
		const t1 = Math.floor(s / 3)
		const t2 = Math.floor(opposite / 3)
		const seg = clipSegment(
			circumcenters[2 * t1]!,
			circumcenters[2 * t1 + 1]!,
			circumcenters[2 * t2]!,
			circumcenters[2 * t2 + 1]!,
			xmin,
			ymin,
			xmax,
			ymax,
		)
		if (!seg) continue

		// The border segment sits on the perpendicular bisector of sysA and
		// sysB, so the direction from whichever of them owns regionHi TO
		// whichever owns regionLo is exactly perpendicular to the segment --
		// normalized here (not yet scaled to borderHalfWidth) so every edge
		// in the same (regionLo, regionHi) pair-group has a directly
		// comparable/averageable perpendicular regardless of which of
		// sysA/sysB happened to own which region.
		const borderA = na === nb ? sa : na
		const borderB = na === nb ? sb : nb
		const regionLo = Math.min(borderA, borderB)
		const regionHi = Math.max(borderA, borderB)
		const loSys = borderA === regionLo ? sysA : sysB
		const hiSys = borderA === regionLo ? sysB : sysA
		let dirX = r_xy[2 * loSys]! - r_xy[2 * hiSys]!
		let dirY = r_xy[2 * loSys + 1]! - r_xy[2 * hiSys + 1]!
		const dirLen = Math.hypot(dirX, dirY) || 1
		dirX /= dirLen
		dirY /= dirLen

		// sysA is an endpoint of the shared Delaunay edge, so it's a vertex of
		// both triangles whose circumcenters this border segment spans -- its
		// distance to each endpoint is that endpoint's own circumradius.
		const sax = r_xy[2 * sysA]!
		const say = r_xy[2 * sysA + 1]!
		const d1 = Math.hypot(seg[0] - sax, seg[1] - say)
		const d2 = Math.hypot(seg[2] - sax, seg[3] - say)

		const edge: RawBorderEdge = {
			p1x: seg[0],
			p1y: seg[1],
			p2x: seg[2],
			p2y: seg[3],
			regionLo,
			regionHi,
			dirX,
			dirY,
			d1,
			d2,
		}
		if (na !== nb) rawBorderEdges.push(edge)
		else rawSectorEdges.push(edge)
	}

	const borderPositions: number[] = []
	const borderColors: number[] = []
	const borderDists: number[] = []
	for (const chain of buildBorderChains(rawBorderEdges)) {
		buildChainRibbon(
			chain,
			borderHalfWidth,
			colorFor(chain.regionLo),
			colorFor(chain.regionHi),
			borderPositions,
			borderColors,
			borderDists,
		)
	}
	const sectorPositions: number[] = []
	const sectorColors: number[] = []
	const sectorDists: number[] = []
	const sectorChainDistances: number[] = []
	const sectorAcross: number[] = []
	for (const chain of buildBorderChains(rawSectorEdges)) {
		buildChainRibbon(
			chain,
			radius.max * SECTOR_BORDER_HALF_WIDTH_FRACTION,
			[1, 1, 1],
			[1, 1, 1],
			sectorPositions,
			sectorColors,
			sectorDists,
		)
		let distance = 0
		for (let index = 0; index < chain.vertices.length - 1; index++) {
			const a = chain.vertices[index]!
			const b = chain.vertices[index + 1]!
			const next = distance + Math.hypot(b.x - a.x, b.y - a.y)
			for (let side = 0; side < 2; side++) {
				sectorChainDistances.push(
					distance,
					next,
					next,
					distance,
					next,
					distance,
				)
				const direction = side === 0 ? 1 : -1
				sectorAcross.push(0, 0, direction, 0, direction, direction)
			}
			distance = next
		}
	}

	// --- polygon fill ---
	const fillPositions: number[] = []
	const fillColors: number[] = []
	const fillDists: number[] = []
	const fillBlendColors: number[] = []
	const fillBlendAmts: number[] = []
	for (let i = 0; i < numSystems; i++) {
		const partition = assignment[i]!
		const polygon = voronoi.cellPolygon(i)
		if (!polygon || polygon.length < 3) continue
		const uniqueCount = isClosedPolygon(polygon)
			? polygon.length - 1
			: polygon.length
		if (uniqueCount < 3) continue
		const [r, g, b] = colorFor(partition)
		const secondary =
			blend && blend.secondary[i]! >= 0 ? blend.secondary[i]! : -1
		const [br, bg, bb] = secondary >= 0 ? colorFor(secondary) : [r, g, b]
		const blendAmt = secondary >= 0 ? blend!.weight[i]! : 0
		const sx = r_xy[2 * i]!
		const sy = r_xy[2 * i + 1]!
		const [ax, ay] = polygon[0]!
		const da = Math.hypot(ax - sx, ay - sy)
		for (let v = 1; v < uniqueCount - 1; v++) {
			const [bx, by] = polygon[v]!
			const [ex, ey] = polygon[v + 1]!
			fillPositions.push(ax, ay, 0, bx, by, 0, ex, ey, 0)
			for (let k = 0; k < 3; k++) {
				fillColors.push(r, g, b)
				fillBlendColors.push(br, bg, bb)
				fillBlendAmts.push(blendAmt)
			}
			fillDists.push(
				da,
				Math.hypot(bx - sx, by - sy),
				Math.hypot(ex - sx, ey - sy),
			)
		}
	}

	function buildTintMaterial(alpha: number): THREE.ShaderMaterial {
		return new THREE.ShaderMaterial({
			uniforms: {
				uAlpha: { value: alpha },
				uInnerFadeStart: { value: innerFadeStart },
				uInnerFadeEnd: { value: innerFadeEnd },
				uOuterFadeStart: { value: outerFadeStart },
				uOuterFadeEnd: { value: outerFadeEnd },
				uSiteFadeStart: { value: siteFadeStart },
				uSiteFadeEnd: { value: siteFadeEnd },
			},
			vertexShader: TINT_VERTEX_SHADER,
			fragmentShader: TINT_FRAGMENT_SHADER,
			transparent: true,
			depthWrite: false,
			depthTest: false,
			side: THREE.DoubleSide,
		})
	}

	const fillGeometry = new THREE.BufferGeometry()
	fillGeometry.setAttribute(
		"position",
		new THREE.BufferAttribute(Float32Array.from(fillPositions), 3),
	)
	fillGeometry.setAttribute(
		"color",
		new THREE.BufferAttribute(Float32Array.from(fillColors), 3),
	)
	fillGeometry.setAttribute(
		"siteDist",
		new THREE.BufferAttribute(Float32Array.from(fillDists), 1),
	)
	fillGeometry.setAttribute(
		"blendColor",
		new THREE.BufferAttribute(Float32Array.from(fillBlendColors), 3),
	)
	fillGeometry.setAttribute(
		"blendAmt",
		new THREE.BufferAttribute(Float32Array.from(fillBlendAmts), 1),
	)
	const fillMaterial = new THREE.ShaderMaterial({
		uniforms: {
			uAlpha: { value: fillAlpha },
			uStripeFreq: { value: stripeFreq },
			uInnerFadeStart: { value: innerFadeStart },
			uInnerFadeEnd: { value: innerFadeEnd },
			uOuterFadeStart: { value: outerFadeStart },
			uOuterFadeEnd: { value: outerFadeEnd },
			uSiteFadeStart: { value: siteFadeStart },
			uSiteFadeEnd: { value: siteFadeEnd },
		},
		vertexShader: FILL_VERTEX_SHADER,
		fragmentShader: FILL_FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		depthTest: false,
		side: THREE.DoubleSide,
	})
	const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial)
	// Drawn first (behind hyperlanes/star points, which don't set an explicit
	// renderOrder below 1 -- see lanes.ts/points.ts) regardless of depth,
	// since depthTest is off above.
	fillMesh.renderOrder = -1

	const group = new THREE.Group()
	group.add(fillMesh)

	let borderGeometry: THREE.BufferGeometry | null = null
	let borderMaterial: THREE.ShaderMaterial | null = null
	if (showBorders) {
		borderGeometry = new THREE.BufferGeometry()
		borderGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(Float32Array.from(borderPositions), 3),
		)
		borderGeometry.setAttribute(
			"color",
			new THREE.BufferAttribute(Float32Array.from(borderColors), 3),
		)
		borderGeometry.setAttribute(
			"siteDist",
			new THREE.BufferAttribute(Float32Array.from(borderDists), 1),
		)
		borderMaterial = buildTintMaterial(borderAlpha)
		const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial)
		// Drawn on top of the fill but still behind the star points/hyperlanes
		// (renderOrder 2/3 -- see points.ts/lanes.ts).
		borderMesh.renderOrder = 0
		group.add(borderMesh)
	}
	let sectorGeometry: THREE.BufferGeometry | null = null
	let sectorMaterial: THREE.ShaderMaterial | null = null
	if (sectorAssignment) {
		sectorGeometry = new THREE.BufferGeometry()
		sectorGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(Float32Array.from(sectorPositions), 3),
		)
		sectorGeometry.setAttribute(
			"siteDist",
			new THREE.BufferAttribute(Float32Array.from(sectorDists), 1),
		)
		sectorGeometry.setAttribute(
			"chainDistance",
			new THREE.BufferAttribute(Float32Array.from(sectorChainDistances), 1),
		)
		sectorGeometry.setAttribute(
			"across",
			new THREE.BufferAttribute(Float32Array.from(sectorAcross), 1),
		)
		sectorMaterial = new THREE.ShaderMaterial({
			uniforms: {
				uColor: { value: new THREE.Color(uiPalette.sectorBoundary) },
				uPeriod: { value: radius.max * SECTOR_DOT_PERIOD_FRACTION },
				uHalfWidth: {
					value: radius.max * SECTOR_BORDER_HALF_WIDTH_FRACTION,
				},
				uInnerFadeStart: { value: innerFadeStart },
				uInnerFadeEnd: { value: innerFadeEnd },
				uOuterFadeStart: { value: outerFadeStart },
				uOuterFadeEnd: { value: outerFadeEnd },
				uSiteFadeStart: { value: siteFadeStart },
				uSiteFadeEnd: { value: siteFadeEnd },
			},
			vertexShader: SECTOR_VERTEX_SHADER,
			fragmentShader: SECTOR_FRAGMENT_SHADER,
			transparent: true,
			depthWrite: false,
			depthTest: false,
			side: THREE.DoubleSide,
		})
		const mesh = new THREE.Mesh(sectorGeometry, sectorMaterial)
		mesh.renderOrder = 0.5
		group.add(mesh)
	}

	const partitionCount = size.length
	let maxSize = 1
	for (let n = 0; n < partitionCount; n++) maxSize = Math.max(maxSize, size[n]!)
	const baseFontSize = radius.max * LABEL_BASE_FONT_FRACTION

	const labels: Text[] = []
	for (let partition = 0; partition < partitionCount; partition++) {
		const partitionSize = size[partition]!
		if (partitionSize <= 0) continue
		const capital = seeds[partition]!
		// sqrt keeps a handful of tiny partitions from all reading as
		// indistinguishably minimum-size next to one another, while the wide
		// LABEL_MIN/MAX_FONT_SCALE spread (not the exponent) is what actually
		// makes a size-1 partition's label read as clearly smaller than a
		// hundreds-of-systems one's.
		const t = THREE.MathUtils.clamp(Math.sqrt(partitionSize / maxSize), 0, 1)
		const fontSize =
			baseFontSize *
			(LABEL_MIN_FONT_SCALE + (LABEL_MAX_FONT_SCALE - LABEL_MIN_FONT_SCALE) * t)
		const label = new Text()
		label.text = labelText(partition)
		label.font = jedarFontUrl
		label.fontWeight = 600
		label.color = LABEL_COLOR
		label.anchorX = "center"
		label.anchorY = "middle"
		label.fontSize = fontSize
		label.textRenderingMode = "distanceField"
		label.renderOrder = 5
		label.frustumCulled = false
		// Nudge the label up off its capital star so the glyphs don't sit
		// directly on top of the star point -- scaled by the label's own font
		// size so larger labels clear proportionally.
		label.position.set(
			r_xy[2 * capital]!,
			r_xy[2 * capital + 1]! + fontSize * LABEL_VERTICAL_OFFSET_SCALE,
			1,
		)
		group.add(label)
		labels.push(label)
	}

	return {
		group,
		dispose() {
			fillGeometry.dispose()
			fillMaterial.dispose()
			borderGeometry?.dispose()
			borderMaterial?.dispose()
			sectorGeometry?.dispose()
			sectorMaterial?.dispose()
			for (const label of labels) label.dispose()
		},
	}
}

/** The nations map mode: a flat per-nation fill, no border bleed. */
export function buildNationOverlay(galaxy: Galaxy): PartitionOverlayResult {
	return buildPartitionOverlay({
		galaxy,
		assignment: galaxy.nationAssignment,
		colors: galaxy.nationColors,
		seeds: galaxy.nationSeeds,
		size: galaxy.nationSize,
		labelText: (nation) =>
			GALAXY_IDENTITY.generateNationName(galaxy.seed, nation),
		sectorAssignment: galaxy.sectorState.assignment,
	})
}

/** The cultures map mode: per-culture fill (colored by heritage family --
 * see GALAXY_CULTURES.build) plus diagonal border-bleed stripes. */
export function buildCultureOverlay(galaxy: Galaxy): PartitionOverlayResult {
	return buildPartitionOverlay({
		galaxy,
		assignment: galaxy.cultureAssignment,
		colors: galaxy.cultureColors,
		seeds: galaxy.cultureSeeds,
		size: galaxy.cultureSize,
		labelText: (culture) =>
			GALAXY_IDENTITY.generateCultureName(galaxy.seed, culture),
		blend: {
			secondary: galaxy.cultureBlendSecondary,
			weight: galaxy.cultureBlendWeight,
		},
		fillAlpha: CULTURE_TINT_ALPHA,
		borderAlpha: CULTURE_BORDER_OPACITY,
		showBorders: false,
	})
}

interface LineMarkerInput {
	positions: readonly number[]
	color: string
}

function buildLineMarkers(input: LineMarkerInput): PartitionOverlayResult {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		"position",
		new THREE.BufferAttribute(Float32Array.from(input.positions), 3),
	)
	const material = new THREE.LineBasicMaterial({
		color: input.color,
		depthTest: false,
		transparent: true,
		opacity: 1,
	})
	const markers = new THREE.LineSegments(geometry, material)
	markers.renderOrder = 4
	const group = new THREE.Group()
	group.add(markers)
	return {
		group,
		dispose() {
			geometry.dispose()
			material.dispose()
		},
	}
}

export function buildSectorCapitalMarkers(
	galaxy: Galaxy,
): PartitionOverlayResult {
	const positions: number[] = []
	const outer = galaxy.radius.max * 0.005
	const arm = outer * 0.65
	const nationCapitals = new Set(galaxy.nationSeeds)
	for (const sector of galaxy.sectorState.sectors) {
		const colony = galaxy.sectorState.colonies.find(
			(candidate) => candidate.id === sector.capitalColonyId,
		)
		if (!colony) continue
		if (nationCapitals.has(colony.systemId)) continue
		const x = galaxy.r_xy[2 * colony.systemId]!
		const y = galaxy.r_xy[2 * colony.systemId + 1]!
		for (const sx of [-1, 1]) {
			for (const sy of [-1, 1]) {
				const cx = x + sx * outer
				const cy = y + sy * outer
				positions.push(cx - sx * arm, cy, 0, cx, cy, 0)
				positions.push(cx, cy, 0, cx, cy - sy * arm, 0)
			}
		}
	}
	return buildLineMarkers({ positions, color: uiPalette.sectorCapital })
}

export function buildNationCapitalMarkers(
	galaxy: Galaxy,
): PartitionOverlayResult {
	const positions: number[] = []
	const radius = galaxy.radius.max * 0.005
	for (const seed of galaxy.nationSeeds) {
		const x = galaxy.r_xy[2 * seed]!
		const y = galaxy.r_xy[2 * seed + 1]!
		positions.push(x + radius, y, 0, x, y + radius, 0)
		positions.push(x, y + radius, 0, x - radius, y, 0)
		positions.push(x - radius, y, 0, x, y - radius, 0)
		positions.push(x, y - radius, 0, x + radius, y, 0)
	}
	return buildLineMarkers({ positions, color: uiPalette.nationCapital })
}
