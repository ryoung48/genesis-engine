import { describe, expect, it, vi } from "vitest"
import {
	getEffectiveObliquityDeg,
	isRetrogradeObliquity,
} from "@/model/orogen/util/units"
import { buildPlanetSliders } from "./sliders"

describe("buildPlanetSliders", () => {
	it("expresses year length relative to Earth using year length only", () => {
		const sliders = buildPlanetSliders({
			planetRadiusKm: 6371,
			obliquity: 23.5,
			eccentricity: 0.0167,
			perihelion: 102,
			sunTempFactor: 1,
			daysPerYear: 365,
			hoursPerDay: 48,
			pressure: 1,
			volcanism: 1,
			landDistribution: 0.25,
			landCoverage: 0.3,
			tidallyLocked: false,
			antistellarLon: 180,
			setPlanetRadiusKm: vi.fn(),
			setObliquity: vi.fn(),
			setEccentricity: vi.fn(),
			setPerihelion: vi.fn(),
			setSunTempFactor: vi.fn(),
			setDaysPerYear: vi.fn(),
			setHoursPerDay: vi.fn(),
			setPressure: vi.fn(),
			setVolcanism: vi.fn(),
			setAxialTiltDirection: vi.fn(),
			setLandDistribution: vi.fn(),
			setLandCoverage: vi.fn(),
			setAntistellarLon: vi.fn(),
		})

		expect(
			sliders.find((slider) => slider.label === "Year Length")?.display,
		).toBe("1.00x Earth")
		expect(
			sliders.find((slider) => slider.label === "Day Length")?.display,
		).toBe("2.00x Earth")
	})

	it("shows base tilt on the planet tab and preserves retrograde mirroring", () => {
		let obliquity = 148.5
		const setObliquity = vi.fn((value: number) => {
			obliquity = isRetrogradeObliquity(obliquity) ? 180 - value : value
		})

		const sliders = buildPlanetSliders({
			planetRadiusKm: 6371,
			obliquity,
			eccentricity: 0.0167,
			perihelion: 102,
			sunTempFactor: 1,
			daysPerYear: 365,
			hoursPerDay: 48,
			pressure: 1,
			volcanism: 1,
			landDistribution: 0.25,
			landCoverage: 0.3,
			tidallyLocked: false,
			antistellarLon: 180,
			setPlanetRadiusKm: vi.fn(),
			setObliquity,
			setEccentricity: vi.fn(),
			setPerihelion: vi.fn(),
			setSunTempFactor: vi.fn(),
			setDaysPerYear: vi.fn(),
			setHoursPerDay: vi.fn(),
			setPressure: vi.fn(),
			setVolcanism: vi.fn(),
			setAxialTiltDirection: vi.fn(),
			setLandDistribution: vi.fn(),
			setLandCoverage: vi.fn(),
			setAntistellarLon: vi.fn(),
		})

		expect(getEffectiveObliquityDeg(obliquity)).toBe(31.5)
		expect(
			sliders.find((slider) => slider.label === "Pressure")?.set,
		).toBeDefined()
		expect(
			sliders.find((slider) => slider.label === "Volcanism")?.display,
		).toBe("1.00")
		expect(sliders.find((slider) => slider.label === "Spin")?.display).toBe(
			"Retrograde",
		)
		expect(sliders.find((slider) => slider.label === "Spin")).toMatchObject({
			min: 0,
			max: 1,
			step: 1,
		})
		expect(sliders.slice(0, 5).map((slider) => slider.label)).toEqual([
			"Radius",
			"Sun Temp",
			"Pressure",
			"Volcanism",
			"Axial Tilt",
		])

		sliders.find((slider) => slider.label === "Axial Tilt")?.set(30)

		expect(setObliquity).toHaveBeenCalledWith(30)
		expect(obliquity).toBe(150)
	})
})
