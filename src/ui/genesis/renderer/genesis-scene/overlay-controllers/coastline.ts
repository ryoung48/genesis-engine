import {
	buildCoastlineGlobeLines,
	buildCoastlineMapLines,
	type CoastlineLineData,
	deriveCoastlineFromWorld,
	loadCoastlineLines,
} from "@/ui/genesis/renderer/coastline-overlay"
import { disposeObject3D } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"

export interface CoastlineControllerDeps {
	requestRender: () => void
	updateOverlayVisibility: () => void
}

/** Owns the coastline overlay -- exact Natural Earth vector data for a real
 * "Load Earth" world, or a coastline derived from the mesh's own land/ocean
 * boundary for a procedurally generated one (see deriveCoastlineFromWorld).
 * Computed lazily (only when toggled on) and cached per world instance. See
 * plans/genesis-scene-controller-split.md. */
export function createCoastlineController(
	ctx: GenesisContext,
	deps: CoastlineControllerDeps,
) {
	function rebuild() {
		disposeObject3D(ctx.globeGroup, ctx.globeCoastlineOverlay)
		disposeObject3D(ctx.scene, ctx.mapCoastlineOverlay)
		ctx.globeCoastlineOverlay = null
		ctx.mapCoastlineOverlay = null
		ctx.coastlineMaterials = []

		if (!ctx.coastlineOverlayVisible) return

		let lineData: CoastlineLineData | null
		if (ctx.currentWorld?.isEarthImport) {
			if (!ctx.cachedCoastlineData) {
				loadCoastlineLines()
					.then((data) => {
						ctx.cachedCoastlineData = data
						rebuild()
						deps.requestRender()
					})
					.catch((err) => {
						console.error("Failed to load coastline overlay:", err)
					})
				return
			}
			lineData = ctx.cachedCoastlineData
		} else if (ctx.currentWorld) {
			if (ctx.derivedCoastlineWorld !== ctx.currentWorld) {
				ctx.derivedCoastlineWorld = ctx.currentWorld
				ctx.derivedCoastlineData = deriveCoastlineFromWorld(ctx.currentWorld)
			}
			lineData = ctx.derivedCoastlineData
		} else {
			lineData = null
		}
		if (!lineData) return

		const w = ctx.canvas.clientWidth
		const h = ctx.canvas.clientHeight

		const globeLines = buildCoastlineGlobeLines(lineData, 1.004, [w, h])
		ctx.globeCoastlineOverlay = globeLines
		ctx.globeGroup.add(globeLines)

		const projection = createMapProjection(
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
		)
		const mapLines = buildCoastlineMapLines(lineData, projection, 0.004, [w, h])
		ctx.mapCoastlineOverlay = mapLines
		addMapSlideClones(mapLines)
		ctx.scene.add(mapLines)

		// addMapSlideClones' clones share mapLines' material instance (Three's
		// default Object3D.clone() behavior for Mesh-derived objects), so
		// updating it here also updates both slide clones.
		ctx.coastlineMaterials = [globeLines.material, mapLines.material]
		deps.updateOverlayVisibility()
	}

	function setVisible(visible: boolean) {
		if (ctx.coastlineOverlayVisible === visible) return
		ctx.coastlineOverlayVisible = visible
		rebuild()
		deps.requestRender()
	}

	return { rebuild, setVisible }
}
