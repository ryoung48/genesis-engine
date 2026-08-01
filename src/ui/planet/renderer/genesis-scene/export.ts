import * as THREE from "three"
import type {
	ExportRendererLike,
	MapExportDependencies,
	MapExportOptions,
	MapExportVisibilityTarget,
} from "@/ui/planet/renderer/create-genesis-scene"
import type { GenesisContext } from "@/ui/planet/renderer/genesis-scene/context"
import {
	applyMapExportVisibility,
	renderMapExportPng,
} from "@/ui/planet/renderer/map-export"

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
			ctx.mapWireframe,
			ctx.mapLandNationBorders,
			ctx.mapNationBorders,
			ctx.mapSelectedProvinceBorder,
			ctx.mapGrid,
			ctx.mapThermalEquator,
			ctx.mapSolarTerminator,
			ctx.mapRivers,
			ctx.mapMeasureLine,
			ctx.mapMeasureDots,
			ctx.mapHierarchyOverlay,
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
			{ object: ctx.waterMesh, visible: false },
			{ object: ctx.atmosMesh, visible: false },
			{ object: ctx.terrainWireframe, visible: false },
			{ object: ctx.globeGrid, visible: false },
			{ object: ctx.globeThermalEquator, visible: false },
			{ object: ctx.globeRivers, visible: false },
			{ object: ctx.globeLandNationBorders, visible: false },
			{ object: ctx.globeNationBorders, visible: false },
			{ object: ctx.globeSelectedProvinceBorder, visible: false },
			{ object: ctx.globeMeasureLine, visible: false },
			{ object: ctx.globeMeasureDots, visible: false },
			{ object: ctx.globePathfindingLine, visible: false },
			{ object: ctx.globePathfindingDots, visible: false },
			{ object: ctx.globeHierarchyOverlay, visible: false },
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
			{ object: ctx.mapWireframe, visible: ctx.wireframeVisible },
			{ object: ctx.mapGrid, visible: ctx.gridVisible },
			{ object: ctx.mapThermalEquator, visible: false },
			{
				object: ctx.mapSolarTerminator,
				visible: ctx.solarTerminatorVisible,
			},
			{ object: ctx.mapRivers, visible: ctx.riversVisible },
			{
				object: ctx.mapLandNationBorders,
				visible: ctx.landNationBordersVisible,
			},
			{
				object: ctx.mapNationBorders,
				visible: ctx.nationBordersVisible,
			},
			{
				object: ctx.mapHierarchyOverlay,
				visible: ctx.hierarchyOverlayNationId >= 0,
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
				visible: ctx.labelMode.nations || ctx.labelMode.dynasty,
			},
			{
				object: ctx.mapNationScripts,
				visible:
					ctx.labelMode.script &&
					(ctx.labelMode.nations || ctx.labelMode.dynasty),
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
		const exportCamera = new THREE.OrthographicCamera(-2, 2, 1, -1, 0.1, 100)
		exportCamera.position.set(0, 0, 5)
		exportCamera.lookAt(0, 0, 0)
		try {
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
				yieldToMainThread:
					deps.mapExportDependencies.yieldToMainThread ??
					(() => new Promise((resolve) => window.setTimeout(resolve, 0))),
			})
		} finally {
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
