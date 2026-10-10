import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import {
	buildGlobeRealSettlements,
	buildGlobeSettlements,
	buildMapRealSettlements,
	buildMapSettlements,
} from "@/ui/genesis/renderer/settlement-overlay"
import type { SetSettlementsParams } from "@/ui/genesis/renderer/types"

export interface SettlementsControllerDeps {
	updateOverlayVisibility: () => void
}

export function createSettlementsController(
	ctx: GenesisContext,
	deps: SettlementsControllerDeps,
) {
	let routeEndpoints: ReadonlySet<number> = new Set()
	let capitalProvinces: ReadonlySet<number> = new Set()
	function rebuildSettlementOverlay() {
		disposeGroup(ctx.globeGroup, ctx.globeSettlements)
		disposeGroup(ctx.scene, ctx.mapSettlements)
		ctx.globeSettlements = null
		ctx.mapSettlements = null
		if (
			!ctx.currentWorld?.provinces ||
			!ctx.settlementLocations ||
			!ctx.settlementUrbanPop ||
			!ctx.settlementsVisible
		) {
			return
		}
		ctx.globeSettlements = buildGlobeSettlements({
			world: ctx.currentWorld,
			locations: ctx.settlementLocations,
			urbanPop: ctx.settlementUrbanPop,
			elevationVisible: ctx.elevationVisible,
			routeEndpoints,
			capitalProvinces,
		})
		ctx.mapSettlements = buildMapSettlements({
			world: ctx.currentWorld,
			locations: ctx.settlementLocations,
			urbanPop: ctx.settlementUrbanPop,
			routeEndpoints,
			capitalProvinces,
			centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
		})
		if (ctx.globeSettlements) ctx.globeGroup.add(ctx.globeSettlements)
		if (ctx.mapSettlements) {
			if (ctx.mapMesh) ctx.mapSettlements.position.copy(ctx.mapMesh.position)
			ctx.scene.add(ctx.mapSettlements)
		}
		deps.updateOverlayVisibility()
	}

	function rebuildEu4SettlementOverlay() {
		disposeGroup(ctx.globeGroup, ctx.globeEu4Settlements)
		disposeGroup(ctx.scene, ctx.mapEu4Settlements)
		ctx.globeEu4Settlements = null
		ctx.mapEu4Settlements = null
		if (
			!ctx.eu4SettlementLats ||
			!ctx.eu4SettlementLons ||
			!ctx.eu4SettlementPopulation ||
			!ctx.eu4SettlementProvinceIds ||
			ctx.eu4SettlementIndices.length === 0 ||
			!ctx.eu4SettlementsVisible
		) {
			return
		}
		ctx.globeEu4Settlements = buildGlobeRealSettlements({
			lats: ctx.eu4SettlementLats,
			lons: ctx.eu4SettlementLons,
			populations: ctx.eu4SettlementPopulation,
			provinceIds: ctx.eu4SettlementProvinceIds,
			capitalProvinceIds: ctx.eu4CapitalProvinceIds,
			indices: ctx.eu4SettlementIndices,
		})
		ctx.mapEu4Settlements = buildMapRealSettlements({
			lats: ctx.eu4SettlementLats,
			lons: ctx.eu4SettlementLons,
			populations: ctx.eu4SettlementPopulation,
			provinceIds: ctx.eu4SettlementProvinceIds,
			capitalProvinceIds: ctx.eu4CapitalProvinceIds,
			indices: ctx.eu4SettlementIndices,
			centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
		})
		if (ctx.globeEu4Settlements) ctx.globeGroup.add(ctx.globeEu4Settlements)
		if (ctx.mapEu4Settlements) {
			if (ctx.mapMesh) ctx.mapEu4Settlements.position.copy(ctx.mapMesh.position)
			ctx.scene.add(ctx.mapEu4Settlements)
		}
		deps.updateOverlayVisibility()
	}

	function setSettlements(params: SetSettlementsParams) {
		const { urbanPop } = params
		routeEndpoints = params.routeEndpoints
		capitalProvinces = params.capitalProvinces
		if (
			!urbanPop ||
			!ctx.currentWorld?.provinces ||
			!ctx.currentWorld.settlementRegions
		) {
			ctx.settlementUrbanPop = null
			ctx.settlementLocations = null
			rebuildSettlementOverlay()
			return
		}
		ctx.settlementLocations = ctx.currentWorld.settlementRegions
		ctx.settlementUrbanPop = urbanPop
		ctx.settlementsDirty = false
		rebuildSettlementOverlay()
	}

	function setSettlementsVisible(visible: boolean) {
		if (ctx.settlementsVisible === visible) return
		ctx.settlementsVisible = visible
		if (
			visible &&
			ctx.settlementsDirty &&
			ctx.settlementUrbanPop &&
			ctx.currentWorld?.provinces &&
			ctx.currentWorld.settlementRegions
		) {
			ctx.settlementLocations = ctx.currentWorld.settlementRegions
			ctx.settlementsDirty = false
		}
		rebuildSettlementOverlay()
	}

	function setEu4Settlements(
		lats: Float32Array | null,
		lons: Float32Array | null,
		population: Float32Array | null,
		provinceIds: Int32Array | null,
		capitalProvinceIds: ReadonlySet<number>,
		indices: number[],
	) {
		ctx.eu4SettlementLats = lats
		ctx.eu4SettlementLons = lons
		ctx.eu4SettlementPopulation = population
		ctx.eu4SettlementProvinceIds = provinceIds
		ctx.eu4CapitalProvinceIds = capitalProvinceIds
		ctx.eu4SettlementIndices = indices
		rebuildEu4SettlementOverlay()
	}

	function setEu4SettlementsVisible(visible: boolean) {
		if (ctx.eu4SettlementsVisible === visible) return
		ctx.eu4SettlementsVisible = visible
		rebuildEu4SettlementOverlay()
	}

	return {
		rebuildSettlementOverlay,
		rebuildEu4SettlementOverlay,
		setSettlements,
		setSettlementsVisible,
		setEu4Settlements,
		setEu4SettlementsVisible,
	}
}
