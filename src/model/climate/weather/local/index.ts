import { MECHANICS } from "@/model/celestial/moons/mechanics"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { WEATHER_AGGREGATION } from "@/model/climate/weather/local/aggregation"
import { WEATHER_BASELINE } from "@/model/climate/weather/local/baseline"
import { WEATHER_MARINE } from "@/model/climate/weather/local/marine"
import type { MarineSnapshot } from "@/model/climate/weather/local/marine/types"
import { WEATHER_REGION } from "@/model/climate/weather/local/region"
import type {
	CreateLocalWeatherParams,
	LocalWeatherValues,
	MarineEvaluationParams,
	PrepareMarineParams,
	ProvinceWeatherEvaluationParams,
	ProvinceWeatherInspection,
	SampleProvinceWeatherParams,
	WeatherContext,
	WeatherProvinceMarine,
	WeatherSnapshot,
} from "@/model/climate/weather/local/types"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { PROVINCE_LOCATIONS } from "@/model/geography/terrain/provinces/locations"
import { RNG } from "@/model/shared/random/rng"

function prepareMarine({
	world,
	marine,
	tidalRange,
	yearSeconds,
}: PrepareMarineParams): WeatherProvinceMarine {
	const { shore, sea } = marine
	const xyz: [number, number, number] = [
		world.mesh.r_xyz[3 * shore],
		world.mesh.r_xyz[3 * shore + 1],
		world.mesh.r_xyz[3 * shore + 2],
	]
	return {
		baseline: WEATHER_BASELINE.build({ world, location: sea, yearSeconds }),
		shore: {
			region: shore,
			latitudeDeg:
				(Math.asin(Math.max(-1, Math.min(1, xyz[2]))) * 180) / Math.PI,
			xyz,
			springRangeM: tidalRange?.[shore] ?? 0,
			lagDraw: RNG.makeRng(world.params.seed ^ shore)(),
		},
		ice: {
			perennial: world.iceMinMonthly[sea.region] > 0,
			seasonal: world.iceMaxMonthly[sea.region] > 0,
		},
	}
}

async function createContext({
	world,
	revision,
	representatives,
	yearSeconds,
}: CreateLocalWeatherParams): Promise<WeatherContext> {
	const openWater = world.landmarks
		? LANDMARKS.openWaterMask({
				isLand: world.isLand,
				landmarks: world.landmarks,
			})
		: null
	const tidalRange = world.tidalRange ?? null
	const locations = world.provinces
		? PROVINCE_LOCATIONS.build({
				mesh: world.mesh,
				provinces: world.provinces,
				isLand: world.isLand,
				representatives,
				openWater,
				tidalRange,
			})
		: []
	const radiusKm = world.params.planetRadiusKm
	const radiusM = radiusKm * 1000
	const context: WeatherContext = {
		revision,
		seed: world.params.seed,
		radiusKm,
		provinces: [],
		marine: openWater
			? {
					adjOffset: world.mesh.adjOffset,
					adjList: world.mesh.adjList,
					neighborDist: world.mesh.neighborDist,
					r_xyz: world.mesh.r_xyz,
					openWater,
					radiusKm,
					gravityMs2:
						(ORBIT_BODY.gravitationalConstantM3KgS2 *
							MECHANICS.derivePlanetMassKg(radiusKm)) /
						(radiusM * radiusM),
				}
			: null,
	}
	for (let first = 0; first < locations.length; first += 256) {
		for (const location of locations.slice(first, first + 256)) {
			context.provinces.push({
				location,
				baselines: location.samples.map((point) =>
					WEATHER_BASELINE.build({ world, location: point, yearSeconds }),
				),
				marine: location.marine
					? prepareMarine({
							world,
							marine: location.marine,
							tidalRange,
							yearSeconds,
						})
					: null,
			})
		}
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
	return context
}

function evaluateMarine({
	context,
	marine,
	instant,
}: MarineEvaluationParams): MarineSnapshot {
	const values =
		context.marine && marine.baseline.valid
			? WEATHER_REGION.sample({ context, baseline: marine.baseline, instant })
			: null
	return {
		shore: marine.shore,
		waves:
			values && context.marine
				? WEATHER_MARINE.waves({
						field: context.marine,
						sea: marine.baseline.location.region,
						ice: marine.ice,
						values,
					})
				: null,
	}
}

function evaluateProvince({
	weather: { context, province, instant },
	trace,
	includeMarine,
}: ProvinceWeatherEvaluationParams): WeatherSnapshot {
	const prepared = context.provinces[province]
	const samples =
		prepared?.baselines.map((baseline) => {
			const input = { context, baseline, instant }
			const result = trace ? WEATHER_REGION.inspect(input) : null
			if (trace && result)
				trace({
					region: baseline.location.region,
					weight: baseline.location.weight,
					triggers: result.triggers,
				})
			return {
				region: baseline.location.region,
				weight: baseline.location.weight,
				values: result ? result.values : WEATHER_REGION.sample(input),
			}
		}) ?? []

	const values = WEATHER_AGGREGATION.combine({ samples })
	return {
		revision: context.revision,
		province,
		instant,
		status: values ? "ready" : "unavailable",
		reason: values ? null : "No valid climate samples for this province",
		approximateLocation: prepared?.location.approximateLocation ?? true,
		values,
		samples,
		marine:
			includeMarine && prepared?.marine
				? evaluateMarine({ context, marine: prepared.marine, instant })
				: null,
	}
}

function sampleProvince(weather: SampleProvinceWeatherParams): WeatherSnapshot {
	return evaluateProvince({ weather, trace: null, includeMarine: true })
}

function sampleProvinceValues(
	weather: SampleProvinceWeatherParams,
): LocalWeatherValues | null {
	return evaluateProvince({ weather, trace: null, includeMarine: false }).values
}
function inspectProvince(
	weather: SampleProvinceWeatherParams,
): ProvinceWeatherInspection {
	const traces: ProvinceWeatherInspection["traces"] = []
	const snapshot = evaluateProvince({
		weather,
		trace: (sample) => traces.push(sample),
		includeMarine: true,
	})
	return { snapshot, traces }
}
export const LOCAL_WEATHER = {
	createContext,
	sampleProvince,
	sampleProvinceValues,
	inspectProvince,
}
