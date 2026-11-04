import { expect, it } from "vitest"
import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import type { LocalWeatherValues } from "@/model/climate/weather/local/types"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"
import { WEATHER_DISTRIBUTIONS } from "@/test/earth/weather-distributions"
import { formatTemperatureDelta } from "@/ui/genesis/shared/ui-format"

it("records primary phenomena, their actual cloud category, wind and temperature departures", () => {
	const snapshot = LOCAL_WEATHER.sampleProvince({
		context: WEATHER_FIXTURE.context(),
		instant: WEATHER_FIXTURE.instant(),
		province: 0,
	})
	const fair: LocalWeatherValues = {
		...snapshot.values!,
		system: "clear",
		dominant: "clear skies",
		conditions: [{ kind: "clear skies", share: 1 }],
		cloudDescription: "clear skies",
		cloudCover: 0,
		clouds: [],
		windSpeedMs: 0,
		temperatureC: 20,
		temperatureNormalC: 26,
	}
	const rain: LocalWeatherValues = {
		...fair,
		system: "rainy",
		dominant: "light rain",
		conditions: [{ kind: "light rain", share: 1 }],
		cloudDescription: "altostratus clouds",
		cloudCover: 0.8,
		clouds: [
			{ genus: "altostratus", cover: 0.8, layer: "middle", estimated: true },
		],
		windSpeedMs: 12,
		temperatureC: 35,
		temperatureNormalC: 30,
	}
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
	for (const values of [fair, rain])
		WEATHER_DISTRIBUTIONS.record({
			state,
			site: 0,
			instant: { ...snapshot.instant, year: 0 },
			values,
			traces: [],
		})
	const report = WEATHER_DISTRIBUTIONS.finish(state),
		env = report.environment
	expect(env.overall.cloudDescriptions).toMatchObject({
		"clear skies": 1,
		"altostratus clouds": 1,
	})
	expect(env.byPhenomenon["clear skies"].samples).toBe(1)
	expect(
		env.byPhenomenon["light rain"].cloudDescriptions["altostratus clouds"],
	).toBe(1)
	expect(env.overall.departures).toEqual({
		colderThanUsual: 1,
		normal: 0,
		warmerThanUsual: 1,
	})
	expect(env.overall.wind).toMatchObject({ Calm: 1, "Strong breeze": 1 })
	expect(env.overall.departureMin).toBe(-6)
	expect(env.overall.departureMax).toBe(5)
	expect(formatTemperatureDelta(-6, "imperial")).toBe("-10.8 °F")
})
