import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import type {
	BuildWeatherBaselineParams,
	SampleMonthlyWeatherParams,
	WeatherBaseline,
	WeatherRainRateParams,
} from "@/model/climate/weather/local/baseline/types"

function monthly({ values, phase }: SampleMonthlyWeatherParams): number {
	const position = phase * 12 - 0.5
	const month = Math.floor(position)
	const f = position - month
	const a = ((month % 12) + 12) % 12
	return values[a] * (1 - f) + values[(a + 1) % 12] * f
}

function build({
	world,
	location,
	yearSeconds,
}: BuildWeatherBaselineParams): WeatherBaseline {
	const N = world.mesh.numRegions
	const r = location.region
	const field = (values: ArrayLike<number>) =>
		Float32Array.from({ length: 12 }, (_, m) => values[m * N + r])
	const temperature = field(world.climate.temperature_monthly)
	const ranges = world.dtr_monthly ? field(world.dtr_monthly) : null
	const dtr = ranges?.every(Number.isFinite) ? ranges : null
	const rain = field(world.rainfall.monthly)
	const windU = world.windMonthly
		? field(world.windMonthly.u)
		: new Float32Array(12).fill(world.wind.windU[r] * world.wind.windSpeed[r])
	const windV = world.windMonthly
		? field(world.windMonthly.v)
		: new Float32Array(12).fill(world.wind.windV[r] * world.wind.windSpeed[r])
	const annualPet = world.climate.pet_monthly
		? field(world.climate.pet_monthly).reduce((a, b) => a + b, 0)
		: 0
	const annualRain = rain.reduce((a, b) => a + b, 0)
	const aridity = annualPet > 0 ? Math.min(1, annualRain / annualPet) : 1
	const dewPoint = dtr
		? Float32Array.from(temperature, (temp, m) => {
				const rh = HUMIDITY.relativeHumidityFromTempRange({
					meanTempC: temp,
					dtrC: dtr[m],
					annualAridity: aridity,
					annualRainfallMm: annualRain,
					distFromOceanKm: world.oceanDist?.[r] ?? 0,
				})
				return rh > 0
					? HUMIDITY.dewPointFromVaporPressureKpa(
							(HUMIDITY.saturationVaporPressureKpa(temp) * rh) / 100,
						)
					: -Infinity
			})
		: null
	const cloud = world.climate.cloud_cover_monthly
		? field(world.climate.cloud_cover_monthly)
		: null
	const slopes = new Float64Array(12)
	for (let i = 0; i < 12; i++) {
		const before = (rain[(i + 11) % 12] * 12) / yearSeconds
		const after = (rain[i] * 12) / yearSeconds
		slopes[i] = before > 0 && after > 0 ? 2 / (1 / before + 1 / after) : 0
	}
	const bare =
		(world.vegetation[r] === 1 || world.vegetation[r] === 2) &&
		world.isLand[r] !== 0 &&
		world.topography?.[r] !== 6
	return {
		location,
		temperature,
		dtr,
		dewPoint,
		rain,
		rainSlopes: slopes,
		windU,
		windV,
		cloud: cloud && cloud.every(Number.isFinite) ? cloud : null,
		isLand: world.isLand[r] !== 0,
		aridity,
		bare,
		particleSource: bare ? (world.vegetation[r] === 1 ? "sand" : "dust") : null,
		valid:
			(world.params.pressure ?? 1) > 0 &&
			temperature.every(Number.isFinite) &&
			rain.every((value) => Number.isFinite(value) && value >= 0) &&
			windU.every(Number.isFinite) &&
			windV.every(Number.isFinite),
	}
}

function rainRate({
	baseline,
	phase,
	yearSeconds,
}: WeatherRainRateParams): number {
	const position = (((phase % 1) + 1) % 1) * 12
	const month = Math.min(11, Math.floor(position))
	const f = position - month
	const duration = yearSeconds / 12
	const total = baseline.rain[month]
	const left = baseline.rainSlopes[month]
	const right = baseline.rainSlopes[(month + 1) % 12]
	return (
		Math.max(
			0,
			((6 * f - 6 * f * f) * total) / duration +
				(3 * f * f - 4 * f + 1) * left +
				(3 * f * f - 2 * f) * right,
		) * 3600
	)
}

export const WEATHER_BASELINE = { build, monthly, rainRate }
