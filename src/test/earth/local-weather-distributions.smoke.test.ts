import { expect, it } from "vitest"
import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"
import { WEATHER_DISTRIBUTIONS } from "@/test/earth/weather-distributions"
import { WEATHER_DISTRIBUTION_PRESENTATION } from "@/test/earth/weather-distributions/presentation"

it("accounts for completed versus terminal runs and independent versus sequential gates on a prescribed sequence", () => {
	const snapshot = LOCAL_WEATHER.sampleProvince({
		context: WEATHER_FIXTURE.context(),
		instant: WEATHER_FIXTURE.instant(),
		province: 0,
	})
	const state = WEATHER_DISTRIBUTIONS.create({
		sites: [
			{
				region: 0,
				climate: "test",
				latitude: 45,
				longitude: 0,
				elevationKm: 0,
				coastKm: 0,
			},
		],
		pairs: [],
		stepHours: 6,
		years: 1,
	})
	;[false, true, false, true].forEach((active, step) => {
		WEATHER_DISTRIBUTIONS.record({
			state,
			site: 0,
			instant: { ...snapshot.instant, year: 0, seconds: step * 21600 },
			values: {
				...snapshot.values!,
				localHour: [21, 3, 9, 21][step],
				dominant: active ? "spattering rain" : "clear skies",
				conditions: active
					? [
							{
								kind: "spattering rain",
								share: 1,
							},
						]
					: [],
			},
			traces: [
				{
					condition: "fog",
					gates: [
						{ name: "first", passed: false },
						{ name: "second", passed: true },
						{ name: "uncomputed", passed: null },
					],
				},
			],
		})
	})
	const report = WEATHER_DISTRIBUTIONS.finish(state)
	const rain = report.conditions.find((c) => c.kind === "spattering rain")!
	expect({
		completed: rain.completedRuns,
		histogram: rain.completedRunHistogramHours,
		right: rain.rightCensoredRuns,
		left: rain.leftCensoredRuns,
		gaps: rain.gapHistogramHours,
	}).toEqual({
		completed: 1,
		histogram: { 6: 1 },
		right: 1,
		left: 0,
		gaps: { 6: 1 },
	})
	expect(rain.bySite[0].activeDaysByYear).toEqual([1])
	const gates = report.triggerGates.all.fog
	expect({
		independent: gates[1].passed,
		reached: gates[1].funnelReached,
		unknown: gates[2].notEvaluated,
	}).toEqual({ independent: 4, reached: 0, unknown: 4 })
	const text = WEATHER_DISTRIBUTION_PRESENTATION.markdown(report)
	expect(text).toContain("\n\n## Overall")
	expect(text).not.toContain("\\n")
})
