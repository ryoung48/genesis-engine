import { GeoPermissibleObjects, GeoProjection } from "d3"
import { Point } from "@/model/utilities/points/types"
import { Vertex } from "@/model/utilities/voronoi/types"
import { MapMode } from "../types"

export type DrawPolygonParams = {
	points: Vertex[]
	direction: "inner" | "outer"
	path: (_object: GeoPermissibleObjects) => string
}

export type DrawMapParams = {
	ctx: CanvasRenderingContext2D
	projection: GeoProjection
	mapMode: MapMode
	hoveredProvince?: number
	visible: Set<number>
	time?: number
}

export interface CircleParams {
	point: Point
	radius: number
	ctx: CanvasRenderingContext2D
	fill: string
	border?: {
		color: string
		width: number
	}
}
