import type {
	ResolveWeatherParams,
	SelectWeatherParams,
	WeatherBranch,
	WeatherChoices,
	WeatherCloudChoiceParams,
	WeatherCondensationParams,
	WeatherConstraintParams,
	WeatherDecision,
	WeatherDecisionInputs,
	WeatherDryShareParams,
	WeatherDryShares,
	WeatherOutcome,
	WeatherOutcomeParams,
	WeatherRegime,
	WeatherSystem,
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
	"thin mist": 0,
	mist: 0,
	fog: 0,
	"cold surface": 0,
	"thin frost": 0,
	frost: 0,
	rime: 0,
	"ice fog": 0,
	"sand storm": 0,
	"dust storm": 0,
	drizzle: 0.2,
	"spattering rain": 1,
	"pelting rain": 10,
	"rain shower": 3,
	"quiet downpour": 10,
	thunderstorm: 5,
	sleet: 1,
	dusting: 0.1,
	"tiny flakes": 0.1,
	"ice crystals": 0.05,
	"snow flurry": 0.3,
	snowfall: 1,
	blizzard: 2.5,
}
const STORMY_COVER = 0.95
const RAINY_COVER = 0.9
const OVERCAST_COVER = 0.9
const CLOUDY_COVER = 0.5
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
}: WeatherCloudChoiceParams): WeatherCloudDescription {
	switch (system) {
		case "clear":
			return "clear skies"
		case "overcast":
			return p < 0.15
				? "haze"
				: p < 0.25
					? "cirrus clouds"
					: p < 0.4
						? "altostratus clouds"
						: "stratus clouds"
		case "rainy":
			return p < 0.15
				? "altostratus clouds"
				: p >= 0.4
					? "cumulus clouds"
					: "stratus clouds"
		case "stormy":
			return p < 0.15 ? "cumulus clouds" : "nimbus clouds"
		case "cloudy":
			return p < 0.15
				? "altocumulus clouds"
				: p >= 0.4
					? "altostratus clouds"
					: "cumulus clouds"
	}
}
function constrain({
	kind,
	input,
	quiet,
}: WeatherConstraintParams): WeatherPhenomenon {
	if ((precipitationWeights[kind] ?? 0) > 0 && input.meanRateMmH <= 0)
		return quiet
	const d =
		input.dewPointC === null ? Infinity : input.temperatureC - input.dewPointC
	if (
		kind === "thunderstorm" &&
		(input.dewPointC === null || input.dewPointC <= 0 || d >= 10)
	)
		return "pelting rain"
	if (kind === "blizzard" && input.gustMs < 15.6) return "snowfall"
	return kind
}
function blowingSnow(input: WeatherDecisionInputs): boolean {
	return (
		input.monthlyTemperatureC < 0 &&
		input.temperatureC < -0.5 &&
		input.windSpeedMs >= 13
	)
}
function condensation({
	input,
	radiative,
}: WeatherCondensationParams): WeatherPhenomenon | null {
	if (
		input.dewPointC === null ||
		(radiative ? input.daylight : input.afternoon)
	)
		return null
	const t = (input.temperatureC * 9) / 5 + 32,
		d = input.temperatureC - input.dewPointC,
		wind = input.windSpeedMs,
		surfaceC = radiative ? input.clearSurfaceC : input.surfaceC,
		margin = surfaceC - input.dewPointC
	if (d <= 0.5 && wind <= (radiative ? 2.5 : 5))
		return t < -30 ? "ice fog" : t < 32 && wind >= 1.6 ? "rime" : "fog"
	const mist =
		t >= 32 && wind <= 8 && d <= 2 ? (d <= 1 ? "mist" : "thin mist") : null
	if (!radiative && mist) return mist
	if (surfaceC > 0) return margin <= 0 ? "dew" : mist
	if (margin <= 0) return "frost"
	if (margin <= 1) return "thin frost"
	return radiative && margin <= 2 ? "cold surface" : mist
}
function outcomes({
	system,
	cloud: c,
	input,
}: WeatherOutcomeParams): WeatherOutcome[] {
	const p = input.rainChance,
		t = (input.temperatureC * 9) / 5 + 32,
		quiet: WeatherPhenomenon = c === "clear skies" ? "clear skies" : "cloudy"
	const add = (kind: WeatherPhenomenon, weight: number): WeatherOutcome => {
		const constrained = constrain({ kind, input, quiet })
		return {
			kind: constrained,
			weight,
			water: precipitationWeights[constrained] ?? 0,
		}
	}
	if (system === "stormy") {
		const chance = Math.min(1, 2 * p)
		if (c === "nimbus clouds")
			return [
				add(quiet, 1 - chance),
				add(
					t < 31
						? "blizzard"
						: t <= 34
							? "sleet"
							: t <= 69
								? "quiet downpour"
								: "thunderstorm",
					chance,
				),
			]
		if (c === "cumulus clouds")
			return [
				add(quiet, 1 - chance),
				add(t <= 32 ? "ice crystals" : "spattering rain", chance),
			]
	}
	if (system === "rainy") {
		if (c === "altostratus clouds")
			return [
				add(quiet, 1 - p),
				add(t <= 32 ? "ice crystals" : "spattering rain", p),
			]
		if (c === "stratus clouds")
			return [
				add(t <= 32 ? "tiny flakes" : "spattering rain", 1 - p),
				add(t <= 32 ? "snow flurry" : "pelting rain", p),
			]
		if (c === "cumulus clouds")
			return [
				add(t <= 32 ? "dusting" : "drizzle", 1 - p),
				add(t <= 32 ? "snowfall" : "rain shower", p),
			]
	}
	if (system === "windy" && blowingSnow(input))
		return [{ kind: "blizzard", weight: 1, water: 0 }]
	if (
		system === "windy" &&
		input.particleSource !== null &&
		input.aridity < 0.3 &&
		input.gustMs >= 15
	)
		return [
			add(input.particleSource === "sand" ? "sand storm" : "dust storm", 1),
		]
	return [add(quiet, 1)]
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
		}
	const dry = wet < 1 ? (cloudMean - wetCover) / (1 - wet) : 0
	if (dry <= 0)
		return {
			clear: 1,
			overcast: 0,
			cloudy: 0,
			wetScale: wetCover > 0 ? Math.min(1, cloudMean / wetCover) : 1,
			dryScale: 1,
		}
	const mixed = (overcastCover + CLOUDY_COVER) / 2
	if (dry <= mixed)
		return {
			clear: 1 - dry / mixed,
			overcast: dry / mixed / 2,
			cloudy: dry / mixed / 2,
			wetScale: 1,
			dryScale: 1,
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
	}
}
function prepare(input: WeatherDecisionInputs): WeatherChoices {
	const p = Math.max(0, Math.min(1, input.rainChance))
	const wet = input.cloudMean === 0 && input.meanRateMmH === 0 ? 0 : p
	const storm = Math.min(
		0.6,
		Math.max(0.25, 0.25 + 0.015 * input.monthlyTemperatureC),
	)
	const cloudOf = (system: WeatherRegime) => cloud({ system, rainChance: p })
	const overcastCover = cloudOf("overcast") === "haze" ? 0 : OVERCAST_COVER
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
		["clear", (1 - wet) * shares.clear, 0],
	]
	const branches = regimes.map(([regime, weight, cover]): WeatherBranch => {
		const c = cloudOf(regime)
		const wetBranch = regime === "stormy" || regime === "rainy"
		if (wetBranch || input.windSpeedMs >= 8) {
			const system = wetBranch ? regime : "windy"
			return {
				system,
				wetBranch,
				cloud: c,
				weight,
				cover,
				outcomes: outcomes({ system, cloud: c, input }),
			}
		}
		const kind = condensation({ input, radiative: regime === "clear" })
		return {
			system:
				kind === "fog" || kind === "rime" || kind === "ice fog"
					? "fog"
					: regime,
			wetBranch,
			cloud: c,
			weight,
			cover,
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
	const clouded = branch.cloud !== "clear skies" && branch.cloud !== "haze"
	const thickness = 1 - draws.precipitation
	const mean = branch.cover
	const cloudCover =
		choices.input.cloudMean === null || (clouded && mean === 0)
			? null
			: clouded
				? mean < 0.5
					? 2 * mean * thickness
					: 1 - 2 * (1 - mean) * (1 - thickness)
				: 0
	const accepted = outcome.water > 0 && draws.precipitation < choices.acceptance
	const intensity = accepted
		? -Math.log(Math.max(1e-6, draws.precipitation / choices.acceptance))
		: 0
	const kind =
		outcome.water > 0 && !accepted
			? branch.cloud === "clear skies"
				? "clear skies"
				: "cloudy"
			: outcome.kind
	const windy =
		branch.wetBranch &&
		(kind === "cloudy" || kind === "clear skies") &&
		choices.input.windSpeedMs >= 8
	return {
		system: windy ? "windy" : branch.system,
		cloud: branch.cloud,
		kind: windy && blowingSnow(choices.input) ? "blizzard" : kind,
		rainRateMmH: accepted
			? ((outcome.water * choices.wetProbability) / choices.expectedWater) *
				choices.wetRateMmH *
				intensity
			: 0,
		cloudCover,
	}
}
function inventory(): WeatherSystem[] {
	return ["clear", "cloudy", "overcast", "fog", "rainy", "stormy", "windy"]
}
export const WEATHER_DECISION = { prepare, resolve, rainChance, inventory }
