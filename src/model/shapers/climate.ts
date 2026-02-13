import { mean, range, scaleLinear } from "d3"
import { WORLD } from ".."
import { CELL } from "../cells"
import { RAIN } from "../cells/rain"
import { TEMPERATURE } from "../cells/temperature"
import { WEATHER } from "../cells/weather"
import { MATH } from "../utilities/math"
import { POINT } from "../utilities/points"
import { SHAPER_MOUNTAINS } from "./topagraphy"

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
							cell.h = WORLD.elevation.compute(cell)
						})
				}
			})
		WORLD.cells.reshape()
	},
	_rain: () => {
		const scale = scaleLinear([4, 8], [1, 1.5])(window.world.resolution)
		const wet = 30
		const ocean = WORLD.cells
			.water()
			.filter((cell) => cell.ocean && cell.landDist > 10)
		const affected = window.world.cells.filter(
			(cell) => cell.shallow || !cell.ocean,
		)

		const assignRain = (attr: "east" | "west") => {
			const visited = new Set<number>()
			ocean.forEach((cell) => {
				cell.rain[attr] = wet
				visited.add(cell.idx)
			})
			const queue = [...ocean]
			while (queue.length > 0) {
				const cell = queue.shift()
				const impact = (cell.ocean ? 0.5 : cell.isWater ? 0.25 : -0.8) / scale
				const rain = Math.max(
					Math.min(Math.max(cell.rain[attr], 0) + impact, wet),
					0,
				)

				// Coriolis deflection based on latitude and hemisphere
				const lat = Math.abs(cell.y)
				const hemisphere = cell.y >= 0 ? 1 : -1

				// Trade winds (0-30°) deflect toward equator, westerlies (30+) deflect toward poles
				let validDirs: string[]
				if (attr === "east") {
					// Trade winds: from east, deflecting toward equator
					// NH: deflect south (SW), SH: deflect north (NW)
					validDirs = lat < 30 ? ["W", hemisphere > 0 ? "SW" : "NW"] : ["W"] // Minimal deflection at higher latitudes
				} else {
					// Westerlies: from west, deflecting toward poles
					// NH: deflect north (NE), SH: deflect south (SE)
					validDirs = lat > 25 ? ["E", hemisphere > 0 ? "NE" : "SE"] : ["E"] // Tropics have less westerly influence
				}

				const neighbors = CELL.neighbors(cell).filter(
					(n) =>
						(!visited.has(n.idx) || (!n.isWater && rain > n.rain[attr])) &&
						validDirs.includes(POINT.direction.geo(cell, n)),
				)
				neighbors.forEach((n) => {
					queue.push(n)
					n.rain[attr] = rain
					visited.add(n.idx)
				})
			}
			range(1).forEach(() => {
				affected.forEach((cell) => {
					cell.rain[attr] = mean(
						CELL.neighbors(cell)
							.concat([cell])
							.filter((n) => n.rain[attr] >= 0 && (n.shallow || !n.ocean))
							.map((n) => n.rain[attr]),
					)
					if (isNaN(cell.rain[attr])) cell.rain[attr] = 0
				})
			})
		}
		assignRain("east")
		assignRain("west")

		const lakes = WORLD.cells.lakes.get()
		const cells = WORLD.cells.land().concat(lakes)

		// Normalize weights before passing to monthly assignment
		cells.forEach((cell) => {
			cell.rain.east /= wet
			cell.rain.west /= wet
			if (cell.rain.east > cell.rain.west) cell.rain.west = 0
			else cell.rain.east = 0
		})

		// Assign monthly rain using thermal equator-driven zones
		RAIN.assignMonthly(cells)
	},
	_heat: () => {
		window.world.cells.forEach((cell) => {
			cell.heat = { min: 0, max: 0, mean: 0 }
			cell.heat.min = TEMPERATURE.annual.min(cell)
			cell.heat.max = TEMPERATURE.annual.max(cell)
			cell.heat.mean = TEMPERATURE.annual.mean(cell)
			cell.heat.monthly = []
		})
	},
	_climate: () => {
		const domain = 1.8
		const humidity = WEATHER.rain.scale.annual
		const rainRanges = {
			arctic: [humidity.parched, humidity.arid, humidity.dry, humidity.low],
			subarctic: [
				humidity.parched,
				humidity.arid,
				humidity.dry,
				humidity.low,
				humidity.moderate,
			],
			boreal: [
				humidity.parched,
				humidity.arid,
				humidity.dry,
				humidity.low,
				humidity.moderate,
				humidity.moist,
			],
			cool: [
				humidity.parched,
				humidity.arid,
				humidity.dry,
				humidity.low,
				humidity.moderate,
				humidity.moist,
				humidity.wet,
			],
			warm: [
				humidity.parched,
				humidity.arid,
				humidity.dry,
				humidity.low,
				humidity.moderate,
				humidity.moist,
				humidity.wet,
				humidity.humid,
			],
			subtropical: [
				humidity.parched,
				humidity.arid,
				humidity.dry,
				humidity.low,
				humidity.moderate,
				humidity.moist,
				humidity.wet,
				humidity.humid,
			],
			tropical: [
				humidity.parched,
				humidity.arid,
				humidity.dry,
				humidity.low,
				humidity.moderate,
				humidity.moist,
				humidity.wet,
				humidity.humid,
				humidity.saturated,
			],
		}
		const temperatureModeration = scaleLinear()
			.domain([10, 30, 80, 200])
			.range([0, 1.5, 3, 8])
			.clamp(true)
		const latitudeModeration = scaleLinear()
			.domain([5, 25])
			.range([-1, 1])
			.clamp(true)
		const scale = (key: keyof typeof rainRanges) =>
			scaleLinear()
				.domain(
					MATH.scaleDiscrete(rainRanges[key].length).map((i) => i * domain),
				)
				.range(rainRanges[key])
		const arctic = scale("arctic")
		const subarctic = scale("subarctic")
		const boreal = scale("boreal")
		const cool = scale("cool")
		const warm = scale("warm")
		const subtropical = scale("subtropical")
		const tropical = scale("tropical")
		const lakes = WORLD.cells.lakes.get()
		WORLD.cells
			.land()
			.concat(lakes)
			.forEach((cell) => {
				const averageHeat = mean([cell.heat.min, cell.heat.max])
				const latitude =
					averageHeat > 24
						? tropical
						: averageHeat > 18
							? subtropical
							: averageHeat > 12
								? warm
								: averageHeat > 2
									? cool
									: averageHeat > -8
										? boreal
										: averageHeat > -14
											? subarctic
											: arctic
				const rain = cell.rain.annual
				const minRain = Math.min(...cell.rain.monthly)
				const maxRain = Math.max(...cell.rain.monthly)
				const rainfallModWinter = temperatureModeration(minRain)
				const rainfallModSummer = temperatureModeration(maxRain)
				const latitudeMod = latitudeModeration(Math.abs(cell.y))
				const southern = cell.y < 0
				if (southern) {
					cell.heat.max += rainfallModSummer * latitudeMod
					cell.heat.min -= rainfallModWinter
				} else {
					cell.heat.max -= rainfallModSummer
					cell.heat.min += rainfallModWinter * latitudeMod
				}
				cell.heat.mean = averageHeat
				if (latitude === tropical) {
					cell.climate = "tropical"
					if (rain > humidity.humid) cell.vegetation = "jungle"
					else if (rain > humidity.wet)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "jungle", w: 70 },
							{ v: "forest", w: 30 },
						])
					else if (rain > humidity.moist)
						cell.vegetation = window.dice.weightedChoice([
							{ v: "forest", w: 70 },
							{ v: "woods", w: 30 },
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
				} else if (latitude === subtropical) {
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
				} else if (latitude === warm) {
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
				} else if (latitude === cool) {
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
				} else if (latitude === boreal) {
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
				} else if (latitude === subarctic) {
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
	},
}
