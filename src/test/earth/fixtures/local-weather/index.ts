import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type { WeatherContext } from "@/model/climate/weather/local/types"
import type { GenesisParams } from "@/model/pipelines/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const params: GenesisParams = {
	...DEFAULT_WORLD_PARAMS,
	seed: 14963991,
	tideLock: null,
}
function context(): WeatherContext {
	const location = {
		region: 0,
		weight: 1,
		xyz: [1, 0, 0] as [number, number, number],
	}
	return {
		revision: 1,
		seed: params.seed,
		radiusKm: params.planetRadiusKm,
		provinces: [
			{
				location: {
					province: 0,
					latitude: 0,
					longitude: 0,
					samples: [location],
					approximateLocation: false,
				},
				baselines: [
					{
						location,
						temperature: new Float32Array(12).fill(20),
						dtr: new Float32Array(12).fill(10),
						dewPoint: new Float32Array(12).fill(15),
						rain: new Float32Array(12).fill(30),
						rainSlopes: new Float64Array(12).fill(360 / 3.156e7),
						windU: new Float32Array(12).fill(3),
						windV: new Float32Array(12).fill(2),
						cloud: new Float32Array(12).fill(0.5),
						isLand: true,
						aridity: 0.5,
						cycloneRisk: 0,
						tornadoRisk: 0,
						bare: false,
						particleSource: null,
						valid: true,
					},
				],
			},
		],
	}
}
function instant() {
	return WEATHER_CLOCK.resolve({ params, elapsedYears: 0.25, manual: null })
}
export const WEATHER_FIXTURE = { context, instant, params }
