import { uiWaterSymbols } from "@/ui/components/tokens"
import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import { DOT_SYMBOLS } from "@/ui/genesis/renderer/overlay-builders/dot-symbols"
import type { DotSymbolData } from "@/ui/genesis/renderer/types"
import {
	WATER_DOT_COLORS,
	WATER_DOT_KEYS,
} from "@/ui/genesis/shared/region-colors/palette"

const COLORS = WATER_DOT_KEYS.map((key) =>
	DOT_SYMBOLS.rgbHex(WATER_DOT_COLORS[key]),
)

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
		ctx.globeWaterSymbols = DOT_SYMBOLS.buildGlobeDots({
			data: ctx.waterSymbolData,
			colors: COLORS,
			radiusRad: uiWaterSymbols.radiusRad,
			globeRadius: ctx.elevationVisible
				? uiWaterSymbols.raisedGlobeRadius
				: uiWaterSymbols.globeRadius,
			viewMode: ctx.currentViewMode,
		})
		ctx.mapWaterSymbols = DOT_SYMBOLS.buildMapDots({
			data: ctx.waterSymbolData,
			colors: COLORS,
			radiusRad: uiWaterSymbols.radiusRad,
			mapDepth: uiWaterSymbols.mapDepth,
			viewMode: ctx.currentViewMode,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
		})
		if (ctx.globeWaterSymbols) ctx.globeGroup.add(ctx.globeWaterSymbols)
		if (ctx.mapWaterSymbols) {
			addMapSlideClones(ctx.mapWaterSymbols)
			ctx.scene.add(ctx.mapWaterSymbols)
		}
	}

	function setWaterSymbols(data: DotSymbolData | null) {
		ctx.waterSymbolData = data
		deps.rebuildOverlays()
	}

	return { rebuild, setWaterSymbols }
}
