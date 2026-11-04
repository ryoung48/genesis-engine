import { WEATHER_COMFORT } from "@/model/climate/weather/local/comfort"
import type {
	ResolveWeatherParams,
	SelectWeatherParams,
	WeatherAddParams,
	WeatherBandParams,
	WeatherBranch,
	WeatherChoices,
	WeatherCloudChoiceParams,
	WeatherCondensationParams,
	WeatherConstraintParams,
	WeatherDecision,
	WeatherDecisionInputs,
	WeatherDryShareParams,
	WeatherDryShares,
	WeatherLayeredRegime,
	WeatherLayerParams,
	WeatherLimits,
	WeatherOutcome,
	WeatherOutcomeParams,
	WeatherPhase,
	WeatherPhaseParams,
	WeatherRegime,
	WeatherSystem,
	WeatherWetParams,
	WeightedWeatherEntry,
} from "@/model/climate/weather/local/decision/types"
import type {
	WeatherCloudDescription,
	WeatherPhenomenon,
} from "@/model/climate/weather/local/vocabulary/types"

const precipitationWeights: Record<WeatherPhenomenon, number> = {
	"clear skies": 0,
	cloudy: 0,
	dew: 0,
	frost: 0,
	mist: 0,
	fog: 0,
	"freezing fog": 0,
	"ice fog": 0,
	"ice crystals": 0,
	haze: 0,
	"drifting snow": 0,
	"blowing sand": 0,
	"blowing dust": 0,
	"sand storm": 0,
	"dust storm": 0,
	drizzle: 0.2,
	"freezing drizzle": 0.2,
	"light rain": 1,
	"moderate rain": 3,
	"heavy rain": 10,
	"light showers": 1,
	"rain showers": 3,
	"freezing rain": 1,
	"rain and snow": 1,
	thunderstorm: 5,
	hail: 4,
	tornado: 5,
	thundersnow: 2.5,
	"light snow": 0.2,
	"moderate snow": 1,
	"heavy snow": 2,
	"snow showers": 1,
	"heavy snow showers": 2,
	blizzard: 2.5,
	"tropical storm": 10,
	hurricane: 10,
}
const BAND_FAMILIES: {
	kinds: WeatherPhenomenon[]
	bands: [number, WeatherPhenomenon][]
}[] = [
	{
		kinds: ["drizzle", "light rain", "moderate rain", "heavy rain"],
		bands: [
			[2.5, "light rain"],
			[7.6, "moderate rain"],
			[Infinity, "heavy rain"],
		],
	},
	{
		kinds: ["light showers", "rain showers"],
		bands: [
			[2.5, "light showers"],
			[7.6, "rain showers"],
			[Infinity, "heavy rain"],
		],
	},
	{
		kinds: ["light snow", "moderate snow", "heavy snow"],
		bands: [
			[1, "light snow"],
			[2, "moderate snow"],
			[Infinity, "heavy snow"],
		],
	},
	{
		kinds: ["snow showers"],
		bands: [
			[2, "snow showers"],
			[Infinity, "heavy snow showers"],
		],
	},
]
const SHOWERS: Partial<Record<WeatherPhenomenon, WeatherPhenomenon>> = {
	drizzle: "light showers",
	"light rain": "light showers",
	"moderate rain": "rain showers",
	"light snow": "snow showers",
	"moderate snow": "snow showers",
}
const LIMITS: WeatherLimits = {
	windyMs: 8,
	blowingSnowMs: 13,
	blizzardGustMs: 15.6,
	blizzardVisibilityM: 400,
}
const DRIZZLE_MAX_MMH = 0.5
const SNOW_WET_BULB_C = 1
const WET_BULB_DEPRESSION_SHARE = 1 / 3
const MAX_WET_BULB_DEPRESSION_C = 15
const FREEZING_RAIN_MIN_C = -5
const FREEZING_RAIN_FULL_C = -1
const FREEZING_RAIN_MAX_SHARE = 0.4
const FREEZING_RAIN_ANOMALY_SPAN_C = 8
const MIN_OUTCOME_SHARE = 1e-3
const THUNDERSTORM_MIN_DEW_POINT_C = ((55 - 32) * 5) / 9
const THUNDERSTORM_MAX_DEPRESSION_C = 10
const THUNDERSNOW_SHARE = 0.02
const HAIL_MAX_SHARE = 0.1
const TORNADO_MAX_SHARE = 0.015
const HAIL_ORGANISATION_FLOOR = 0.25
const LAPSE_RATE_C_PER_KM = 6.5
const HAIL_MELT_START_KM = 3.5
const HAIL_MELT_END_KM = 4.5
const ADVECTION_FOG_WIND_MS = 10
const RADIATION_FOG_WIND_MS = 2.5
const ICE_CRYSTALS_MAX_C = -25
const ICE_CRYSTALS_WIND_MS = 5
const SUPERCOOLED_FOG_MIN_C = -10
const CONVECTIVE_RAIN_MIN_C = 15
const COLD_SHOWER_MAX_C = 0
const PARTICLE_ARIDITY = 0.3
const BLOWING_PARTICLE_GUST_MS = 10
const PARTICLE_STORM_GUST_MS = 15
const MAX_STORM_SHARE = 0.9
const STORMY_COVER = 0.95
const RAINY_COVER = 0.9
const OVERCAST_COVER = 0.9
const CLOUDY_COVER = 0.5
const CLEAR_COVER = 0.1
const HAZE_MAX_SHARE = 0.3
const CLOUD_LAYERS: Record<WeatherLayeredRegime, [number, number][]> = {
	overcast: [
		[0.15, 0.45],
		[0.3, 0.45],
		[0.45, 0.4],
		[0.6, 0.3],
	],
	cloudy: [
		[0.3, 0.45],
		[0.45, 0.35],
		[0.55, 0.3],
		[0.65, 0.25],
	],
}
const FRONT_LAYER_SHIFT = 0.5
const FRONT_RAPID_HPA = 2
const HAZE_ARIDITY = 0.5
const HAZE_DRY_MONTH_CHANCE = 0.15
const HAZE_WET_MONTH_CHANCE = 0.3
const HAZE_MAX_HUMIDITY = 80
const FEW_CLOUDS_MIN = 1 / 16
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
function band({
	kind,
	rateMmH,
	stratiform,
}: WeatherBandParams): WeatherPhenomenon {
	if (stratiform && rateMmH < DRIZZLE_MAX_MMH) {
		if (kind === "freezing rain") return "freezing drizzle"
		if (BAND_FAMILIES[0].kinds.includes(kind)) return "drizzle"
	}
	const family = BAND_FAMILIES.find((entry) => entry.kinds.includes(kind))
	return family ? family.bands.find(([limit]) => rateMmH < limit)![1] : kind
}
function precipitationPhase({
	input,
	layered,
}: WeatherPhaseParams): WeatherPhase {
	const depression =
		input.dewPointC === null || !Number.isFinite(input.dewPointC)
			? 0
			: Math.min(
					MAX_WET_BULB_DEPRESSION_C,
					Math.max(0, input.temperatureC - input.dewPointC),
				)
	const wetBulbC = input.temperatureC - depression * WET_BULB_DEPRESSION_SHARE
	const snow = 1 / (1 + Math.exp(wetBulbC - SNOW_WET_BULB_C))
	const freezing = input.temperatureC < 0
	const warmNose =
		layered && freezing
			? FREEZING_RAIN_MAX_SHARE *
				clamp01(
					(input.temperatureC - FREEZING_RAIN_MIN_C) /
						(FREEZING_RAIN_FULL_C - FREEZING_RAIN_MIN_C),
				) *
				clamp01(
					0.5 +
						(input.temperatureC - input.monthlyTemperatureC) /
							FREEZING_RAIN_ANOMALY_SPAN_C,
				)
			: 0
	const liquid = (1 - snow) * (1 - snow)
	return {
		snow: snow * snow * (1 - warmNose),
		mix: 2 * snow * (1 - snow) * (1 - warmNose),
		liquid: liquid + warmNose * (1 - liquid),
		freezing,
	}
}
function layeredCloud({
	regime,
	input,
	draw,
}: WeatherLayerParams): WeatherCloudDescription {
	const p = input.rainChance
	const band = p < 0.15 ? 0 : p < 0.25 ? 1 : p < 0.4 ? 2 : 3
	const [low, middle] = CLOUD_LAYERS[regime][band]
	const shifted =
		FRONT_LAYER_SHIFT *
		low *
		clamp01(-input.pressureTendencyHpa / FRONT_RAPID_HPA)
	const lowShare = low - shifted
	const middleShare = middle + (regime === "overcast" ? shifted : 0)
	if (draw < lowShare)
		return regime === "overcast"
			? band === 3
				? "stratus clouds"
				: "stratocumulus clouds"
			: band === 3
				? "stratocumulus clouds"
				: "cumulus clouds"
	if (draw < lowShare + middleShare)
		return regime === "overcast" ? "altostratus clouds" : "altocumulus clouds"
	return "cirrus clouds"
}
function rainChance(monthlyMm: number): number {
	const amounts = [0, 10, 25, 50, 100, 150, 200, 250],
		chances = [0.06, 0.18, 0.3, 0.42, 0.54, 0.68, 0.8, 0.92]
	for (let i = 1; i < amounts.length; i++)
		if (monthlyMm < amounts[i])
			return (
				chances[i - 1] +
				((chances[i] - chances[i - 1]) *
					(Math.max(0, monthlyMm) - amounts[i - 1])) /
					(amounts[i] - amounts[i - 1])
			)
	return Math.min(1, 0.92 + ((monthlyMm - 250) * 0.12) / 50)
}
function cloud({
	system,
	rainChance: p,
	monthlyTemperatureC,
}: WeatherCloudChoiceParams): WeatherCloudDescription {
	switch (system) {
		case "clear":
			return "clear skies"
		case "overcast":
			return p < 0.25
				? "cirrus clouds"
				: p < 0.4
					? "altostratus clouds"
					: "stratus clouds"
		case "rainy":
			return p < 0.15
				? "altostratus clouds"
				: p >= 0.4 &&
						(monthlyTemperatureC >= CONVECTIVE_RAIN_MIN_C ||
							monthlyTemperatureC < COLD_SHOWER_MAX_C)
					? "cumulus clouds"
					: "stratus clouds"
		case "stormy":
			return p < 0.15 ? "cumulus clouds" : "nimbus clouds"
		case "cloudy":
			return p < 0.15
				? "altocumulus clouds"
				: p >= 0.4
					? "stratocumulus clouds"
					: "cumulus clouds"
	}
}
function constrain({
	kind,
	input,
	quiet,
}: WeatherConstraintParams): WeatherPhenomenon {
	if (precipitationWeights[kind] > 0 && input.meanRateMmH <= 0) return quiet
	if (
		(kind === "thunderstorm" || kind === "hail" || kind === "tornado") &&
		(input.dewPointC === null ||
			input.temperatureC - input.dewPointC >= THUNDERSTORM_MAX_DEPRESSION_C)
	)
		return "heavy rain"
	if (kind === "blizzard" && input.gustMs < LIMITS.blizzardGustMs)
		return "moderate snow"
	return kind
}
function groundSnow(input: WeatherDecisionInputs): WeatherPhenomenon | null {
	if (input.monthlyTemperatureC >= 0 || input.temperatureC >= -0.5) return null
	return input.windSpeedMs >= LIMITS.blowingSnowMs
		? "blizzard"
		: input.windSpeedMs >= LIMITS.windyMs
			? "drifting snow"
			: null
}
function iceSaturated(input: WeatherDecisionInputs): boolean {
	const t = input.temperatureC,
		d = input.dewPointC!
	return (17.62 * d) / (243.12 + d) >= (22.46 * t) / (272.62 + t)
}
function condensation({
	input,
	radiative,
}: WeatherCondensationParams): WeatherPhenomenon | null {
	if (input.dewPointC === null) return null
	const t = (input.temperatureC * 9) / 5 + 32,
		d = input.temperatureC - input.dewPointC,
		wind = input.windSpeedMs,
		surfaceC = radiative ? input.clearSurfaceC : input.surfaceC,
		margin = surfaceC - input.dewPointC
	const iceCrystals =
		radiative &&
		input.temperatureC <= ICE_CRYSTALS_MAX_C &&
		wind <= ICE_CRYSTALS_WIND_MS &&
		iceSaturated(input)
	if (radiative && input.daylight) return iceCrystals ? "ice crystals" : null
	if (
		d <= 0.5 &&
		wind <= (radiative ? RADIATION_FOG_WIND_MS : ADVECTION_FOG_WIND_MS)
	) {
		if (t >= 32) return "fog"
		if (input.temperatureC >= SUPERCOOLED_FOG_MIN_C) return "freezing fog"
		if (t < -30 && wind <= RADIATION_FOG_WIND_MS) return "ice fog"
	}
	if (iceCrystals) return "ice crystals"
	const mist = t >= 32 && wind <= LIMITS.windyMs && d <= 2 ? "mist" : null
	if (!radiative && mist) return mist
	if (surfaceC > 0) return margin <= 0 ? "dew" : mist
	return margin <= 1 ? "frost" : mist
}
function hazeShare(input: WeatherDecisionInputs): number {
	const humidity = WEATHER_COMFORT.relativeHumidity({
		temperatureC: input.temperatureC,
		dewPointC: input.dewPointC,
	})
	if (humidity === null || humidity >= HAZE_MAX_HUMIDITY) return 0
	return (
		HAZE_MAX_SHARE *
		clamp01((HAZE_ARIDITY - input.aridity) / HAZE_ARIDITY) *
		clamp01(
			(HAZE_WET_MONTH_CHANCE - input.rainChance) /
				(HAZE_WET_MONTH_CHANCE - HAZE_DRY_MONTH_CHANCE),
		)
	)
}
function outcomes({
	system,
	cloud: c,
	input,
}: WeatherOutcomeParams): WeatherOutcome[] {
	const p = input.rainChance,
		quiet: WeatherPhenomenon = c === "clear skies" ? "clear skies" : "cloudy"
	const add = ({ kind, weight, convective }: WeatherAddParams) => {
		const constrained = constrain({ kind, input, quiet })
		return {
			kind: convective ? (SHOWERS[constrained] ?? constrained) : constrained,
			weight,
			water: precipitationWeights[constrained],
		}
	}
	const layeredPhase = precipitationPhase({ input, layered: true })
	const showerPhase = precipitationPhase({ input, layered: false })
	const freezingLevelKm =
		Math.max(0, input.monthlyTemperatureC) / LAPSE_RATE_C_PER_KM
	const hail =
		HAIL_MAX_SHARE *
		(input.land ? 1 : 0) *
		Math.max(0, 1 + input.convectiveBias) *
		Math.min(
			1,
			HAIL_ORGANISATION_FLOOR +
				(1 - HAIL_ORGANISATION_FLOOR) *
					Math.max(input.stormTrack, input.severeRisk),
		) *
		clamp01(
			(HAIL_MELT_END_KM - freezingLevelKm) /
				(HAIL_MELT_END_KM - HAIL_MELT_START_KM),
		)
	const tornado =
		TORNADO_MAX_SHARE *
		(input.land ? 1 : 0) *
		input.severeRisk *
		Math.max(0, 1 + input.convectiveBias)
	const wet = ({ rain, snow, weight, convective }: WeatherWetParams) => {
		const phase = convective ? showerPhase : layeredPhase
		const thundersnow = snow === "blizzard" ? THUNDERSNOW_SHARE : 0
		return [
			add({
				kind: snow,
				weight: weight * phase.snow * (1 - thundersnow),
				convective,
			}),
			add({
				kind: "thundersnow",
				weight: weight * phase.snow * thundersnow,
				convective: false,
			}),
			add({ kind: "rain and snow", weight: weight * phase.mix, convective }),
			add({
				kind: phase.freezing ? "freezing rain" : rain,
				weight: weight * phase.liquid,
				convective: convective && !phase.freezing,
			}),
		].filter((outcome) => outcome.weight >= MIN_OUTCOME_SHARE * weight)
	}
	const calm = (weight: number) =>
		add({ kind: quiet, weight, convective: false })
	if (system === "stormy") {
		const chance = Math.min(1, 2 * p)
		if (c === "nimbus clouds")
			return [
				calm(1 - chance),
				...(input.dewPointC !== null &&
				input.dewPointC >= THUNDERSTORM_MIN_DEW_POINT_C
					? [
							add({
								kind: "thunderstorm",
								weight: chance * (1 - hail - tornado),
								convective: false,
							}),
							...(hail > 0
								? [
										add({
											kind: "hail",
											weight: chance * hail,
											convective: false,
										}),
									]
								: []),
							...(tornado > 0
								? [
										add({
											kind: "tornado",
											weight: chance * tornado,
											convective: false,
										}),
									]
								: []),
						]
					: wet({
							rain: "heavy rain",
							snow: "blizzard",
							weight: chance,
							convective: false,
						})),
			]
		if (c === "cumulus clouds")
			return [
				calm(1 - chance),
				...wet({
					rain: "light rain",
					snow: "light snow",
					weight: chance,
					convective: true,
				}),
			]
	}
	if (system === "rainy") {
		if (c === "altostratus clouds")
			return [
				calm(1 - p),
				...wet({
					rain: "light rain",
					snow: "light snow",
					weight: p,
					convective: false,
				}),
			]
		if (c === "stratus clouds")
			return [
				...wet({
					rain: "light rain",
					snow: "light snow",
					weight: 1 - p,
					convective: false,
				}),
				...wet({
					rain: "heavy rain",
					snow: "moderate snow",
					weight: p,
					convective: false,
				}),
			]
		if (c === "cumulus clouds")
			return [
				...wet({
					rain: "drizzle",
					snow: "light snow",
					weight: 1 - p,
					convective: true,
				}),
				...wet({
					rain: "moderate rain",
					snow: "moderate snow",
					weight: p,
					convective: true,
				}),
			]
	}
	if (system === "windy") {
		const snow = groundSnow(input)
		if (snow) return [{ kind: snow, weight: 1, water: 0 }]
		if (
			input.particleSource !== null &&
			input.aridity < PARTICLE_ARIDITY &&
			input.gustMs >= BLOWING_PARTICLE_GUST_MS
		) {
			const storm = input.gustMs >= PARTICLE_STORM_GUST_MS
			const kind: WeatherPhenomenon =
				input.particleSource === "sand"
					? storm
						? "sand storm"
						: "blowing sand"
					: storm
						? "dust storm"
						: "blowing dust"
			return [{ kind, weight: 1, water: 0 }]
		}
	}
	const haze = hazeShare(input)
	return system === "stormy" || system === "rainy" || haze <= 0
		? [calm(1)]
		: [{ kind: "haze", weight: haze, water: 0 }, calm(1 - haze)]
}
function dryShares({
	cloudMean,
	wet,
	wetCover,
	overcastCover,
}: WeatherDryShareParams): WeatherDryShares {
	if (cloudMean === null)
		return {
			clear: 0.64 / 0.88,
			overcast: 0.12 / 0.88,
			cloudy: 0.12 / 0.88,
			wetScale: 1,
			dryScale: 1,
			clearScale: 1,
		}
	const dry = wet < 1 ? (cloudMean - wetCover) / (1 - wet) : 0
	if (dry <= CLEAR_COVER)
		return {
			clear: 1,
			overcast: 0,
			cloudy: 0,
			wetScale: dry < 0 && wetCover > 0 ? Math.min(1, cloudMean / wetCover) : 1,
			dryScale: 1,
			clearScale: Math.max(0, dry) / CLEAR_COVER,
		}
	const mixed = (overcastCover + CLOUDY_COVER) / 2
	if (dry <= mixed) {
		const clouded = (dry - CLEAR_COVER) / (mixed - CLEAR_COVER)
		return {
			clear: 1 - clouded,
			overcast: clouded / 2,
			cloudy: clouded / 2,
			wetScale: 1,
			dryScale: 1,
			clearScale: 1,
		}
	}
	const overcast =
		overcastCover > CLOUDY_COVER
			? Math.min(1, (dry - CLOUDY_COVER) / (overcastCover - CLOUDY_COVER))
			: 0
	return {
		clear: 0,
		overcast,
		cloudy: 1 - overcast,
		wetScale: 1,
		dryScale: dry / (overcast * overcastCover + (1 - overcast) * CLOUDY_COVER),
		clearScale: 1,
	}
}
function prepare(input: WeatherDecisionInputs): WeatherChoices {
	const p = clamp01(input.rainChance)
	const wet = input.cloudMean === 0 && input.meanRateMmH === 0 ? 0 : p
	const storm = Math.min(
		MAX_STORM_SHARE,
		Math.max(
			0,
			Math.min(0.6, Math.max(0.25, 0.25 + 0.015 * input.monthlyTemperatureC)) *
				(1 + input.convectiveBias),
		),
	)
	const cloudOf = (system: WeatherRegime) =>
		cloud({
			system,
			rainChance: p,
			monthlyTemperatureC: input.monthlyTemperatureC,
		})
	const overcastCover = OVERCAST_COVER
	const shares = dryShares({
		cloudMean: input.cloudMean,
		wet,
		wetCover: wet * (storm * STORMY_COVER + (1 - storm) * RAINY_COVER),
		overcastCover,
	})
	const regimes: [WeatherRegime, number, number][] = [
		["stormy", wet * storm, STORMY_COVER * shares.wetScale],
		["rainy", wet * (1 - storm), RAINY_COVER * shares.wetScale],
		[
			"overcast",
			(1 - wet) * shares.overcast,
			Math.min(1, overcastCover * shares.dryScale),
		],
		[
			"cloudy",
			(1 - wet) * shares.cloudy,
			Math.min(1, CLOUDY_COVER * shares.dryScale),
		],
		["clear", (1 - wet) * shares.clear, CLEAR_COVER * shares.clearScale],
	]
	const branches = regimes.map(([regime, weight, cover]): WeatherBranch => {
		const c = cloudOf(regime)
		const base = { regime, cloud: c, weight, cover }
		if (regime === "stormy" || regime === "rainy")
			return {
				...base,
				system: regime,
				wetBranch: true,
				outcomes: outcomes({ system: regime, cloud: c, input }),
			}
		const kind = condensation({ input, radiative: regime === "clear" })
		const foggy =
			kind === "fog" || kind === "freezing fog" || kind === "ice fog"
		if (!foggy && input.windSpeedMs >= LIMITS.windyMs)
			return {
				...base,
				system: "windy",
				wetBranch: false,
				outcomes: outcomes({ system: "windy", cloud: c, input }),
			}
		return {
			...base,
			cloud: foggy && regime !== "clear" && cover > 0 ? "stratus clouds" : c,
			system: foggy ? "fog" : regime,
			wetBranch: false,
			outcomes: kind
				? [{ kind, weight: 1, water: 0 }]
				: outcomes({ system: regime, cloud: c, input }),
		}
	})
	const expected = (value: (outcome: WeatherOutcome) => number) =>
		branches.reduce(
			(sum, b) =>
				sum +
				b.weight * b.outcomes.reduce((s, o) => s + o.weight * value(o), 0),
			0,
		)
	const expectedWater = expected((o) => o.water)
	const wetProbability = expected((o) => (o.water > 0 ? 1 : 0))
	const wetHourRate = Math.min(
		4,
		Math.max(0.3, 0.6 * 1.065 ** input.monthlyTemperatureC),
	)
	const acceptance =
		wetProbability > 0
			? Math.min(
					1,
					Math.min(0.3, input.meanRateMmH / wetHourRate) / wetProbability,
				)
			: 0
	return {
		branches,
		expectedWater,
		wetProbability,
		acceptance,
		wetRateMmH:
			acceptance > 0 ? input.meanRateMmH / (acceptance * wetProbability) : 0,
		input,
	}
}
function select<T extends WeightedWeatherEntry>({
	entries,
	draw,
}: SelectWeatherParams<T>): T {
	entries = entries.filter((entry) => entry.weight > 0)
	const sum = entries.reduce((s, e) => s + e.weight, 0)
	let remaining = Math.max(0, Math.min(1 - Number.EPSILON, draw)) * sum
	for (const entry of entries) {
		remaining -= entry.weight
		if (remaining < 0) return entry
	}
	return entries[entries.length - 1]
}
function resolve({ choices, draws }: ResolveWeatherParams): WeatherDecision {
	const branch = select({ entries: choices.branches, draw: draws.branch })
	const outcome = select({ entries: branch.outcomes, draw: draws.event })
	const clearRegime = branch.cloud === "clear skies"
	const mean = branch.cover
	const clouded = !clearRegime || mean > 0
	const thickness = 1 - draws.precipitation
	const drawn =
		mean < 0.5 ? 2 * mean * thickness : 1 - 2 * (1 - mean) * (1 - thickness)
	const cloudCover =
		choices.input.cloudMean === null || (!clearRegime && clouded && mean === 0)
			? null
			: !clouded || (clearRegime && drawn < FEW_CLOUDS_MIN)
				? 0
				: drawn
	const accepted = outcome.water > 0 && draws.precipitation < choices.acceptance
	const intensity = accepted
		? -Math.log(Math.max(1e-6, draws.precipitation / choices.acceptance))
		: 0
	const rainRateMmH = accepted
		? ((outcome.water * choices.wetProbability) / choices.expectedWater) *
			choices.wetRateMmH *
			intensity
		: 0
	const layeredRegime: WeatherLayeredRegime | null =
		branch.system === "fog"
			? null
			: branch.regime === "cloudy"
				? "cloudy"
				: branch.regime === "overcast" ||
						(branch.regime === "rainy" && rainRateMmH === 0)
					? "overcast"
					: null
	const baseCloud = layeredRegime
		? layeredCloud({
				regime: layeredRegime,
				input: choices.input,
				draw: draws.layer,
			})
		: branch.cloud
	const cloud: WeatherCloudDescription =
		clearRegime && cloudCover
			? choices.input.daylight
				? "cumulus clouds"
				: "cirrus clouds"
			: baseCloud === "cumulus clouds" &&
					!choices.input.daylight &&
					rainRateMmH === 0
				? "stratocumulus clouds"
				: baseCloud
	const kind =
		outcome.water > 0 && !accepted
			? branch.cloud === "clear skies"
				? "clear skies"
				: "cloudy"
			: band({
					kind: outcome.kind,
					rateMmH: rainRateMmH,
					stratiform: branch.cloud === "stratus clouds",
				})
	const windy =
		branch.wetBranch &&
		(kind === "cloudy" || kind === "clear skies") &&
		choices.input.windSpeedMs >= LIMITS.windyMs
	return {
		regime: branch.regime,
		system: windy ? "windy" : branch.system,
		cloud,
		kind: (windy ? groundSnow(choices.input) : null) ?? kind,
		rainRateMmH,
		cloudCover,
	}
}
function inventory(): WeatherSystem[] {
	return ["clear", "cloudy", "overcast", "fog", "rainy", "stormy", "windy"]
}
function limits(): WeatherLimits {
	return { ...LIMITS }
}
export const WEATHER_DECISION = {
	prepare,
	resolve,
	rainChance,
	inventory,
	band,
	limits,
}
