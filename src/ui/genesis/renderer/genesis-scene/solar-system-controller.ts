import type { MoonBody } from "@/model/celestial/moons/types"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import {
	DEFAULT_CAMERA_FAR,
	DEFAULT_CONTROLS_MAX_DISTANCE,
	DEFAULT_CONTROLS_MIN_DISTANCE,
	setCameraFarForMaxDistance,
} from "@/ui/genesis/renderer/genesis-scene/scene-setup"
import { buildMoonOrbitOverlay } from "@/ui/genesis/renderer/moon-orbit-overlay"
import {
	buildSolarSystemOverlay,
	type SolarSystemOverlayParams,
} from "@/ui/genesis/solar-system/overlay"

export interface SolarSystemControllerDeps {
	requestRender: () => void
	syncAnimationState: () => void
	updateOverlayVisibility: () => void
}

const SOLAR_SYSTEM_FOCUS_DISTANCE_MULTIPLIER = 6
const SOLAR_SYSTEM_MIN_FOCUS_DISTANCE = 0.3

/** Owns the solar-system view: entering/leaving it (setSolarSystemActive),
 * the star-system overlay itself (setSolarSystemOverlay/
 * updateSolarSystemOverlay), the clock knobs (updateSolarSystemDay/
 * setSolarSystemSpinHours), focusing the camera on a body or moon
 * (focusOnSystemBody + its tween step), and the separate moon-orbit
 * overlay used in the planet view. See
 * plans/genesis-scene-controller-split.md. */
export function createSolarSystemController(
	ctx: GenesisContext,
	deps: SolarSystemControllerDeps,
) {
	function stepSolarSystemFocusTween() {
		if (!ctx.solarSystemFocusTween) return
		const u = Math.min(
			1,
			(performance.now() - ctx.solarSystemFocusTween.t0) /
				ctx.solarSystemFocusTween.duration,
		)
		const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
		ctx.camera.position.lerpVectors(
			ctx.solarSystemFocusTween.camFrom,
			ctx.solarSystemFocusTween.camTo,
			eased,
		)
		ctx.controls.target.lerpVectors(
			ctx.solarSystemFocusTween.targetFrom,
			ctx.solarSystemFocusTween.targetTo,
			eased,
		)
		if (u >= 1) {
			ctx.solarSystemFocusTween = null
			deps.syncAnimationState()
		}
	}

	function focusOnSystemBody(
		bodyIndex: number,
		moonIndex?: number,
		opts?: { durationMs?: number },
	) {
		if (!ctx.solarSystemActive) setSolarSystemActive(true)
		if (!ctx.solarSystemOverlayState) return
		const focus = ctx.solarSystemOverlayState.getBodyFocus(bodyIndex, moonIndex)
		if (!focus) return
		ctx.solarSystemTrackedFocus = { bodyIndex, moonIndex }
		ctx.solarSystemTrackedFocusPosition = focus.position.clone()
		ctx.solarSystemFocusChangeHandler?.(bodyIndex, moonIndex)
		const distance = Math.max(
			focus.radius * SOLAR_SYSTEM_FOCUS_DISTANCE_MULTIPLIER,
			SOLAR_SYSTEM_MIN_FOCUS_DISTANCE,
		)
		const dir = ctx.camera.position.clone().sub(ctx.controls.target).normalize()
		if (!Number.isFinite(dir.x) || dir.lengthSq() === 0) dir.set(0, 0, 1)
		const camTo = focus.position.clone().add(dir.multiplyScalar(distance))
		ctx.solarSystemFocusTween = {
			t0: performance.now(),
			duration: opts?.durationMs ?? 900,
			camFrom: ctx.camera.position.clone(),
			camTo,
			targetFrom: ctx.controls.target.clone(),
			targetTo: focus.position.clone(),
		}
		deps.syncAnimationState()
	}

	function disposeMoonOrbitOverlay() {
		if (!ctx.moonOrbitState) return
		ctx.orbitGroup.remove(ctx.moonOrbitState.group)
		ctx.moonOrbitState.dispose()
		ctx.moonOrbitState = null
	}

	function setMoonOrbitOverlay(
		moons: MoonBody[] | null,
		planetRadiusKm: number,
		day: number,
		showGrid: boolean,
		gridSpacing: number,
		showEllipticalOrbits: boolean,
	) {
		ctx.currentMoonOrbitDay = day
		disposeMoonOrbitOverlay()
		if (moons && moons.length > 0) {
			ctx.moonOrbitState = buildMoonOrbitOverlay(
				moons,
				planetRadiusKm,
				day,
				showGrid,
				gridSpacing,
				showEllipticalOrbits,
			)
			ctx.orbitGroup.add(ctx.moonOrbitState.group)
		}
		deps.requestRender()
	}

	function updateMoonOrbitOverlay(
		moons: MoonBody[] | null,
		planetRadiusKm: number,
		showGrid: boolean,
		gridSpacing: number,
		showEllipticalOrbits: boolean,
	) {
		setMoonOrbitOverlay(
			moons,
			planetRadiusKm,
			ctx.currentMoonOrbitDay,
			showGrid,
			gridSpacing,
			showEllipticalOrbits,
		)
	}

	function updateMoonOrbitDay(day: number) {
		ctx.currentMoonOrbitDay = day
		ctx.moonOrbitState?.setDay(day)
		deps.requestRender()
	}

	function setSolarSystemActive(active: boolean) {
		if (ctx.solarSystemActive === active) return
		ctx.solarSystemActive = active
		ctx.solarSystemGroup.visible = active
		ctx.globeGroup.visible = !active
		ctx.orbitGroup.visible = !active
		// ctx.mapMesh lives directly on `scene`, not inside ctx.globeGroup, since
		// the flat-map view uses its own orthographic camera alongside the
		// globe's perspective one -- so it needs its own visibility toggle here.
		// Every other map overlay (grid, coastline, borders, etc.) is toggled by
		// updateOverlayVisibility, which also accounts for solarSystemActive.
		const showMap = !active && ctx.currentViewMode === "map"
		if (ctx.mapMesh) ctx.mapMesh.visible = showMap
		ctx.mapControls.enabled = showMap
		ctx.controls.enabled = active || ctx.currentViewMode !== "map"
		deps.updateOverlayVisibility()
		// The globe's own sun/ambient lights are scene-wide and would otherwise
		// wash out the solar-system overlay's star light, making its Daylight
		// toggle invisible — suppress them while this view is active.
		ctx.ambient.visible = !active
		ctx.sun.visible = !active
		if (active) {
			ctx.savedCameraPosition = ctx.camera.position.clone()
			ctx.savedControlsTarget = ctx.controls.target.clone()
			ctx.controls.target.set(0, 0, 0)
			const dist = ctx.solarSystemOverlayState?.suggestedCameraDistance ?? 6
			ctx.controls.minDistance = 0.1
			ctx.controls.maxDistance = dist * 4
			setCameraFarForMaxDistance(ctx, ctx.controls.maxDistance)
			ctx.camera.position.set(0, 0, dist)
		} else {
			if (ctx.savedCameraPosition)
				ctx.camera.position.copy(ctx.savedCameraPosition)
			if (ctx.savedControlsTarget)
				ctx.controls.target.copy(ctx.savedControlsTarget)
			ctx.controls.minDistance = DEFAULT_CONTROLS_MIN_DISTANCE
			ctx.controls.maxDistance = DEFAULT_CONTROLS_MAX_DISTANCE
			ctx.camera.far = DEFAULT_CAMERA_FAR
			ctx.camera.updateProjectionMatrix()
		}
		ctx.controls.update()
		deps.requestRender()
		deps.syncAnimationState()
	}

	function setSolarSystemOverlay(params: SolarSystemOverlayParams | null) {
		if (ctx.solarSystemOverlayState) {
			ctx.solarSystemGroup.remove(ctx.solarSystemOverlayState.group)
			ctx.solarSystemOverlayState.dispose()
			ctx.solarSystemOverlayState = null
		}
		if (params) {
			ctx.solarSystemOverlayState = buildSolarSystemOverlay(params)
			ctx.solarSystemGroup.add(ctx.solarSystemOverlayState.group)
			if (ctx.solarSystemActive) {
				ctx.controls.maxDistance =
					ctx.solarSystemOverlayState.suggestedCameraDistance * 4
				setCameraFarForMaxDistance(ctx, ctx.controls.maxDistance)
			}
		}
		// The overlay just got torn down and rebuilt from scratch (this fires
		// on nearly every slider tweak, not just clock changes) — without this,
		// the camera would keep looking at wherever the tracked body used to be
		// instead of following it into the new overlay.
		reapplyTrackedSolarSystemFocus()
		deps.requestRender()
	}

	function updateSolarSystemOverlay(params: SolarSystemOverlayParams | null) {
		if (!params) {
			setSolarSystemOverlay(null)
			return
		}
		if (
			!ctx.solarSystemOverlayState ||
			!ctx.solarSystemOverlayState.updateBodies(params.bodies)
		) {
			setSolarSystemOverlay({
				...params,
				initialDay: ctx.currentSolarSystemDay,
			})
		}
		ctx.solarSystemOverlayState?.setSpinHours(ctx.currentSolarSystemSpinHours)
		reapplyTrackedSolarSystemFocus()
		deps.requestRender()
	}

	function reapplyTrackedSolarSystemFocus() {
		if (!ctx.solarSystemTrackedFocus || !ctx.solarSystemOverlayState) return
		const focus = ctx.solarSystemOverlayState.getBodyFocus(
			ctx.solarSystemTrackedFocus.bodyIndex,
			ctx.solarSystemTrackedFocus.moonIndex,
		)
		if (!focus) return
		if (ctx.solarSystemTrackedFocusPosition) {
			const delta = focus.position
				.clone()
				.sub(ctx.solarSystemTrackedFocusPosition)
			ctx.camera.position.add(delta)
			ctx.controls.target.add(delta)
		}
		ctx.solarSystemTrackedFocusPosition = focus.position.clone()
	}

	function updateSolarSystemDay(day: number) {
		ctx.currentSolarSystemDay = day
		ctx.solarSystemOverlayState?.setDay(day)
		reapplyTrackedSolarSystemFocus()
		deps.requestRender()
	}

	function setSolarSystemSpinHours(hours: number) {
		ctx.currentSolarSystemSpinHours = hours
		ctx.solarSystemOverlayState?.setSpinHours(hours)
		reapplyTrackedSolarSystemFocus()
		deps.requestRender()
	}

	function setSolarSystemFocusChangeHandler(
		handler: ((bodyIndex: number, moonIndex?: number) => void) | null,
	) {
		ctx.solarSystemFocusChangeHandler = handler
	}

	return {
		stepSolarSystemFocusTween,
		focusOnSystemBody,
		setMoonOrbitOverlay,
		updateMoonOrbitOverlay,
		updateMoonOrbitDay,
		setSolarSystemActive,
		setSolarSystemOverlay,
		updateSolarSystemOverlay,
		updateSolarSystemDay,
		setSolarSystemSpinHours,
		setSolarSystemFocusChangeHandler,
	}
}
