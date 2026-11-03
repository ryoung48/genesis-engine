import { expect, it } from "vitest"
import type { MoonBody } from "@/model/celestial/moons/types"
import { WEATHER_SKY } from "@/model/climate/weather/local/sky"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"

function equinox() {
	const instant = WEATHER_FIXTURE.instant()
	return {
		...instant,
		seconds: 0,
		solarLongitudeRad: 0,
		solarDaySeconds: 86400,
		retrograde: false,
		sun: [1, 0, 0] as [number, number, number],
	}
}

it("places sunrise and sunset symmetrically around noon with polar limits", () => {
	const sun = WEATHER_SKY.sun({ instant: equinox(), latitudeDeg: 0 })
	expect(sun.cycle).toBe("cycle")
	expect(sun.daylightHours).toBeCloseTo(12.11, 1)
	expect(sun.riseHour! + sun.setHour!).toBeCloseTo(24, 6)
	const summer = {
		...equinox(),
		sun: [Math.cos(0.41), 0, Math.sin(0.41)] as [number, number, number],
	}
	expect(WEATHER_SKY.sun({ instant: summer, latitudeDeg: 80 }).cycle).toBe(
		"alwaysUp",
	)
	expect(
		WEATHER_SKY.sun({ instant: summer, latitudeDeg: -80 }).daylightHours,
	).toBe(0)
	expect(
		WEATHER_SKY.sun({
			instant: { ...equinox(), solarDaySeconds: null },
			latitudeDeg: 0,
		}).cycle,
	).toBe("locked")
})

it("derives moon phase from elongation and moonlight from time above the horizon", () => {
	const moon = {
		name: "Luna",
		orbitalPeriodDays: 27.3,
		meanAnomalyAtEpochDeg: 180,
		longitudeOfPerihelionDeg: 0,
		longitudeOfAscendingNodeDeg: 0,
	} as unknown as MoonBody
	const [full] = WEATHER_SKY.moons({
		instant: equinox(),
		latitudeDeg: 0,
		moons: [moon],
	})
	expect(full.phase).toBe("full")
	expect(full.illumination).toBeCloseTo(1, 6)
	expect(full.riseHour).toBeCloseTo(18, 0)
	expect(full.setHour).toBeCloseTo(6, 0)
	expect(full.upHours!).toBeCloseTo(12.03, 1)
	const [fresh] = WEATHER_SKY.moons({
		instant: equinox(),
		latitudeDeg: 0,
		moons: [{ ...moon, meanAnomalyAtEpochDeg: 0 }],
	})
	expect(fresh.phase).toBe("new")
	expect(fresh.riseHour).toBeCloseTo(6, 0)
})
