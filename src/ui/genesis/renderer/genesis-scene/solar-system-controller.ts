import type { MoonBody } from "@/model/celestial/moons/types"
import { DEFERRED_SHADERS } from "@/ui/genesis/renderer/deferred-shaders"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import {
	DEFAULT_CAMERA_FAR,
	DEFAULT_CAMERA_NEAR,
	DEFAULT_CONTROLS_MAX_DISTANCE,
	DEFAULT_CONTROLS_MIN_DISTANCE,
	setCameraFarForMaxDistance,
} from "@/ui/genesis/renderer/genesis-scene/scene-setup"
import { buildMoonOrbitOverlay } from "@/ui/genesis/renderer/moon-orbit-overlay"
import {
	setNebulaBackgroundSeed as applyNebulaBackgroundSeed,
	frameNebulaBackground,
} from "@/ui/genesis/renderer/nebula-background"
import { buildSolarSystemOverlay } from "@/ui/genesis/solar-system/overlay/overlay"
import type {
	OrbitAddress,
	SolarSystemOverlayParams,
	SolarSystemOverlayState,
} from "@/ui/genesis/solar-system/overlay/types"

export interface SolarSystemControllerDeps {
	requestRender: () => void
	syncAnimationState: () => void
	updateOverlayVisibility: () => void
}

const SOLAR_SYSTEM_FOCUS_DISTANCE_MULTIPLIER = 6
// The camera may come no closer than this many radii of the focused body,
// so it never ends up inside it.
const SOLAR_SYSTEM_MIN_DISTANCE_RADII = 1.2
// True-scale distances span ~1e9 from a small moon to the system's edge,
// more than one fixed near/far pair can resolve, so the near plane tracks
// the camera's distance to its target.
const SOLAR_SYSTEM_NEAR_FRACTION = 0.01
// Keeps the projection finite with the camera sitting on its target.
const SOLAR_SYSTEM_MIN_NEAR = 1e-9

export function createSolarSystemController(
	ctx: GenesisContext,
	deps: SolarSystemControllerDeps,
) {
	let compilationNeeded = false
	let compilation: Promise<void> | null = null
	let programsWarm = false
	let disposed = false
	const retiredOverlays = new Set<SolarSystemOverlayState>()

	function disposeRetiredOverlays() {
		for (const overlay of retiredOverlays) overlay.dispose()
		retiredOverlays.clear()
	}

	function startCompilation() {
		const swaps = DEFERRED_SHADERS.defer(ctx.solarSystemGroup)
		// Acquire the new materials' programs before releasing the previous
		// overlay, so shared shader variants stay in the renderer's cache.
		compilation = DEFERRED_SHADERS.compile({
			renderer: ctx.renderer,
			camera: ctx.camera,
			scene: ctx.scene,
			swaps,
		})
			.catch((error: unknown) => {
				console.error("Solar system shader compilation failed", error)
			})
			.then(() => {
				DEFERRED_SHADERS.restore(swaps)
				programsWarm = true
				if (!compilationNeeded) disposeRetiredOverlays()
			})
			.finally(() => {
				compilation = null
				if (!disposed) deps.requestRender()
			})
	}

	function renderSolarSystemView() {
		if (disposed) return
		if (compilationNeeded && !compilation) {
			compilationNeeded = false
			startCompilation()
		}
		// Once programs have been built, a rebuild mostly hits the renderer's
		// cache, so holding the last frame beats flashing placeholders.
		if (compilation && programsWarm) return
		ctx.camera.near = Math.max(
			ctx.camera.position.distanceTo(ctx.controls.target) *
				SOLAR_SYSTEM_NEAR_FRACTION,
			SOLAR_SYSTEM_MIN_NEAR,
		)
		ctx.camera.updateProjectionMatrix()
		frameNebulaBackground({ mesh: ctx.nebulaBackground, camera: ctx.camera })
		ctx.renderer.render(ctx.scene, ctx.camera)
	}

	async function finishCompilation() {
		disposed = true
		await compilation
		disposeRetiredOverlays()
	}

	function stepSolarSystemFocusTween() {
		if (!ctx.solarSystemFocusTween) return
		if (ctx.solarSystemFocusTween.t0 === 0) {
			ctx.solarSystemFocusTween.t0 = performance.now()
		}
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
		address: OrbitAddress,
		opts?: { durationMs?: number },
	) {
		if (!ctx.solarSystemActive) setSolarSystemActive(true)
		if (!ctx.solarSystemOverlayState) return
		const focus = ctx.solarSystemOverlayState.getBodyFocus(address)
		if (!focus) return
		ctx.solarSystemTrackedFocus = address
		ctx.solarSystemTrackedFocusPosition = focus.position.clone()
		ctx.solarSystemFocusChangeHandler?.(address)
		ctx.controls.minDistance = focus.radius * SOLAR_SYSTEM_MIN_DISTANCE_RADII
		const distance = focus.radius * SOLAR_SYSTEM_FOCUS_DISTANCE_MULTIPLIER
		const dir = ctx.camera.position.clone().sub(ctx.controls.target).normalize()
		if (!Number.isFinite(dir.x) || dir.lengthSq() === 0) dir.set(0, 0, 1)
		const camTo = focus.position.clone().add(dir.multiplyScalar(distance))
		ctx.solarSystemFocusTween = {
			// Stamped on the first step, not here -- see the field's doc in context.ts.
			t0: 0,
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
		if (disposed) return
		if (ctx.solarSystemActive === active) return
		ctx.solarSystemActive = active
		ctx.solarSystemGroup.visible = active
		ctx.globeGroup.visible = !active
		ctx.orbitGroup.visible = !active
		// The nebula skybox carries its own starfield -- the shared point
		// starfield would double it up, so it rests while this view is up.
		ctx.starPoints.visible = !active
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
		if (active && ctx.solarSystemOverlayState) compilationNeeded = true
		if (active) {
			ctx.savedCameraPosition = ctx.camera.position.clone()
			ctx.savedControlsTarget = ctx.controls.target.clone()
			ctx.controls.target.set(0, 0, 0)
			const dist = ctx.solarSystemOverlayState?.suggestedCameraDistance ?? 6
			ctx.controls.minDistance =
				(ctx.solarSystemOverlayState?.getBodyFocus({
					kind: "star",
					starIndex: 0,
				})?.radius ?? 0) * SOLAR_SYSTEM_MIN_DISTANCE_RADII
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
			ctx.camera.near = DEFAULT_CAMERA_NEAR
			ctx.camera.far = DEFAULT_CAMERA_FAR
			ctx.camera.updateProjectionMatrix()
		}
		ctx.controls.update()
		deps.requestRender()
		deps.syncAnimationState()
	}

	function setSolarSystemOverlay(params: SolarSystemOverlayParams | null) {
		if (disposed) return
		if (ctx.solarSystemOverlayState) {
			ctx.solarSystemGroup.remove(ctx.solarSystemOverlayState.group)
			retiredOverlays.add(ctx.solarSystemOverlayState)
			ctx.solarSystemOverlayState = null
		}
		compilationNeeded = params !== null
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
			compilation ||
			!ctx.solarSystemOverlayState ||
			!ctx.solarSystemOverlayState.updateBodies(
				params.bodies,
				params.mainWorldTexture,
			)
		) {
			setSolarSystemOverlay({
				...params,
				initialDay: ctx.currentSolarSystemDay,
			})
		}
		compilationNeeded = true
		ctx.solarSystemOverlayState?.setSpinHours(ctx.currentSolarSystemSpinHours)
		reapplyTrackedSolarSystemFocus()
		deps.requestRender()
	}

	function reapplyTrackedSolarSystemFocus() {
		if (!ctx.solarSystemTrackedFocus || !ctx.solarSystemOverlayState) return
		const focus = ctx.solarSystemOverlayState.getBodyFocus(
			ctx.solarSystemTrackedFocus,
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
		handler: ((address: OrbitAddress) => void) | null,
	) {
		ctx.solarSystemFocusChangeHandler = handler
	}

	function setNebulaBackgroundSeed(seed: number) {
		applyNebulaBackgroundSeed({ mesh: ctx.nebulaBackground, seed })
		deps.requestRender()
	}

	return {
		finishCompilation,
		renderSolarSystemView,
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
		setNebulaBackgroundSeed,
	}
}
