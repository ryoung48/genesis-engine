import { disposeGroup, disposeObject3D } from "@/ui/planet/renderer/disposal"
import type { GenesisContext } from "@/ui/planet/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/planet/renderer/map-export"
import {
	buildGlobeRivers,
	buildMapRivers,
} from "@/ui/planet/renderer/overlay-builders/rivers"
import {
	buildGlobeThermalEquator,
	buildMapThermalEquator,
} from "@/ui/planet/renderer/overlay-builders/thermal-equator"
import {
	buildGlobeWindArrows,
	buildMapWindArrows,
} from "@/ui/planet/renderer/overlay-builders/wind-arrows"
import type { RiverData, WindArrowData } from "@/ui/planet/renderer/types"

/** Owns three independent line overlays that all happen to be built inside
 * the same section of the original monolithic rebuildOverlays(): the
 * thermal equator, the wind-arrow field, and the river network. Kept as
 * one controller/file (matching the plan's "rivers-wind-thermal.ts") since
 * they share no state but were grouped there. Each has its own dispose +
 * rebuild so callers (rebuildOverlays' replacement wiring) can call them
 * independently, preserving the original build order: thermal equator,
 * then solar-terminator (owned elsewhere), then wind arrows, then rivers.
 * See plans/genesis-scene-controller-split.md. */
export interface RiversWindThermalControllerDeps {
	/** All four setters below rebuild every overlay, not just their own
	 * (matches the original create-genesis-scene.ts behavior -- each setter
	 * called the monolithic rebuildOverlays(), not a scoped rebuild). */
	rebuildOverlays: () => void
}

export function createRiversWindThermalController(
	ctx: GenesisContext,
	deps: RiversWindThermalControllerDeps,
) {
	function disposeThermalEquator() {
		disposeObject3D(ctx.globeGroup, ctx.globeThermalEquator)
		disposeObject3D(ctx.scene, ctx.mapThermalEquator)
		ctx.globeThermalEquator = null
		ctx.mapThermalEquator = null
	}

	function rebuildThermalEquator() {
		disposeThermalEquator()
		if (!ctx.thermalEquatorPoints) return
		ctx.globeThermalEquator = buildGlobeThermalEquator(
			ctx.thermalEquatorPoints,
			ctx.currentViewMode,
			ctx.elevationVisible,
		)
		ctx.mapThermalEquator = buildMapThermalEquator(
			ctx.thermalEquatorPoints,
			ctx.currentMapProjectionLatitudeDeg,
			ctx.currentViewMode,
		)
		ctx.globeGroup.add(ctx.globeThermalEquator)
		addMapSlideClones(ctx.mapThermalEquator)
		ctx.scene.add(ctx.mapThermalEquator)
	}

	function disposeWindArrows() {
		disposeObject3D(ctx.globeGroup, ctx.globeWindArrows)
		disposeObject3D(ctx.scene, ctx.mapWindArrows)
		ctx.globeWindArrows = null
		ctx.mapWindArrows = null
	}

	function rebuildWindArrows() {
		disposeWindArrows()
		if (!ctx.windArrowData) return
		ctx.globeWindArrows = buildGlobeWindArrows(
			ctx.windArrowData,
			ctx.currentViewMode,
			ctx.elevationVisible,
		)
		ctx.mapWindArrows = buildMapWindArrows(
			ctx.windArrowData,
			ctx.currentViewMode,
		)
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

	function setThermalEquator(points: [number, number][] | null) {
		ctx.thermalEquatorPoints = points
		deps.rebuildOverlays()
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
		disposeThermalEquator,
		rebuildThermalEquator,
		disposeWindArrows,
		rebuildWindArrows,
		disposeRivers,
		rebuildRivers,
		setThermalEquator,
		setWindArrows,
		setRivers,
		setRiversVisible,
	}
}
