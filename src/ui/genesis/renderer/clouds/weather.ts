import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { CLIMATEV2_OUTPUTS } from "@/model/climatev2/outputs"
import type { CirculationBelts } from "@/model/climatev2/vendor/circulation.js"
import { MESH } from "@/model/mesh"
import type { CloudWeather } from "@/ui/genesis/renderer/clouds/types"
import type { CloudClimateGrid } from "@/ui/genesis/renderer/clouds/vendor/orogen.js"

const WIDTH = 360
const HEIGHT = 180
const SIZE = WIDTH * HEIGHT
const regionGrids = new WeakMap<Float32Array, Int32Array>()

function averageBelts(months: CirculationBelts[]): CirculationBelts {
	const mean = (key: Exclude<keyof CirculationBelts, `extraLows${string}`>) =>
		months.reduce((sum, belts) => sum + belts[key], 0) / months.length
	const meanLows = (key: "extraLowsN" | "extraLowsS") => {
		const count = Math.min(...months.map((belts) => belts[key].length))
		const lows: number[] = []
		for (let k = 0; k < count; k++)
			lows.push(
				months.reduce((sum, belts) => sum + belts[key][k], 0) / months.length,
			)
		return lows
	}
	return {
		extraLowsN: meanLows("extraLowsN"),
		extraLowsS: meanLows("extraLowsS"),
		itcz: mean("itcz"),
		hiN: mean("hiN"),
		hiS: mean("hiS"),
		loN: mean("loN"),
		loS: mean("loS"),
		midN: mean("midN"),
		midS: mean("midS"),
	}
}

export function rasterizeCloudWeather({
	world,
	month,
}: CloudWeather): CloudClimateGrid {
	const { mesh, climate, rainfall, wind, windMonthly, oceanCurrents } = world
	let regions = regionGrids.get(mesh.r_xyz)
	if (!regions) {
		const index = MESH.buildRegionSpatialIndex(mesh)
		regions = new Int32Array(SIZE)
		for (let y = 0; y < HEIGHT; y++) {
			for (let x = 0; x < WIDTH; x++) {
				regions[y * WIDTH + x] = index.nearest(x + 0.5 - 180, 90 - y - 0.5)
			}
		}
		regionGrids.set(mesh.r_xyz, regions)
	}

	const P = new Float32Array(SIZE)
	const T = new Float32Array(SIZE)
	const slp = new Float32Array(SIZE)
	const u = new Float32Array(SIZE)
	const v = new Float32Array(SIZE)
	const sstAnom = new Float32Array(SIZE)
	const seaIce = new Uint8Array(SIZE)
	const sea = new Uint8Array(SIZE)
	const cyclone = new Float32Array(SIZE)
	const annual = month === 0
	const offset = (month - 1) * mesh.numRegions
	const orbit = CLIMATEV2_ORBIT.fromParams(world.params)
	let pressureSum = 0
	let areaSum = 0
	for (let cell = 0; cell < SIZE; cell++) {
		const region = regions[cell]
		const i = offset + region
		const area = Math.cos(
			((90 - Math.floor(cell / WIDTH) - 0.5) * Math.PI) / 180,
		)
		P[cell] =
			(annual ? rainfall.annual[region] / 12 : rainfall.monthly[i]) /
			orbit.yearScale
		T[cell] = annual
			? climate.temperature_avg[region]
			: climate.temperature_monthly[i]
		slp[cell] = wind.pressure[region]
		pressureSum += slp[cell] * area
		areaSum += area
		u[cell] = annual
			? wind.windU[region] * wind.windSpeed[region]
			: windMonthly.u[i]
		v[cell] = annual
			? wind.windV[region] * wind.windSpeed[region]
			: windMonthly.v[i]
		sstAnom[cell] =
			(annual ? oceanCurrents.sst[region] : oceanCurrents.sstMonthly[i]) *
			CLIMATEV2_OUTPUTS.sstAnomalySaturationC
		sea[cell] = world.isLand[region] ? 0 : 1
		seaIce[cell] = sea[cell] && world.iceMinMonthly[region] > 0 ? 1 : 0
		cyclone[cell] = sea[cell] ? (world.cycloneRisk?.[region] ?? 0) : 0
	}
	const meanPressure = pressureSum / areaSum
	for (let cell = 0; cell < SIZE; cell++) slp[cell] -= meanPressure

	const months = world.circulationBelts
	const belts = !months
		? null
		: annual
			? averageBelts(months)
			: months[month - 1]
	return { P, T, slp, u, v, sstAnom, seaIce, sea, cyclone, belts }
}
