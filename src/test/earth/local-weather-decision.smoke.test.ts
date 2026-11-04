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
	daylight: true,
	particleSource: null,
	aridity: 0.5,
	convectiveBias: 0,
	land: true,
	stormTrack: 1,
	severeRisk: 0,
	pressureTendencyHpa: 0,
}
const order = ["stormy", "rainy", "overcast", "cloudy", "clear"]
it("keeps the cloud table at its rainfall-probability boundaries", () => {
	const cases = [
		{
			p: 0.1,
			expected: [
				"cumulus clouds",
				"altostratus clouds",
				"cirrus clouds",
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
				"stratocumulus clouds",
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
it("keeps light rain under multiple original cloud branches and permits dry nimbus", () => {
	for (const p of [0.1, 0.3]) {
		const choices = WEATHER_DECISION.prepare({ ...base, rainChance: p })
		const rainy = choices.branches.find((b) => b.system === "rainy")!
		expect(
			rainy.outcomes.some((o) => o.kind === "light rain" && o.water > 0),
		).toBe(true)
		expect(rainy.cloud).toBe(
			p === 0.1 ? "altostratus clouds" : "stratus clouds",
		)
	}
	const choices = WEATHER_DECISION.prepare({ ...base, rainChance: 0.1 }),
		convective = choices.branches.find((b) => b.system === "stormy")!
	expect(convective.cloud).toBe("cumulus clouds")
	expect(convective.outcomes.some((o) => o.kind === "light showers")).toBe(true)
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
	expect(systems({ dewPointC: 24.8, windSpeedMs: 9 })).toEqual([
		"stormy",
		"rainy",
		"fog",
		"fog",
		"windy",
	])
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
		expect(
			WEATHER_DECISION.prepare({ ...choices.input, gustMs: 12 }).branches.find(
				(b) => b.system === "windy",
			)!.outcomes[0].kind,
		).toBe(source === "sand" ? "blowing sand" : "blowing dust")
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
	expect(
		calm.outcomes.some((outcome) => outcome.kind === "moderate snow"),
	).toBe(true)
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
		draws: { branch: 0.01, event: 0, precipitation: 0.99, layer: 0.5 },
	})
	expect(quiet.system).toBe("windy")
	expect(quiet.rainRateMmH).toBe(0)
	const raining = WEATHER_DECISION.resolve({
		choices: WEATHER_DECISION.prepare(windy),
		draws: { branch: 0.01, event: 0.99, precipitation: 0, layer: 0.5 },
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
			draws: { branch: 0.01, event: 0, precipitation: 0.99, layer: 0.5 },
		}).kind,
	).toBe("blizzard")
	expect(
		WEATHER_DECISION.prepare({ ...cold, monthlyTemperatureC: 2 }).branches[4]
			.outcomes[0].kind,
	).toBe("clear skies")
	expect(
		WEATHER_DECISION.prepare({ ...cold, windSpeedMs: 9 }).branches[4]
			.outcomes[0].kind,
	).toBe("drifting snow")
})

it("splits near-freezing precipitation into snow, rain and snow, freezing rain and rain by wet-bulb temperature", () => {
	const kinds = (temperatureC: number, dewPointC: number) =>
		WEATHER_DECISION.prepare({
			...base,
			temperatureC,
			dewPointC,
			surfaceC: temperatureC,
			clearSurfaceC: temperatureC,
			monthlyTemperatureC: temperatureC,
		})
			.branches.find(
				(b) => b.system === "rainy" && b.cloud === "stratus clouds",
			)!
			.outcomes.filter((o) => o.water > 0)
			.map((o) => o.kind)
	expect(kinds(-6, -8)).toContain("light snow")
	expect(kinds(-6, -8)).not.toContain("light rain")
	expect(kinds(-0.5, -1)).toEqual(
		expect.arrayContaining(["rain and snow", "freezing rain"]),
	)
	expect(kinds(1, 0.5)).toEqual(
		expect.arrayContaining(["rain and snow", "light rain"]),
	)
	expect(kinds(12, 9)).not.toContain("light snow")
})

it("bands the precipitation label by the rate that falls", () => {
	const band = (
		kind: Parameters<typeof WEATHER_DECISION.band>[0]["kind"],
		rateMmH: number,
	) => WEATHER_DECISION.band({ kind, rateMmH, stratiform: false })
	expect(band("light rain", 0.1)).toBe("light rain")
	expect(
		WEATHER_DECISION.band({
			kind: "light rain",
			rateMmH: 0.1,
			stratiform: true,
		}),
	).toBe("drizzle")
	expect(
		WEATHER_DECISION.band({
			kind: "freezing rain",
			rateMmH: 0.1,
			stratiform: true,
		}),
	).toBe("freezing drizzle")
	expect(band("light showers", 3)).toBe("rain showers")
	expect(band("rain showers", 10)).toBe("heavy rain")
	expect(band("snow showers", 3)).toBe("heavy snow showers")
	expect(band("light rain", 1)).toBe("light rain")
	expect(band("light rain", 5)).toBe("moderate rain")
	expect(band("drizzle", 20)).toBe("heavy rain")
	expect(band("light snow", 1.5)).toBe("moderate snow")
	expect(band("moderate snow", 3)).toBe("heavy snow")
	expect(band("thunderstorm", 0.1)).toBe("thunderstorm")
	expect(band("rain and snow", 30)).toBe("rain and snow")
})

it("concentrates stormy weather in the land afternoon and ocean night", () => {
	const storm = (input: Partial<WeatherDecisionInputs>) =>
		WEATHER_DECISION.prepare({ ...base, ...input }).branches[0].weight
	expect(storm({ convectiveBias: 0.4 })).toBeGreaterThan(storm({}))
	expect(storm({ convectiveBias: -0.4 })).toBeLessThan(storm({}))
})

it("adds hail to organised land thunderstorms below a survivable freezing level", () => {
	const kinds = (input: Partial<WeatherDecisionInputs>) =>
		WEATHER_DECISION.prepare({
			...base,
			temperatureC: 25,
			dewPointC: 22,
			windSpeedMs: 10,
			...input,
		}).branches[0].outcomes.map((o) => o.kind)
	expect(kinds({})).toContain("hail")
	expect(kinds({ land: false })).not.toContain("hail")
	expect(kinds({ monthlyTemperatureC: 31 })).not.toContain("hail")
	const hail = (input: Partial<WeatherDecisionInputs>) =>
		WEATHER_DECISION.prepare({
			...base,
			dewPointC: 22,
			monthlyTemperatureC: 18,
			...input,
		}).branches[0].outcomes.find((o) => o.kind === "hail")!.weight
	expect(hail({ stormTrack: 0.1 })).toBeLessThan(hail({ stormTrack: 1 }))
	expect(hail({ stormTrack: 0.1, severeRisk: 1 })).toBeCloseTo(
		hail({ stormTrack: 1 }),
		12,
	)
	expect(kinds({ dewPointC: 10 })).not.toContain("thunderstorm")
})

it("adds tornadoes to land thunderstorms in tornado-prone environments", () => {
	const tornado = (input: Partial<WeatherDecisionInputs>) =>
		WEATHER_DECISION.prepare({ ...base, dewPointC: 22, ...input })
			.branches[0].outcomes.filter((o) => o.kind === "tornado")
			.reduce((sum, o) => sum + o.weight, 0)
	expect(tornado({})).toBe(0)
	expect(tornado({ severeRisk: 1 })).toBeGreaterThan(0)
	expect(tornado({ severeRisk: 1, land: false })).toBe(0)
	expect(tornado({ severeRisk: 1, convectiveBias: 0.4 })).toBeGreaterThan(
		tornado({ severeRisk: 1 }),
	)
})

it("adds thundersnow, warm-nose freezing rain and convective showers", () => {
	const cold = {
		...base,
		temperatureC: -6,
		monthlyTemperatureC: -6,
		dewPointC: -7,
		surfaceC: -6,
		clearSurfaceC: -6,
	}
	expect(
		WEATHER_DECISION.prepare(cold).branches[0].outcomes.map((o) => o.kind),
	).toContain("thundersnow")
	const freezing = (temperatureC: number) =>
		WEATHER_DECISION.prepare({
			...cold,
			temperatureC,
			dewPointC: temperatureC - 0.5,
		})
			.branches[1].outcomes.filter((o) => o.kind === "freezing rain")
			.reduce((sum, o) => sum + o.weight, 0)
	expect(freezing(-2)).toBeGreaterThan(freezing(-5.5))
	const showers = WEATHER_DECISION.prepare({
		...base,
		rainChance: 0.5,
	}).branches[1].outcomes.map((o) => o.kind)
	expect(showers).toEqual(
		expect.arrayContaining(["light showers", "rain showers"]),
	)
})

it("forms freezing fog, calm ice fog and ice crystals in cold saturated air", () => {
	const kind = (input: Partial<WeatherDecisionInputs>) =>
		WEATHER_DECISION.prepare({
			...base,
			daylight: false,
			windSpeedMs: 1,
			...input,
		}).branches[4].outcomes[0].kind
	expect(
		kind({
			temperatureC: -5,
			dewPointC: -5.2,
			surfaceC: -5,
			clearSurfaceC: -5,
		}),
	).toBe("freezing fog")
	expect(
		kind({
			temperatureC: -40,
			dewPointC: -40.2,
			surfaceC: -40,
			clearSurfaceC: -40,
		}),
	).toBe("ice fog")
	expect(
		kind({
			temperatureC: -30,
			dewPointC: -32.5,
			surfaceC: -30,
			clearSurfaceC: -30,
			daylight: true,
		}),
	).toBe("ice crystals")
})

it("limits freezing fog to supercooled air and reports advective fog as stratus", () => {
	const branch = (temperatureC: number) =>
		WEATHER_DECISION.prepare({
			...base,
			daylight: false,
			windSpeedMs: 1,
			temperatureC,
			dewPointC: temperatureC - 0.2,
			surfaceC: temperatureC,
			clearSurfaceC: temperatureC,
		}).branches[2]
	expect(branch(-5).outcomes[0].kind).toBe("freezing fog")
	expect(branch(-5).cloud).toBe("stratus clouds")
	expect(branch(-20).outcomes[0].kind).not.toContain("fog")
})

it("keeps warm-nose freezing rain out of showers and cool wet rain stratiform", () => {
	const branches = WEATHER_DECISION.prepare({
		...base,
		rainChance: 0.1,
		temperatureC: -2,
		monthlyTemperatureC: -3,
		dewPointC: -2.5,
		surfaceC: -2,
		clearSurfaceC: -2,
	}).branches
	const freezing = (index: number) =>
		branches[index].outcomes
			.filter((o) => o.kind === "freezing rain")
			.reduce((sum, o) => sum + o.weight, 0)
	expect(branches[0].cloud).toBe("cumulus clouds")
	expect(branches[1].cloud).toBe("altostratus clouds")
	expect(freezing(1)).toBeGreaterThan(0.01)
	expect(freezing(0)).toBeLessThan(0.01)
	expect(
		WEATHER_DECISION.prepare({
			...base,
			rainChance: 0.5,
			monthlyTemperatureC: 8,
		}).branches[1].cloud,
	).toBe("stratus clouds")
	expect(
		WEATHER_DECISION.prepare({
			...base,
			rainChance: 0.5,
			monthlyTemperatureC: -5,
		}).branches[1].cloud,
	).toBe("cumulus clouds")
})

it("gives the clear regime few clouds while keeping the monthly mean cover", () => {
	for (const cloudMean of [0.05, 0.3, 0.5]) {
		const choices = WEATHER_DECISION.prepare({ ...base, cloudMean })
		expect(
			choices.branches.reduce((sum, b) => sum + b.weight * b.cover, 0),
		).toBeCloseTo(cloudMean, 12)
	}
	const choices = WEATHER_DECISION.prepare({ ...base, cloudMean: 0.5 })
	const clear = (precipitation: number) =>
		WEATHER_DECISION.resolve({
			choices,
			draws: { branch: 0.999, event: 0, precipitation, layer: 0.5 },
		})
	expect(clear(0.99).cloudCover).toBe(0)
	expect(clear(0.99).cloud).toBe("clear skies")
	expect(clear(0.1).cloudCover).toBeGreaterThan(0.1)
	expect(clear(0.1).cloud).toBe("cumulus clouds")
})

it("adds haze to dry hours in arid climates and dry months", () => {
	const haze = (input: Partial<WeatherDecisionInputs>) =>
		WEATHER_DECISION.prepare({
			...base,
			rainChance: 0.1,
			aridity: 0.1,
			dewPointC: 0,
			...input,
		})
			.branches[4].outcomes.filter((o) => o.kind === "haze")
			.reduce((sum, o) => sum + o.weight, 0)
	expect(haze({})).toBeGreaterThan(0.2)
	expect(haze({ aridity: 0.6 })).toBe(0)
	expect(haze({ rainChance: 0.35 })).toBe(0)
	expect(haze({ dewPointC: 24 })).toBe(0)
	expect(
		WEATHER_DECISION.prepare({
			...base,
			rainChance: 0.1,
			aridity: 0.1,
			dewPointC: 0,
		}).branches[0].outcomes.some((o) => o.kind === "haze"),
	).toBe(false)
})

it("picks one layered cloud type for overcast and cloudy hours and shifts to altostratus ahead of fronts", () => {
	const choices = (pressureTendencyHpa: number) =>
		WEATHER_DECISION.prepare({ ...base, cloudMean: 0.6, pressureTendencyHpa })
	const overcastDraw = choices(0)
		.branches.slice(0, 2)
		.reduce((sum, b) => sum + b.weight, 0)
	const overcast = (layer: number, pressureTendencyHpa: number) =>
		WEATHER_DECISION.resolve({
			choices: choices(pressureTendencyHpa),
			draws: {
				branch: overcastDraw + 0.001,
				event: 0,
				precipitation: 0.5,
				layer,
			},
		}).cloud
	expect(overcast(0.1, 0)).toBe("stratocumulus clouds")
	expect(overcast(0.6, 0)).toBe("altostratus clouds")
	expect(overcast(0.95, 0)).toBe("cirrus clouds")
	expect(overcast(0.4, 0)).toBe("stratocumulus clouds")
	expect(overcast(0.4, -3)).toBe("altostratus clouds")
})

it("gives rainy hours without rain a layered cloud and keeps raining hours' cloud", () => {
	const rainy = (precipitation: number) =>
		WEATHER_DECISION.resolve({
			choices: WEATHER_DECISION.prepare(base),
			draws: { branch: 0.25, event: 0.5, precipitation, layer: 0.6 },
		})
	expect(rainy(0.99).regime).toBe("rainy")
	expect(rainy(0.99).rainRateMmH).toBe(0)
	expect(rainy(0.99).cloud).toBe("altostratus clouds")
	expect(rainy(0).rainRateMmH).toBeGreaterThan(0)
	expect(rainy(0).cloud).toBe("stratus clouds")
})
