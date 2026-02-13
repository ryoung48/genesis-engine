import * as turf from "@turf/turf"
import * as d3 from "d3"

import { CircleParams, DrawPolygonParams } from "./types"

/**
 * Creates a strongly typed curve context object.
 * @param curve The curve object.
 * @returns The curve context object.
 */
function curveContext(curve: d3.CurveGenerator, closePath = true) {
	let firstMove = true // Flag to track the first moveTo call
	let lastPoint: [number, number] = null // Store the last point for potential use in finalizing open paths

	return {
		moveTo(x: number, y: number): void {
			if (!firstMove && !closePath) {
				// For open paths, ensure we finalize the path properly if moveTo is called again
				this.closePath()
			}
			curve.lineStart()
			curve.point(x, y)
			firstMove = false
			lastPoint = [x, y]
		},
		lineTo(x: number, y: number): void {
			curve.point(x, y)
			lastPoint = [x, y]
		},
		closePath(): void {
			if (closePath) {
				curve.lineEnd()
			} else if (lastPoint) {
				// For open paths, make a final call to ensure the last segment is drawn
				curve.point(lastPoint[0], lastPoint[1])
				curve.lineEnd()
			}
			// Reset state for next path
			firstMove = true
			lastPoint = null
		},
	}
}
/**
 * Returns a function that generates a geo curve path.
 *
 * @param curve The curve function.
 * @param projection The projection function.
 * @param context The context for the path.
 * @returns The generated geo curve path.
 */
function geoCurvePath(
	curve: (_context: d3.Path) => d3.CurveGenerator,
	projection: d3.GeoProjection,
	closePath = true,
) {
	return (object: d3.GeoPermissibleObjects) => {
		const pathContext = d3.path()
		const geoContext = curveContext(
			curve(pathContext),
			closePath,
		) as d3.GeoContext
		d3.geoPath(projection, geoContext)(object)
		return pathContext.toString()
	}
}

export const MAP_SHAPES = {
	height: 800,
	width: 1600,
	breakpoints: {
		regional: 25,
		global: 7,
	},
	color: {
		water: {
			fresh: "#bfe9fc",
			salt: "#abd9f0ff",
			seaIce: { permanent: "#FFF", seasonal: "#e3f1f2" },
		},
	},
	circle: (params: CircleParams) => {
		const { ctx, point, radius, fill, border } = params
		const width = border?.width ?? 0
		ctx.lineWidth = width
		ctx.beginPath()
		ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI)
		ctx.strokeStyle = border?.color ?? "black"
		ctx.fillStyle = fill
		ctx.fill()
		if (width > 0) ctx.stroke()
	},
	polygon: (params: DrawPolygonParams) => {
		const { direction, path, points } = params
		const reverse = points.slice().reverse()
		const areaO = d3.geoArea(turf.polygon([points]))
		const areaR = d3.geoArea(turf.polygon([reverse]))
		const outer = areaO > areaR
		const inside = outer ? reverse : points
		const outside = outer ? points : reverse
		const poly = turf.polygon([direction === "inner" ? inside : outside])
		return new Path2D(path(poly))
	},
	path: {
		curveClosed: (projection: d3.GeoProjection) =>
			geoCurvePath(d3.curveCatmullRomClosed.alpha(0.1), projection),
		curve: (projection: d3.GeoProjection) =>
			geoCurvePath(d3.curveCatmullRom.alpha(0.1), projection, false),
		basis: (projection: d3.GeoProjection) =>
			geoCurvePath(d3.curveBasis, projection, false),
		linear: (projection: d3.GeoProjection) => d3.geoPath(projection),
	},
	projection: {
		build: (ctx: CanvasRenderingContext2D) =>
			MAP_SHAPES.projection.orthographic(ctx),
		mercator: (ctx: CanvasRenderingContext2D) =>
			d3
				.geoMercator()
				.scale(MAP_SHAPES.scale.init)
				.translate([ctx.canvas.width / 2, ctx.canvas.height / 2]),
		orthographic: (ctx: CanvasRenderingContext2D) =>
			d3
				.geoOrthographic()
				.scale(MAP_SHAPES.scale.init)
				.translate([ctx.canvas.width / 2, ctx.canvas.height / 2]),
	},
	scale: {
		init: 200,
		derived: (projection: d3.GeoProjection) =>
			projection.scale() / MAP_SHAPES.scale.init,
	},
	styles: [
		"Nations",
		"Cultures",
		"Religion",
		"Government",
		"Population",
		"Development",
		"Resources",
		"Terrain",
		"Climate",
		"Vegetation",
		"Temperature",
		"Rain",
	] as const,
}
