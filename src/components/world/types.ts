import { GeoProjection } from "d3"

export type CachedImages = Record<string, HTMLImageElement>

export type MapMode =
	| "provinces"
	| "nations"
	| "climate"
	| "vegetation"
	| "terrain"
	| "cultures"
	| "religion"
	| "optimalWealth"
	| "population"
	| "development"
	| "rainfall"
	| "temperature"
	| "wind"
	| "pressure"

export type WorldPaintParams = {
	ctx: CanvasRenderingContext2D
	projection: GeoProjection
	mapMode: MapMode
	cachedImages: CachedImages
	hoveredProvince?: number
	visible: Set<number>
	selectedNation?: number | null
	scale: number
	time?: number
	highlightedProvince?: number | null
}
