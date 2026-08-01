import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { disposeGroup } from "@/ui/planet/renderer/disposal"
import type { GenesisContext } from "@/ui/planet/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/planet/renderer/map-export"
import {
	buildGlobeHierarchyOverlay,
	buildMapHierarchyOverlay,
} from "@/ui/planet/renderer/overlay-builders/hierarchy"

export interface HierarchyControllerDeps {
	updateOverlayVisibility: () => void
}

/** Owns the settlement-hierarchy overlay (the parent/child lines drawn for
 * a selected nation's settlement tree). See
 * plans/genesis-scene-controller-split.md. */
export function createHierarchyController(
	ctx: GenesisContext,
	deps: HierarchyControllerDeps,
) {
	function rebuild() {
		disposeGroup(ctx.globeGroup, ctx.globeHierarchyOverlay)
		disposeGroup(ctx.scene, ctx.mapHierarchyOverlay)
		ctx.globeHierarchyOverlay = null
		ctx.mapHierarchyOverlay = null
		if (!ctx.hierarchyOverlayWorld || ctx.hierarchyOverlayNationId < 0) return
		ctx.globeHierarchyOverlay = buildGlobeHierarchyOverlay(
			ctx.hierarchyOverlayWorld,
			ctx.hierarchyOverlayNationId,
			ctx.currentViewMode,
			ctx.canvas,
			ctx.elevationVisible,
		)
		ctx.mapHierarchyOverlay = buildMapHierarchyOverlay(
			ctx.hierarchyOverlayWorld,
			ctx.hierarchyOverlayNationId,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			ctx.currentViewMode,
			ctx.canvas,
		)
		if (ctx.globeHierarchyOverlay) ctx.globeGroup.add(ctx.globeHierarchyOverlay)
		if (ctx.mapHierarchyOverlay) {
			addMapSlideClones(ctx.mapHierarchyOverlay)
			ctx.scene.add(ctx.mapHierarchyOverlay)
		}
		deps.updateOverlayVisibility()
	}

	function setHierarchyOverlay(
		world: SerializedGenesisWorld | null,
		selectedNationId: number,
	) {
		ctx.hierarchyOverlayWorld = world
		ctx.hierarchyOverlayNationId = selectedNationId
		rebuild()
	}

	return { rebuild, setHierarchyOverlay }
}
