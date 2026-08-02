import * as THREE from "three"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import type { GenesisHoverInfo } from "@/ui/genesis/renderer/types"

export interface InteractionControllerDeps {
	setSelectedProvince: (provinceId: number | null) => void
	focusOnSystemBody: (bodyIndex: number, moonIndex?: number) => void
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
		const hit = hits.find((h) => h.object instanceof THREE.Mesh)
		if (!hit) return
		const target = ctx.solarSystemOverlayState.resolveHitBodyIndex(hit.object)
		if (!target) return
		// Route through focusOnSystemBody (not a one-off controls.target set) so
		// this double-click gets the same tracked-focus treatment as a GPS
		// click — otherwise the camera would stop following as soon as the
		// clock or any other slider moved the body.
		deps.focusOnSystemBody(target.bodyIndex, target.moonIndex)
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
