import * as d3 from "d3"
import {
	hsl,
	interpolateBlues,
	interpolateBuPu,
	max,
	mean,
	min,
	type ScaleLinear,
	scaleLinear,
} from "d3"
import { classify } from "@/model/cells/climate/pasta"
import { EBM } from "@/model/cells/ebm"
import { TEMPERATURE } from "@/model/cells/temperature"
import { WEATHER } from "@/model/cells/weather"
import { WIND } from "@/model/cells/wind"
import { NATION } from "@/model/nations"
import { RELATIONS } from "@/model/nations/relations"
import { Relation } from "@/model/nations/relations/types"
import { WAR } from "@/model/nations/wars"
import { PROVINCE } from "@/model/provinces"
import { LEADER } from "@/model/provinces/leader"
import { Province } from "@/model/provinces/types"
import { SHAPER_DISPLAY } from "@/model/shapers/display"
import { Vertex } from "@/model/utilities/voronoi/types"
import { MAP_SHAPES } from "../shapes"
import { MAP_METRICS } from "../shapes/metrics"
import { DrawMapParams } from "../shapes/types"
import { MapMode } from "../types"

function monthFromTime(time?: number): number | undefined {
	if (time === undefined) return undefined
	return new Date(time).getMonth()
}

const wasteland = "#bcbcbc"

let diplomacyTarget: number | null = null

let lastWorldId: string | null = null
let wealthScale: ScaleLinear<number, number> | null = null
let wealthScaleTime: number | undefined = undefined
let devScale: ScaleLinear<number, number> | null = null
let devScaleTime: number | undefined = undefined
let popScale: ScaleLinear<number, number> | null = null
let popScaleTime: number | undefined = undefined

const provinceBorders: Record<
	number,
	{
		path: Vertex[][]
	}
> = {}

const nationBorders: Record<
	number,
	{
		path: Vertex[][]
		color: string
		members: number[]
	}
> = {}

// Per-frame Path2D cache — avoids rebuilding the same polygon multiple times
// within a single render (fill pass, stroke pass, hover pass).
// Invalidated at the start of each frame via beginFrame().
let framePolygons: Record<string, Path2D> = {}

function beginFrame() {
	framePolygons = {}
}

function getPolygon(params: {
	points: Vertex[]
	path: (_object: d3.GeoPermissibleObjects) => string
	direction: "inner" | "outer"
	key: string
}): Path2D {
	const cached = framePolygons[params.key]
	if (cached) return cached
	const p = MAP_SHAPES.polygon({
		points: params.points,
		path: params.path,
		direction: params.direction,
	})
	framePolygons[params.key] = p
	return p
}

function clearCaches() {
	Object.keys(provinceBorders).forEach((k) => delete provinceBorders[Number(k)])
	Object.keys(nationBorders).forEach((k) => delete nationBorders[Number(k)])
}

function clearNationCache() {
	Object.keys(nationBorders).forEach((k) => delete nationBorders[Number(k)])
}

function getWealthScale(time?: number) {
	if (
		wealthScale &&
		wealthScaleTime === time &&
		lastWorldId === window.world.id
	) {
		return wealthScale
	}

	const nations = NATION.nations(time)
	const scores = nations.map((n) => NATION.wealth.optimal(n, time))
	const maxScore = max(scores) || 1
	const minScore = min(scores) || 0

	wealthScale = scaleLinear()
		.domain([Math.min(0, minScore), maxScore])
		.range([0, 1])
	wealthScaleTime = time
	lastWorldId = window.world.id
	return wealthScale
}

function getDevScale(time?: number) {
	if (devScale && devScaleTime === time && lastWorldId === window.world.id) {
		return devScale
	}

	const provinces = window.world.provinces.filter((p) => !p.desolate)
	const scores = provinces.map((p) => PROVINCE.development.get(p, time))
	const maxScore = max(scores) || 1
	const minScore = min(scores) || 0

	devScale = scaleLinear()
		.domain([Math.min(0, minScore), maxScore])
		.range([0, 1])
	devScaleTime = time
	lastWorldId = window.world.id
	return devScale
}

function getPopScale(time?: number) {
	if (popScale && popScaleTime === time && lastWorldId === window.world.id) {
		return popScale
	}

	const provinces = window.world.provinces.filter((p) => !p.desolate)
	const densities = provinces.map((p) => PROVINCE.population.density(p, time))
	// We'll use a log scale approach by transforming the domain, or simply linear
	// The user asked for "just like wealth" which is linear min->max, so let's check wealth first.
	// Wealth is using scaleLinear [min, max] -> [0, 1].
	// Population density varies wildly, so linear might be dominated by outliers,
	// but the request is specific: "just like wealth based on max and min".
	// However, for population, a power or log scale is visibly better.
	// Let's stick to the user's "just like wealth" request structure (min/max normalization),
	// but maybe keep the sqrt/pow transformation if it makes sense, OR purely linear if they want standard normalization.

	// Wealth implementation:
	// wealthScale = scaleLinear().domain([min, max]).range([0, 1])

	// Let's do the same for population density
	const maxD = max(densities) || 1
	const minD = min(densities) || 0

	// Using a power scale (squareroot-ish) is better for vis, but "just like wealth" implies linear normalization.
	// I'll try to stick to a slightly adjusted linear or power scale that maps the domain.
	// Wealth uses scaleLinear. I will use scalePow with exponent 0.5 to dampen high density spikes,
	// mapping [min, max] -> [0, 1].

	popScale = d3
		.scalePow()
		.exponent(0.4) // Using slight power curve to make differences visible
		.domain([minD, maxD])
		.range([0, 1])

	lastWorldId = window.world.id
	popScaleTime = time
	return popScale
}

function getStripePattern(
	ctx: CanvasRenderingContext2D,
	color: string,
	scale: number,
): CanvasPattern | null {
	const pCanvas = document.createElement("canvas")
	const pCtx = pCanvas.getContext("2d")
	if (!pCtx) return null

	const size = 16 - Math.floor(16 / scale)
	pCanvas.width = size
	pCanvas.height = size

	pCtx.strokeStyle = color
	pCtx.lineWidth = 4

	// Draw diagonal lines that tile seamlessly
	pCtx.beginPath()
	pCtx.moveTo(-2, size + 2)
	pCtx.lineTo(size + 2, -2)
	pCtx.stroke()

	pCtx.beginPath()
	pCtx.moveTo(-2, 2)
	pCtx.lineTo(2, -2)
	pCtx.stroke()

	pCtx.beginPath()
	pCtx.moveTo(size - 2, size + 2)
	pCtx.lineTo(size + 2, size - 2)
	pCtx.stroke()

	const pattern = ctx.createPattern(pCanvas, "repeat")
	return pattern
}

const modes: Record<MapMode, (province: Province, time?: number) => string> = {
	climate: (province: Province) => {
		const cell = window.world.cells[province.cell]
		const climate = MAP_METRICS.climate.tempColor(cell.heat.mean)
		const min = EBM.constants.chaotic.min
		const max = EBM.constants.chaotic.max
		const threshold = 15
		const minT = Math.min(threshold, Math.max(min - cell.heat.min, 0))
		const maxT = Math.min(threshold, Math.max(cell.heat.max - max, 0))
		if (minT <= 0 || maxT <= 0) return climate
		const dist = (minT + maxT) / 2
		const climateScale = scaleLinear()
			.domain([0, threshold])
			.range([climate, MAP_METRICS.climate.chaotic] as unknown[] as number[])
			.clamp(true)
		return climateScale(dist) as unknown as string
	},
	vegetation: (province: Province) => {
		const cell = window.world.cells[province.cell]
		return MAP_METRICS.vegetation.color[
			cell.vegetation as keyof typeof MAP_METRICS.vegetation.color
		]
	},
	terrain: (province: Province) => {
		const cell = window.world.cells[province.cell]
		if (cell.topography === "marsh")
			return MAP_METRICS.terrain.categorical.marsh
		if (cell.topography === "coastal") return "hsla(157, 21%, 57%, 1)"

		const cells = province.cells.land.map((c) => window.world.cells[c])
		const avgH = mean(cells.map((c) => c.elevation)) || 0
		return MAP_METRICS.terrain.color(avgH, cell.topography)
	},
	provinces: (province: Province) => province.color,
	nations: (province: Province, time?: number) => {
		const nation =
			WAR.rebels.overlord(province, time) ?? PROVINCE.nation(province, time)
		const c = hsl(nation.color)
		c.l = 0.92
		return c.toString()
	},
	cultures: (province: Province) => {
		const culture = window.world.cultures[province.culture]
		return culture?.color || wasteland
	},
	dynasties: (province: Province, time?: number) => {
		if (province.desolate) return wasteland
		const ruler = PROVINCE.nation(province, time)
		const dynastyIdx = LEADER.dynasty.get(ruler, time)
		if (dynastyIdx < 0) return wasteland
		const dynasty = window.world.dynasties[dynastyIdx]
		return dynasty?.color || wasteland
	},
	religion: (province: Province) => {
		const faith = window.world.faiths[province.faith]
		return faith?.color || wasteland
	},
	optimalWealth: (province: Province, time?: number) => {
		if (province.desolate) return interpolateBlues(0)
		const score = NATION.wealth.optimal(province, time)
		return interpolateBlues(getWealthScale(time)(score))
	},
	population: (province: Province, time?: number) => {
		if (province.desolate) return d3.interpolateOranges(0)
		const densityPerKm = PROVINCE.population.density(province, time)
		return d3.interpolateOranges(getPopScale(time)(densityPerKm))
	},
	development: (province: Province, time?: number) => {
		if (province.desolate) return interpolateBuPu(0)
		const score = PROVINCE.development.get(province, time)
		return interpolateBuPu(getDevScale(time)(score))
	},
	rainfall: (province: Province, time?: number) => {
		const cell = PROVINCE.cell(province)
		const m = monthFromTime(time)
		const monthlyRain = WEATHER.rain.month({ cell, month: m })
		return MAP_METRICS.rain.color(monthlyRain)
	},
	temperature: (province: Province, time?: number) => {
		const cells = province.cells.land.map((c) => window.world.cells[c])
		const m = monthFromTime(time)
		if (m !== undefined) {
			return MAP_METRICS.temperature.color(
				mean(cells.map((c) => TEMPERATURE.monthly.mean({ cell: c, month: m }))),
			)
		}
		return MAP_METRICS.temperature.color(mean(cells.map((c) => c.heat.mean)))
	},
	wind: (province: Province, time?: number) => {
		const cells = province.cells.land.map((c) => window.world.cells[c])
		const m = monthFromTime(time)
		if (m !== undefined) {
			const avg = mean(cells.map((c) => c.wind?.monthly?.[m] ?? 0))
			return WIND.color(avg)
		}
		const avg = mean(cells.map((c) => c.wind?.annual ?? 0))
		return WIND.color(avg)
	},
	biome: (province: Province) => {
		const cell = window.world.cells[province.cell]
		if (!cell.heat?.monthly || !cell.rain?.monthly) return wasteland
		const { color } = classify(cell)
		return `rgb(${color[0]},${color[1]},${color[2]})`
	},
	diplomacy: (province: Province, time?: number) => {
		if (province.desolate) return wasteland
		if (diplomacyTarget === null) {
			// Fallback to nations mode if no target selected
			const nation =
				WAR.rebels.overlord(province, time) ?? PROVINCE.nation(province, time)
			const c = hsl(nation.color)
			c.l = 0.92
			return c.toString()
		}
		const target = window.world.provinces[diplomacyTarget]
		const nation = PROVINCE.nation(province, time)

		// Selected nation itself
		if (nation.idx === diplomacyTarget) return "#ffffff"

		const RELATION_COLORS: Record<Relation, string> = {
			war: "#971212ff", // red-700 (darker than rival)
			rival: "#ef4444", // red-500
			suspicious: "#f59e0b",
			neutral: "#9ca3af",
			friendly: "#22c55e",
			ally: "#3b82f6",
			vassal: "#be86f3ff", // purple-500
			overlord: "#7c3aed", // violet-600 (distinct from vassal)
			personal_union_senior: "#f472b6", // pink-400
			personal_union_junior: "#fbcfe8", // pink-200
		}

		// Only sovereign nations have meaningful relations
		if (!NATION.sovereign(nation, time)) return "#e5e7eb"

		const relation = RELATIONS.get({
			nation: target,
			other: nation,
			time,
		})
		return RELATION_COLORS[relation]
	},
}

function ensureProvinceBorders() {
	const { provinces } = window.world

	if (window.world.id !== lastWorldId) {
		lastWorldId = window.world.id
		clearCaches()
	}

	if (Object.keys(provinceBorders).length === 0) {
		provinces.forEach((province) => {
			provinceBorders[province.idx] = {
				path: SHAPER_DISPLAY.borders.provinces([province]),
			}
		})
	}
}

export const DRAW_BORDERS = {
	beginFrame,
	clearNationCache,
	setDiplomacyTarget: (nationIdx: number | null) => {
		diplomacyTarget = nationIdx
	},
	/** Fill provinces with map-mode colors + province border strokes. Optional landmark filter. */
	fillProvinces: (
		{ ctx, projection, mapMode, visible, time }: DrawMapParams,
		landmarkFilter?: Set<number>,
	) => {
		const scale = MAP_SHAPES.scale.derived(projection)
		const linear = MAP_SHAPES.path.linear(projection)

		ensureProvinceBorders()

		const { provinces } = window.world

		// Pre-filter once
		const drawn = provinces.filter((p) => {
			if (!visible.has(p.idx)) return false
			if (!landmarkFilter) return true
			const cell = window.world.cells[p.cell]
			return landmarkFilter.has(cell.landmark)
		})

		// Drawing Fills
		drawn.forEach((province) => {
			const styles = provinceBorders[province.idx]
			if (mapMode === "nations" && province.desolate) {
				ctx.fillStyle = wasteland
			} else {
				ctx.fillStyle = modes[mapMode](province, time)
			}

			styles?.path.forEach((border, bIdx) => {
				ctx.save()
				const p = getPolygon({
					points: border,
					path: linear,
					direction: "inner",
					key: `p${province.idx}_${bIdx}`,
				})
				ctx.clip(p)
				ctx.fill(p)

				// DRAW OCCUPATION STRIPES
				const war = PROVINCE.occupations.get(province, time)
				const rebel = WAR.rebels.active(PROVINCE.nation(province, time), time)
				if (rebel && war === undefined && mapMode === "nations") {
					const pattern = getStripePattern(ctx, "black", scale)
					ctx.fillStyle = pattern
					ctx.fill(p)
				} else if (war !== undefined && mapMode === "nations" && !rebel) {
					const attacker = window.world.provinces[war.attacker]
					const pattern = getStripePattern(ctx, attacker.color, scale)
					ctx.fillStyle = pattern
					ctx.fill(p)
				}

				ctx.restore()
			})
		})

		ctx.strokeStyle = "rgba(0,0,0,0.15)"
		ctx.lineWidth = scale * 0.5
		drawn.forEach((province) => {
			const styles = provinceBorders[province.idx]
			styles?.path.forEach((border, bIdx) => {
				const p = getPolygon({
					points: border,
					path: linear,
					direction: "inner",
					key: `p${province.idx}_${bIdx}`,
				})
				ctx.stroke(p)
			})
		})
	},
	/** Draw nation border overlays (called once after all depth layers). */
	nationBorders: ({
		ctx,
		projection,
		mapMode,
		visible,
		time,
	}: DrawMapParams) => {
		const scale = MAP_SHAPES.scale.derived(projection)
		const linear = MAP_SHAPES.path.linear(projection)

		ensureProvinceBorders()

		if (mapMode === "nations" && Object.keys(nationBorders).length === 0) {
			const nations = window.world.provinces.filter(
				(p) => PROVINCE.parent.get(p, time) === undefined && !p.desolate,
			)
			nations.forEach((nation) => {
				if (WAR.rebels.active(nation, time)) return
				const provinces = NATION.provinces(nation, time)
				const rebels = WAR.rebels.get(nation, time)
				const combined = [...provinces, ...rebels]
				nationBorders[nation.idx] = {
					path: SHAPER_DISPLAY.borders.provinces(combined),
					color: nation.color,
					members: combined.map((p) => p.idx),
				}
			})
		}

		if (mapMode === "nations") {
			Object.entries(nationBorders)
				.sort((a, b) => b[1].members.length - a[1].members.length)
				.forEach(([key, styles]) => {
					const isVisible = styles.members.some((m) => visible.has(m))
					if (!isVisible) return

					ctx.strokeStyle = styles.color
					ctx.lineWidth = scale * 2
					styles.path.forEach((border, bIdx) => {
						const p = getPolygon({
							points: border,
							path: linear,
							direction: "inner",
							key: `n${key}_${bIdx}`,
						})
						ctx.save()
						ctx.clip(p)
						ctx.stroke(p)
						ctx.restore()
					})
				})
		}
	},
	/** Draw hover highlight (called once at end). */
	hover: ({ ctx, projection, hoveredProvince, time }: DrawMapParams) => {
		const scale = MAP_SHAPES.scale.derived(projection)
		const linear = MAP_SHAPES.path.linear(projection)

		ensureProvinceBorders()

		if (hoveredProvince !== undefined) {
			const province = window.world.provinces[hoveredProvince]
			const nation = PROVINCE.nation(province, time)
			if (nation) {
				const members = NATION.provinces(nation, time)
				ctx.fillStyle = "rgba(8, 8, 8, 0.2)"
				members.forEach((p) => {
					const styles = provinceBorders[p.idx]
					styles?.path.forEach((border, bIdx) => {
						const poly = getPolygon({
							points: border,
							path: linear,
							direction: "inner",
							key: `p${p.idx}_${bIdx}`,
						})
						ctx.fill(poly)
					})
				})

				const styles = provinceBorders[province.idx]
				if (styles) {
					ctx.lineWidth = scale * 0.5
					ctx.strokeStyle = "white"
					styles.path.forEach((border, bIdx) => {
						const p = getPolygon({
							points: border,
							path: linear,
							direction: "inner",
							key: `p${province.idx}_${bIdx}`,
						})
						ctx.stroke(p)
					})
				}
			}
		}
	},
	/** Get map-mode color for a province. */
	getProvinceColor: (
		province: Province,
		mapMode: MapMode,
		time?: number,
	): string => {
		return modes[mapMode](province, time)
	},
}
