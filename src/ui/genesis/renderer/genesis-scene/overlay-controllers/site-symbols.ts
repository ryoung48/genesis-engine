import { CAVES } from "@/model/geography/terrain/caves"
import { uiSiteSymbols } from "@/ui/components/tokens"
import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import { DOT_SYMBOLS } from "@/ui/genesis/renderer/overlay-builders/dot-symbols"
import type { DotSymbolData } from "@/ui/genesis/renderer/types"
import { CAVE_DOT_COLORS } from "@/ui/genesis/shared/region-colors/palette"

const COLORS = [
	...CAVES.types.map((type) => DOT_SYMBOLS.rgbHex(CAVE_DOT_COLORS[type])),
]

export interface SiteSymbolsControllerDeps {
	rebuildOverlays: () => void
}

export function createSiteSymbolsController(
	ctx: GenesisContext,
	deps: SiteSymbolsControllerDeps,
) {
	function dispose() {
		disposeGroup(ctx.globeGroup, ctx.globeSiteSymbols)
		disposeGroup(ctx.scene, ctx.mapSiteSymbols)
		ctx.globeSiteSymbols = null
		ctx.mapSiteSymbols = null
	}

	function rebuild() {
		dispose()
		if (!ctx.siteSymbolData) return
		ctx.globeSiteSymbols = DOT_SYMBOLS.buildGlobeDots({
			data: ctx.siteSymbolData,
			colors: COLORS,
			radiusRad: uiSiteSymbols.radiusRad,
			globeRadius: ctx.elevationVisible
				? uiSiteSymbols.raisedGlobeRadius
				: uiSiteSymbols.globeRadius,
			viewMode: ctx.currentViewMode,
		})
		ctx.mapSiteSymbols = DOT_SYMBOLS.buildMapDots({
			data: ctx.siteSymbolData,
			colors: COLORS,
			radiusRad: uiSiteSymbols.radiusRad,
			mapDepth: uiSiteSymbols.mapDepth,
			viewMode: ctx.currentViewMode,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
		})
		if (ctx.globeSiteSymbols) ctx.globeGroup.add(ctx.globeSiteSymbols)
		if (ctx.mapSiteSymbols) {
			addMapSlideClones(ctx.mapSiteSymbols)
			ctx.scene.add(ctx.mapSiteSymbols)
		}
	}

	function setSiteSymbols(data: DotSymbolData | null) {
		ctx.siteSymbolData = data
		deps.rebuildOverlays()
	}

	return { rebuild, setSiteSymbols }
}
