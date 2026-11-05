import { ECLIPSES } from "@/model/celestial/eclipses"
import type { PlanetEclipse } from "@/model/celestial/eclipses/types"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_ECLIPSE_FORECAST } from "@/model/climate/weather/local/sky/eclipses/forecast"
import { LOCAL_ECLIPSES } from "@/model/climate/weather/local/sky/eclipses/local"
import type {
	LocalEclipse,
	WeatherEclipseLocalParams,
	WeatherEclipseLocalResult,
} from "@/model/climate/weather/local/sky/eclipses/types"
import { SCAN } from "@/model/shared/math/scan"

const empty: WeatherEclipseLocalResult = {
	next: [],
	current: [],
	combined: [],
	unavailable: [],
	status: "complete",
}

function eventKey(event: PlanetEclipse): string {
	return `${ECLIPSES.category(event.kind)}:${event.moonIdx}:${event.occluderIdx}:${event.ingressS}:${event.egressS}`
}

function local({
	params,
	xyz,
	instant,
}: WeatherEclipseLocalParams): WeatherEclipseLocalResult {
	const cache = WEATHER_ECLIPSE_FORECAST.getCache(params)
	const length = Math.hypot(...xyz)
	if (!(length > 0 && Number.isFinite(length + instant.seconds)))
		return { ...empty, status: "unavailable" }
	if (!cache.ephemeris.moons.length)
		return { ...empty, unavailable: cache.dropped }
	const siteKey = xyz.join(":")
	let site = cache.sites.get(siteKey)
	if (!site) {
		site = new Map()
		cache.sites.set(siteKey, site)
	}
	const now = instant.seconds
	const phase = WEATHER_CLOCK.localSolar({ instant, xyz }).phase
	const solarDay = instant.solarDaySeconds ?? instant.rotationSeconds
	const events: LocalEclipse[] = []
	const seen = new Set<string>()
	let unavailable: string[] = []
	for (let years = 1; years <= WEATHER_ECLIPSE_FORECAST.horizonYears; years++) {
		const endS = now + years * cache.yearSeconds
		const global = WEATHER_ECLIPSE_FORECAST.calendar({
			params,
			startS: now,
			endS,
		})
		if (global.status === "unavailable")
			return { ...empty, status: "unavailable" }
		const name = (idx: number) =>
			cache.ephemeris.moons.find((m) => m.moon.idx === idx)?.moon.name ??
			`Moon ${idx}`
		unavailable = [
			...cache.dropped,
			...global.unavailableMoons.map(name),
			...global.unavailablePairs.map(([a, b]) => `${name(a)} and ${name(b)}`),
		]
		for (const event of global.events) {
			const key = eventKey(event)
			if (seen.has(key)) continue
			seen.add(key)
			if (!site.has(key))
				site.set(key, LOCAL_ECLIPSES.circumstances({ cache, xyz, event }))
			const found = site.get(key)
			if (!found) continue
			events.push({
				...event,
				...found,
				durationS: found.visibleIntervals.reduce(
					(sum, [a, b]) => sum + b - a,
					0,
				),
				durationClipped: event.clippedStart || event.clippedEnd,
				instantaneousCoverage: null,
				dayOffset: Math.floor(phase + (found.maximumS - now) / solarDay),
			})
		}
		const first = events
			.filter((event) => event.visibleIntervals[0][0] > now)
			.reduce<LocalEclipse | null>(
				(best, event) =>
					!best || event.maximumS < best.maximumS ? event : best,
				null,
			)
		if (first && first.maximumS <= endS) break
	}
	const current = events
		.filter((event) =>
			event.visibleIntervals.some(([a, b]) => now >= a && now < b),
		)
		.map((event) => {
			const point = LOCAL_ECLIPSES.point({ cache, xyz, event, seconds: now })
			return {
				...event,
				instantaneousCoverage:
					ECLIPSES.category(event.kind) === "solar" ||
					ECLIPSES.category(event.kind) === "occultation"
						? point.geometry.coverage
						: null,
			}
		})
	const future = events
		.filter((event) => event.visibleIntervals[0][0] > now)
		.sort((a, b) => a.maximumS - b.maximumS || a.moonIdx - b.moonIdx)
	const next = future.filter(
		(event) => event.maximumS - future[0].maximumS <= 1,
	)
	const solar = (event: LocalEclipse) =>
		ECLIPSES.category(event.kind) === "solar"
	const currentSolar = current.filter(solar)
	const firstSolar = next.find(solar)
	const groups = [
		{ current: true, events: currentSolar },
		{
			current: false,
			events: firstSolar
				? future.filter(
						(event) =>
							solar(event) &&
							(event === firstSolar ||
								SCAN.intersect({
									a: event.visibleIntervals,
									b: firstSolar.visibleIntervals,
								}).length > 0),
					)
				: [],
		},
	]
	let combinedSite = cache.combined.get(siteKey)
	if (!combinedSite) {
		combinedSite = new Map()
		cache.combined.set(siteKey, combinedSite)
	}
	const combined = groups.flatMap((group) => {
		if (group.events.length < 2) return []
		const key = group.events.map(eventKey).sort().join("|")
		if (!combinedSite.has(key))
			combinedSite.set(
				key,
				LOCAL_ECLIPSES.combine({ cache, xyz, events: group.events }),
			)
		const found = combinedSite.get(key)
		if (!found) return []
		return [
			{
				...found,
				current: group.current,
				moonLabels: group.events.map((event) => event.moonLabel),
				instantaneousCoverage: group.current
					? LOCAL_ECLIPSES.union({
							cache,
							xyz,
							moonIdxs: group.events.map((event) => event.moonIdx),
							seconds: now,
						}).coverage
					: null,
				dayOffset: Math.floor(phase + (found.maximumS - now) / solarDay),
			},
		]
	})
	return { next, current, combined, unavailable, status: "complete" }
}

export const WEATHER_ECLIPSES = {
	calendar: WEATHER_ECLIPSE_FORECAST.calendar,
	next: WEATHER_ECLIPSE_FORECAST.next,
	local,
	horizonYears: WEATHER_ECLIPSE_FORECAST.horizonYears,
}
