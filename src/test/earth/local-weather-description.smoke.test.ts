import { expect, it } from "vitest"
import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import { WEATHER_AGGREGATION } from "@/model/climate/weather/local/aggregation"
import { WEATHER_COMFORT } from "@/model/climate/weather/local/comfort"
import type { LocalWeatherValues } from "@/model/climate/weather/local/types"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"
import { WEATHER_DISPLAY } from "@/ui/genesis/shared/weather-display"

function snapshot() {
	const result = LOCAL_WEATHER.sampleProvince({
		context: WEATHER_FIXTURE.context(),
		instant: WEATHER_FIXTURE.instant(),
		province: 0,
	})
	const values: LocalWeatherValues = {
		...result.values!,
		temperatureC: 20,
		temperatureNormalC: 20,
		windU: 4,
		windV: 0,
		windSpeedMs: 4,
		windDirectionDeg: 270,
		conditions: [{ kind: "clear skies", share: 1 }],
		dominant: "clear skies",
		cloudCover: 0,
		clouds: [],
		cloudDescription: "clear skies",
	}
	return { ...result, values }
}
it("displays the generated phenomenon and cloud category without reclassifying them", () => {
	const weather = snapshot(),
		before = structuredClone(weather)
	const metric = WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})!,
		imperial = WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "imperial",
			dateLabel: "",
		})!
	expect(metric.conditions).toBe("Clear skies")
	expect(metric.sky).toBe("Clear · 0%")
	expect(metric.clouds).toBe("Clear skies")
	expect(metric.temperature).toBe("Mild · 20.0 °C")
	expect(imperial.temperature).toBe("Mild · 68.0 °F")
	expect(metric.wind).toBe("Gentle breeze · W 4.0 m/s")
	expect(imperial.wind).toBe("Gentle breeze · W 8.9 mph")
	expect(weather).toEqual(before)
	weather.values.dominant = "light rain"
	weather.values.conditions = [{ kind: "light rain", share: 1 }]
	weather.values.cloudDescription = "altostratus clouds"
	weather.values.cloudCover = 0.6
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})!.conditions,
	).toBe("Light rain")
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})!.clouds,
	).toBe("Altostratus clouds")
})
it("marks unusual temperature independently of display units", () => {
	const weather = snapshot()
	weather.values.temperatureNormalC = 15
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})?.temperature,
	).toBe("Mild (warmer than usual) · 20.0 °C")
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "imperial",
			dateLabel: "",
		})?.temperature,
	).toBe("Mild (warmer than usual) · 68.0 °F")
	weather.values.temperatureNormalC = 25
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})?.temperature,
	).toContain("colder than usual")
})
it("uses actual solar context for time-of-day wording and opposite hemisphere seasons", () => {
	const weather = snapshot()
	weather.values.latitudeDeg = 45
	weather.instant.sun = [1, 0, 0]
	weather.instant.solarLongitudeRad = Math.PI / 2
	const hours = weather.instant.solarDaySeconds! / 3600
	weather.values.localHour = hours * 0.3
	weather.values.solarElevationDeg = 20
	weather.values.daylight = true
	const morning = WEATHER_DISPLAY.present({
		snapshot: weather,
		unitSystem: "metric",
		dateLabel: "",
	})!
	expect(morning.time).toContain("Morning")
	expect(morning.tiles.find((tile) => tile.label === "Season")?.value).toBe(
		"Summer",
	)
	weather.values.latitudeDeg = -45
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})?.tiles.find((tile) => tile.label === "Season")?.value,
	).toBe("Winter")
	weather.values.localHour = hours * 0.2
	weather.values.solarElevationDeg = -3
	weather.values.daylight = false
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})?.time,
	).toContain("Dawn")
	weather.values.localHour = hours * 0.8
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})?.time,
	).toContain("Dusk")
	weather.values.solarElevationDeg = -20
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})?.time,
	).toContain("Night")
	weather.instant.locked = true
	weather.instant.solarDaySeconds = null
	weather.values.localHour = null
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})?.tiles.find((tile) => tile.label === "Local time")?.value,
	).toBe("Dark")
})
it("does not impose dawn on polar night or axial seasons on an untilted world", () => {
	const weather = snapshot()
	weather.values.latitudeDeg = 80
	weather.instant.sun = [Math.cos(Math.PI / 6), 0, -0.5]
	weather.values.daylight = false
	weather.values.solarElevationDeg = -3
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})?.time,
	).toContain("Polar night")
	weather.instant.tiltDeg = 0
	expect(
		WEATHER_DISPLAY.present({
			snapshot: weather,
			unitSystem: "metric",
			dateLabel: "",
		})?.tiles.find((tile) => tile.label === "Season")?.value,
	).toBe("No axial seasons")
})
it("matches the NWS heat index and wind chill tables", () => {
	const f = (c: number) => (c * 9) / 5 + 32
	const c = (f: number) => ((f - 32) * 5) / 9
	expect(
		WEATHER_COMFORT.relativeHumidity({ temperatureC: 12, dewPointC: 12 }),
	).toBeCloseTo(100, 6)
	expect(
		f(
			WEATHER_COMFORT.apparentTemperature({
				temperatureC: c(90),
				relativeHumidity: 70,
				windSpeedMs: 2,
			}),
		),
	).toBeCloseTo(106, 0)
	expect(
		f(
			WEATHER_COMFORT.apparentTemperature({
				temperatureC: c(15),
				relativeHumidity: 50,
				windSpeedMs: 10 / 2.23694,
			}),
		),
	).toBeCloseTo(3, 0)
	expect(
		WEATHER_COMFORT.apparentTemperature({
			temperatureC: 18,
			relativeHumidity: 50,
			windSpeedMs: 8,
		}),
	).toBe(18)
})
it("names a province's clouds from its cloudiest sample when the representative sample is clear", () => {
	const clear = { ...snapshot().values, rainRateMmH: 0 }
	const cloudy: LocalWeatherValues = {
		...clear,
		dominant: "cloudy",
		conditions: [{ kind: "cloudy", share: 1 }],
		cloudCover: 0.8,
		cloudDescription: "cumulus clouds",
	}
	const combined = WEATHER_AGGREGATION.combine({
		samples: [
			{ region: 0, weight: 0.6, values: clear },
			{ region: 1, weight: 0.4, values: cloudy },
		],
	})!
	expect(combined.dominant).toBe("clear skies")
	expect(combined.cloudCover).toBeCloseTo(0.32, 12)
	expect(combined.cloudDescription).toBe("cumulus clouds")
	expect(
		WEATHER_AGGREGATION.combine({
			samples: [{ region: 0, weight: 1, values: clear }],
		})!.cloudDescription,
	).toBe("clear skies")
})
