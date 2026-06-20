import { SLIDER_RANGES } from "@/model/shared/slider-ranges"
import {
	getHabitableZoneAU,
	getStarLuminositySol,
	isValidSpectralClass,
	type MainSequenceClass,
} from "@/model/shared/star-types"
import {
	DEFAULT_PLANET_RADIUS_KM,
	getEffectiveObliquityDeg,
	getMaxOceanDepthKm,
} from "@/model/shared/units"
import type { SocietyEra } from "@/model/society/eras"
import { computeSeaLevelOffsetKm } from "@/model/terrain/sea-level"
import { formatCompactNumber } from "../../hover/info-panel-format"
import type { UnitSystem } from "../shared/ui-format"
import { DEFAULT_WORLD_PARAMS } from "./defaults"

const SR = SLIDER_RANGES

export interface SliderDef {
	label: string
	help: string
	value: number
	display: string
	min: number
	max: number
	step: number
	set: (v: number) => void
	disabled?: boolean
}

export function buildPlanetSliders(state: {
	planetRadiusKm: number
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	daysPerYear: number
	hoursPerDay: number
	pressure: number
	tidalStrength: number
	landDistribution: number
	landCoverage: number
	tidallyLocked: boolean
	antistellarLon: number
	setPlanetRadiusKm: (v: number) => void
	setObliquity: (v: number) => void
	setEccentricity: (v: number) => void
	setPerihelion: (v: number) => void
	setOrbitalDistanceAU: (v: number) => void
	setDaysPerYear: (v: number) => void
	setHoursPerDay: (v: number) => void
	setPressure: (v: number) => void
	setTidalStrength: (v: number) => void
	setAxialTiltDirection: (v: number) => void
	setLandDistribution: (v: number) => void
	setLandCoverage: (v: number) => void
	setAntistellarLon: (v: number) => void
}): SliderDef[] {
	return [
		{
			label: "Radius",
			help: "Sets the planet's physical size for climate and distance calculations.",
			value: state.planetRadiusKm,
			display: `${(state.planetRadiusKm / DEFAULT_PLANET_RADIUS_KM).toFixed(2)}x`,
			...SR.planetRadiusKm,
			set: state.setPlanetRadiusKm,
		},
		(() => {
			const cls: MainSequenceClass = isValidSpectralClass(state.spectralClass)
				? state.spectralClass
				: "G"
			const lum = getStarLuminositySol(cls, state.starSubtype)
			const hz = getHabitableZoneAU(lum)
			const hzFactor = hz > 0 ? state.orbitalDistanceAU / hz : 1
			return {
				label: "Orbital Distance",
				help: "Distance from the star relative to the habitable zone centre. 1.00× HZ = ideal insolation for liquid water.",
				value: hzFactor,
				display: `${hzFactor.toFixed(2)}× HZ`,
				min: 0.5,
				max: 1.5,
				step: 0.01,
				set: (v: number) => state.setOrbitalDistanceAU(v * hz),
			}
		})(),
		{
			label: "Pressure",
			help: "Atmospheric pressure in bars. Higher pressure increases water vapor capacity and cloud formation; lower pressure suppresses it.",
			value: state.pressure,
			display: `${state.pressure.toFixed(1)} bar`,
			...SR.pressure,
			set: state.setPressure,
		},
		{
			label: "Axial Tilt",
			help: "Sets the base seasonal tilt from 0 to 90 degrees. Use the direction control to switch between prograde and retrograde, which mirrors the stored obliquity as 180 - x. On tidally locked worlds this approximates a Cassini-state obliquity.",
			value: getEffectiveObliquityDeg(state.obliquity),
			display: `${getEffectiveObliquityDeg(state.obliquity).toFixed(1)}°`,
			min: 0,
			max: 90,
			step: 0.5,
			set: state.setObliquity,
		},
		{
			label: "Spin",
			help: "Prograde spin matches the usual rotation direction; retrograde spin reverses it.",
			value: state.obliquity <= 90 ? 0 : 1,
			display: state.obliquity <= 90 ? "Prograde" : "Retrograde",
			min: 0,
			max: 1,
			step: 1,
			set: state.setAxialTiltDirection,
			disabled: state.tidallyLocked,
		},
		{
			label: "Eccentricity",
			help: "Controls how circular or stretched the orbit is, increasing seasonal contrast as it rises.",
			value: state.eccentricity,
			display: state.eccentricity.toFixed(3),
			...SR.eccentricity,
			set: state.setEccentricity,
		},
		{
			label: "Perihelion",
			help: "Orbital angle of closest approach to the star in degrees. Affects when peak insolation occurs during the year.",
			value: state.perihelion,
			display: `${state.perihelion.toFixed(0)}\u00B0`,
			...SR.perihelion,
			set: state.setPerihelion,
		},
		...(!state.tidallyLocked
			? [
					{
						label: "Day Length",
						help: "Sets the rotation period in local hours. Shorter days mix heat more strongly; longer days reduce that effect.",
						value: state.hoursPerDay,
						display: `${(state.hoursPerDay / 24).toFixed(2)}x`,
						...SR.hoursPerDay,
						set: state.setHoursPerDay,
					},
				]
			: []),
		...(state.tidallyLocked
			? [
					{
						label: "Antistellar Lon",
						help: "Longitude of the antistellar point (permanent dark side center).",
						value: state.antistellarLon,
						display: `${state.antistellarLon.toFixed(0)}\u00B0`,
						...SR.antistellarLon,
						set: state.setAntistellarLon,
					},
				]
			: []),
		{
			label:
				state.landCoverage >= 0.5
					? "Ocean Concentration"
					: "Land Concentration",
			help:
				state.landCoverage >= 0.5
					? "Controls how concentrated the oceans are. Higher values cluster water into a superocean, while lower values scatter it across the world."
					: "Controls how concentrated the land is. Higher values cluster terrain into a supercontinent, while lower values scatter it across the world.",
			value: 1 - state.landDistribution,
			display: (1 - state.landDistribution).toFixed(2),
			...SR.landDistribution,
			set: (value) => state.setLandDistribution(1 - value),
		},
		{
			label: "Land Coverage",
			help: "Sets the overall land-to-ocean balance for the world.",
			value: state.landCoverage,
			display: `${(state.landCoverage * 100).toFixed(0)}%`,
			...SR.landCoverage,
			set: state.setLandCoverage,
		},
		{
			label: "Tides",
			help: "Tidal force multiplier. 1.0x = Earth's lunar+solar regime. 0 = no moon, negligible tides. Higher values create stronger tidal ranges and more coastal wetlands. Disabled on tidally locked worlds.",
			value: state.tidalStrength,
			display: `${state.tidalStrength.toFixed(1)}x`,
			...SR.tidalStrength,
			set: state.setTidalStrength,
			disabled: state.tidallyLocked,
		},
	]
}

export function buildTerrainSliders(state: {
	numPoints: number
	jitter: number
	numPlates: number
	roughness: number
	continentSizeVariety: number
	terrainWarp: number
	smoothing: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	glacialErosion: number
	seaLevel: number
	craters: number
	volcanism: number
	unitSystem: UnitSystem
	maxElevation: number
	setNumPoints: (v: number) => void
	setJitter: (v: number) => void
	setNumPlates: (v: number) => void
	setRoughness: (v: number) => void
	setContinentSizeVariety: (v: number) => void
	setTerrainWarp: (v: number) => void
	setSmoothing: (v: number) => void
	setHydraulicErosion: (v: number) => void
	setThermalErosion: (v: number) => void
	setRidgeSharpening: (v: number) => void
	setGlacialErosion: (v: number) => void
	setSeaLevel: (v: number) => void
	setCraters: (v: number) => void
	setVolcanism: (v: number) => void
	setMaxElevation: (v: number) => void
}): SliderDef[] {
	return [
		{
			label: "Detail",
			help: "Higher detail sharpens coastlines and terrain, but takes longer to build.",
			value: state.numPoints,
			display: formatCompactNumber(state.numPoints),
			...SR.numPoints,
			set: state.setNumPoints,
		},
		{
			label: "Irregularity",
			help: "Controls how even or organic the underlying mesh feels.",
			value: state.jitter,
			display: state.jitter.toFixed(2),
			...SR.jitter,
			set: state.setJitter,
		},
		{
			label: "Plates",
			help: "More plates create more tectonic boundaries, coasts, and terrain partitions.",
			value: state.numPlates,
			display: String(state.numPlates),
			...SR.numPlates,
			set: state.setNumPlates,
		},
		{
			label: "Roughness",
			help: "Adds fractal detail to mountains, ridges, and coastlines.",
			value: state.roughness,
			display: state.roughness.toFixed(2),
			...SR.roughness,
			set: state.setRoughness,
		},
		{
			label: "Size Variety",
			help: "Makes plate-driven landmasses or seas more equal-sized or more uneven.",
			value: state.continentSizeVariety,
			display: state.continentSizeVariety.toFixed(2),
			...SR.continentSizeVariety,
			set: state.setContinentSizeVariety,
		},
		{
			label: "Terrain Warp",
			help: "Twists the raw terrain field into more organic coastlines and ridges.",
			value: state.terrainWarp,
			display: state.terrainWarp.toFixed(2),
			...SR.terrainWarp,
			set: state.setTerrainWarp,
		},
		{
			label: "Smoothing",
			help: "Softens hard tectonic edges and blends abrupt elevation transitions.",
			value: state.smoothing,
			display: state.smoothing.toFixed(2),
			...SR.smoothing,
			set: state.setSmoothing,
		},
		{
			label: "Hydraulic Erosion",
			help: "Cuts river valleys and drainage networks into the terrain.",
			value: state.hydraulicErosion,
			display: state.hydraulicErosion.toFixed(2),
			...SR.hydraulicErosion,
			set: state.setHydraulicErosion,
		},
		{
			label: "Thermal Erosion",
			help: "Moves loose material downhill, softening ridges and steep slopes.",
			value: state.thermalErosion,
			display: state.thermalErosion.toFixed(2),
			...SR.thermalErosion,
			set: state.setThermalErosion,
		},
		{
			label: "Ridge Sharpening",
			help: "Pushes ridgelines above their surroundings for a stronger mountain silhouette.",
			value: state.ridgeSharpening,
			display: state.ridgeSharpening.toFixed(2),
			...SR.ridgeSharpening,
			set: state.setRidgeSharpening,
		},
		{
			label: "Glacial Erosion",
			help: "Carves fjords, basins, and U-shaped valleys into cold high terrain.",
			value: state.glacialErosion,
			display: state.glacialErosion.toFixed(2),
			...SR.glacialErosion,
			set: state.setGlacialErosion,
		},
		{
			label: "Sea Level",
			help: "Shifts the final shoreline after volcanism and craters are applied. 1.00x keeps the baseline sea level unchanged.",
			value: state.seaLevel,
			display: (() => {
				const offsetKm = computeSeaLevelOffsetKm(
					state.seaLevel,
					getMaxOceanDepthKm(DEFAULT_PLANET_RADIUS_KM),
				)
				const sign = offsetKm > 0 ? "+" : offsetKm < 0 ? "−" : ""
				if (state.unitSystem === "imperial") {
					return `${sign}${Math.round(Math.abs(offsetKm) * 3280.84).toLocaleString()} ft`
				}
				return `${sign}${Math.round(Math.abs(offsetKm) * 1000).toLocaleString()} m`
			})(),
			...SR.seaLevel,
			set: state.setSeaLevel,
		},
		{
			label: "Max Elevation",
			help: "Sets the maximum mountain height in meters. Higher values allow taller mountain ranges to form during tectonic uplift.",
			value: state.maxElevation,
			display: (() => {
				const km = state.maxElevation / 1000
				if (state.unitSystem === "imperial") {
					return `${(km * 0.621371).toFixed(1)} mi`
				}
				return `${km.toFixed(1)} km`
			})(),
			...SR.maxElevation,
			set: state.setMaxElevation,
		},
		{
			label: "Craters",
			help: "Stamps impact craters onto the surface. Higher values produce more and larger craters.",
			value: state.craters,
			display: state.craters.toFixed(2),
			...SR.craters,
			set: state.setCraters,
		},
		{
			label: "Volcanism",
			help: "Controls hotspot and volcanic feature frequency on a 0-10 scale. 0 disables hotspots, island arcs, volcanic arcs, and LIPs. 1 matches the old baseline setting, and values above 1 progressively make volcanic features more common without relying on runaway peak heights.",
			value: state.volcanism,
			display: state.volcanism.toFixed(2),
			...SR.volcanism,
			set: state.setVolcanism,
		},
	]
}

export function resetWorldDefaults(setters: {
	setNumPoints: (v: number) => void
	setJitter: (v: number) => void
	setNumPlates: (v: number) => void
	setLandDistribution: (v: number) => void
	setContinentSizeVariety: (v: number) => void
	setLandCoverage: (v: number) => void
	setRoughness: (v: number) => void
	setPlanetRadiusKm: (v: number) => void
	setObliquity: (v: number) => void
	setEccentricity: (v: number) => void
	setSpectralClass: (v: string) => void
	setStarSubtype: (v: number) => void
	setOrbitalDistanceAU: (v: number) => void
	setDaysPerYear: (v: number) => void
	setHoursPerDay: (v: number) => void
	setTidallyLocked: (v: boolean) => void
	setAntistellarLon: (v: number) => void
	setPerihelion: (v: number) => void
	setPressure: (v: number) => void
	setTidalStrength: (v: number) => void
	setTerrainWarp: (v: number) => void
	setSmoothing: (v: number) => void
	setHydraulicErosion: (v: number) => void
	setThermalErosion: (v: number) => void
	setRidgeSharpening: (v: number) => void
	setGlacialErosion: (v: number) => void
	setSeaLevel: (v: number) => void
	setCraters: (v: number) => void
	setVolcanism: (v: number) => void
	setMaxElevation: (v: number) => void
	setEra: (v: SocietyEra) => void
}): void {
	setters.setNumPoints(DEFAULT_WORLD_PARAMS.numPoints)
	setters.setJitter(DEFAULT_WORLD_PARAMS.jitter)
	setters.setNumPlates(DEFAULT_WORLD_PARAMS.numPlates)
	setters.setLandDistribution(DEFAULT_WORLD_PARAMS.landDistribution)
	setters.setContinentSizeVariety(DEFAULT_WORLD_PARAMS.continentSizeVariety)
	setters.setLandCoverage(DEFAULT_WORLD_PARAMS.landCoverage)
	setters.setRoughness(DEFAULT_WORLD_PARAMS.roughness)
	setters.setPlanetRadiusKm(DEFAULT_WORLD_PARAMS.planetRadiusKm)
	setters.setObliquity(DEFAULT_WORLD_PARAMS.obliquity)
	setters.setEccentricity(DEFAULT_WORLD_PARAMS.eccentricity)
	setters.setSpectralClass(DEFAULT_WORLD_PARAMS.spectralClass)
	setters.setStarSubtype(DEFAULT_WORLD_PARAMS.starSubtype)
	setters.setOrbitalDistanceAU(DEFAULT_WORLD_PARAMS.orbitalDistanceAU)
	setters.setDaysPerYear(DEFAULT_WORLD_PARAMS.daysPerYear)
	setters.setHoursPerDay(DEFAULT_WORLD_PARAMS.hoursPerDay)
	setters.setTidallyLocked(false)
	setters.setAntistellarLon(DEFAULT_WORLD_PARAMS.antistellarLon)
	setters.setPerihelion(DEFAULT_WORLD_PARAMS.perihelion)
	setters.setPressure(DEFAULT_WORLD_PARAMS.pressure)
	setters.setTerrainWarp(DEFAULT_WORLD_PARAMS.terrainWarp)
	setters.setSmoothing(DEFAULT_WORLD_PARAMS.smoothing)
	setters.setHydraulicErosion(DEFAULT_WORLD_PARAMS.hydraulicErosion)
	setters.setThermalErosion(DEFAULT_WORLD_PARAMS.thermalErosion)
	setters.setRidgeSharpening(DEFAULT_WORLD_PARAMS.ridgeSharpening)
	setters.setGlacialErosion(DEFAULT_WORLD_PARAMS.glacialErosion)
	setters.setSeaLevel(DEFAULT_WORLD_PARAMS.seaLevel)
	setters.setCraters(DEFAULT_WORLD_PARAMS.craters)
	setters.setVolcanism(DEFAULT_WORLD_PARAMS.volcanism)
	setters.setMaxElevation(DEFAULT_WORLD_PARAMS.maxElevation)
	setters.setEra(DEFAULT_WORLD_PARAMS.era)
	setters.setTidalStrength(DEFAULT_WORLD_PARAMS.tidalStrength)
}
