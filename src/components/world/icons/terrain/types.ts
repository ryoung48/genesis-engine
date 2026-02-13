/* eslint-disable camelcase */
import { GeoProjection } from "d3"

import { CachedImages } from "../../types"
import { desert_icon } from "./desert/types"
import { element__icon } from "./elements/types"
import { grass_icon } from "./grass/types"
import { mountain_icon } from "./mountains/types"
import { tree__icon } from "./trees/types"

export type TerrainIcon =
	| mountain_icon
	| grass_icon
	| desert_icon
	| tree__icon
	| element__icon

export type DrawTerrainIconParams = {
	ctx: CanvasRenderingContext2D
	cachedImages: CachedImages
	projection: GeoProjection
}
