import { mkdirSync, writeFileSync } from "node:fs"
import { it } from "vitest"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_ECLIPSES } from "@/model/climate/weather/local/sky/eclipses"
import { WEATHER_ECLIPSE_FORECAST } from "@/model/climate/weather/local/sky/eclipses/forecast"
import type { GenesisParams } from "@/model/pipelines/types"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"

it("records cold and warm eclipse scan latency", () => {
	const earth = WEATHER_FIXTURE.params
	const fastMoon = {
		...earth.moons[0],
		idx: 2,
		orbitalPeriodDays: 1,
		eccentricity: 0.95,
		inclinationDeg: 60,
	}
	const variants: { name: string; years: number; params: GenesisParams }[] = [
		{ name: "earth-one-year", years: 1, params: earth },
		{ name: "earth-twenty-years", years: 20, params: earth },
		{ name: "moonless", years: 20, params: { ...earth, moons: [] } },
		{
			name: "mixed-periods-one-year",
			years: 1,
			params: { ...earth, moons: [...earth.moons, fastMoon] },
		},
	]
	const calendars = variants.map(({ name, years, params }) => {
		const cold = { ...params }
		const year = WEATHER_CLOCK.ecliptic({
			params: cold,
			seconds: 0,
		}).yearSeconds
		let started = performance.now()
		const result = WEATHER_ECLIPSES.calendar({
			params: cold,
			startS: 0,
			endS: years * year,
		})
		const coldMs = performance.now() - started
		started = performance.now()
		WEATHER_ECLIPSES.calendar({ params: cold, startS: 0, endS: years * year })
		return {
			name,
			coldMs,
			warmMs: performance.now() - started,
			evaluations: result.evaluations,
			byCategory: (
				WEATHER_ECLIPSE_FORECAST.getCache(cold).calendar?.tracks ?? []
			).reduce<Record<string, number>>((sums, track) => {
				sums[track.category] =
					(sums[track.category] ?? 0) + track.state.evaluations
				return sums
			}, {}),
			status: result.status,
			events: result.events.length,
			kinds: result.events.map((event) => event.kind),
		}
	})
	const earthNext = { ...earth }
	let started = performance.now()
	const next = WEATHER_ECLIPSES.next({ params: earthNext, startS: 0 })
	const nextMs = performance.now() - started
	const site = { ...earth }
	const instant = WEATHER_CLOCK.resolve({
		params: site,
		elapsedYears: 0,
		manual: null,
	})
	const xyz: [number, number, number] = [0.5, 0.5, Math.sqrt(0.5)]
	started = performance.now()
	const local = WEATHER_ECLIPSES.local({ params: site, xyz, instant })
	const localColdMs = performance.now() - started
	const updates = [...Array(32).keys()].map((index) => {
		const at = WEATHER_CLOCK.resolve({
			params: site,
			elapsedYears: (index * 3600) / instant.yearSeconds,
			manual: null,
		})
		const start = performance.now()
		WEATHER_ECLIPSES.local({ params: site, xyz, instant: at })
		return performance.now() - start
	})
	const report = {
		calendars,
		next: { ms: nextMs, status: next.status, event: next.event },
		local: {
			coldMs: localColdMs,
			maximumWarmMs: Math.max(...updates),
			meanWarmMs:
				updates.reduce((sum, value) => sum + value, 0) / updates.length,
			status: local.status,
			next: local.next.map((event) => ({
				kind: event.kind,
				maximumS: event.maximumS,
				durationS: event.durationS,
				coverage: event.coverage,
			})),
		},
	}
	mkdirSync("stats/eclipses", { recursive: true })
	writeFileSync(
		"stats/eclipses/scan-latency.json",
		JSON.stringify(report, null, 2),
	)
	console.log(
		JSON.stringify({
			calendars: calendars.map(({ kinds, ...rest }) => rest),
			next: report.next.ms,
			local: { ...report.local, next: report.local.next.length },
		}),
	)
}, 120000)
