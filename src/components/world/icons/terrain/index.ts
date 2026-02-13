import * as turf from "@turf/turf"

import { MAP_SHAPES } from "../../shapes"
import { ICON } from ".."
import { IconDef } from "../types"
import { desert__icons } from "./desert"
import { element__icons } from "./elements"
import { grass__icons } from "./grass"
import { mountain__icons } from "./mountains"
import { tree__icons } from "./trees"
import { DrawTerrainIconParams, TerrainIcon } from "./types"

const terrain: Record<TerrainIcon, IconDef> = {
	...desert__icons,
	...grass__icons,
	...mountain__icons,
	...tree__icons,
	...element__icons,
}

export const DRAW_TERRAIN = {
	icons: ({ ctx, cachedImages, projection }: DrawTerrainIconParams) => {
		const scale = MAP_SHAPES.scale.derived(projection)
		const pathGen = MAP_SHAPES.path.linear(projection)
		const sortedIcons = window.world.display.icons
			.filter(() => {
				const valid = scale <= 20
				return valid
			})
			.sort((a, b) => {
				if (a.y === b.y) {
					return a.x - b.x
				}
				return b.y - a.y
			})
		ctx.save()
		sortedIcons.forEach((i) => {
			const img = cachedImages[i.type]
			const icon = DRAW_TERRAIN.definitions[i.type]
			const geojson = turf.point([i.x, i.y])
			const center = pathGen.centroid(geojson)
			ICON.draw({
				ctx,
				img,
				icon,
				sw: scale,
				sh: scale,
				point: {
					x: center[0],
					y: center[1],
				},
			})
		})
		ctx.restore()
	},
	definitions: terrain,
}
