import { disposeGroup, disposeObject3D } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import {
	buildMapWireframe,
	buildTerrainWireframe,
} from "@/ui/genesis/renderer/mesh-builders"
import {
	buildGlobeGrid,
	buildMapGrid,
} from "@/ui/genesis/renderer/overlay-builders/grid"
import type { ColorMode } from "@/ui/genesis/shared/colors"

export interface OverlayAggregatorControllerDeps {
	syncAnimationState: () => void
	rebuildCoastline: () => void
	rebuildThermalEquator: () => void
	rebuildSolarTerminator: () => void
	rebuildWindArrows: () => void
	rebuildRivers: () => void
	applyWaterMaterialForMode: (mode: ColorMode) => void
	rebuildNationBorders: () => void
	rebuildSelectedProvinceBorder: () => void
	rebuildHierarchy: () => void
	rebuildSettlementOverlay: () => void
	rebuildEu4SettlementOverlay: () => void
	rebuildTradeRouteOverlay: () => void
	rebuildNationLabels: () => void
	updateOverlayVisibility: () => void
}

/** Disposes and rebuilds every overlay group from scratch (wireframe, grid,
 * plus a full rebuild pass across every overlay controller), then syncs
 * visibility -- the "something structural changed" full-rebuild path, as
 * opposed to each controller's own narrower rebuild used for smaller
 * changes. Called on world load, wireframe/grid toggles, and grid spacing
 * changes. See plans/genesis-scene-controller-split.md. */
export function createOverlayAggregatorController(
	ctx: GenesisContext,
	deps: OverlayAggregatorControllerDeps,
) {
	function rebuildOverlays() {
		disposeObject3D(ctx.globeGroup, ctx.terrainWireframe)
		disposeObject3D(ctx.scene, ctx.mapWireframe)
		disposeObject3D(ctx.globeGroup, ctx.globeGrid)
		disposeObject3D(ctx.scene, ctx.mapGrid)
		disposeGroup(ctx.scene, ctx.mapSolarTerminator)
		disposeObject3D(ctx.globeGroup, ctx.globeNationBorders)
		disposeObject3D(ctx.scene, ctx.mapNationBorders)
		disposeObject3D(ctx.globeGroup, ctx.globeNationFill)
		disposeObject3D(ctx.scene, ctx.mapNationFill)
		disposeObject3D(ctx.globeGroup, ctx.globeOccupationStripes)
		disposeObject3D(ctx.scene, ctx.mapOccupationStripes)
		disposeObject3D(ctx.globeGroup, ctx.globeSelectedProvinceBorder)
		disposeObject3D(ctx.scene, ctx.mapSelectedProvinceBorder)
		disposeObject3D(ctx.globeGroup, ctx.pulseGlobe)
		disposeObject3D(ctx.scene, ctx.pulseMap)
		disposeGroup(ctx.globeGroup, ctx.globeHierarchyOverlay)
		disposeGroup(ctx.scene, ctx.mapHierarchyOverlay)
		disposeGroup(ctx.globeGroup, ctx.globeSettlements)
		disposeGroup(ctx.scene, ctx.mapSettlements)
		disposeGroup(ctx.globeGroup, ctx.globeEu4Settlements)
		disposeGroup(ctx.scene, ctx.mapEu4Settlements)
		disposeGroup(ctx.globeGroup, ctx.globeInfrastructure)
		disposeGroup(ctx.scene, ctx.mapInfrastructure)
		disposeGroup(ctx.globeGroup, ctx.globeNationLabels)
		disposeGroup(ctx.scene, ctx.mapNationLabels)
		if (ctx.globeNationScripts) ctx.globeGroup.remove(ctx.globeNationScripts)
		if (ctx.mapNationScripts) ctx.scene.remove(ctx.mapNationScripts)
		disposeGroup(ctx.globeGroup, ctx.globeSettlementLabels)
		disposeGroup(ctx.scene, ctx.mapSettlementLabels)
		ctx.terrainWireframe = null
		ctx.mapWireframe = null
		ctx.globeGrid = null
		ctx.mapGrid = null
		ctx.mapSolarTerminator = null
		ctx.globeNationBorders = null
		ctx.mapNationBorders = null
		ctx.globeNationFill = null
		ctx.mapNationFill = null
		ctx.globeNationFillRadius = null
		ctx.mapNationFillParams = null
		ctx.globeOccupationStripes = null
		ctx.mapOccupationStripes = null
		ctx.nationBorderMaterials = []
		ctx.pulseGlobe = null
		ctx.pulseMap = null
		ctx.pulse = null
		ctx.globeHierarchyOverlay = null
		ctx.mapHierarchyOverlay = null
		ctx.globeSettlements = null
		ctx.mapSettlements = null
		ctx.settlementsDirty = true
		ctx.globeInfrastructure = null
		ctx.mapInfrastructure = null
		ctx.globeNationLabels = null
		ctx.mapNationLabels = null
		ctx.globeNationScripts = null
		ctx.mapNationScripts = null
		ctx.globeSettlementLabels = null
		ctx.mapSettlementLabels = null
		deps.syncAnimationState()

		if (ctx.wireframeVisible && ctx.currentWorld) {
			ctx.terrainWireframe = buildTerrainWireframe(
				ctx.currentWorld,
				ctx.wireframeVisible,
				ctx.currentViewMode,
				ctx.elevationVisible,
			)
			ctx.globeGroup.add(ctx.terrainWireframe)
		}
		if (ctx.wireframeVisible && ctx.currentWorld) {
			ctx.mapWireframe = buildMapWireframe({
				world: ctx.currentWorld,
				centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
				projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
				wireframeVisible: ctx.wireframeVisible,
				viewMode: ctx.currentViewMode,
			})
			addMapSlideClones(ctx.mapWireframe)
			ctx.scene.add(ctx.mapWireframe)
		}
		if (ctx.gridVisible) {
			ctx.globeGrid = buildGlobeGrid(
				ctx.gridSpacingDeg,
				ctx.gridVisible,
				ctx.currentViewMode,
				ctx.elevationVisible,
			)
			ctx.mapGrid = buildMapGrid(
				ctx.gridSpacingDeg,
				ctx.currentMapProjectionLatitudeDeg,
				ctx.gridVisible,
				ctx.currentViewMode,
			)
			ctx.globeGroup.add(ctx.globeGrid)
			addMapSlideClones(ctx.mapGrid)
			ctx.scene.add(ctx.mapGrid)
		}
		deps.rebuildCoastline()
		deps.rebuildThermalEquator()
		deps.rebuildSolarTerminator()
		deps.rebuildWindArrows()
		deps.rebuildRivers()
		deps.applyWaterMaterialForMode(ctx.currentColorMode)
		deps.rebuildNationBorders()
		deps.rebuildSelectedProvinceBorder()
		deps.rebuildHierarchy()
		deps.rebuildSettlementOverlay()
		deps.rebuildEu4SettlementOverlay()
		deps.rebuildTradeRouteOverlay()
		deps.rebuildNationLabels()
		deps.updateOverlayVisibility()
	}

	return { rebuildOverlays }
}
