import { MECHANICS } from "@/model/celestial/moons/mechanics"
import { MOON_PRECESSION } from "@/model/celestial/moons/mechanics/precession"
import type { MoonPrecessionRates } from "@/model/celestial/moons/mechanics/precession/types"
import type { MoonBody } from "@/model/celestial/moons/types"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type {
	SkyPrecessionMoonsParams,
	SkyPrecessionRatesParams,
} from "@/model/climate/weather/local/sky/precession/types"
import type { GenesisParams } from "@/model/pipelines/types"
import { TIME } from "@/model/shared/time"

const caches = new WeakMap<GenesisParams, Map<string, MoonPrecessionRates>>()

function rates({
	params,
	moon,
}: SkyPrecessionRatesParams): MoonPrecessionRates {
	let cache = caches.get(params)
	if (!cache) {
		cache = new Map()
		caches.set(params, cache)
	}
	const key = [
		moon.idx,
		moon.orbitalPeriodDays,
		moon.eccentricity,
		moon.inclinationDeg,
		moon.longitudeOfAscendingNodeDeg,
	].join(":")
	const previous = cache.get(key)
	if (previous) return previous
	const instant = WEATHER_CLOCK.resolve({
		params,
		elapsedYears: 0,
		manual: null,
	})
	const planetMassKg = MECHANICS.derivePlanetMassKg(params.planetRadiusKm)
	const result = MOON_PRECESSION.rates({
		moon,
		semiMajorAxisM: MECHANICS.moonSemiMajorAxisM({ moon, planetMassKg }),
		planetRadiusM: params.planetRadiusKm * 1000,
		planetMassKg,
		spinRateRadS: (2 * Math.PI) / instant.rotationSeconds,
		obliquityDeg: instant.tiltDeg,
		yearDays: instant.yearSeconds / TIME.secondsPerDay,
	})
	cache.set(key, result)
	return result
}

function moons({
	params,
	moons,
	seconds,
}: SkyPrecessionMoonsParams): MoonBody[] {
	return moons.map((moon) =>
		MOON_PRECESSION.at({
			moon,
			rates: rates({ params, moon }),
			t: seconds / TIME.secondsPerDay,
		}),
	)
}

export const SKY_PRECESSION = { rates, moons }
