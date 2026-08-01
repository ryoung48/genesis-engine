import type * as THREE from "three"
import { disposeGroup, disposeObject3D } from "@/ui/planet/renderer/disposal"
import type { GenesisContext } from "@/ui/planet/renderer/genesis-scene/context"
import {
	createNationLabelPools,
	disposePool,
} from "@/ui/planet/renderer/nation-label-overlay/pool"
import { disposeScriptTextureCache } from "@/ui/planet/renderer/nation-script-overlay"

export interface DisposeControllerDeps {
	/** Removes the canvas/controls event listeners interaction-controller.ts
	 * wired up. */
	removeEventListeners: () => void
	disposeAnimationLoop: () => void
	disposeLabelPools: () => void
	/** The org-name label overlay's group refs + pools -- still owned
	 * directly by create-genesis-scene.ts (see labels.ts's doc comment on
	 * why: it's a permanently-null-const, pre-existing dead code left
	 * as-is). */
	globeOrgLabel: THREE.Group | null
	mapOrgLabel: THREE.Group | null
	orgLabelPools: ReturnType<typeof createNationLabelPools>
}

/** Aggregates every controller's own disposal into the single `dispose()`
 * GenesisScene exposes -- tears down event listeners, the render loop,
 * every overlay's THREE objects/materials/pools, and the base scene
 * objects (water/atmosphere/starfield geometries+materials) scene-setup.ts
 * constructed. See plans/genesis-scene-controller-split.md. */
export function createDisposeController(
	ctx: GenesisContext,
	deps: DisposeControllerDeps,
) {
	function dispose() {
		deps.disposeAnimationLoop()
		deps.removeEventListeners()
		ctx.solarSystemOverlayState?.dispose()
		ctx.controls.dispose()
		ctx.mapControls.dispose()
		ctx.renderer.dispose()
		disposeObject3D(ctx.globeGroup, ctx.terrainMesh)
		disposeObject3D(ctx.scene, ctx.mapMesh)
		disposeObject3D(ctx.globeGroup, ctx.terrainWireframe)
		disposeObject3D(ctx.scene, ctx.mapWireframe)
		disposeObject3D(ctx.globeGroup, ctx.globeGrid)
		disposeObject3D(ctx.globeGroup, ctx.globeCloudMesh)
		disposeObject3D(ctx.scene, ctx.mapGrid)
		disposeObject3D(ctx.globeGroup, ctx.globeThermalEquator)
		disposeObject3D(ctx.scene, ctx.mapThermalEquator)
		disposeGroup(ctx.globeGroup, ctx.globeSolarTerminator)
		disposeGroup(ctx.scene, ctx.mapSolarTerminator)
		disposeObject3D(ctx.globeGroup, ctx.globeNationBorders)
		disposeObject3D(ctx.scene, ctx.mapNationBorders)
		disposeObject3D(ctx.globeGroup, ctx.globeLandNationBorders)
		disposeObject3D(ctx.scene, ctx.mapLandNationBorders)
		disposeObject3D(ctx.globeGroup, ctx.globeNationFill)
		disposeObject3D(ctx.scene, ctx.mapNationFill)
		disposeObject3D(ctx.globeGroup, ctx.globeOccupationStripes)
		disposeObject3D(ctx.scene, ctx.mapOccupationStripes)
		disposeObject3D(ctx.globeGroup, ctx.pulseGlobe)
		disposeObject3D(ctx.scene, ctx.pulseMap)
		disposeObject3D(ctx.globeGroup, ctx.globeCoastlineOverlay)
		disposeObject3D(ctx.scene, ctx.mapCoastlineOverlay)
		disposeGroup(ctx.globeGroup, ctx.globeRivers)
		disposeGroup(ctx.scene, ctx.mapRivers)
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
		disposeGroup(ctx.globeGroup, deps.globeOrgLabel)
		disposeGroup(ctx.scene, deps.mapOrgLabel)
		disposePool(deps.orgLabelPools.globe)
		disposePool(deps.orgLabelPools.map)
		if (ctx.globeNationScripts) ctx.globeGroup.remove(ctx.globeNationScripts)
		if (ctx.mapNationScripts) ctx.scene.remove(ctx.mapNationScripts)
		ctx.pendingNationScriptTextureQueue = null
		disposeScriptTextureCache(ctx.nationScriptTextureCache)
		disposeGroup(ctx.globeGroup, ctx.globeSettlementLabels)
		disposeGroup(ctx.scene, ctx.mapSettlementLabels)
		deps.disposeLabelPools()
		ctx.waterGeo.dispose()
		ctx.waterMat.dispose()
		ctx.atmosGeo.dispose()
		ctx.atmosMat.dispose()
		ctx.starGeo.dispose()
		ctx.starMat.dispose()
	}

	return { dispose }
}
