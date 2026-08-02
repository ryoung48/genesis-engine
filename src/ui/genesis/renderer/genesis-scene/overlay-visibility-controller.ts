import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"

export interface OverlayVisibilityControllerDeps {
	requestRender: () => void
}

/** Toggles `.visible` on every overlay object in `ctx` based on the current
 * view mode (globe/map) and each overlay's own feature flag, and copies
 * `mapMesh.position` onto every map-side object (they're built once at the
 * origin, then repositioned each rebuild to track the map mesh's own
 * slide-around-the-seam position). Pure ctx reads -- called after almost
 * every overlay rebuild and view-mode change. See
 * plans/genesis-scene-controller-split.md. */
export function createOverlayVisibilityController(
	ctx: GenesisContext,
	deps: OverlayVisibilityControllerDeps,
) {
	function updateOverlayVisibility() {
		const showMap = ctx.currentViewMode === "map" && !ctx.solarSystemActive
		if (ctx.globeCoastlineOverlay)
			ctx.globeCoastlineOverlay.visible =
				ctx.coastlineOverlayVisible && ctx.currentViewMode === "globe"
		if (ctx.mapCoastlineOverlay) {
			ctx.mapCoastlineOverlay.visible = ctx.coastlineOverlayVisible && showMap
			if (ctx.mapMesh)
				ctx.mapCoastlineOverlay.position.copy(ctx.mapMesh.position)
		}
		if (ctx.terrainWireframe)
			ctx.terrainWireframe.visible =
				ctx.wireframeVisible && ctx.currentViewMode === "globe"
		if (ctx.mapWireframe) {
			ctx.mapWireframe.visible = ctx.wireframeVisible && showMap
			if (ctx.mapMesh) ctx.mapWireframe.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeNationFill)
			ctx.globeNationFill.visible = ctx.currentViewMode === "globe"
		if (ctx.mapNationFill) {
			ctx.mapNationFill.visible = showMap
			if (ctx.mapMesh) ctx.mapNationFill.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeOccupationStripes)
			ctx.globeOccupationStripes.visible = ctx.currentViewMode === "globe"
		if (ctx.mapOccupationStripes) {
			ctx.mapOccupationStripes.visible = showMap
			if (ctx.mapMesh)
				ctx.mapOccupationStripes.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeLandNationBorders)
			ctx.globeLandNationBorders.visible =
				ctx.currentViewMode === "globe" && ctx.landNationBordersVisible
		if (ctx.mapLandNationBorders) {
			ctx.mapLandNationBorders.visible = showMap && ctx.landNationBordersVisible
			if (ctx.mapMesh)
				ctx.mapLandNationBorders.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeNationBorders)
			ctx.globeNationBorders.visible =
				ctx.currentViewMode === "globe" && ctx.nationBordersVisible
		if (ctx.mapNationBorders) {
			ctx.mapNationBorders.visible = showMap && ctx.nationBordersVisible
			if (ctx.mapMesh) ctx.mapNationBorders.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeOrgLabel)
			ctx.globeOrgLabel.visible = ctx.currentViewMode === "globe"
		if (ctx.mapOrgLabel) {
			ctx.mapOrgLabel.visible = showMap
			if (ctx.mapMesh) ctx.mapOrgLabel.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeSelectedProvinceBorder)
			ctx.globeSelectedProvinceBorder.visible = ctx.currentViewMode === "globe"
		if (ctx.mapSelectedProvinceBorder) {
			ctx.mapSelectedProvinceBorder.visible = showMap
			if (ctx.mapMesh)
				ctx.mapSelectedProvinceBorder.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeGrid)
			ctx.globeGrid.visible = ctx.gridVisible && ctx.currentViewMode === "globe"
		if (ctx.mapGrid) {
			ctx.mapGrid.visible = ctx.gridVisible && showMap
			if (ctx.mapMesh) ctx.mapGrid.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeThermalEquator)
			ctx.globeThermalEquator.visible = ctx.currentViewMode === "globe"
		if (ctx.mapThermalEquator) {
			ctx.mapThermalEquator.visible = showMap
			if (ctx.mapMesh) ctx.mapThermalEquator.position.copy(ctx.mapMesh.position)
		}
		if (ctx.mapSolarTerminator) {
			ctx.mapSolarTerminator.visible = ctx.solarTerminatorVisible && showMap
			if (ctx.mapMesh)
				ctx.mapSolarTerminator.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeWindArrows)
			ctx.globeWindArrows.visible = ctx.currentViewMode === "globe"
		if (ctx.mapWindArrows) {
			ctx.mapWindArrows.visible = showMap
			if (ctx.mapMesh) ctx.mapWindArrows.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeRivers)
			ctx.globeRivers.visible =
				ctx.riversVisible && ctx.currentViewMode === "globe"
		if (ctx.mapRivers) {
			ctx.mapRivers.visible = ctx.riversVisible && showMap
			if (ctx.mapMesh) ctx.mapRivers.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeMeasureLine)
			ctx.globeMeasureLine.visible = ctx.currentViewMode === "globe"
		if (ctx.mapMeasureLine) {
			ctx.mapMeasureLine.visible = showMap
			if (ctx.mapMesh) ctx.mapMeasureLine.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeMeasureDots)
			ctx.globeMeasureDots.visible = ctx.currentViewMode === "globe"
		if (ctx.mapMeasureDots) {
			ctx.mapMeasureDots.visible = showMap
			if (ctx.mapMesh) ctx.mapMeasureDots.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeHierarchyOverlay)
			ctx.globeHierarchyOverlay.visible = ctx.currentViewMode === "globe"
		if (ctx.mapHierarchyOverlay) {
			ctx.mapHierarchyOverlay.visible = showMap
			if (ctx.mapMesh)
				ctx.mapHierarchyOverlay.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeSettlements)
			ctx.globeSettlements.visible =
				ctx.settlementsVisible && ctx.currentViewMode === "globe"
		if (ctx.mapSettlements) {
			ctx.mapSettlements.visible = ctx.settlementsVisible && showMap
			if (ctx.mapMesh) ctx.mapSettlements.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeEu4Settlements)
			ctx.globeEu4Settlements.visible =
				ctx.eu4SettlementsVisible && ctx.currentViewMode === "globe"
		if (ctx.mapEu4Settlements) {
			ctx.mapEu4Settlements.visible = ctx.eu4SettlementsVisible && showMap
			if (ctx.mapMesh) ctx.mapEu4Settlements.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeInfrastructure)
			ctx.globeInfrastructure.visible =
				ctx.infrastructureVisible && ctx.currentViewMode === "globe"
		if (ctx.mapInfrastructure) {
			ctx.mapInfrastructure.visible = ctx.infrastructureVisible && showMap
			if (ctx.mapMesh) ctx.mapInfrastructure.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeNationLabels)
			ctx.globeNationLabels.visible =
				(ctx.labelMode.nations || ctx.labelMode.dynasty) &&
				ctx.currentViewMode === "globe"
		if (ctx.globeNationScripts)
			ctx.globeNationScripts.visible =
				ctx.labelMode.script &&
				(ctx.labelMode.nations || ctx.labelMode.dynasty) &&
				ctx.currentViewMode === "globe"
		if (ctx.mapNationLabels) {
			ctx.mapNationLabels.visible =
				(ctx.labelMode.nations || ctx.labelMode.dynasty) && showMap
			if (ctx.mapMesh) ctx.mapNationLabels.position.copy(ctx.mapMesh.position)
		}
		if (ctx.mapNationScripts) {
			ctx.mapNationScripts.visible =
				ctx.labelMode.script &&
				(ctx.labelMode.nations || ctx.labelMode.dynasty) &&
				showMap
			if (ctx.mapMesh) ctx.mapNationScripts.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeSettlementLabels)
			ctx.globeSettlementLabels.visible =
				ctx.labelMode.settlements && ctx.currentViewMode === "globe"
		if (ctx.mapSettlementLabels) {
			ctx.mapSettlementLabels.visible = ctx.labelMode.settlements && showMap
			if (ctx.mapMesh)
				ctx.mapSettlementLabels.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeCultureLabels)
			ctx.globeCultureLabels.visible =
				ctx.labelMode.culture && ctx.currentViewMode === "globe"
		if (ctx.mapCultureLabels) {
			ctx.mapCultureLabels.visible = ctx.labelMode.culture && showMap
			if (ctx.mapMesh) ctx.mapCultureLabels.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeHeritageLabels)
			ctx.globeHeritageLabels.visible =
				ctx.labelMode.heritage && ctx.currentViewMode === "globe"
		if (ctx.mapHeritageLabels) {
			ctx.mapHeritageLabels.visible = ctx.labelMode.heritage && showMap
			if (ctx.mapMesh) ctx.mapHeritageLabels.position.copy(ctx.mapMesh.position)
		}
		if (ctx.globeReligionLabels)
			ctx.globeReligionLabels.visible =
				ctx.labelMode.religion && ctx.currentViewMode === "globe"
		if (ctx.mapReligionLabels) {
			ctx.mapReligionLabels.visible = ctx.labelMode.religion && showMap
			if (ctx.mapMesh) ctx.mapReligionLabels.position.copy(ctx.mapMesh.position)
		}
		deps.requestRender()
	}

	return { updateOverlayVisibility }
}
