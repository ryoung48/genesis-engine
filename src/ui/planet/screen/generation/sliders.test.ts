import { describe, expect, it, vi } from "vitest"
import { LUNA_MOON_SEED } from "@/model/celestial/moons/orbital-mechanics"
import {
	getEffectiveObliquityDeg,
	isRetrogradeObliquity,
} from "@/model/shared/units"
import { DEFAULT_WORLD_PARAMS } from "./defaults"
import {
	buildPlanetSliders,
	buildTerrainSliders,
	resetWorldDefaults,
} from "./sliders"

describe("buildPlanetSliders", () => {
	it("expresses year length relative to Earth using year length only", () => {
		const sliders = buildPlanetSliders({
			planetRadiusKm: 6371,
			obliquity: 23.5,
			eccentricity: 0.0167,
			perihelion: 102,
			spectralClass: "G",
			starSubtype: 2,
			orbitalDistanceAU: 1.0,
			daysPerYear: 365,
			hoursPerDay: 48,
			pressure: 1,
			landDistribution: 0.25,
			landCoverage: 0.3,
			tidallyLocked: false,
			antistellarLon: 180,
			setPlanetRadiusKm: vi.fn(),
			setObliquity: vi.fn(),
			setEccentricity: vi.fn(),
			setPerihelion: vi.fn(),
			setOrbitalDistanceAU: vi.fn(),
			setDaysPerYear: vi.fn(),
			setHoursPerDay: vi.fn(),
			setPressure: vi.fn(),
			setAxialTiltDirection: vi.fn(),
			setLandDistribution: vi.fn(),
			setLandCoverage: vi.fn(),
			setAntistellarLon: vi.fn(),
		})

		expect(
			sliders.find((slider) => slider.label === "Year Length")?.display,
		).toBe("1.00x")
		expect(
			sliders.find((slider) => slider.label === "Day Length")?.display,
		).toBe("2.00x")
	})

	it("presents land concentration as the inverse of land distribution", () => {
		const setLandDistribution = vi.fn()
		const sliders = buildPlanetSliders({
			planetRadiusKm: 6371,
			obliquity: 23.5,
			eccentricity: 0.0167,
			perihelion: 102,
			spectralClass: "G",
			starSubtype: 2,
			orbitalDistanceAU: 1.0,
			daysPerYear: 365,
			hoursPerDay: 24,
			pressure: 1,
			landDistribution: 0.25,
			landCoverage: 0.3,
			tidallyLocked: false,
			antistellarLon: 180,
			setPlanetRadiusKm: vi.fn(),
			setObliquity: vi.fn(),
			setEccentricity: vi.fn(),
			setPerihelion: vi.fn(),
			setOrbitalDistanceAU: vi.fn(),
			setDaysPerYear: vi.fn(),
			setHoursPerDay: vi.fn(),
			setPressure: vi.fn(),
			setAxialTiltDirection: vi.fn(),
			setLandDistribution,
			setLandCoverage: vi.fn(),
			setAntistellarLon: vi.fn(),
		})

		const slider = sliders.find(
			(candidate) => candidate.label === "Land Concentration",
		)

		expect(slider).toMatchObject({
			label: "Land Concentration",
			value: 0.75,
			display: "0.75",
			help: "Controls how concentrated the land is. Higher values cluster terrain into a supercontinent, while lower values scatter it across the world.",
		})

		slider?.set(0.9)

		expect(setLandDistribution).toHaveBeenCalledTimes(1)
		expect(setLandDistribution.mock.calls[0]?.[0]).toBeCloseTo(0.1)
	})

	it("renames the concentration slider for ocean-heavy worlds", () => {
		const sliders = buildPlanetSliders({
			planetRadiusKm: 6371,
			obliquity: 23.5,
			eccentricity: 0.0167,
			perihelion: 102,
			spectralClass: "G",
			starSubtype: 2,
			orbitalDistanceAU: 1.0,
			daysPerYear: 365,
			hoursPerDay: 24,
			pressure: 1,
			landDistribution: 0.25,
			landCoverage: 0.6,
			tidallyLocked: false,
			antistellarLon: 180,
			setPlanetRadiusKm: vi.fn(),
			setObliquity: vi.fn(),
			setEccentricity: vi.fn(),
			setPerihelion: vi.fn(),
			setOrbitalDistanceAU: vi.fn(),
			setDaysPerYear: vi.fn(),
			setHoursPerDay: vi.fn(),
			setPressure: vi.fn(),
			setAxialTiltDirection: vi.fn(),
			setLandDistribution: vi.fn(),
			setLandCoverage: vi.fn(),
			setAntistellarLon: vi.fn(),
		})

		expect(
			sliders.find((slider) => slider.label === "Ocean Concentration"),
		).toMatchObject({
			help: "Controls how concentrated the oceans are. Higher values cluster water into a superocean, while lower values scatter it across the world.",
		})
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
			spectralClass: "G",
			starSubtype: 2,
			orbitalDistanceAU: 1.0,
			daysPerYear: 365,
			hoursPerDay: 48,
			pressure: 1,
			landDistribution: 0.25,
			landCoverage: 0.3,
			tidallyLocked: false,
			antistellarLon: 180,
			setPlanetRadiusKm: vi.fn(),
			setObliquity,
			setEccentricity: vi.fn(),
			setPerihelion: vi.fn(),
			setOrbitalDistanceAU: vi.fn(),
			setDaysPerYear: vi.fn(),
			setHoursPerDay: vi.fn(),
			setPressure: vi.fn(),
			setAxialTiltDirection: vi.fn(),
			setLandDistribution: vi.fn(),
			setLandCoverage: vi.fn(),
			setAntistellarLon: vi.fn(),
		})

		expect(getEffectiveObliquityDeg(obliquity)).toBe(31.5)
		expect(
			sliders.find((slider) => slider.label === "Pressure")?.set,
		).toBeDefined()
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
			"Orbital Distance",
			"Pressure",
			"Axial Tilt",
			"Spin",
		])

		sliders.find((slider) => slider.label === "Axial Tilt")?.set(30)

		expect(setObliquity).toHaveBeenCalledWith(30)
		expect(obliquity).toBe(150)
	})

	it("swaps day length for antistellar longitude when tidally locked", () => {
		const sliders = buildPlanetSliders({
			planetRadiusKm: 6371,
			obliquity: 23.5,
			eccentricity: 0.0167,
			perihelion: 102,
			spectralClass: "G",
			starSubtype: 2,
			orbitalDistanceAU: 1.0,
			daysPerYear: 365,
			hoursPerDay: 24,
			pressure: 1,
			landDistribution: 0.25,
			landCoverage: 0.3,
			tidallyLocked: true,
			antistellarLon: 225,
			setPlanetRadiusKm: vi.fn(),
			setObliquity: vi.fn(),
			setEccentricity: vi.fn(),
			setPerihelion: vi.fn(),
			setOrbitalDistanceAU: vi.fn(),
			setDaysPerYear: vi.fn(),
			setHoursPerDay: vi.fn(),
			setPressure: vi.fn(),
			setAxialTiltDirection: vi.fn(),
			setLandDistribution: vi.fn(),
			setLandCoverage: vi.fn(),
			setAntistellarLon: vi.fn(),
		})

		expect(
			sliders.find((slider) => slider.label === "Day Length"),
		).toBeUndefined()
		expect(
			sliders.find((slider) => slider.label === "Antistellar Lon"),
		).toMatchObject({
			display: "225°",
		})
		expect(
			sliders.find((slider) => slider.label === "Axial Tilt"),
		).toMatchObject({
			display: "23.5°",
		})
		expect(sliders.find((slider) => slider.label === "Spin")).toMatchObject({
			display: "Prograde",
			disabled: true,
		})
	})
})

describe("buildTerrainSliders", () => {
	it("formats terrain controls from the supplied generation state", () => {
		const setNumPoints = vi.fn()
		const setCraters = vi.fn()
		const sliders = buildTerrainSliders({
			numPoints: 204000,
			jitter: 0.35,
			numPlates: 12,
			roughness: 0.45,
			continentSizeVariety: 0.6,
			terrainWarp: 0.8,
			smoothing: 0.15,
			hydraulicErosion: 0.25,
			thermalErosion: 0.4,
			ridgeSharpening: 0.5,
			glacialErosion: 0.6,
			seaLevel: 1.1,
			craters: 0.25,
			volcanism: 1,
			unitSystem: "metric",
			maxElevation: 6000,
			setNumPoints,
			setJitter: vi.fn(),
			setNumPlates: vi.fn(),
			setRoughness: vi.fn(),
			setContinentSizeVariety: vi.fn(),
			setTerrainWarp: vi.fn(),
			setSmoothing: vi.fn(),
			setHydraulicErosion: vi.fn(),
			setThermalErosion: vi.fn(),
			setRidgeSharpening: vi.fn(),
			setGlacialErosion: vi.fn(),
			setSeaLevel: vi.fn(),
			setCraters,
			setVolcanism: vi.fn(),
			setMaxElevation: vi.fn(),
		})

		expect(sliders.map((slider) => slider.label)).toEqual([
			"Detail",
			"Irregularity",
			"Plates",
			"Roughness",
			"Size Variety",
			"Terrain Warp",
			"Smoothing",
			"Hydraulic Erosion",
			"Thermal Erosion",
			"Ridge Sharpening",
			"Glacial Erosion",
			"Sea Level",
			"Max Elevation",
			"Craters",
			"Volcanism",
		])
		expect(sliders.find((slider) => slider.label === "Plates")?.display).toBe(
			"12",
		)
		expect(sliders.find((slider) => slider.label === "Detail")?.display).toBe(
			"204k",
		)
		expect(sliders.find((slider) => slider.label === "Craters")?.display).toBe(
			"0.25",
		)
		expect(sliders.find((slider) => slider.label === "Detail")?.set).toBe(
			setNumPoints,
		)
		expect(sliders.find((slider) => slider.label === "Craters")?.set).toBe(
			setCraters,
		)
	})
})

describe("resetWorldDefaults", () => {
	it("forwards every generation setter to the default world parameters", () => {
		const setters = {
			setNumPoints: vi.fn(),
			setJitter: vi.fn(),
			setNumPlates: vi.fn(),
			setLandDistribution: vi.fn(),
			setContinentSizeVariety: vi.fn(),
			setLandCoverage: vi.fn(),
			setRoughness: vi.fn(),
			setPlanetRadiusKm: vi.fn(),
			setObliquity: vi.fn(),
			setEccentricity: vi.fn(),
			setSpectralClass: vi.fn(),
			setStarSubtype: vi.fn(),
			setOrbitalDistanceAU: vi.fn(),
			setDaysPerYear: vi.fn(),
			setHoursPerDay: vi.fn(),
			setTidallyLocked: vi.fn(),
			setAntistellarLon: vi.fn(),
			setPerihelion: vi.fn(),
			setPressure: vi.fn(),
			setMoonCount: vi.fn(),
			setMoonSeed: vi.fn(),
			setTerrainWarp: vi.fn(),
			setSmoothing: vi.fn(),
			setHydraulicErosion: vi.fn(),
			setThermalErosion: vi.fn(),
			setRidgeSharpening: vi.fn(),
			setGlacialErosion: vi.fn(),
			setSeaLevel: vi.fn(),
			setVolcanism: vi.fn(),
			setCraters: vi.fn(),
			setMaxElevation: vi.fn(),
			setEra: vi.fn(),
		}

		resetWorldDefaults(setters)

		expect(setters.setNumPoints).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.numPoints,
		)
		expect(setters.setJitter).toHaveBeenCalledWith(DEFAULT_WORLD_PARAMS.jitter)
		expect(setters.setNumPlates).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.numPlates,
		)
		expect(setters.setLandDistribution).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.landDistribution,
		)
		expect(setters.setContinentSizeVariety).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.continentSizeVariety,
		)
		expect(setters.setLandCoverage).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.landCoverage,
		)
		expect(setters.setRoughness).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.roughness,
		)
		expect(setters.setPlanetRadiusKm).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.planetRadiusKm,
		)
		expect(setters.setObliquity).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.obliquity,
		)
		expect(setters.setEccentricity).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.eccentricity,
		)
		expect(setters.setSpectralClass).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.spectralClass,
		)
		expect(setters.setStarSubtype).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.starSubtype,
		)
		expect(setters.setOrbitalDistanceAU).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.orbitalDistanceAU,
		)
		expect(setters.setDaysPerYear).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.daysPerYear,
		)
		expect(setters.setHoursPerDay).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.hoursPerDay,
		)
		expect(setters.setTidallyLocked).toHaveBeenCalledWith(false)
		expect(setters.setAntistellarLon).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.antistellarLon,
		)
		expect(setters.setPerihelion).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.perihelion,
		)
		expect(setters.setPressure).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.pressure,
		)
		expect(setters.setTerrainWarp).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.terrainWarp,
		)
		expect(setters.setSmoothing).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.smoothing,
		)
		expect(setters.setHydraulicErosion).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.hydraulicErosion,
		)
		expect(setters.setThermalErosion).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.thermalErosion,
		)
		expect(setters.setRidgeSharpening).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.ridgeSharpening,
		)
		expect(setters.setGlacialErosion).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.glacialErosion,
		)
		expect(setters.setSeaLevel).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.seaLevel,
		)
		expect(setters.setVolcanism).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.volcanism,
		)
		expect(setters.setCraters).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.craters,
		)
		expect(setters.setMaxElevation).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.maxElevation,
		)
		expect(setters.setMoonCount).toHaveBeenCalledWith(
			DEFAULT_WORLD_PARAMS.moonCount,
		)
		expect(setters.setMoonSeed).toHaveBeenCalledWith(LUNA_MOON_SEED)
	})
})
