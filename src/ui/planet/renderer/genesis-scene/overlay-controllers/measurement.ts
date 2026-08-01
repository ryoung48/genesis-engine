import { disposeObject3D } from "@/ui/planet/renderer/disposal"
import type { GenesisContext } from "@/ui/planet/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/planet/renderer/map-export"
import {
	buildGlobeMeasurementOverlay,
	buildMapMeasurementOverlay,
} from "@/ui/planet/renderer/measurement-overlay"

export interface MeasurementControllerDeps {
	requestRender: () => void
}

/** Owns the distance-measurement overlay (the two-point line + endpoint
 * dots drawn while the user is using the ruler tool). See
 * plans/genesis-scene-controller-split.md. */
export function createMeasurementController(
	ctx: GenesisContext,
	deps: MeasurementControllerDeps,
) {
	function setMeasureLine(
		startXYZ: [number, number, number] | null,
		endXYZ: [number, number, number] | null,
	) {
		disposeObject3D(ctx.globeGroup, ctx.globeMeasureLine)
		disposeObject3D(ctx.scene, ctx.mapMeasureLine)
		disposeObject3D(ctx.globeGroup, ctx.globeMeasureDots)
		disposeObject3D(ctx.scene, ctx.mapMeasureDots)
		ctx.globeMeasureLine = null
		ctx.mapMeasureLine = null
		ctx.globeMeasureDots = null
		ctx.mapMeasureDots = null

		if (!startXYZ) {
			deps.requestRender()
			return
		}

		const w = ctx.canvas.clientWidth || 1
		const h = ctx.canvas.clientHeight || 1
		const globeOverlay = buildGlobeMeasurementOverlay(
			startXYZ,
			endXYZ,
			ctx.currentViewMode,
			[w, h],
		)
		ctx.globeMeasureLine = globeOverlay.line
		ctx.globeMeasureDots = globeOverlay.dots
		if (ctx.globeMeasureLine) ctx.globeGroup.add(ctx.globeMeasureLine)
		ctx.globeGroup.add(ctx.globeMeasureDots)

		const mapOverlay = buildMapMeasurementOverlay(
			startXYZ,
			endXYZ,
			ctx.currentViewMode,
			[w, h],
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
		)
		ctx.mapMeasureLine = mapOverlay.line
		ctx.mapMeasureDots = mapOverlay.dots
		if (ctx.mapMeasureLine) {
			if (ctx.mapMesh) ctx.mapMeasureLine.position.copy(ctx.mapMesh.position)
			addMapSlideClones(ctx.mapMeasureLine)
			ctx.scene.add(ctx.mapMeasureLine)
		}
		if (ctx.mapMesh) ctx.mapMeasureDots.position.copy(ctx.mapMesh.position)
		addMapSlideClones(ctx.mapMeasureDots)
		ctx.scene.add(ctx.mapMeasureDots)
		deps.requestRender()
	}

	return { setMeasureLine }
}
