import { SLIDER_RANGES } from "@/model/shared/slider-ranges"
import {
	DEFAULT_PLANET_RADIUS_KM,
	getEarthYearFactor,
	getEffectiveObliquityDeg,
} from "@/model/shared/units"
import { formatCompactNumber } from "../../hover/info-panel-format"
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
	sunTempFactor: number
	daysPerYear: number
	hoursPerDay: number
	pressure: number
	volcanism: number
	landDistribution: number
	landCoverage: number
	tidallyLocked: boolean
	antistellarLon: number
	setPlanetRadiusKm: (v: number) => void
	setObliquity: (v: number) => void
	setEccentricity: (v: number) => void
	setPerihelion: (v: number) => void
	setSunTempFactor: (v: number) => void
	setDaysPerYear: (v: number) => void
	setHoursPerDay: (v: number) => void
	setPressure: (v: number) => void
	setVolcanism: (v: number) => void
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
		{
			label: "Sun Temp",
			help: "Scales stellar temperature relative to Sol. 1.0x matches the Sun, 0.5x is half as hot.",
			value: state.sunTempFactor,
			display: `${state.sunTempFactor.toFixed(2)}x`,
			...SR.sunTempFactor,
			set: state.setSunTempFactor,
		},
		{
			label: "Pressure",
			help: "Atmospheric pressure in bars. Lower pressure increases evaporation and cloud formation; higher pressure suppresses it.",
			value: state.pressure,
			display: `${state.pressure.toFixed(1)} bar`,
			...SR.pressure,
			set: state.setPressure,
		},
		{
			label: "Volcanism",
			help: "Controls hotspot and volcanic activity on a 0-10 scale. 1 matches the old mid setting, 2 matches the old maximum, and values above 2 progressively push volcanic climate and terrain effects into much more extreme territory without relying on runaway peak heights.",
			value: state.volcanism,
			display: state.volcanism.toFixed(2),
			...SR.volcanism,
			set: state.setVolcanism,
		},
		{
			label: "Axial Tilt",
			help: "Sets the base seasonal tilt from 0 to 90 degrees. Use the direction control to switch between prograde and retrograde, which mirrors the stored obliquity as 180 - x.",
			value: state.tidallyLocked
				? 0
				: getEffectiveObliquityDeg(state.obliquity),
			display: state.tidallyLocked
				? "0.0°"
				: `${getEffectiveObliquityDeg(state.obliquity).toFixed(1)}°`,
			min: 0,
			max: 90,
			step: 0.5,
			set: state.setObliquity,
			disabled: state.tidallyLocked,
		},
		{
			label: "Spin",
			help: "Prograde spin matches the usual rotation direction; retrograde spin reverses it.",
			value: state.tidallyLocked || state.obliquity <= 90 ? 0 : 1,
			display:
				state.tidallyLocked || state.obliquity <= 90
					? "Prograde"
					: "Retrograde",
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
		{
			label: "Year Length",
			help: "Sets the orbital year length in local days. Seasonal pacing changes without increasing sim resolution.",
			value: state.daysPerYear,
			display: `${getEarthYearFactor(state.daysPerYear).toFixed(2)}x`,
			...SR.daysPerYear,
			set: state.setDaysPerYear,
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
			label: "Land Distribution",
			help: "Controls how concentrated the minority phase is: land below 50%, water above 50%.",
			value: state.landDistribution,
			display: state.landDistribution.toFixed(2),
			...SR.landDistribution,
			set: state.setLandDistribution,
		},
		{
			label: "Land Coverage",
			help: "Sets the overall land-to-ocean balance for the world.",
			value: state.landCoverage,
			display: `${(state.landCoverage * 100).toFixed(0)}%`,
			...SR.landCoverage,
			set: state.setLandCoverage,
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
	craters: number
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
	setCraters: (v: number) => void
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
			label: "Craters",
			help: "Stamps impact craters onto the surface. Higher values produce more and larger craters.",
			value: state.craters,
			display: state.craters.toFixed(2),
			...SR.craters,
			set: state.setCraters,
		},
	]
}

export function resetWorldDefaults(setters: {
	setTectonicMode: (v: 0 | 1) => void
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
	setSunTempFactor: (v: number) => void
	setDaysPerYear: (v: number) => void
	setHoursPerDay: (v: number) => void
	setTidallyLocked: (v: boolean) => void
	setAntistellarLon: (v: number) => void
	setPerihelion: (v: number) => void
	setPressure: (v: number) => void
	setTerrainWarp: (v: number) => void
	setSmoothing: (v: number) => void
	setHydraulicErosion: (v: number) => void
	setThermalErosion: (v: number) => void
	setRidgeSharpening: (v: number) => void
	setGlacialErosion: (v: number) => void
	setVolcanism: (v: number) => void
	setCraters: (v: number) => void
}): void {
	setters.setTectonicMode(DEFAULT_WORLD_PARAMS.tectonicMode)
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
	setters.setSunTempFactor(DEFAULT_WORLD_PARAMS.sunTempFactor)
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
	setters.setVolcanism(DEFAULT_WORLD_PARAMS.volcanism)
	setters.setCraters(DEFAULT_WORLD_PARAMS.craters)
}
