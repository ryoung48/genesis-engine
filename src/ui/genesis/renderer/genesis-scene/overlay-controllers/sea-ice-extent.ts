import * as THREE from "three"
import { PASTA } from "@/model/climate/classification/pasta"
import {
	buildCoastlineGlobeLines,
	buildCoastlineMapLines,
} from "@/ui/genesis/renderer/coastline-overlay"
import { disposeObject3D } from "@/ui/genesis/renderer/disposal"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import type { SeaIceExtentControllerParams } from "@/ui/genesis/renderer/types"

export function createSeaIceExtentController({
	ctx,
	requestRender,
	updateOverlayVisibility,
}: SeaIceExtentControllerParams) {
	function rebuild() {
		disposeObject3D(ctx.globeGroup, ctx.globeSeaIceExtent)
		disposeObject3D(ctx.scene, ctx.mapSeaIceExtent)
		ctx.globeSeaIceExtent = null
		ctx.mapSeaIceExtent = null
		ctx.seaIceExtentMaterials = []
		const world = ctx.currentWorld
		if (!ctx.seaIceExtentVisible || !world) return
		const { mesh, isLand } = world
		const globe = new THREE.Group()
		const map = new THREE.Group()
		const projection = createMapProjection(
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
		)
		const resolution: [number, number] = [
			ctx.canvas.clientWidth,
			ctx.canvas.clientHeight,
		]
		const permanentIce = PASTA.pastaLabels.indexOf("Ofi")
		const seasonalIce = [
			PASTA.pastaLabels.indexOf("Ofd"),
			PASTA.pastaLabels.indexOf("Ofg"),
		]
		for (const [classes, color] of [
			[[permanentIce, ...seasonalIce], 0x1687ff],
			[[permanentIce], 0xff3344],
		] as const) {
			const rings: number[][] = []
			for (let side = 0; side < mesh.numSides; side++) {
				const opposite = mesh.halfedges[side]
				if (opposite < 0 || side > opposite) continue
				const a = mesh.s_begin_r[side],
					b = mesh.s_begin_r[opposite]
				if (
					isLand[a] ||
					isLand[b] ||
					classes.includes(world.pastaClimate[a]) ===
						classes.includes(world.pastaClimate[b])
				)
					continue
				const t0 = mesh.s_inner_t[side],
					t1 = mesh.s_outer_t[side]
				if (t0 < 0 || t1 < 0) continue
				const ring: number[] = []
				for (const t of [t0, t1]) {
					const x = mesh.t_xyz[3 * t],
						y = mesh.t_xyz[3 * t + 1],
						z = mesh.t_xyz[3 * t + 2]
					ring.push(
						(Math.atan2(y, x) * 180) / Math.PI,
						(Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
					)
				}
				rings.push(ring)
			}
			const data = { rings }
			const globeLine = buildCoastlineGlobeLines(data, 1.004, resolution)
			const mapLine = buildCoastlineMapLines(
				data,
				projection,
				0.004,
				resolution,
			)
			for (const line of [globeLine, mapLine]) {
				ctx.seaIceExtentMaterials.push(line.material)
				line.material.color.setHex(color)
				line.material.dashed = true
				line.material.dashSize = 0.008
				line.material.gapSize = 0.008
				line.material.needsUpdate = true
			}
			globe.add(globeLine)
			map.add(mapLine)
		}
		ctx.globeSeaIceExtent = globe
		ctx.mapSeaIceExtent = map
		ctx.globeGroup.add(globe)
		addMapSlideClones(map)
		ctx.scene.add(map)
		updateOverlayVisibility()
	}
	function setVisible(visible: boolean) {
		if (ctx.seaIceExtentVisible === visible) return
		ctx.seaIceExtentVisible = visible
		rebuild()
		requestRender()
	}
	return { rebuild, setVisible }
}
