import { expect, it } from "vitest"
import { WEATHER_BASELINE } from "@/model/climate/weather/local/baseline"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"

it("round trips reference dates and keeps the illuminated hemisphere consistent", () => {
	const instant = WEATHER_FIXTURE.instant()
	const manual = WEATHER_CLOCK.resolve({
		params: WEATHER_FIXTURE.params,
		elapsedYears: 0,
		manual: {
			year: instant.year,
			month: Math.floor(instant.phase * 12),
			day: 0,
			dialHour: 0,
		},
	})
	expect(manual.seconds).toBeLessThanOrEqual(instant.seconds)
	expect(Math.hypot(...instant.sun)).toBeCloseTo(1, 6)
	const noon = WEATHER_CLOCK.localSolar({ instant, xyz: instant.sun })
	const midnight = WEATHER_CLOCK.localSolar({
		instant,
		xyz: instant.sun.map((v) => -v) as [number, number, number],
	})
	expect(noon.daylight).toBe(true)
	expect(midnight.daylight).toBe(false)
	expect(noon.phase).toBeCloseTo(0.5, 6)
	const locked = WEATHER_CLOCK.resolve({
		params: {
			...WEATHER_FIXTURE.params,
			tideLock: { type: "solar", target: 0 },
		},
		elapsedYears: 0.25,
		manual: null,
	})
	expect(locked.solarDaySeconds).toBeNull()
	const retrograde = WEATHER_CLOCK.resolve({
		params: { ...WEATHER_FIXTURE.params, obliquity: 157 },
		elapsedYears: 0.25,
		manual: null,
	})
	expect(retrograde.solarDaySeconds!).toBeLessThan(instant.solarDaySeconds!)
})
it("integrates the smooth seasonal rain baseline to its monthly amount", () => {
	const baseline = WEATHER_FIXTURE.context().provinces[0].baselines[0]
	const yearSeconds = WEATHER_FIXTURE.instant().yearSeconds
	let sum = 0
	const n = 4096
	for (let i = 0; i <= n; i++)
		sum +=
			WEATHER_BASELINE.rainRate({ baseline, phase: i / n / 12, yearSeconds }) *
			(i === 0 || i === n ? 0.5 : 1)
	expect(Math.abs((sum * yearSeconds) / 12 / n / 3600 - 30)).toBeLessThan(1e-3)
	expect(
		WEATHER_BASELINE.monthly({ values: baseline.temperature, phase: 0 }),
	).toBe(20)
})

it("retains the exact current instant on a direct manual-mode transition", () => {
	const input = {
		params: WEATHER_FIXTURE.params,
		elapsedYears: 867.12345678,
		current: true,
		manual: { year: 867, month: 1, day: 2, dialHour: 3 },
		previous: null as
			| import("@/model/climate/weather/local/clock/types").WeatherClockSelection
			| null,
	}
	const current = WEATHER_CLOCK.select(input)
	const manual = WEATHER_CLOCK.select({
		...input,
		current: false,
		previous: current,
	})
	expect(manual.instant).toBe(current.instant)
	expect(
		WEATHER_CLOCK.select({
			...input,
			current: false,
			previous: manual,
			manual: { ...input.manual, dialHour: 4 },
		}).instant.seconds,
	).not.toBe(manual.instant.seconds)
})

it("advances local solar time after noon for either rotation direction", () => {
	for (const obliquity of [23, 157]) {
		const params = { ...WEATHER_FIXTURE.params, obliquity }
		const noon = WEATHER_CLOCK.resolve({
			params,
			elapsedYears: 0.25,
			manual: null,
		})
		const later = WEATHER_CLOCK.resolve({
			params,
			elapsedYears: 0.25 + 3600 / noon.yearSeconds,
			manual: null,
		})
		expect(
			WEATHER_CLOCK.localSolar({ instant: later, xyz: noon.sun }).phase,
		).toBeGreaterThan(0.5)
	}
})
