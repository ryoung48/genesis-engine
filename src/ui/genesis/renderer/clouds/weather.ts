import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { CLIMATEV2_OUTPUTS } from "@/model/climatev2/outputs"
import { MESH } from "@/model/mesh"
import type { CloudWeather } from "@/ui/genesis/renderer/clouds/types"
import type { CloudClimateGrid } from "@/ui/genesis/renderer/clouds/vendor/orogen.js"

const WIDTH = 360
const HEIGHT = 180
const SIZE = WIDTH * HEIGHT
const regionGrids = new WeakMap<Float32Array, Int32Array>()

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
	const annual = month === 0
	const offset = (month - 1) * mesh.numRegions
	const orbit = CLIMATEV2_ORBIT.fromParams(world.params)
	const pressureOffset = 1011 * (orbit.pressureScale - 1)
	for (let cell = 0; cell < SIZE; cell++) {
		const region = regions[cell]
		const i = offset + region
		P[cell] =
			(annual ? rainfall.annual[region] / 12 : rainfall.monthly[i]) /
			orbit.yearScale
		T[cell] = annual
			? climate.temperature_avg[region]
			: climate.temperature_monthly[i]
		slp[cell] = wind.pressure[region] - pressureOffset
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
	}
	return { P, T, slp, u, v, sstAnom, seaIce, sea }
}
