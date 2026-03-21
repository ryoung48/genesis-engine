import { mean } from "d3"
import { WORLD } from ".."
import { CELL } from "../cells"
import { RAIN } from "../cells/rain"
import { TEMPERATURE } from "../cells/temperature"
import { WEATHER } from "../cells/weather"
import { WIND } from "../cells/wind"
import { SHAPER_MOUNTAINS } from "./topagraphy"
import { EBM } from "../cells/ebm"

export const SHAPER_CLIMATES = {
	_lakes: () => {
		const lakes = WORLD.cells.lakes.get()
		const shallow = lakes.filter((cell) => cell.shallow)
		WORLD.features("water")
			.filter((idx) => window.world.landmarks[idx].type !== "ocean")
			.forEach((landmark) => {
				const border = shallow.filter((cell) => cell.landmark === landmark)
				const arid = border.some((cell) => {
					return CELL.neighbors(cell).some(
						(n) => n.vegetation === "desert" || n.vegetation === "sparse",
					)
				})
				const mountainous = border.some((cell) =>
					CELL.neighbors(cell).some((n) => n.isMountains),
				)
				if (arid || mountainous) {
					WORLD.cells.lakes
						.remove({ lakes, lake: landmark })
						.forEach((cell) => {
							cell.elevation = WORLD.elevation.compute(cell)
						})
				}
			})
		WORLD.cells.reshape()
	},
	_rain: () => {
		// 1. Compute moisture advection from oceans
		RAIN.assignAdvection()

		const lakes = WORLD.cells.lakes.get()
		const cells = WORLD.cells.land().concat(lakes)

		// 2. Assign monthly rain using thermal equator-driven zones
		RAIN.assignMonthly(cells)
	},
	_heat: () => {
		window.world.cells.forEach((cell) => {
			cell.heat = { min: 0, max: 0, mean: 0 }
			cell.heat.min = TEMPERATURE.annual.min(cell)
			cell.heat.max = TEMPERATURE.annual.max(cell)
			cell.heat.mean = TEMPERATURE.annual.mean(cell)
			cell.heat.monthly = []
			cell.heat.monthlyE = []
		})
	},
	_climate: () => {
		const humidity = WEATHER.rain.scale.annual
		const lakes = WORLD.cells.lakes.get()
		WORLD.cells
			.land()
			.concat(lakes)
			.forEach((cell) => {
				const minHeat = Math.min(...cell.heat.monthly)
				const maxHeat = Math.max(...cell.heat.monthly)
				const averageHeat = mean(cell.heat.monthly)
				const isChaotic =
					minHeat < EBM.constants.chaotic.min && maxHeat > EBM.constants.chaotic.max
				const isInfernal = averageHeat > EBM.constants.chaotic.max
				const climate = isChaotic
					? 'chaotic'
					: isInfernal
						? 'infernal'
						: averageHeat > 24
							? 'tropical'
							: averageHeat > 18
								? 'subtropical'
								: averageHeat > 12
									? 'warm'
									: averageHeat > 6
										? 'cool'
										: averageHeat > -3
											? 'boreal'
											: averageHeat > -9
												? 'subarctic'
												: 'arctic'
				const rain = cell.rain.annual
				cell.heat.max = maxHeat
				cell.heat.min = minHeat
				cell.heat.mean = averageHeat
				if (climate === 'chaotic') {
					cell.climate = "chaotic"
					if (rain > humidity.wet)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "jungle", w: 20 },
							{ v: "forest", w: 40 },
							{ v: "woods", w: 40 },
						])
					else if (rain > humidity.moist)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "forest", w: 30 },
							{ v: "woods", w: 40 },
							{ v: "grasslands", w: 30 },
						])
					else if (rain > humidity.moderate)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "woods", w: 30 },
							{ v: "grasslands", w: 50 },
							{ v: "sparse", w: 20 },
						])
					else if (rain > humidity.low)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "grasslands", w: 40 },
							{ v: "sparse", w: 40 },
							{ v: "desert", w: 20 },
						])
					else if (rain > humidity.dry)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 60 },
							{ v: "desert", w: 40 },
						])
					else cell.vegetation = "desert"
				} else if (climate === 'infernal') {
					cell.climate = "infernal"
					if (rain > humidity.moderate)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 60 },
							{ v: "grasslands", w: 40 },
						])
					else if (rain > humidity.low)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 70 },
							{ v: "desert", w: 30 },
						])
					else if (rain > humidity.dry)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 40 },
							{ v: "desert", w: 60 },
						])
					else cell.vegetation = "desert"
				} else if (climate === 'tropical') {
					cell.climate = "tropical"
					if (rain > humidity.wet) cell.vegetation = "jungle"
					else if (rain > humidity.moist)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "forest", w: 70 },
							{ v: "jungle", w: 30 },
						])
					else if (rain > humidity.moderate)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "forest", w: 30 },
							{ v: "woods", w: 70 },
						])
					else if (rain > humidity.low)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "woods", w: 70 },
							{ v: "grasslands", w: 30 },
						])
					else if (rain > humidity.dry)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "grasslands", w: 70 },
							{ v: "sparse", w: 30 },
						])
					else if (rain > humidity.arid)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 80 },
							{ v: "desert", w: 20 },
						])
					else cell.vegetation = "desert"
				} else if (climate === 'subtropical') {
					cell.climate = "subtropical"
					if (rain > humidity.wet) cell.vegetation = "jungle"
					else if (rain > humidity.moist)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "forest", w: 40 },
							{ v: "jungle", w: 60 },
						])
					else if (rain > humidity.moderate)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "forest", w: 70 },
							{ v: "woods", w: 30 },
						])
					else if (rain > humidity.low)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "woods", w: 80 },
							{ v: "grasslands", w: 20 },
						])
					else if (rain > humidity.dry)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 20 },
							{ v: "grasslands", w: 80 },
						])
					else if (rain > humidity.arid)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 80 },
							{ v: "desert", w: 20 },
						])
					else cell.vegetation = "desert"
				} else if (climate === 'warm') {
					cell.climate = "temperate"
					if (rain > humidity.wet) cell.vegetation = "forest"
					else if (rain > humidity.moist)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "forest", w: 70 },
							{ v: "woods", w: 30 },
						])
					else if (rain > humidity.moderate) cell.vegetation = "woods"
					else if (rain > humidity.low)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "woods", w: 60 },
							{ v: "grasslands", w: 40 },
						])
					else if (rain > humidity.dry) cell.vegetation = "grasslands"
					else if (rain > humidity.arid)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 80 },
							{ v: "desert", w: 20 },
						])
					else cell.vegetation = "desert"
				} else if (climate === 'cool') {
					cell.climate = "temperate"
					if (rain > humidity.moist) cell.vegetation = "forest"
					else if (rain > humidity.moderate)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "forest", w: 70 },
							{ v: "woods", w: 30 },
						])
					else if (rain > humidity.low) cell.vegetation = "woods"
					else if (rain > humidity.dry)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "grasslands", w: 80 },
							{ v: "sparse", w: 20 },
						])
					else if (rain > humidity.arid)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 80 },
							{ v: "desert", w: 20 },
						])
					else cell.vegetation = "desert"
				} else if (climate === 'boreal') {
					cell.climate = "boreal"
					if (rain > humidity.moderate) cell.vegetation = "forest"
					else if (rain > humidity.low)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "forest", w: 70 },
							{ v: "woods", w: 30 },
						])
					else if (rain > humidity.dry)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "woods", w: 70 },
							{ v: "grasslands", w: 30 },
						])
					else if (rain > humidity.arid)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 80 },
							{ v: "desert", w: 20 },
						])
					else cell.vegetation = "desert"
				} else if (climate === 'subarctic') {
					cell.climate = "subarctic"
					if (rain > humidity.low)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 60 },
							{ v: "grasslands", w: 40 },
						])
					else if (rain > humidity.dry)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 80 },
							{ v: "grasslands", w: 20 },
						])
					else if (rain > humidity.arid) cell.vegetation = "sparse"
					else
						cell.vegetation = window.dice.weightedChoice([
							{ v: "sparse", w: 70 },
							{ v: "desert", w: 30 },
						])
				} else {
					cell.climate = "arctic"
					cell.vegetation = "desert"
				}
			})
	},
	_coastlines: () => {
		// iterate through all coastal polygons 338
		window.world.cells
			.filter((p) => p.isCoast)
			.forEach((p) => {
				p.coastalEdges = []
				p.waterSources = new Set()
				CELL.neighbors(p)
					.filter((n) => n.isWater)
					.forEach((neighbor) => {
						// add water source
						p.waterSources.add(neighbor.landmark)
						// mark edge as coastal
						const edge = CELL.commonEdge(p.idx, neighbor.idx)
						window.world.coasts.push({
							land: p.landmark,
							water: neighbor.landmark,
							edge: edge,
						})
						// get coastal edge coordinates
						// add them to the coastal polygon coordinates list (used for location placement)
						p.coastalEdges.push([
							{
								x: edge[0][0],
								y: edge[0][1],
							},
							{
								x: edge[1][0],
								y: edge[1][1],
							},
						])
					})
			})
	},
	build: () => {
		SHAPER_CLIMATES._heat()
		SHAPER_CLIMATES._rain()
		SHAPER_CLIMATES._climate()
		SHAPER_CLIMATES._lakes()
		SHAPER_CLIMATES._coastlines()
		SHAPER_MOUNTAINS._topography()
		WIND.build()
	},
}
