import { CAVES } from "@/model/geography/terrain/caves"
import { uiCaveSymbols } from "@/ui/components/tokens"
import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import { DOT_SYMBOLS } from "@/ui/genesis/renderer/overlay-builders/dot-symbols"
import type { DotSymbolData } from "@/ui/genesis/renderer/types"
import { CAVE_DOT_COLORS } from "@/ui/genesis/shared/region-colors/palette"

const COLORS = CAVES.types.map((type) =>
	DOT_SYMBOLS.rgbHex(CAVE_DOT_COLORS[type]),
)

export interface CaveSymbolsControllerDeps {
	rebuildOverlays: () => void
}

export function createCaveSymbolsController(
	ctx: GenesisContext,
	deps: CaveSymbolsControllerDeps,
) {
	function dispose() {
		disposeGroup(ctx.globeGroup, ctx.globeCaveSymbols)
		disposeGroup(ctx.scene, ctx.mapCaveSymbols)
		ctx.globeCaveSymbols = null
		ctx.mapCaveSymbols = null
	}

	function rebuild() {
		dispose()
		if (!ctx.caveSymbolData) return
		ctx.globeCaveSymbols = DOT_SYMBOLS.buildGlobeDots({
			data: ctx.caveSymbolData,
			colors: COLORS,
			radiusRad: uiCaveSymbols.radiusRad,
			globeRadius: ctx.elevationVisible
				? uiCaveSymbols.raisedGlobeRadius
				: uiCaveSymbols.globeRadius,
			viewMode: ctx.currentViewMode,
		})
		ctx.mapCaveSymbols = DOT_SYMBOLS.buildMapDots({
			data: ctx.caveSymbolData,
			colors: COLORS,
			radiusRad: uiCaveSymbols.radiusRad,
			mapDepth: uiCaveSymbols.mapDepth,
			viewMode: ctx.currentViewMode,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
		})
		if (ctx.globeCaveSymbols) ctx.globeGroup.add(ctx.globeCaveSymbols)
		if (ctx.mapCaveSymbols) {
			addMapSlideClones(ctx.mapCaveSymbols)
			ctx.scene.add(ctx.mapCaveSymbols)
		}
	}

	function setCaveSymbols(data: DotSymbolData | null) {
		ctx.caveSymbolData = data
		deps.rebuildOverlays()
	}

	return { rebuild, setCaveSymbols }
}
