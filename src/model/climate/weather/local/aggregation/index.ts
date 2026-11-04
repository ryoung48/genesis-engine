import type { CloudOccurrence } from "@/model/climate/weather/local/clouds/types"
import type {
	AggregateWeatherParams,
	ConditionOccurrence,
	LocalWeatherValues,
	WeatherPartition,
} from "@/model/climate/weather/local/types"

function combine({
	samples,
}: AggregateWeatherParams): LocalWeatherValues | null {
	if (
		!samples.length ||
		samples.some((sample) => sample.weight > 0 && sample.values === null)
	)
		return null
	const valid = samples.filter(
		(sample) => sample.weight > 0 && sample.values !== null,
	)
	const first = valid[0]?.values
	if (!first) return null
	const mean = (
		key:
			| "temperatureC"
			| "temperatureNormalC"
			| "rainRateMmH"
			| "windU"
			| "windV"
			| "pressureTendencyHpa",
	) =>
		valid.reduce(
			(sum, sample) => sum + sample.weight * (sample.values?.[key] ?? 0),
			0,
		)
	const rainRateMmH = mean("rainRateMmH")
	const partition = (phase: keyof WeatherPartition) =>
		valid.reduce(
			(sum, sample) =>
				sum +
				sample.weight *
					sample.values!.rainRateMmH *
					sample.values!.precipitation[phase],
			0,
		) / (rainRateMmH || 1)
	const windU = mean("windU")
	const windV = mean("windV")
	const windSpeedMs = Math.hypot(windU, windV)
	const allCloud = valid.every((sample) => sample.values?.cloudCover !== null)
	const clouds = new Map<string, CloudOccurrence>()
	const conditions = new Map<string, ConditionOccurrence>()
	for (const sample of valid) {
		for (const occurrence of sample.values?.clouds ?? []) {
			const previous = clouds.get(occurrence.genus)
			clouds.set(occurrence.genus, {
				...occurrence,
				cover: (previous?.cover ?? 0) + occurrence.cover * sample.weight,
			})
		}
		for (const occurrence of sample.values?.conditions ?? []) {
			const previous = conditions.get(occurrence.kind)
			conditions.set(occurrence.kind, {
				...occurrence,
				share: (previous?.share ?? 0) + sample.weight * occurrence.share,
			})
		}
	}
	const cloudList = allCloud
		? [...clouds.values()]
				.filter((cloud) => cloud.cover > 0)
				.sort(
					(a, b) =>
						b.cover - a.cover ||
						(a.genus < b.genus ? -1 : a.genus > b.genus ? 1 : 0),
				)
		: null
	const conditionList = [...conditions.values()].sort(
		(a, b) => b.share - a.share || a.kind.localeCompare(b.kind),
	)
	const candidates =
		rainRateMmH > 0
			? valid.filter((sample) => sample.values!.rainRateMmH > 0)
			: valid
	const primary = candidates.reduce((best, sample) => {
		const score =
			rainRateMmH > 0
				? sample.weight * sample.values!.rainRateMmH
				: (conditions.get(sample.values!.dominant!)?.share ?? 0)
		const bestScore =
			rainRateMmH > 0
				? best.weight * best.values!.rainRateMmH
				: (conditions.get(best.values!.dominant!)?.share ?? 0)
		return score > bestScore ? sample : best
	}).values!
	const cloudiest = valid.reduce((best, sample) =>
		sample.weight * (sample.values!.cloudCover ?? 0) >
		best.weight * (best.values!.cloudCover ?? 0)
			? sample
			: best,
	).values!
	const primaryClear = primary.cloudDescription === "clear skies"
	const cloudDescription = !allCloud
		? null
		: primaryClear && (cloudiest.cloudCover ?? 0) > 0
			? cloudiest.cloudDescription
			: primary.cloudDescription

	return {
		...first,
		regime: primary.regime,
		system: primary.system,
		particleSource: primary.particleSource,
		cloudDescription,
		temperatureC: mean("temperatureC"),
		visibilityM: Math.min(...valid.map((sample) => sample.values!.visibilityM)),
		precipitation: {
			liquid: partition("liquid"),
			snow: partition("snow"),
			ice: partition("ice"),
		},
		temperatureNormalC: mean("temperatureNormalC"),
		pressureTendencyHpa: mean("pressureTendencyHpa"),
		rainRateMmH,
		windU,
		windV,
		windSpeedMs,
		windDirectionDeg:
			windSpeedMs === 0
				? null
				: ((Math.atan2(-windU, -windV) * 180) / Math.PI + 360) % 360,
		gustMs: Math.max(...valid.map((sample) => sample.values?.gustMs ?? 0)),
		dewPointC: valid.every((sample) => sample.values?.dewPointC !== null)
			? valid.reduce(
					(sum, sample) =>
						sum + sample.weight * (sample.values?.dewPointC ?? 0),
					0,
				)
			: null,
		cloudCover: allCloud
			? valid.reduce(
					(sum, sample) =>
						sum + sample.weight * (sample.values?.cloudCover ?? 0),
					0,
				)
			: null,
		clouds: cloudList,
		conditions: conditionList,
		dominant: primary.dominant,
	}
}

export const WEATHER_AGGREGATION = { combine }
