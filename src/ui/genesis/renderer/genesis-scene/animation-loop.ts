import * as THREE from "three"
import { CLOUD_FRAME_MS } from "@/ui/genesis/renderer/clouds/overlay"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { updateGlobeLabelOrientations } from "@/ui/genesis/renderer/nation-label-overlay/orientation"
import { activateSettlementLabels } from "@/ui/genesis/renderer/nation-label-overlay/settlement-labels"
import {
	applySettlementLabelCulling,
	applySettlementMarkerCollisionCulling,
	applySettlementMarkerScreenScale,
} from "@/ui/genesis/renderer/nation-label-overlay/settlement-marker-collision"
import {
	createPendingNationScriptTextureQueue,
	processPendingNationScriptTextures,
} from "@/ui/genesis/renderer/nation-script-overlay"
import { createRenderScheduler } from "@/ui/genesis/renderer/render-scheduler"
import { SETTLEMENT_SCRIPT } from "@/ui/genesis/renderer/settlement-script-overlay"
import {
	SOLAR_TERMINATOR_ELEVATED_RADIUS,
	SOLAR_TERMINATOR_RADIUS,
} from "@/ui/genesis/renderer/solar-terminator"

const LABEL_CULLING_ENABLED = true
const MAP_DASH_DENSE_ZOOM = 20
const GLOBE_DASH_DENSE_DISTANCE = 1.1
const DENSE_DASH_SCALE = 2
const SOLAR_SYSTEM_CAMERA_SETTLE_FRACTION = 1e-4

function requestSettlementScripts(
	ctx: GenesisContext,
	group: THREE.Group | null,
): boolean {
	if (!group) return false
	ctx.pendingSettlementScriptTextureQueue ??=
		createPendingNationScriptTextureQueue()
	return SETTLEMENT_SCRIPT.request({
		group,
		textureCache: ctx.nationScriptTextureCache,
		textureQueue: ctx.pendingSettlementScriptTextureQueue,
	})
}

function processSettlementScriptTextures(ctx: GenesisContext): boolean {
	const progress = processPendingNationScriptTextures(
		ctx.pendingSettlementScriptTextureQueue,
		ctx.nationScriptTextureCache,
		12,
	)
	if (progress.pending === 0) ctx.pendingSettlementScriptTextureQueue = null
	return progress.pending > 0 || progress.processed > 0
}

export interface AnimationLoopControllerDeps {
	stepFocusTween: () => void
	stepPulse: () => void
	stepSolarSystemFocusTween: () => void
	renderSolarSystemView: () => void
	updateSolarTerminatorLabels: (radius: number) => void
}

export function createAnimationLoopController(
	ctx: GenesisContext,
	deps: AnimationLoopControllerDeps,
) {
	let cloudFrame: number | null = null
	const previousCameraPosition = new THREE.Vector3()
	const renderScheduler = createRenderScheduler({
		requestFrame: (callback) => window.requestAnimationFrame(callback),
		cancelFrame: (handle) => window.cancelAnimationFrame(handle),
		onFrame: () => {
			let keepAnimating = false
			if (
				!ctx.solarSystemActive &&
				!ctx.clouds.frozen &&
				((ctx.globeGroup.visible && ctx.clouds.globe.visible) ||
					ctx.mapCloudMesh?.visible)
			) {
				ctx.clouds.advance()
				cloudFrame ??= window.setTimeout(() => {
					cloudFrame = null
					renderScheduler.requestRender()
				}, CLOUD_FRAME_MS)
			} else if (cloudFrame !== null) {
				window.clearTimeout(cloudFrame)
				cloudFrame = null
			}

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
					previousCameraPosition.copy(ctx.camera.position)
					ctx.controls.update()
					if (
						!ctx.globeControlsInteracting &&
						ctx.globeControlActivityFrames > 0
					) {
						ctx.globeControlActivityFrames--
					}
					// TrackballControls uses a fixed world-space change threshold.
					// At moon scale, even a large on-screen move can fall below it.
					const cameraStillMoving =
						ctx.camera.position.distanceToSquared(previousCameraPosition) >
						ctx.camera.position.distanceToSquared(ctx.controls.target) *
							SOLAR_SYSTEM_CAMERA_SETTLE_FRACTION ** 2
					if (cameraStillMoving)
						ctx.globeControlActivityFrames = Math.max(
							1,
							ctx.globeControlActivityFrames,
						)
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
						mat.dashScale =
							ctx.mapCamera.zoom >= MAP_DASH_DENSE_ZOOM ? DENSE_DASH_SCALE : 1
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
				keepAnimating = processSettlementScriptTextures(ctx) || keepAnimating
				{
					applySettlementMarkerScreenScale(ctx, ctx.mapSettlements)
					applySettlementMarkerScreenScale(ctx, ctx.mapEu4Settlements)
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
					keepAnimating =
						requestSettlementScripts(ctx, ctx.mapSettlementLabels) ||
						keepAnimating
					keepAnimating =
						activateSettlementLabels(ctx.mapSettlementLabels) || keepAnimating
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
					mat.dashScale =
						dist <= GLOBE_DASH_DENSE_DISTANCE ? DENSE_DASH_SCALE : 1
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
			keepAnimating = processSettlementScriptTextures(ctx) || keepAnimating
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
				keepAnimating =
					requestSettlementScripts(ctx, ctx.globeSettlementLabels) ||
					keepAnimating
				keepAnimating =
					activateSettlementLabels(ctx.globeSettlementLabels) || keepAnimating
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
			!!ctx.focusTween || !!ctx.solarSystemFocusTween || !!ctx.pulse,
		)
	}

	function dispose() {
		if (cloudFrame !== null) window.clearTimeout(cloudFrame)
		renderScheduler.dispose()
	}

	return { requestRender, syncAnimationState, dispose }
}
