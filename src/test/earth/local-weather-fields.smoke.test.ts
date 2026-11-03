import { expect, it } from "vitest"
import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import { WEATHER_FIELDS } from "@/model/climate/weather/local/fields"
import { NORMAL } from "@/model/shared/math/normal"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"

it("has deterministic smooth fields across the seam, with independent channels and long times", () => {
	const input = {
		seed: 14963991,
		channel: "wet",
		xyz: [-1, 0, 0] as [number, number, number],
		radiusKm: 6371,
		seconds: 123456789,
		driftMs: [10, 0] as [number, number],
	}
	const a = WEATHER_FIELDS.sample(input)
	expect(WEATHER_FIELDS.sample(input)).toBe(a)
	expect(
		Math.abs(WEATHER_FIELDS.sample({ ...input, xyz: [-1, 1e-9, 0] }) - a),
	).toBeLessThan(1e-6)
	expect(WEATHER_FIELDS.sample({ ...input, channel: "temperature" })).not.toBe(
		a,
	)
	expect(
		WEATHER_FIELDS.sample({ ...input, seconds: input.seconds + 2 ** 32 }),
	).not.toBe(a)
	expect(NORMAL.cdf(NORMAL.quantile(0.975))).toBeCloseTo(0.975, 6)
})
it("is query-order independent and leaves baseline arrays unchanged", () => {
	const context = WEATHER_FIXTURE.context()
	const copy = structuredClone(context)
	const instant = WEATHER_FIXTURE.instant()
	const a = LOCAL_WEATHER.sampleProvince({ context, instant, province: 0 })
	LOCAL_WEATHER.sampleProvince({
		context,
		instant: { ...instant, seconds: instant.seconds + 600 },
		province: 0,
	})
	expect(
		LOCAL_WEATHER.sampleProvince({ context, instant, province: 0 }),
	).toEqual(a)
	expect(context).toEqual(copy)
	expect(a.values?.gustMs).toBeGreaterThanOrEqual(a.values!.windSpeedMs)
})

it("compares temperature departures to the same local time of day", () => {
	const context = WEATHER_FIXTURE.context()
	const instant = WEATHER_FIXTURE.instant()
	const day = LOCAL_WEATHER.sampleProvince({
		context,
		province: 0,
		instant: { ...instant, sun: [1, 0, 0] },
	}).values!
	const night = LOCAL_WEATHER.sampleProvince({
		context,
		province: 0,
		instant: { ...instant, sun: [-1, 0, 0] },
	}).values!
	expect(day.temperatureNormalC).not.toBe(night.temperatureNormalC)
	expect(day.temperatureC - day.temperatureNormalC).toBeCloseTo(
		night.temperatureC - night.temperatureNormalC,
		6,
	)
})
