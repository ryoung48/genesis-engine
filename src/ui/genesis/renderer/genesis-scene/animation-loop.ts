import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { updateGlobeLabelOrientations } from "@/ui/genesis/renderer/nation-label-overlay/orientation"
import { applySettlementLabelScreenScale } from "@/ui/genesis/renderer/nation-label-overlay/settlement-labels"
import {
	applySettlementLabelCulling,
	applySettlementMarkerCollisionCulling,
	applySettlementMarkerScreenScale,
} from "@/ui/genesis/renderer/nation-label-overlay/settlement-marker-collision"
import { processPendingNationScriptTextures } from "@/ui/genesis/renderer/nation-script-overlay"
import { createRenderScheduler } from "@/ui/genesis/renderer/render-scheduler"
import {
	SOLAR_TERMINATOR_ELEVATED_RADIUS,
	SOLAR_TERMINATOR_RADIUS,
} from "@/ui/genesis/renderer/solar-terminator"

const LABEL_CULLING_ENABLED = true

export interface AnimationLoopControllerDeps {
	stepFocusTween: () => void
	stepPulse: () => void
	stepSolarSystemFocusTween: () => void
	renderSolarSystemView: () => void
	updateSolarTerminatorLabels: (radius: number) => void
}

/** Owns the `onFrame` render-scheduler callback -- the single per-frame
 * step that advances every other controller's tween/pulse/streaming state
 * and decides whether the loop needs to keep running. Also owns
 * `requestRender`/`syncAnimationState`, since both are really just thin
 * wrappers around the render scheduler this controller constructs. See
 * plans/genesis-scene-controller-split.md. */
export function createAnimationLoopController(
	ctx: GenesisContext,
	deps: AnimationLoopControllerDeps,
) {
	const renderScheduler = createRenderScheduler({
		requestFrame: (callback) => window.requestAnimationFrame(callback),
		cancelFrame: (handle) => window.cancelAnimationFrame(handle),
		onFrame: () => {
			let keepAnimating = false

			if (ctx.focusTween) {
				deps.stepFocusTween()
				keepAnimating = keepAnimating || ctx.focusTween !== null
			}
			if (ctx.pulse) {
				deps.stepPulse()
				keepAnimating = keepAnimating || ctx.pulse !== null
			}

			if (ctx.solarSystemFocusTween) {
				deps.stepSolarSystemFocusTween()
				keepAnimating = keepAnimating || ctx.solarSystemFocusTween !== null
			}

			if (ctx.solarSystemActive) {
				if (
					ctx.globeControlsInteracting ||
					ctx.globeControlActivityFrames > 0
				) {
					ctx.controls.update()
					if (
						!ctx.globeControlsInteracting &&
						ctx.globeControlActivityFrames > 0
					) {
						ctx.globeControlActivityFrames--
					}
					keepAnimating =
						keepAnimating ||
						ctx.globeControlsInteracting ||
						ctx.globeControlActivityFrames > 0
				}
				// Body-name labels don't rotate with anything else in the scene
				// (bodyGroups only ever translate), so they need their own
				// per-frame billboard update to keep facing the camera.
				ctx.solarSystemOverlayState?.updateLevelOfDetail(ctx.camera)
				ctx.solarSystemOverlayState?.updateLabelOrientations(ctx.camera)
				deps.renderSolarSystemView()
				return keepAnimating
			}

			if (ctx.currentViewMode === "map") {
				if (ctx.mapControlsInteracting || ctx.mapControlActivityFrames > 0) {
					ctx.mapControls.update()
					if (!ctx.mapControlsInteracting && ctx.mapControlActivityFrames > 0) {
						ctx.mapControlActivityFrames--
					}
					keepAnimating =
						keepAnimating ||
						ctx.mapControlsInteracting ||
						ctx.mapControlActivityFrames > 0
				}
				if (ctx.mapInfrastructureMaterials.length > 0) {
					const zoomScale = Math.sqrt(ctx.mapCamera.zoom)
					for (const mat of ctx.mapInfrastructureMaterials) {
						mat.linewidth = mat.userData.baseWidth * zoomScale
					}
				}
				if (ctx.mapRiverMaterials.length > 0) {
					const zoomScale = Math.sqrt(ctx.mapCamera.zoom)
					for (const mat of ctx.mapRiverMaterials) {
						mat.linewidth = mat.userData.baseWidth * zoomScale
					}
				}
				if (ctx.nationBorderMaterials.length > 0) {
					const zoomScale = Math.pow(ctx.mapCamera.zoom, 0.3)
					for (const mat of ctx.nationBorderMaterials) {
						mat.linewidth = mat.userData.baseWidth * zoomScale
					}
				}
				const scriptTextureProgress = processPendingNationScriptTextures(
					ctx.pendingNationScriptTextureQueue,
					ctx.nationScriptTextureCache,
					3,
				)
				if (scriptTextureProgress.pending === 0) {
					ctx.pendingNationScriptTextureQueue = null
				}
				keepAnimating =
					keepAnimating ||
					scriptTextureProgress.pending > 0 ||
					scriptTextureProgress.processed > 0
				{
					applySettlementMarkerScreenScale(ctx, ctx.mapSettlements)
					applySettlementMarkerScreenScale(ctx, ctx.mapEu4Settlements)
					applySettlementLabelScreenScale(ctx, ctx.mapSettlementLabels)
					const mapSettlementVisibility = new Map<string, boolean>()
					applySettlementMarkerCollisionCulling(
						ctx,
						ctx.mapSettlements,
						mapSettlementVisibility,
					)
					applySettlementMarkerCollisionCulling(
						ctx,
						ctx.mapEu4Settlements,
						mapSettlementVisibility,
					)
					applySettlementLabelCulling(
						ctx.mapSettlementLabels,
						mapSettlementVisibility,
						true,
					)
				}
				ctx.renderer.render(ctx.scene, ctx.mapCamera)
				return keepAnimating
			}

			if (ctx.globeRiverMaterials.length > 0) {
				const dist = ctx.camera.position.length()
				const zoomScale = 3 / dist
				for (const mat of ctx.globeRiverMaterials) {
					mat.linewidth = mat.userData.baseWidth * zoomScale
				}
			}
			if (ctx.nationBorderMaterials.length > 0) {
				const dist = ctx.camera.position.length()
				const zoomScale = Math.pow(3 / dist, 0.3)
				for (const mat of ctx.nationBorderMaterials) {
					mat.linewidth = mat.userData.baseWidth * zoomScale
				}
			}
			if (ctx.globeMeasureDots && ctx.globeMeasureDots.visible) {
				const dist = ctx.camera.position.length()
				const scale = dist * 0.001
				for (const child of ctx.globeMeasureDots.children) {
					child.scale.setScalar(scale)
				}
			}
			if (ctx.globeInfrastructureMaterials.length > 0) {
				const dist = ctx.camera.position.length()
				const zoomScale = 3 / dist
				for (const mat of ctx.globeInfrastructureMaterials) {
					mat.linewidth = mat.userData.baseWidth * zoomScale
				}
			}
			if (ctx.globeControlsInteracting || ctx.globeControlActivityFrames > 0) {
				ctx.controls.update()
				if (
					!ctx.globeControlsInteracting &&
					ctx.globeControlActivityFrames > 0
				) {
					ctx.globeControlActivityFrames--
				}
				keepAnimating =
					keepAnimating ||
					ctx.globeControlsInteracting ||
					ctx.globeControlActivityFrames > 0
			}
			const scriptTextureProgress = processPendingNationScriptTextures(
				ctx.pendingNationScriptTextureQueue,
				ctx.nationScriptTextureCache,
				3,
			)
			if (scriptTextureProgress.pending === 0) {
				ctx.pendingNationScriptTextureQueue = null
			}
			keepAnimating =
				keepAnimating ||
				scriptTextureProgress.pending > 0 ||
				scriptTextureProgress.processed > 0
			updateGlobeLabelOrientations(
				ctx.globeNationLabels,
				ctx.camera,
				LABEL_CULLING_ENABLED,
			)
			updateGlobeLabelOrientations(
				ctx.globeNationScripts,
				ctx.camera,
				LABEL_CULLING_ENABLED,
			)
			updateGlobeLabelOrientations(
				ctx.globeSettlementLabels,
				ctx.camera,
				LABEL_CULLING_ENABLED,
			)
			{
				applySettlementMarkerScreenScale(ctx, ctx.globeSettlements)
				applySettlementMarkerScreenScale(ctx, ctx.globeEu4Settlements)
				applySettlementLabelScreenScale(ctx, ctx.globeSettlementLabels)
				const globeSettlementVisibility = new Map<string, boolean>()
				applySettlementMarkerCollisionCulling(
					ctx,
					ctx.globeSettlements,
					globeSettlementVisibility,
				)
				applySettlementMarkerCollisionCulling(
					ctx,
					ctx.globeEu4Settlements,
					globeSettlementVisibility,
				)
				applySettlementLabelCulling(
					ctx.globeSettlementLabels,
					globeSettlementVisibility,
					false,
				)
			}
			updateGlobeLabelOrientations(
				ctx.globeCultureLabels,
				ctx.camera,
				LABEL_CULLING_ENABLED,
			)
			updateGlobeLabelOrientations(
				ctx.globeHeritageLabels,
				ctx.camera,
				LABEL_CULLING_ENABLED,
			)
			updateGlobeLabelOrientations(
				ctx.globeReligionLabels,
				ctx.camera,
				LABEL_CULLING_ENABLED,
			)
			deps.updateSolarTerminatorLabels(
				ctx.elevationVisible
					? SOLAR_TERMINATOR_ELEVATED_RADIUS
					: SOLAR_TERMINATOR_RADIUS,
			)
			ctx.renderer.render(ctx.scene, ctx.camera)
			return keepAnimating
		},
	})

	function requestRender() {
		renderScheduler.requestRender()
	}

	function syncAnimationState() {
		renderScheduler.setAnimationActive(
			!!ctx.focusTween ||
				!!ctx.solarSystemFocusTween ||
				!!ctx.pulse ||
				ctx.globeControlsInteracting ||
				ctx.mapControlsInteracting ||
				ctx.globeControlActivityFrames > 0 ||
				ctx.mapControlActivityFrames > 0,
		)
	}

	function dispose() {
		renderScheduler.dispose()
	}

	return { requestRender, syncAnimationState, dispose }
}
