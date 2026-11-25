import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import {
	buildGlobeWaterSymbols,
	buildMapWaterSymbols,
} from "@/ui/genesis/renderer/overlay-builders/water-symbols"
import type { WaterSymbolData } from "@/ui/genesis/renderer/types"

export interface WaterSymbolsControllerDeps {
	rebuildOverlays: () => void
}

export function createWaterSymbolsController(
	ctx: GenesisContext,
	deps: WaterSymbolsControllerDeps,
) {
	function dispose() {
		disposeGroup(ctx.globeGroup, ctx.globeWaterSymbols)
		disposeGroup(ctx.scene, ctx.mapWaterSymbols)
		ctx.globeWaterSymbols = null
		ctx.mapWaterSymbols = null
	}

	function rebuild() {
		dispose()
		if (!ctx.waterSymbolData) return
		ctx.globeWaterSymbols = buildGlobeWaterSymbols({
			data: ctx.waterSymbolData,
			viewMode: ctx.currentViewMode,
			elevationVisible: ctx.elevationVisible,
		})
		ctx.mapWaterSymbols = buildMapWaterSymbols({
			data: ctx.waterSymbolData,
			viewMode: ctx.currentViewMode,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
		})
		if (ctx.globeWaterSymbols) ctx.globeGroup.add(ctx.globeWaterSymbols)
		if (ctx.mapWaterSymbols) {
			addMapSlideClones(ctx.mapWaterSymbols)
			ctx.scene.add(ctx.mapWaterSymbols)
		}
	}

	function setWaterSymbols(data: WaterSymbolData | null) {
		ctx.waterSymbolData = data
		deps.rebuildOverlays()
	}

	return { rebuild, setWaterSymbols }
}
