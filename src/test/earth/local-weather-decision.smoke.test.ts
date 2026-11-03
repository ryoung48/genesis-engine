import { expect, it } from "vitest"
import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import { WEATHER_DECISION } from "@/model/climate/weather/local/decision"
import type { WeatherDecisionInputs } from "@/model/climate/weather/local/decision/types"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"

const base: WeatherDecisionInputs = {
	rainChance: 0.3,
	meanRateMmH: 0.1,
	cloudMean: null,
	temperatureC: 25,
	monthlyTemperatureC: 25,
	dewPointC: 15,
	surfaceC: 25,
	clearSurfaceC: 25,
	windSpeedMs: 4,
	gustMs: 6,
	afternoon: false,
	daylight: true,
	particleSource: null,
	aridity: 0.5,
}
const order = ["stormy", "rainy", "overcast", "cloudy", "clear"]
it("preserves the old cloud table at its rainfall-probability boundaries", () => {
	const cases = [
		{
			p: 0.1,
			expected: [
				"cumulus clouds",
				"altostratus clouds",
				"haze",
				"altocumulus clouds",
				"clear skies",
			],
		},
		{
			p: 0.2,
			expected: [
				"nimbus clouds",
				"stratus clouds",
				"cirrus clouds",
				"cumulus clouds",
				"clear skies",
			],
		},
		{
			p: 0.3,
			expected: [
				"nimbus clouds",
				"stratus clouds",
				"altostratus clouds",
				"cumulus clouds",
				"clear skies",
			],
		},
		{
			p: 0.5,
			expected: [
				"nimbus clouds",
				"cumulus clouds",
				"stratus clouds",
				"altostratus clouds",
				"clear skies",
			],
		},
	]
	for (const row of cases)
		expect(
			WEATHER_DECISION.prepare({ ...base, rainChance: row.p }).branches.map(
				(b) => b.cloud,
			),
		).toEqual(row.expected)
})
it("orders regimes along one storminess axis with a temperature-dependent storm share", () => {
	const choices = WEATHER_DECISION.prepare(base)
	expect(choices.branches.map((b) => b.system)).toEqual(order)
	expect(choices.branches.map((b) => b.weight)).toEqual(
		[
			0.3 * 0.6,
			0.3 * 0.4,
			0.7 * (0.12 / 0.88),
			0.7 * (0.12 / 0.88),
			0.7 * (0.64 / 0.88),
		].map((w) => expect.closeTo(w, 12)),
	)
	for (const [temperature, storm] of [
		[-20, 0.25],
		[10, 0.4],
	])
		expect(
			WEATHER_DECISION.prepare({ ...base, monthlyTemperatureC: temperature })
				.branches[0].weight,
		).toBeCloseTo(0.3 * storm, 12)
})
it("keeps spattering rain under multiple original cloud branches and permits dry nimbus", () => {
	for (const p of [0.1, 0.3]) {
		const choices = WEATHER_DECISION.prepare({ ...base, rainChance: p })
		const rainy = choices.branches.find((b) => b.system === "rainy")!
		expect(
			rainy.outcomes.some((o) => o.kind === "spattering rain" && o.water > 0),
		).toBe(true)
		expect(rainy.cloud).toBe(
			p === 0.1 ? "altostratus clouds" : "stratus clouds",
		)
	}
	const choices = WEATHER_DECISION.prepare({ ...base, rainChance: 0.1 }),
		convective = choices.branches.find((b) => b.system === "stormy")!
	expect(convective.cloud).toBe("cumulus clouds")
	expect(convective.outcomes.some((o) => o.kind === "spattering rain")).toBe(
		true,
	)
	const nimbus = WEATHER_DECISION.prepare({
		...base,
		rainChance: 0.3,
	}).branches.find((b) => b.system === "stormy")!
	expect(nimbus.cloud).toBe("nimbus clouds")
	expect(nimbus.outcomes.some((o) => o.water === 0 && o.weight > 0)).toBe(true)
})
it("normalizes precipitation and matches monthly cloud cover in both directions", () => {
	const choices = WEATHER_DECISION.prepare({ ...base, cloudMean: 0.9 })
	const expected = choices.branches.reduce(
		(sum, b) =>
			sum +
			b.weight *
				b.outcomes.reduce(
					(s, o) =>
						s +
						o.weight *
							choices.acceptance *
							((o.water * choices.wetProbability) / choices.expectedWater) *
							choices.wetRateMmH,
					0,
				),
		0,
	)
	expect(expected).toBeCloseTo(base.meanRateMmH, 12)
	expect(choices.acceptance * choices.wetProbability).toBeCloseTo(
		Math.min(0.3, base.meanRateMmH / (0.6 * 1.065 ** base.monthlyTemperatureC)),
		12,
	)
	const clear = (cloudMean: number) =>
		WEATHER_DECISION.prepare({ ...base, cloudMean }).branches[4].weight
	for (const cloudMean of [0.1, 0.5, 0.9]) {
		const branches = WEATHER_DECISION.prepare({ ...base, cloudMean }).branches
		expect(branches.reduce((sum, b) => sum + b.weight, 0)).toBeCloseTo(1, 12)
		expect(
			branches.reduce((sum, b) => sum + b.weight * b.cover, 0),
		).toBeCloseTo(cloudMean, 12)
	}
	expect(clear(0.1)).toBeGreaterThan(0.7 * (0.64 / 0.88))
	expect(clear(0.9)).toBe(0)
	expect(
		WEATHER_DECISION.prepare({ ...base, meanRateMmH: 0 }).branches.every((b) =>
			b.outcomes.every((o) => o.water === 0),
		),
	).toBe(true)
})
it("overlays humidity, afternoon, numeric wind and terrain constraints without moving regime boundaries", () => {
	const systems = (input: Partial<WeatherDecisionInputs>) =>
		WEATHER_DECISION.prepare({ ...base, ...input }).branches.map(
			(b) => b.system,
		)
	expect(systems({ dewPointC: null })).toEqual(order)
	expect(systems({ dewPointC: 24.8 })).toEqual([
		"stormy",
		"rainy",
		"fog",
		"fog",
		"clear",
	])
	expect(systems({ dewPointC: 24.8, afternoon: true })).toEqual(order)
	expect(systems({ windSpeedMs: 9 })).toEqual([
		"stormy",
		"rainy",
		"windy",
		"windy",
		"windy",
	])
	const weights = (input: Partial<WeatherDecisionInputs>) =>
		WEATHER_DECISION.prepare({ ...base, ...input }).branches.map(
			(b) => b.weight,
		)
	expect(weights({ windSpeedMs: 9, dewPointC: 24.8 })).toEqual(weights({}))
	expect(
		WEATHER_DECISION.prepare({ ...base, dewPointC: 24.2 }).branches[2]
			.outcomes[0].kind,
	).toBe("mist")
	for (const source of ["sand", "dust"] as const) {
		const choices = WEATHER_DECISION.prepare({
			...base,
			particleSource: source,
			aridity: 0.1,
			windSpeedMs: 10,
			gustMs: 15,
		})
		expect(
			choices.branches.find((b) => b.system === "windy")!.outcomes[0].kind,
		).toBe(source === "sand" ? "sand storm" : "dust storm")
	}
})
it("shares repeatable weather at adjacent locations and preserves immutable inputs", () => {
	const context = WEATHER_FIXTURE.context(),
		instant = WEATHER_FIXTURE.instant(),
		copy = structuredClone(context)
	const near = structuredClone(context.provinces[0])
	near.baselines[0].location.xyz = [Math.cos(0.00001), Math.sin(0.00001), 0]
	near.location.samples = [near.baselines[0].location]
	context.provinces.push(near)
	const a = LOCAL_WEATHER.sampleProvince({ context, instant, province: 0 }),
		b = LOCAL_WEATHER.sampleProvince({ context, instant, province: 1 })
	expect(a.values!.dominant).toBe(b.values!.dominant)
	expect(a.values!.cloudDescription).toBe(b.values!.cloudDescription)
	expect(
		Math.abs(a.values!.temperatureC - b.values!.temperatureC),
	).toBeLessThan(0.01)
	expect(
		LOCAL_WEATHER.sampleProvince({ context, instant, province: 0 }),
	).toEqual(a)
	expect(context.provinces[0]).toEqual(copy.provinces[0])
})

it("retains frozen storm candidates under sufficient numeric wind", () => {
	const cold = {
		...base,
		temperatureC: -5,
		dewPointC: -5,
		surfaceC: -5,
		windSpeedMs: 11,
		gustMs: 16,
	}
	const eligible = WEATHER_DECISION.prepare(cold).branches.find(
		(branch) => branch.system === "stormy",
	)!
	expect(
		eligible.outcomes.some(
			(outcome) => outcome.kind === "blizzard" && outcome.water > 0,
		),
	).toBe(true)
	const calm = WEATHER_DECISION.prepare({
		...cold,
		windSpeedMs: 3,
		gustMs: 5,
	}).branches.find((branch) => branch.system === "stormy")!
	expect(calm.outcomes.some((outcome) => outcome.kind === "blizzard")).toBe(
		false,
	)
	expect(calm.outcomes.some((outcome) => outcome.kind === "snowfall")).toBe(
		true,
	)
})

it("forms dew, frost and radiation fog on clear calm nights", () => {
	const night = { ...base, daylight: false, windSpeedMs: 1, dewPointC: 15 }
	const clear = (input: WeatherDecisionInputs) =>
		WEATHER_DECISION.prepare(input).branches[4].outcomes[0].kind
	expect(clear({ ...night, dewPointC: 20, clearSurfaceC: 19 })).toBe("dew")
	expect(
		clear({
			...night,
			temperatureC: -2,
			dewPointC: -5,
			surfaceC: -2,
			clearSurfaceC: -6,
		}),
	).toBe("frost")
	expect(clear({ ...night, dewPointC: 24.8 })).toBe("fog")
	expect(clear({ ...night, dewPointC: 10, clearSurfaceC: 22 })).toBe(
		"clear skies",
	)
	expect(clear({ ...night, daylight: true, dewPointC: 24.8 })).toBe(
		"clear skies",
	)
})

it("labels windy dry wet-regime hours and forms ground blizzards from blowing snow", () => {
	const windy = { ...base, windSpeedMs: 9, gustMs: 13 }
	const quiet = WEATHER_DECISION.resolve({
		choices: WEATHER_DECISION.prepare(windy),
		draws: { branch: 0.01, event: 0, precipitation: 0.99 },
	})
	expect(quiet.system).toBe("windy")
	expect(quiet.rainRateMmH).toBe(0)
	const raining = WEATHER_DECISION.resolve({
		choices: WEATHER_DECISION.prepare(windy),
		draws: { branch: 0.01, event: 0.99, precipitation: 0 },
	})
	expect(raining.system).toBe("stormy")
	expect(raining.rainRateMmH).toBeGreaterThan(0)
	const cold = {
		...base,
		temperatureC: -10,
		monthlyTemperatureC: -5,
		dewPointC: -15,
		surfaceC: -10,
		clearSurfaceC: -10,
		windSpeedMs: 13,
		gustMs: 19,
	}
	expect(WEATHER_DECISION.prepare(cold).branches[4].outcomes[0]).toEqual({
		kind: "blizzard",
		weight: 1,
		water: 0,
	})
	expect(
		WEATHER_DECISION.resolve({
			choices: WEATHER_DECISION.prepare(cold),
			draws: { branch: 0.01, event: 0, precipitation: 0.99 },
		}).kind,
	).toBe("blizzard")
	expect(
		WEATHER_DECISION.prepare({ ...cold, monthlyTemperatureC: 2 }).branches[4]
			.outcomes[0].kind,
	).toBe("clear skies")
})
