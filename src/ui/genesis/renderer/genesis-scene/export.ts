import * as THREE from "three"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import type {
	ExportRendererLike,
	MapExportDependencies,
	MapExportOptions,
	MapExportVisibilityTarget,
} from "@/ui/genesis/renderer/genesis-scene/types"
import {
	applyMapExportVisibility,
	renderMapExportPng,
} from "@/ui/genesis/renderer/map-export"
import {
	settlementLabelsInView,
	syncSettlementLabelsForExport,
} from "@/ui/genesis/renderer/nation-label-overlay/settlement-labels"
import { createSettlementFrustum } from "@/ui/genesis/renderer/nation-label-overlay/settlement-marker-collision"
import {
	createPendingNationScriptTextureQueue,
	processPendingNationScriptTextures,
} from "@/ui/genesis/renderer/nation-script-overlay"
import { SETTLEMENT_SCRIPT } from "@/ui/genesis/renderer/settlement-script-overlay"
import { TRADE_ROUTE_DETAIL_LAYER } from "@/ui/genesis/renderer/trade-route-overlay"

export interface ExportControllerDeps {
	requestRender: () => void
	setMapCenterLongitude: (longitudeDeg: number) => void
	mapExportDependencies: MapExportDependencies
}

/** Owns exporting the flat map to a PNG: repositioning map-slide clones to
 * match the current map mesh (syncMapExportObjectPositions), building the
 * "only the map, nothing else" visibility list (buildMapExportVisibilityTargets),
 * and the actual render-to-PNG orchestration (exportMapPng), which mostly
 * delegates to map-export.ts. See plans/genesis-scene-controller-split.md. */
export function createExportController(
	ctx: GenesisContext,
	deps: ExportControllerDeps,
) {
	function syncMapExportObjectPositions() {
		const mapObjects = [
			ctx.mapCloudMesh,
			ctx.mapWireframe,
			ctx.mapNationBorders,
			ctx.mapSelectedProvinceBorder,
			ctx.mapGrid,
			ctx.mapSolarTerminator,
			ctx.mapRivers,
			ctx.mapMeasureLine,
			ctx.mapMeasureDots,
			ctx.mapRealmBorders,
			ctx.mapSettlements,
			ctx.mapEu4Settlements,
			ctx.mapInfrastructure,
			ctx.mapNationLabels,
			ctx.mapNationScripts,
			ctx.mapSettlementLabels,
			ctx.mapCultureLabels,
			ctx.mapHeritageLabels,
			ctx.mapReligionLabels,
			ctx.mapPathfindingLine,
			ctx.mapPathfindingDots,
			ctx.pulseMap,
		]
		for (const object of mapObjects) {
			if (object && ctx.mapMesh) object.position.copy(ctx.mapMesh.position)
		}
	}

	function buildMapExportVisibilityTargets(): MapExportVisibilityTarget[] {
		return [
			{ object: ctx.terrainMesh, visible: false },
			{ object: ctx.clouds.globe, visible: false },
			{ object: ctx.waterMesh, visible: false },
			{ object: ctx.atmosMesh, visible: false },
			{ object: ctx.terrainWireframe, visible: false },
			{ object: ctx.globeGrid, visible: false },
			{ object: ctx.globeRivers, visible: false },
			{ object: ctx.globeNationBorders, visible: false },
			{ object: ctx.globeSelectedProvinceBorder, visible: false },
			{ object: ctx.globeMeasureLine, visible: false },
			{ object: ctx.globeMeasureDots, visible: false },
			{ object: ctx.globePathfindingLine, visible: false },
			{ object: ctx.globePathfindingDots, visible: false },
			{ object: ctx.globeRealmBorders, visible: false },
			{ object: ctx.globeSettlements, visible: false },
			{ object: ctx.globeEu4Settlements, visible: false },
			{ object: ctx.globeInfrastructure, visible: false },
			{ object: ctx.globeNationLabels, visible: false },
			{ object: ctx.globeNationScripts, visible: false },
			{ object: ctx.globeSettlementLabels, visible: false },
			{ object: ctx.globeCultureLabels, visible: false },
			{ object: ctx.globeHeritageLabels, visible: false },
			{ object: ctx.globeReligionLabels, visible: false },
			{ object: ctx.pulseGlobe, visible: false },
			{ object: ctx.mapMesh, visible: true },
			{ object: ctx.mapCloudMesh, visible: ctx.clouds.ready },
			{ object: ctx.mapWireframe, visible: ctx.wireframeVisible },
			{ object: ctx.mapGrid, visible: ctx.gridVisible },
			{
				object: ctx.mapSolarTerminator,
				visible: ctx.solarTerminatorVisible,
			},
			{ object: ctx.mapRivers, visible: ctx.riversVisible },
			{
				object: ctx.mapNationBorders,
				visible: ctx.nationBordersVisible,
			},
			{
				object: ctx.mapRealmBorders,
				visible: ctx.realmBordersSpec !== null,
			},
			{ object: ctx.mapSettlements, visible: ctx.settlementsVisible },
			{
				object: ctx.mapEu4Settlements,
				visible: ctx.eu4SettlementsVisible,
			},
			{
				object: ctx.mapInfrastructure,
				visible: ctx.infrastructureVisible,
			},
			{
				object: ctx.mapNationLabels,
				visible:
					ctx.labelMode.nations ||
					ctx.labelMode.dynasty ||
					ctx.labelMode.heraldry,
			},
			{
				object: ctx.mapNationScripts,
				visible: ctx.labelMode.script,
			},
			{
				object: ctx.mapSettlementLabels,
				visible: ctx.labelMode.settlements,
			},
			{ object: ctx.mapCultureLabels, visible: ctx.labelMode.culture },
			{
				object: ctx.mapHeritageLabels,
				visible: ctx.labelMode.heritage,
			},
			{
				object: ctx.mapReligionLabels,
				visible: ctx.labelMode.religion,
			},
			{ object: ctx.mapSelectedProvinceBorder, visible: false },
			{ object: ctx.mapMeasureLine, visible: false },
			{ object: ctx.mapMeasureDots, visible: false },
			{ object: ctx.mapPathfindingLine, visible: false },
			{ object: ctx.mapPathfindingDots, visible: false },
			{ object: ctx.pulseMap, visible: false },
		]
	}

	async function exportMapPng(options: MapExportOptions): Promise<Blob> {
		if (!ctx.currentWorld || !ctx.mapMesh) {
			throw new Error("Cannot export map before a world is loaded")
		}
		const width = Math.max(1, Math.floor(options.width))
		const height = Math.max(1, Math.floor(width / 2))
		const previousCenterLongitude = ctx.currentMapCenterLongitudeDeg
		const requestedCenterLongitude = options.centerLongitudeDeg
		const shouldRecenterForExport =
			typeof requestedCenterLongitude === "number" &&
			Number.isFinite(requestedCenterLongitude) &&
			requestedCenterLongitude !== previousCenterLongitude
		if (shouldRecenterForExport) {
			deps.setMapCenterLongitude(requestedCenterLongitude)
		}
		syncMapExportObjectPositions()
		const restoreVisibility = applyMapExportVisibility(
			buildMapExportVisibilityTargets(),
		)
		const resumeClouds = ctx.clouds.freezeForExport()
		const exportCamera = new THREE.OrthographicCamera(-2, 2, 1, -1, 0.1, 100)
		exportCamera.layers.enable(TRADE_ROUTE_DETAIL_LAYER)
		exportCamera.position.set(0, 0, 5)
		exportCamera.lookAt(0, 0, 0)
		const yieldToMainThread =
			deps.mapExportDependencies.yieldToMainThread ??
			(() => new Promise<void>((resolve) => window.setTimeout(resolve, 0)))
		try {
			const labels = settlementLabelsInView({
				group: ctx.mapSettlementLabels,
				frustum: createSettlementFrustum(exportCamera),
			})
			if (labels.length > 0) {
				const textureQueue = (ctx.pendingSettlementScriptTextureQueue ??=
					createPendingNationScriptTextureQueue())
				SETTLEMENT_SCRIPT.request({
					labels,
					textureCache: ctx.nationScriptTextureCache,
					textureQueue,
				})
				await syncSettlementLabelsForExport(labels)
				while (
					processPendingNationScriptTextures(
						textureQueue,
						ctx.nationScriptTextureCache,
						12,
					).pending > 0
				) {
					await yieldToMainThread()
				}
			}
			return await renderMapExportPng({
				scene: ctx.scene,
				renderer: ctx.renderer as unknown as ExportRendererLike,
				camera: exportCamera,
				width,
				height,
				onProgress: options.onProgress,
				createRenderTarget:
					deps.mapExportDependencies.createRenderTarget ??
					((tileWidth, tileHeight) =>
						new THREE.WebGLRenderTarget(tileWidth, tileHeight)),
				yieldToMainThread,
			})
		} finally {
			resumeClouds()
			restoreVisibility()
			if (shouldRecenterForExport) {
				deps.setMapCenterLongitude(previousCenterLongitude)
			}
			deps.requestRender()
		}
	}

	return {
		syncMapExportObjectPositions,
		buildMapExportVisibilityTargets,
		exportMapPng,
	}
}
