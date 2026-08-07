import * as THREE from "three"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { CAPITAL_SCALE_MULTIPLIER } from "@/ui/genesis/renderer/settlement-overlay"

// Fixed screen-space exclusion radius per settlement, in PIXELS -- not
// converted from any world-space marker size. This is the key
// simplification over the earlier (broken) attempt: since the box is
// defined directly in pixels, it's automatically "large" in world terms
// when zoomed out (a handful of pixels covers a big patch of the globe/map)
// and "small" when zoomed in (the same pixel count covers almost nothing),
// with no world-unit-to-pixel conversion formula to get wrong. The only
// thing that still needs real projection is each marker's screen
// *position*, which we already know works correctly -- it's the same
// getWorldPosition + camera.project() the markers themselves render with.
// Fixed target on-screen radius for every marker -- no population-based
// size variance (see settlement-overlay.ts's GLOBE_MARKER_SCALE/
// MAP_MARKER_RADIUS, which this mirrors for collision/screen-scale math).
const FIXED_PX_RADIUS = 0.75

// How much marker/label size actually responds to zoom: 1 = fully constant
// on-screen size regardless of zoom (Mapbox default, no size-by-zoom); 0 =
// fully world-space size (grows/shrinks 1:1 with the camera's actual zoom
// relative to REFERENCE_*, i.e. exactly like a real object). Blended in log
// space against a fixed reference zoom (see referencePixelsPerWorldUnit) --
// NOT a bare exponent on the raw px-per-world-unit value, which has no
// reference point to shrink toward and blows size up at close zoom.
export const SCREEN_SCALE_RESPONSIVENESS = 0.5

// The zoom level at which pxRadiusForPop/labelPxHeightForPop's px sizes are
// exactly honored; size grows/shrinks from there as zoom moves away,
// damped by SCREEN_SCALE_RESPONSIVENESS. Matches this app's initial camera
// state (see buildGenesisSceneSetup in scene-setup.ts: camera.position.set
// (0, 0, 3), fov 50; mapCamera starts at zoom 1).
const REFERENCE_GLOBE_DISTANCE = 3
const REFERENCE_GLOBE_FOV_DEG = 50
const REFERENCE_MAP_ZOOM = 1

// Extra px added to every marker's collision radius so a culled marker's
// label (which sits just above it, see settlement-labels.ts) doesn't end up
// dangling with no room -- rather than measuring each label's actual glyph
// box, we just pad the marker's own bounding circle enough to cover it.
const LABEL_PADDING_PX = 14

const PROJECT_VEC = new THREE.Vector3()
const WORLD_POS_VEC = new THREE.Vector3()
const CAM_WORLD_POS_VEC = new THREE.Vector3()

interface MarkerCandidate {
	object: THREE.Object3D & { visible: boolean }
	isCapital: boolean
	priority: number
	x: number
	y: number
	halfSize: number
}

export function pxRadiusForPop(_pop: number): number {
	return FIXED_PX_RADIUS
}

/** How many world units correspond to one screen pixel at `worldPos`,
 * given the current camera. Constant everywhere for the orthographic map
 * camera (depends only on zoom); depends on distance-to-camera for the
 * perspective globe camera (closer = more pixels per world unit). Used to
 * convert a target on-screen size (px) into the world-space scale that
 * will actually render at that size -- see
 * applySettlementMarkerScreenScale/applySettlementLabelScreenScale below. */
export function pixelsPerWorldUnitAt(
	ctx: GenesisContext,
	cam: THREE.Camera,
	worldPos: THREE.Vector3,
): number {
	const h = ctx.canvas.clientHeight
	if ((cam as THREE.OrthographicCamera).isOrthographicCamera) {
		const ortho = cam as THREE.OrthographicCamera
		return (h * ortho.zoom) / (ortho.top - ortho.bottom)
	}
	const persp = cam as THREE.PerspectiveCamera
	const dist = worldPos.distanceTo(persp.getWorldPosition(CAM_WORLD_POS_VEC))
	const vFov = (persp.fov * Math.PI) / 180
	return h / (2 * dist * Math.tan(vFov / 2) * persp.zoom)
}

function referencePixelsPerWorldUnit(
	ctx: GenesisContext,
	cam: THREE.Camera,
): number {
	const h = ctx.canvas.clientHeight
	if ((cam as THREE.OrthographicCamera).isOrthographicCamera) {
		const ortho = cam as THREE.OrthographicCamera
		return (h * REFERENCE_MAP_ZOOM) / (ortho.top - ortho.bottom)
	}
	const vFov = (REFERENCE_GLOBE_FOV_DEG * Math.PI) / 180
	return h / (2 * REFERENCE_GLOBE_DISTANCE * Math.tan(vFov / 2))
}

/** The px-per-world-unit conversion to actually size something by, after
 * damping the camera's real zoom toward REFERENCE_* by
 * SCREEN_SCALE_RESPONSIVENESS -- see that constant's doc comment. Blending
 * happens in log space (equivalent to reference^(1-r) * actual^r) so it's a
 * true interpolation between "constant world size" and "constant screen
 * size", not an arbitrary exponent on an unreferenced number. */
export function dampedPixelsPerWorldUnitAt(
	ctx: GenesisContext,
	cam: THREE.Camera,
	worldPos: THREE.Vector3,
): number {
	const actual = pixelsPerWorldUnitAt(ctx, cam, worldPos)
	const reference = referencePixelsPerWorldUnit(ctx, cam)
	if (!(actual > 0) || !(reference > 0)) return actual
	return reference * (actual / reference) ** SCREEN_SCALE_RESPONSIVENESS
}

function projectToPx(
	ctx: GenesisContext,
	cam: THREE.Camera,
	worldPos: THREE.Vector3,
): [number, number] | null {
	PROJECT_VEC.copy(worldPos).project(cam)
	if (PROJECT_VEC.z > 1) return null
	const w = ctx.canvas.clientWidth
	const h = ctx.canvas.clientHeight
	return [(PROJECT_VEC.x * 0.5 + 0.5) * w, (-PROJECT_VEC.y * 0.5 + 0.5) * h]
}

function overlaps(a: MarkerCandidate, b: MarkerCandidate): boolean {
	const dx = a.x - b.x
	const dy = a.y - b.y
	const minDist = a.halfSize + b.halfSize
	return dx * dx + dy * dy < minDist * minDist
}

/** Marker/label pairs are matched by this id, stamped on both by the shared
 * settlementId() helper -- see settlement-overlay.ts. */
function markerId(userData: Record<string, unknown>): string | undefined {
	return userData.settlementId as string | undefined
}

/** Screen-space greedy collision culling for settlement dot markers: active
 * nation capitals always win an overlap. Within the capital and non-capital
 * groups respectively, larger population wins (the same Mapbox-style greedy
 * placement used previously).
 *
 * Neither the globe nor map settlement-dot groups have any other per-frame
 * visibility mechanism (unlike labels, which get a fresh baseline each
 * frame from back-face culling on globe), so every marker's visibility is
 * reset here before re-evaluating -- otherwise a marker hidden by a
 * collision on one frame could never come back once the camera moves and
 * the overlap clears. */
export function applySettlementMarkerCollisionCulling(
	ctx: GenesisContext,
	group: THREE.Group | null,
	visibilityOut?: Map<string, boolean>,
): void {
	if (!group) return
	const cam: THREE.Camera =
		ctx.currentViewMode === "map" ? ctx.mapCamera : ctx.camera
	const candidates: MarkerCandidate[] = []

	for (const child of group.children) {
		const marker = child as THREE.Object3D & {
			visible: boolean
			userData: Record<string, unknown>
		}
		marker.visible = true
		const pop = (marker.userData.settlementPop as number | undefined) ?? 0
		const isCapital =
			(marker.userData.isCapital as boolean | undefined) ?? false
		const worldPos = marker.getWorldPosition(WORLD_POS_VEC)
		const px = projectToPx(ctx, cam, worldPos)
		if (!px) {
			marker.visible = false
			visibilityOut?.set(markerId(marker.userData) ?? "", false)
			continue
		}
		candidates.push({
			object: marker,
			isCapital,
			priority: pop,
			x: px[0],
			y: px[1],
			halfSize:
				pxRadiusForPop(pop) * (isCapital ? CAPITAL_SCALE_MULTIPLIER : 1) +
				LABEL_PADDING_PX,
		})
	}

	candidates.sort(
		(a, b) =>
			Number(b.isCapital) - Number(a.isCapital) || b.priority - a.priority,
	)
	const placed: MarkerCandidate[] = []
	for (const candidate of candidates) {
		let collided = false
		for (const p of placed) {
			if (overlaps(candidate, p)) {
				collided = true
				break
			}
		}
		const visible = !collided
		candidate.object.visible = visible
		const id = markerId(candidate.object.userData)
		if (id !== undefined) visibilityOut?.set(id, visible)
		if (visible) placed.push(candidate)
	}
}

/** Rescales every marker each frame so its on-screen size tracks
 * pxRadiusForPop(pop) -- the same target size the collision pass already
 * assumes -- damped by SCREEN_SCALE_RESPONSIVENESS so it still visibly
 * grows when zoomed in and shrinks when zoomed out (like a real map),
 * without going fully world-space and ballooning/vanishing at extreme
 * zoom. Sprites (globe) get their scale
 * set directly; circle Meshes (map) get scaled relative to their baked
 * geometry radius (userData.baseRadius, stamped at build time -- see
 * settlement-overlay.ts) since CircleGeometry's radius can't change after
 * construction. */
export function applySettlementMarkerScreenScale(
	ctx: GenesisContext,
	group: THREE.Group | null,
): void {
	if (!group) return
	const cam: THREE.Camera =
		ctx.currentViewMode === "map" ? ctx.mapCamera : ctx.camera

	for (const child of group.children) {
		const marker = child as THREE.Object3D & {
			userData: Record<string, unknown>
		}
		const pop = (marker.userData.settlementPop as number | undefined) ?? 0
		const isCapital =
			(marker.userData.isCapital as boolean | undefined) ?? false
		const worldPos = marker.getWorldPosition(WORLD_POS_VEC)
		const pxPerWorldUnit = dampedPixelsPerWorldUnitAt(ctx, cam, worldPos)
		if (!(pxPerWorldUnit > 0)) continue
		const desiredPxRadius =
			pxRadiusForPop(pop) * (isCapital ? CAPITAL_SCALE_MULTIPLIER : 1)

		if ((marker as THREE.Sprite).isSprite) {
			const worldDiameter = (desiredPxRadius * 2) / pxPerWorldUnit
			marker.scale.setScalar(worldDiameter)
		} else {
			const baseRadius = (marker.userData.baseRadius as number | undefined) ?? 1
			const worldRadius = desiredPxRadius / pxPerWorldUnit
			marker.scale.setScalar(worldRadius / baseRadius)
		}
	}
}

/** Applies the visibility computed by applySettlementMarkerCollisionCulling
 * to the matching settlement labels, keyed by userData.settlementId (see
 * settlement-labels.ts). Globe labels already get a fresh per-frame
 * visibility baseline from back-face culling (updateGlobeLabelOrientations,
 * which must run before this), so here we only ever narrow that to false --
 * never force a backface-culled label back on. Map labels have no other
 * per-frame visibility mechanism, so `resetVisible` gives them the same
 * fresh-baseline treatment markers get. */
export function applySettlementLabelCulling(
	labelGroup: THREE.Group | null,
	visibility: Map<string, boolean>,
	resetVisible: boolean,
): void {
	if (!labelGroup) return
	for (const child of labelGroup.children) {
		if (child.type === "Line") continue
		const label = child as THREE.Object3D & {
			visible: boolean
			userData: Record<string, unknown>
		}
		const id = label.userData.settlementId as string | undefined
		if (id === undefined) continue
		const markerVisible = visibility.get(id)
		if (markerVisible === undefined) continue
		label.visible = resetVisible
			? markerVisible
			: label.visible && markerVisible
	}
}
