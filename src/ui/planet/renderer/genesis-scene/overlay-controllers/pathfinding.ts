import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { disposeObject3D } from "@/ui/planet/renderer/disposal"
import type { GenesisContext } from "@/ui/planet/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/planet/renderer/map-export"
import {
	buildGlobePathfindingOverlay,
	buildMapPathfindingOverlay,
} from "@/ui/planet/renderer/pathfinding-overlay"

export interface PathfindingControllerDeps {
	requestRender: () => void
}

/** Owns the pathfinding-route overlay (the highlighted region path + start/
 * end dots drawn while the user is using the route tool). See
 * plans/genesis-scene-controller-split.md. */
export function createPathfindingController(
	ctx: GenesisContext,
	deps: PathfindingControllerDeps,
) {
	function setPathfindingOverlay(
		pathRegions: number[] | null,
		startXYZ: [number, number, number] | null,
		endXYZ: [number, number, number] | null,
	) {
		disposeObject3D(ctx.globeGroup, ctx.globePathfindingLine)
		disposeObject3D(ctx.scene, ctx.mapPathfindingLine)
		disposeObject3D(ctx.globeGroup, ctx.globePathfindingDots)
		disposeObject3D(ctx.scene, ctx.mapPathfindingDots)
		ctx.globePathfindingLine = null
		ctx.mapPathfindingLine = null
		ctx.globePathfindingDots = null
		ctx.mapPathfindingDots = null

		if (!startXYZ || !ctx.currentWorld) {
			deps.requestRender()
			return
		}

		const r_xyz = ctx.currentWorld.mesh.r_xyz
		const elevation = ctx.currentWorld.elevation
		const w = ctx.canvas.clientWidth || 1
		const h = ctx.canvas.clientHeight || 1

		const globeOverlay = buildGlobePathfindingOverlay(
			pathRegions,
			startXYZ,
			endXYZ,
			r_xyz,
			elevation,
			ctx.currentViewMode,
			[w, h],
		)
		ctx.globePathfindingLine = globeOverlay.line as LineSegments2 | null
		ctx.globePathfindingDots = globeOverlay.dots
		if (ctx.globePathfindingLine) ctx.globeGroup.add(ctx.globePathfindingLine)
		ctx.globeGroup.add(ctx.globePathfindingDots)

		const mapOverlay = buildMapPathfindingOverlay(
			pathRegions,
			startXYZ,
			endXYZ,
			r_xyz,
			elevation,
			ctx.currentViewMode,
			[w, h],
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
		)
		ctx.mapPathfindingLine = mapOverlay.line as LineSegments2 | null
		ctx.mapPathfindingDots = mapOverlay.dots
		if (ctx.mapPathfindingLine) {
			if (ctx.mapMesh)
				ctx.mapPathfindingLine.position.copy(ctx.mapMesh.position)
			addMapSlideClones(ctx.mapPathfindingLine)
			ctx.scene.add(ctx.mapPathfindingLine)
		}
		if (ctx.mapMesh) ctx.mapPathfindingDots.position.copy(ctx.mapMesh.position)
		addMapSlideClones(ctx.mapPathfindingDots)
		ctx.scene.add(ctx.mapPathfindingDots)
		deps.requestRender()
	}

	return { setPathfindingOverlay }
}
