import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	LocalSolarParams,
	LocalSolarState,
	ResolveWeatherClockParams,
	SelectWeatherClockParams,
	ShiftWeatherInstantParams,
	WeatherClockRates,
	WeatherClockSelection,
	WeatherEclipticParams,
	WeatherEclipticState,
	WeatherInstant,
	WeatherSeasonParams,
} from "@/model/climate/weather/local/clock/types"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { CLIMATEV2_LOCKED_ORBIT } from "@/model/climatev2/orbit/locked"
import type { GenesisParams } from "@/model/pipelines/types"

const orbitalTables = new WeakMap<
	GenesisParams,
	ReturnType<typeof CLIMATEV2_LOCKED_ORBIT.computeDailyLockedOrbit>
>()

const clockRates = new WeakMap<GenesisParams, WeatherClockRates>()
const yearLengths = new WeakMap<GenesisParams, number>()

const YEAR_SECONDS = 3.156e7
const TAU = 2 * Math.PI
const wrap = (value: number) => ((value % 1) + 1) % 1

function tableFor(params: GenesisParams) {
	let table = orbitalTables.get(params)
	if (!table) {
		table = CLIMATEV2_LOCKED_ORBIT.computeDailyLockedOrbit(params)
		orbitalTables.set(params, table)
	}
	return table
}

function ecliptic({
	params,
	seconds,
}: WeatherEclipticParams): WeatherEclipticState {
	let yearSeconds = yearLengths.get(params)
	if (yearSeconds === undefined) {
		const orbit =
			params.tideLock?.type === "solar"
				? CLIMATEV2_ORBIT.lockedFromParams(params)
				: CLIMATEV2_ORBIT.fromParams(params)
		yearSeconds = orbit.yearScale * YEAR_SECONDS
		yearLengths.set(params, yearSeconds)
	}
	const table = tableFor(params)
	const position = wrap(seconds / yearSeconds) * table.solarLongitude.length
	const day = Math.floor(position),
		fraction = position - day
	const next = (day + 1) % table.solarLongitude.length
	const a = table.solarLongitude[day]
	const difference =
		((table.solarLongitude[next] - a + 3 * Math.PI) % TAU) - Math.PI
	return {
		solarLongitudeRad: a + difference * fraction,
		starDistanceM:
			(table.distance[day] * (1 - fraction) + table.distance[next] * fraction) *
			params.orbitalDistanceAU *
			ORBIT_BODY.astronomicalUnitM,
		yearSeconds,
		day,
		next,
		fraction,
		librationRad:
			table.libration[day] * (1 - fraction) +
			table.libration[next] * fraction -
			table.libration[0],
	}
}

function rates(params: GenesisParams): WeatherClockRates {
	const previous = clockRates.get(params)
	if (previous) return previous
	const orbit =
		params.tideLock?.type === "solar"
			? CLIMATEV2_ORBIT.lockedFromParams(params)
			: CLIMATEV2_ORBIT.fromParams(params)
	const yearSeconds = orbit.yearScale * YEAR_SECONDS
	const table = tableFor(params)
	const count = table.solarLongitude.length
	const dt = yearSeconds / count
	const turn = (value: number) => ((value + 3 * Math.PI) % TAU) - Math.PI
	let speed = 0,
		angular = 0,
		libration = 0,
		nearest = Infinity
	for (let day = 0; day < count; day++) {
		const next = (day + 1) % count
		const change = Math.abs(
			turn(table.solarLongitude[next] - table.solarLongitude[day]),
		)
		const radius = Math.max(table.distance[day], table.distance[next])
		angular = Math.max(angular, change / dt)
		speed = Math.max(
			speed,
			Math.hypot(radius * change, table.distance[next] - table.distance[day]) /
				dt,
		)
		libration = Math.max(
			libration,
			Math.abs(table.libration[next] - table.libration[day]) / dt,
		)
		nearest = Math.min(nearest, table.distance[day])
	}
	const slope = (values: number[]) =>
		values.reduce(
			(max, value, n) =>
				Math.max(
					max,
					Math.abs(values[(n + 1) % values.length] - value) /
						(yearSeconds / values.length),
				),
			0,
		)
	const locked = orbit.locked
		? slope(orbit.locked.libration) + slope(orbit.locked.declination)
		: libration
	const result = {
		starSpeedRatio: speed / nearest,
		frameRadS: Math.abs(orbit.rotationRateRadS) + 3 * angular + locked,
	}
	clockRates.set(params, result)
	return result
}

function resolve({
	params,
	elapsedYears,
	manual,
}: ResolveWeatherClockParams): WeatherInstant {
	const locked = params.tideLock?.type === "solar"
	const orbit = locked
		? CLIMATEV2_ORBIT.lockedFromParams(params)
		: CLIMATEV2_ORBIT.fromParams(params)
	const yearSeconds = orbit.yearScale * YEAR_SECONDS
	const rotationSeconds = TAU / orbit.rotationRateRadS
	const seconds = manual
		? (manual.year + manual.month / 12) * yearSeconds +
			(manual.day + manual.dialHour / 24) * rotationSeconds
		: elapsedYears * yearSeconds
	const phase = wrap(seconds / yearSeconds)
	const retrograde = params.obliquity > 90 ? -1 : 1
	const solarRate = retrograde * orbit.rotationRateRadS - TAU / yearSeconds
	let subLon = Math.PI - solarRate * seconds
	let declination =
		((orbit.tiltDeg * Math.PI) / 180) * Math.sin(TAU * (phase - 0.25))

	const state = ecliptic({ params, seconds })
	const solarLongitude = state.solarLongitudeRad
	if (!orbit.locked) {
		declination = Math.asin(
			Math.sin((orbit.tiltDeg * Math.PI) / 180) * Math.sin(solarLongitude),
		)
		subLon += state.librationRad
	}
	if (orbit.locked) {
		const position = phase * 12 - 0.5
		const month = Math.floor(position)
		const fraction = position - month
		const a = ((month % 12) + 12) % 12
		const b = (a + 1) % 12
		subLon =
			(orbit.locked.substellarLon * Math.PI) / 180 +
			orbit.locked.libration[a] * (1 - fraction) +
			orbit.locked.libration[b] * fraction
		declination =
			orbit.locked.declination[a] * (1 - fraction) +
			orbit.locked.declination[b] * fraction
	}
	return {
		seconds,
		phase,
		year: Math.floor(seconds / yearSeconds),
		yearSeconds,
		rotationSeconds,
		solarDaySeconds:
			locked || Math.abs(solarRate) < Number.EPSILON
				? null
				: TAU / Math.abs(solarRate),
		referencePhase: wrap(seconds / rotationSeconds),
		locked,
		retrograde: retrograde < 0,
		solarLongitudeRad: ((solarLongitude % TAU) + TAU) % TAU,
		tiltDeg: orbit.tiltDeg,
		sun: [
			Math.cos(declination) * Math.cos(subLon),
			Math.cos(declination) * Math.sin(subLon),
			Math.sin(declination),
		],
	}
}

function select(input: SelectWeatherClockParams): WeatherClockSelection {
	const previous = input.previous
	const sameControls =
		previous?.params === input.params &&
		previous.manual.year === input.manual.year &&
		previous.manual.month === input.manual.month &&
		previous.manual.day === input.manual.day &&
		previous.manual.dialHour === input.manual.dialHour
	const instant =
		!input.current && sameControls
			? previous.instant
			: resolve({
					params: input.params,
					elapsedYears: input.elapsedYears,
					manual: input.current ? null : input.manual,
				})
	return {
		params: input.params,
		current: input.current,
		manual: input.manual,
		instant,
	}
}

function localSolar({ instant, xyz }: LocalSolarParams): LocalSolarState {
	const dot =
		xyz[0] * instant.sun[0] + xyz[1] * instant.sun[1] + xyz[2] * instant.sun[2]
	const heating = Math.max(0, dot)
	const longitude = Math.atan2(xyz[1], xyz[0])
	const sunLongitude = Math.atan2(instant.sun[1], instant.sun[0])
	const solarPhase = wrap(
		((longitude - sunLongitude) * (instant.retrograde ? -1 : 1)) / TAU + 0.5,
	)
	return {
		heating,
		elevationDeg: (Math.asin(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI,
		latitudeDeg: (Math.asin(Math.max(-1, Math.min(1, xyz[2]))) * 180) / Math.PI,
		daylight: heating > 0,
		phase: solarPhase,
		hour:
			instant.solarDaySeconds === null
				? null
				: (solarPhase * instant.solarDaySeconds) / 3600,
	}
}

function shift({
	instant,
	deltaSeconds,
}: ShiftWeatherInstantParams): WeatherInstant {
	const seconds = instant.seconds + deltaSeconds
	const angle =
		instant.solarDaySeconds === null
			? 0
			: ((instant.retrograde ? 1 : -1) * TAU * deltaSeconds) /
				instant.solarDaySeconds
	const cosine = Math.cos(angle),
		sine = Math.sin(angle)
	return {
		...instant,
		seconds,
		year: Math.floor(seconds / instant.yearSeconds),
		phase: wrap(seconds / instant.yearSeconds),
		referencePhase:
			instant.solarDaySeconds === null
				? instant.referencePhase
				: wrap(instant.referencePhase + deltaSeconds / instant.solarDaySeconds),
		sun: [
			instant.sun[0] * cosine - instant.sun[1] * sine,
			instant.sun[0] * sine + instant.sun[1] * cosine,
			instant.sun[2],
		],
	}
}
function season({ instant, latitudeDeg }: WeatherSeasonParams): string {
	if (instant.tiltDeg === 0) return "No axial seasons"
	if (latitudeDeg === 0) return "Equatorial"
	const quarter = Math.floor(instant.solarLongitudeRad / (Math.PI / 2))
	return ["Spring", "Summer", "Autumn", "Winter"][
		(quarter + (latitudeDeg < 0 ? 2 : 0)) % 4
	]
}

export const WEATHER_CLOCK = {
	ecliptic,
	rates,
	resolve,
	localSolar,
	select,
	shift,
	season,
	earthYearSeconds: YEAR_SECONDS,
}
