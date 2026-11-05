import { ECLIPSE_CALENDAR } from "@/model/celestial/eclipses/calendar"
import type { EclipseCalendarResult } from "@/model/celestial/eclipses/types"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import { TIDAL_CONTRIBUTORS } from "@/model/climate/ocean/tides/tidal-schedule/contributors"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type { WeatherEclipseCache } from "@/model/climate/weather/local/sky/eclipses/forecast/types"
import type {
	WeatherEclipseCalendarParams,
	WeatherEclipseNext,
	WeatherEclipseNextParams,
} from "@/model/climate/weather/local/sky/eclipses/types"
import { SKY_PRECESSION } from "@/model/climate/weather/local/sky/precession"
import type { GenesisParams } from "@/model/pipelines/types"

const HORIZON_YEARS = 20
const caches = new WeakMap<GenesisParams, WeatherEclipseCache>()

function getCache(params: GenesisParams): WeatherEclipseCache {
	const previous = caches.get(params)
	if (previous) return previous
	const captured = {
		...params,
		moons: params.moons.map((moon) => ({ ...moon })),
	}
	const rates = WEATHER_CLOCK.rates(captured)
	const mass = MECHANICS.derivePlanetMassKg(captured.planetRadiusKm)
	const prepared = TIDAL_CONTRIBUTORS.prepare({
		params: captured,
		moons: captured.moons,
	}).moons
	const cache: WeatherEclipseCache = {
		params: captured,
		rates,
		yearSeconds: WEATHER_CLOCK.ecliptic({ params: captured, seconds: 0 })
			.yearSeconds,
		ephemeris: {
			moons: prepared.map((moon) => ({
				moon,
				semiMajorAxisM: MECHANICS.moonSemiMajorAxisM({
					moon,
					planetMassKg: mass,
				}),
				rates: SKY_PRECESSION.rates({ params: captured, moon }),
			})),
			starRadiusM: TIDAL_CONTRIBUTORS.starDiameterM(captured) / 2,
			planetRadiusM: captured.planetRadiusKm * 1000,
			starAt: (seconds) => {
				const state = WEATHER_CLOCK.ecliptic({ params: captured, seconds })
				return [
					Math.cos(state.solarLongitudeRad) * state.starDistanceM,
					Math.sin(state.solarLongitudeRad) * state.starDistanceM,
					0,
				]
			},
			starSpeedRatio: rates.starSpeedRatio,
		},
		dropped: captured.moons
			.filter((moon) => !prepared.some((kept) => kept.idx === moon.idx))
			.map((moon) => moon.name ?? `Moon ${moon.idx}`),
		calendar: null,
		sites: new Map(),
		combined: new Map(),
	}
	caches.set(params, cache)
	return cache
}

function calendar({
	params,
	startS,
	endS,
}: WeatherEclipseCalendarParams): EclipseCalendarResult {
	const cache = getCache(params)
	if (!cache.ephemeris.moons.length)
		return {
			status: "complete",
			events: [],
			unavailableMoons: [],
			unavailablePairs: [],
			evaluations: 0,
		}
	if (!(Number.isFinite(startS + endS) && endS > startS))
		return {
			status: "unavailable",
			events: [],
			unavailableMoons: [],
			unavailablePairs: [],
			evaluations: 0,
		}
	const year = cache.yearSeconds
	if (
		!cache.calendar ||
		startS < cache.calendar.startS + year ||
		startS - cache.calendar.startS > (HORIZON_YEARS + 2) * year
	)
		cache.calendar = ECLIPSE_CALENDAR.create({
			ephemeris: cache.ephemeris,
			startS: (Math.floor(startS / year) - 1) * year,
		})
	return ECLIPSE_CALENDAR.events({
		calendar: cache.calendar,
		startS,
		endS,
		followS: endS + year,
	})
}

function next({
	params,
	startS,
}: WeatherEclipseNextParams): WeatherEclipseNext {
	const year = getCache(params).yearSeconds
	for (let years = 1; years <= HORIZON_YEARS; years++) {
		const result = calendar({ params, startS, endS: startS + years * year })
		const event = result.events.find((e) => e.maximumS >= startS) ?? null
		if (result.status === "unavailable" || event)
			return { status: result.status, event }
	}
	return { status: "complete", event: null }
}

export const WEATHER_ECLIPSE_FORECAST = {
	getCache,
	calendar,
	next,
	horizonYears: HORIZON_YEARS,
}
