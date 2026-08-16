import * as THREE from "three"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import type { GenesisHoverInfo } from "@/ui/genesis/renderer/types"
import type { OrbitAddress } from "@/ui/genesis/solar-system/overlay"

export interface InteractionControllerDeps {
	setSelectedProvince: (provinceId: number | null) => void
	focusOnSystemBody: (
		address: OrbitAddress,
		opts?: { durationMs?: number },
	) => void
}

/** Owns pointer/hover/click interaction with the canvas: hover raycasting
 * and the hover-info callback, region click selection, and double-clicking
 * a body in the solar-system view to focus it. See
 * plans/genesis-scene-controller-split.md. */
export function createInteractionController(
	ctx: GenesisContext,
	deps: InteractionControllerDeps,
) {
	const raycaster = new THREE.Raycaster()
	const pointer = new THREE.Vector2()

	function setHoveredRegion(region: number | null) {
		ctx.hoveredRegion = region ?? -1
	}

	function emitHover(info: GenesisHoverInfo | null) {
		ctx.hoverHandler?.(info)
	}

	function clearHover() {
		if (ctx.hoveredRegion === -1) return
		ctx.hoveredRegion = -1
		emitHover(null)
	}

	function updateHover(event: PointerEvent) {
		if (!ctx.currentWorld || ctx.solarSystemActive) {
			clearHover()
			return
		}

		const rect = ctx.canvas.getBoundingClientRect()
		const width = Math.max(rect.width, 1)
		const height = Math.max(rect.height, 1)
		pointer.x = ((event.clientX - rect.left) / width) * 2 - 1
		pointer.y = -(((event.clientY - rect.top) / height) * 2 - 1)
		raycaster.setFromCamera(
			pointer,
			ctx.currentViewMode === "map" ? ctx.mapCamera : ctx.camera,
		)

		const target = ctx.currentViewMode === "map" ? ctx.mapMesh : ctx.terrainMesh
		if (!target) {
			clearHover()
			return
		}

		const hits = raycaster.intersectObject(target, true)
		const hit = hits[0]
		if (!hit || hit.faceIndex == null) {
			clearHover()
			return
		}

		const faceToRegion =
			ctx.currentViewMode === "map"
				? ctx.mapFaceToRegion
				: ctx.terrainFaceToRegion
		const region = faceToRegion[hit.faceIndex] ?? -1
		if (region < 0) {
			clearHover()
			return
		}

		ctx.hoveredRegion = region
		emitHover({
			region,
			clientX: event.clientX - rect.left,
			clientY: event.clientY - rect.top,
		})
	}

	function handlePointerDown(event: PointerEvent) {
		ctx.pointerDownPos = { x: event.clientX, y: event.clientY }
	}

	function handleClick(event: PointerEvent) {
		if (!ctx.clickHandler || !ctx.currentWorld || ctx.solarSystemActive) return
		if (ctx.pointerDownPos) {
			const dx = event.clientX - ctx.pointerDownPos.x
			const dy = event.clientY - ctx.pointerDownPos.y
			if (dx * dx + dy * dy > 25) return
		}
		const rect = ctx.canvas.getBoundingClientRect()
		const width = Math.max(rect.width, 1)
		const height = Math.max(rect.height, 1)
		pointer.x = ((event.clientX - rect.left) / width) * 2 - 1
		pointer.y = -(((event.clientY - rect.top) / height) * 2 - 1)
		raycaster.setFromCamera(
			pointer,
			ctx.currentViewMode === "map" ? ctx.mapCamera : ctx.camera,
		)
		const target = ctx.currentViewMode === "map" ? ctx.mapMesh : ctx.terrainMesh
		if (!target) return
		const hits = raycaster.intersectObject(target, true)
		const hit = hits[0]
		if (!hit || hit.faceIndex == null) return
		const faceToRegion =
			ctx.currentViewMode === "map"
				? ctx.mapFaceToRegion
				: ctx.terrainFaceToRegion
		const region = faceToRegion[hit.faceIndex] ?? -1
		if (region < 0) return
		deps.setSelectedProvince(null)
		ctx.clickHandler({
			region,
			clientX: event.clientX - rect.left,
			clientY: event.clientY - rect.top,
		})
	}

	// Double-clicking any body in the solar-system view (star, planet, or a
	// moon) recenters the orbit target on it. Returning to the planet view
	// is a deliberate action via the settings panel, not a click gesture.
	function handleSolarSystemDoubleClick(event: MouseEvent) {
		if (!ctx.solarSystemActive || !ctx.solarSystemOverlayState) return
		const rect = ctx.canvas.getBoundingClientRect()
		const width = Math.max(rect.width, 1)
		const height = Math.max(rect.height, 1)
		pointer.x = ((event.clientX - rect.left) / width) * 2 - 1
		pointer.y = -(((event.clientY - rect.top) / height) * 2 - 1)
		raycaster.setFromCamera(pointer, ctx.camera)
		const hits = raycaster.intersectObject(
			ctx.solarSystemOverlayState.group,
			true,
		)
		// A belt's asteroid field is one big InstancedMesh spanning the same
		// region a belt-interior dwarf planet (Ceres, Pallas, ...) sits in, and
		// often sits closer along the ray than the dwarf's own tiny mesh. A
		// belt is never a valid click target (see resolveHitBodyIndex/
		// listAddresses' own doc), so InstancedMesh hits are skipped entirely
		// here rather than merely deprioritized -- any real hit still wins over
		// the nearest-on-screen fallback, but an unresolved/absent hit (a stray
		// rock, or empty space between them) always falls through to it.
		const hit = hits.find(
			(h) =>
				h.object instanceof THREE.Mesh &&
				!(h.object instanceof THREE.InstancedMesh),
		)
		const overlayState = ctx.solarSystemOverlayState
		const target = hit
			? overlayState.resolveHitBodyIndex(hit.object)
			: findClosestBodyOnScreen(overlayState, pointer)
		if (!target) return
		// Route through focusOnSystemBody (not a one-off controls.target set) so
		// this double-click gets the same tracked-focus treatment as a GPS
		// click — otherwise the camera would stop following as soon as the
		// clock or any other slider moved the body.
		deps.focusOnSystemBody(target)
	}

	// A raycast only hits a body if the click lands exactly on its (often
	// tiny, at solar-system scale) mesh. Double-clicking empty space nearby
	// should still snap to something, so fall back to whichever body's
	// projected screen position is nearest the click, regardless of distance.
	function findClosestBodyOnScreen(
		overlayState: NonNullable<GenesisContext["solarSystemOverlayState"]>,
		clickNdc: THREE.Vector2,
	): OrbitAddress | null {
		let closest: OrbitAddress | null = null
		let closestDistSq = Infinity
		const projected = new THREE.Vector3()
		for (const address of overlayState.listAddresses()) {
			const focus = overlayState.getBodyFocus(address)
			if (!focus) continue
			projected.copy(focus.position).project(ctx.camera)
			// Behind the camera — not a valid on-screen candidate.
			if (projected.z > 1) continue
			const dx = projected.x - clickNdc.x
			const dy = projected.y - clickNdc.y
			const distSq = dx * dx + dy * dy
			if (distSq < closestDistSq) {
				closestDistSq = distSq
				closest = address
			}
		}
		return closest
	}

	function setHoverHandler(
		handler: ((info: GenesisHoverInfo | null) => void) | null,
	) {
		ctx.hoverHandler = handler
		if (!handler) clearHover()
	}

	function setClickHandler(handler: ((info: GenesisHoverInfo) => void) | null) {
		ctx.clickHandler = handler
	}

	return {
		setHoveredRegion,
		emitHover,
		clearHover,
		updateHover,
		handlePointerDown,
		handleClick,
		handleSolarSystemDoubleClick,
		setHoverHandler,
		setClickHandler,
	}
}
