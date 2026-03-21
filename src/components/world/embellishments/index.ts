import { geoGraticule10 } from "d3"
import { RAIN } from "@/model/cells/rain"
import { MATH } from "@/model/utilities/math"
import { MAP_SHAPES } from "../shapes"
import { MAP_METRICS } from "../shapes/metrics"
import { DrawMapParams } from "../shapes/types"

export const DRAW_EMBELLISHMENTS = {
	thermalEquator: ({
		ctx,
		projection,
		month,
	}: DrawMapParams & { month: number }) => {
		const teqCache = RAIN.teqCache()
		if (!teqCache || teqCache.size === 0) return

		// Build sorted array of [longitude, teqLatitude] for this month
		const points: [number, number][] = []
		teqCache.forEach((teqPerMonth, lonBin) => {
			const lat = teqPerMonth[month ?? 0]
			if (lat !== undefined) points.push([lonBin, lat])
		})
		points.sort((a, b) => a[0] - b[0])
		if (points.length < 2) return

		// Wrap around the anti-meridian: append the first point shifted +360°
		// so d3's geoPath clips the line properly across ±180°.
		const first = points[0]
		points.push([first[0] + 360, first[1]])

		// Draw as a smooth curved line via GeoJSON LineString
		const line: GeoJSON.Feature<GeoJSON.LineString> = {
			type: "Feature",
			properties: {},
			geometry: { type: "LineString", coordinates: points },
		}
		const pathGen = MAP_SHAPES.path.curve(projection)
		const d = pathGen(line)
		if (!d) return

		ctx.save()
		const path = new Path2D(d)
		ctx.lineWidth = 2
		ctx.strokeStyle = "rgba(220, 40, 40, 0.75)"
		ctx.setLineDash([6, 3])
		ctx.stroke(path)
		ctx.setLineDash([])
		ctx.restore()
	},
	graticule: ({ ctx, projection }: DrawMapParams) => {
		ctx.save()
		const scale = MAP_SHAPES.scale.derived(projection)
		const pathGen = MAP_SHAPES.path.linear(projection)
		const path = new Path2D(pathGen(geoGraticule10()))
		const opacity = 1 / (scale / 2)
		ctx.lineWidth = 0.25
		ctx.strokeStyle = `rgba(0,0,0,${opacity})`
		ctx.stroke(path)
		ctx.restore()
	},
	measure: ({
		ctx,
		projection,
		p1,
		p2,
		units = "metric",
	}: DrawMapParams & {
		p1: [number, number]
		p2: [number, number]
		units?: "metric" | "imperial"
	}) => {
		if (!p1 || !p2) return

		const start = projection(p1)
		const end = projection(p2)

		if (!start || !end) return

		ctx.save()

		// Draw Line
		ctx.beginPath()
		ctx.moveTo(start[0], start[1])
		ctx.lineTo(end[0], end[1])
		ctx.lineWidth = 1.5
		ctx.strokeStyle = "black"
		ctx.setLineDash([5, 5])
		ctx.stroke()
		// White outline for visibility
		ctx.lineWidth = 1.5
		ctx.strokeStyle = "white"
		ctx.stroke()
		ctx.lineWidth = 1.0
		ctx.strokeStyle = "black"
		ctx.stroke()
		ctx.setLineDash([])

		// Draw Dots
		ctx.fillStyle = "white"
		ctx.strokeStyle = "black"
		ctx.lineWidth = 1
		;[start, end].forEach(([x, y]) => {
			ctx.beginPath()
			ctx.arc(x, y, 3, 0, Math.PI * 2)
			ctx.fill()
			ctx.stroke()
		})

		// Draw Label
		const mx = (start[0] + end[0]) / 2
		const my = (start[1] + end[1]) / 2 - 15
		const distKm = MATH.distance.geo(p1, p2) * window.world.radius

		const label =
			units === "metric"
				? MAP_METRICS.terrain.format(distKm, 0)
				: `${MATH.conversion.distance.km.miles(distKm).toFixed(0)} mi`

		ctx.font = "11px sans-serif"
		const metrics = ctx.measureText(label)
		const pad = 4
		const w = metrics.width + pad * 2
		const h = 16

		ctx.translate(mx, my)
		ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
		ctx.shadowColor = "rgba(0,0,0,0.2)"
		ctx.shadowBlur = 4
		ctx.fillRect(-w / 2, -h / 2, w, h)
		ctx.shadowColor = "transparent"
		ctx.shadowBlur = 0
		ctx.strokeStyle = "#ccc"
		ctx.strokeRect(-w / 2, -h / 2, w, h)

		ctx.fillStyle = "black"
		ctx.textAlign = "center"
		ctx.textBaseline = "middle"
		ctx.fillText(label, 0, 1) // slight visual adjustment

		ctx.restore()
	},
}
