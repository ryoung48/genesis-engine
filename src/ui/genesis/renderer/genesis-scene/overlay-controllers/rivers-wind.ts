import { disposeGroup, disposeObject3D } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import {
	buildGlobeRivers,
	buildMapRivers,
} from "@/ui/genesis/renderer/overlay-builders/rivers"
import {
	buildGlobeWindArrows,
	buildMapWindArrows,
} from "@/ui/genesis/renderer/overlay-builders/wind-arrows"
import type { RiverData, WindArrowData } from "@/ui/genesis/renderer/types"

export interface RiversWindControllerDeps {
	rebuildOverlays: () => void
}

export function createRiversWindController(
	ctx: GenesisContext,
	deps: RiversWindControllerDeps,
) {
	function disposeWindArrows() {
		disposeObject3D(ctx.globeGroup, ctx.globeWindArrows)
		disposeObject3D(ctx.scene, ctx.mapWindArrows)
		ctx.globeWindArrows = null
		ctx.mapWindArrows = null
	}

	function rebuildWindArrows() {
		disposeWindArrows()
		if (!ctx.windArrowData) return
		ctx.globeWindArrows = buildGlobeWindArrows({
			data: ctx.windArrowData,
			viewMode: ctx.currentViewMode,
			elevationVisible: ctx.elevationVisible,
		})
		ctx.mapWindArrows = buildMapWindArrows({
			data: ctx.windArrowData,
			viewMode: ctx.currentViewMode,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
		})
		if (ctx.globeWindArrows) ctx.globeGroup.add(ctx.globeWindArrows)
		if (ctx.mapWindArrows) {
			addMapSlideClones(ctx.mapWindArrows)
			ctx.scene.add(ctx.mapWindArrows)
		}
	}

	function disposeRivers() {
		disposeGroup(ctx.globeGroup, ctx.globeRivers)
		disposeGroup(ctx.scene, ctx.mapRivers)
		ctx.globeRivers = null
		ctx.mapRivers = null
		ctx.globeRiverMaterials = []
		ctx.mapRiverMaterials = []
		ctx.riverMaterials = []
	}

	function rebuildRivers() {
		disposeRivers()
		if (!ctx.riversVisible || !ctx.riverData) return
		ctx.globeRivers = buildGlobeRivers(
			ctx.riverData,
			ctx.canvas,
			ctx.riverMaterials,
			ctx.globeRiverMaterials,
			ctx.riversVisible,
			ctx.currentViewMode,
			ctx.elevationVisible,
		)
		ctx.mapRivers = buildMapRivers(
			ctx.riverData,
			ctx.canvas,
			ctx.riverMaterials,
			ctx.mapRiverMaterials,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			ctx.riversVisible,
			ctx.currentViewMode,
		)
		ctx.globeGroup.add(ctx.globeRivers)
		addMapSlideClones(ctx.mapRivers)
		ctx.scene.add(ctx.mapRivers)
	}

	function setWindArrows(data: WindArrowData | null) {
		ctx.windArrowData = data
		deps.rebuildOverlays()
	}

	function setRivers(data: RiverData | null) {
		ctx.riverData = data
		deps.rebuildOverlays()
	}

	function setRiversVisible(visible: boolean) {
		if (ctx.riversVisible === visible) return
		ctx.riversVisible = visible
		deps.rebuildOverlays()
	}

	return {
		disposeWindArrows,
		rebuildWindArrows,
		disposeRivers,
		rebuildRivers,
		setWindArrows,
		setRivers,
		setRiversVisible,
	}
}
