import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import {
	buildGlobeRealmBorders,
	buildMapRealmBorders,
} from "@/ui/genesis/renderer/overlay-builders/realm-borders"
import type { RealmBordersSpec } from "@/ui/genesis/renderer/types"

export interface RealmBordersControllerDeps {
	updateOverlayVisibility: () => void
}

export function createRealmBordersController(
	ctx: GenesisContext,
	deps: RealmBordersControllerDeps,
) {
	function rebuild() {
		disposeGroup(ctx.globeGroup, ctx.globeRealmBorders)
		disposeGroup(ctx.scene, ctx.mapRealmBorders)
		ctx.globeRealmBorders = null
		ctx.mapRealmBorders = null
		if (!ctx.realmBordersSpec) return
		ctx.globeRealmBorders = buildGlobeRealmBorders(
			ctx.realmBordersSpec,
			ctx.currentViewMode,
			ctx.canvas,
			ctx.elevationVisible,
		)
		ctx.mapRealmBorders = buildMapRealmBorders(
			ctx.realmBordersSpec,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			ctx.currentViewMode,
			ctx.canvas,
		)
		if (ctx.globeRealmBorders) ctx.globeGroup.add(ctx.globeRealmBorders)
		if (ctx.mapRealmBorders) {
			addMapSlideClones(ctx.mapRealmBorders)
			ctx.scene.add(ctx.mapRealmBorders)
		}
		deps.updateOverlayVisibility()
	}

	function setRealmBorders(spec: RealmBordersSpec | null) {
		ctx.realmBordersSpec = spec
		rebuild()
	}

	return { rebuild, setRealmBorders }
}
