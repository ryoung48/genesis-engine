import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import {
	buildGlobeHierarchyOverlay,
	buildMapHierarchyOverlay,
} from "@/ui/genesis/renderer/overlay-builders/hierarchy"
import type { HierarchyOverlaySpec } from "@/ui/genesis/renderer/types"

export interface HierarchyControllerDeps {
	updateOverlayVisibility: () => void
}

export function createHierarchyController(
	ctx: GenesisContext,
	deps: HierarchyControllerDeps,
) {
	function rebuild() {
		disposeGroup(ctx.globeGroup, ctx.globeHierarchyOverlay)
		disposeGroup(ctx.scene, ctx.mapHierarchyOverlay)
		ctx.globeHierarchyOverlay = null
		ctx.mapHierarchyOverlay = null
		if (!ctx.hierarchyOverlaySpec) return
		ctx.globeHierarchyOverlay = buildGlobeHierarchyOverlay(
			ctx.hierarchyOverlaySpec,
			ctx.currentViewMode,
			ctx.canvas,
			ctx.elevationVisible,
		)
		ctx.mapHierarchyOverlay = buildMapHierarchyOverlay(
			ctx.hierarchyOverlaySpec,
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

	function setHierarchyOverlay(spec: HierarchyOverlaySpec | null) {
		ctx.hierarchyOverlaySpec = spec
		rebuild()
	}

	return { rebuild, setHierarchyOverlay }
}
