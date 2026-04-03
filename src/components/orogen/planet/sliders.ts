import { DEFAULT_PLANET_RADIUS_KM } from "@/model/orogen/units"
import { DEFAULT_WORLD_PARAMS, STAGNANT_TERRAIN_OVERRIDES } from "./constants"

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
	tectonicMode: number
	planetRadiusKm: number
	obliquity: number
	eccentricity: number
	perihelion: number
	sunTempFactor: number
	daysPerYear: number
	hoursPerDay: number
	pressure: number
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
	setLandDistribution: (v: number) => void
	setLandCoverage: (v: number) => void
	setAntistellarLon: (v: number) => void
}): SliderDef[] {
	return [
		{
			label: "Radius",
			help: "Sets the planet's physical size for climate and distance calculations.",
			value: state.planetRadiusKm,
			display: `${(state.planetRadiusKm / DEFAULT_PLANET_RADIUS_KM).toFixed(2)}x Earth`,
			min: Math.round(DEFAULT_PLANET_RADIUS_KM * 0.5 / 100) * 100,
			max: Math.round(DEFAULT_PLANET_RADIUS_KM * 4 / 100) * 100,
			step: 100,
			set: state.setPlanetRadiusKm,
		},
		{
			label: "Sun Temp",
			help: "Scales stellar temperature relative to Sol. 1.0x matches the Sun, 0.5x is half as hot.",
			value: state.sunTempFactor,
			display: `${state.sunTempFactor.toFixed(2)}x`,
			min: 0.9,
			max: 1.2,
			step: 0.01,
			set: state.setSunTempFactor,
		},
		{
			label: "Pressure",
			help: "Atmospheric pressure in bars. Lower pressure increases evaporation and cloud formation; higher pressure suppresses it.",
			value: state.pressure,
			display: `${state.pressure.toFixed(1)} bar`,
			min: 0.1,
			max: 10,
			step: 0.1,
			set: state.setPressure,
		},
		{
			label: "Axial Tilt",
			help: "Sets seasonal tilt from 0 to 180 degrees. Tilts above 90 are treated as retrograde and flip seasonal rainfall timing.",
			value: state.tidallyLocked ? 0 : state.obliquity,
			display: state.tidallyLocked ? "0.0°" : `${state.obliquity.toFixed(1)}°`,
			min: 0,
			max: 180,
			step: 0.5,
			set: state.setObliquity,
			disabled: state.tidallyLocked,
		},
		{
			label: "Eccentricity",
			help: "Controls how circular or stretched the orbit is, increasing seasonal contrast as it rises.",
			value: state.eccentricity,
			display: state.eccentricity.toFixed(3),
			min: 0,
			max: 0.2,
			step: 0.001,
			set: state.setEccentricity,
		},
		{
			label: "Perihelion",
			help: "Orbital angle of closest approach to the star in degrees. Affects when peak insolation occurs during the year.",
			value: state.perihelion,
			display: `${state.perihelion.toFixed(0)}\u00B0`,
			min: 0,
			max: 360,
			step: 1,
			set: state.setPerihelion,
		},
		{
			label: "Year Length",
			help: "Sets the orbital year length in local days. Seasonal pacing changes without increasing sim resolution.",
			value: state.daysPerYear,
			display: `${state.daysPerYear.toFixed(0)} d`,
			min: 100,
			max: 1000,
			step: 5,
			set: state.setDaysPerYear,
		},
		...(!state.tidallyLocked ? [{
			label: "Day Length",
			help: "Sets the rotation period in local hours. Shorter days mix heat more strongly; longer days reduce that effect.",
			value: state.hoursPerDay,
			display: `${state.hoursPerDay.toFixed(1)} h`,
			min: 8,
			max: 48,
			step: 0.5,
			set: state.setHoursPerDay,
		}] : []),
		...(state.tidallyLocked ? [{
			label: "Antistellar Lon",
			help: "Longitude of the antistellar point (permanent dark side center).",
			value: state.antistellarLon,
			display: `${state.antistellarLon.toFixed(0)}\u00B0`,
			min: 0,
			max: 360,
			step: 1,
			set: state.setAntistellarLon,
		}] : []),
		{
			label: "Land Distribution",
			help: "Controls how concentrated the minority phase is: land below 50%, water above 50%.",
			value: state.landDistribution,
			display: state.landDistribution.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setLandDistribution,
		},
		{
			label: "Land Coverage",
			help: "Sets the overall land-to-ocean balance for the world.",
			value: state.landCoverage,
			display: `${(state.landCoverage * 100).toFixed(0)}%`,
			min: 0,
			max: 1,
			step: 0.01,
			set: state.setLandCoverage,
		},
	]
}

export function buildTerrainSliders(state: {
	tectonicMode: number
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
	volcanism: number
	craters: number
	setTectonicMode: (v: number) => void
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
	setVolcanism: (v: number) => void
	setCraters: (v: number) => void
}): SliderDef[] {
	const isStagnant = state.tectonicMode === 1
	return [
		{
			label: "Tectonic Mode",
			help: "Active: Earth-like plate tectonics with subduction. Stagnant Lid: single lithosphere with coronae, volcanic provinces, and rift zones (Venus/Mars/Moon-like).",
			value: state.tectonicMode,
			display: isStagnant ? "Stagnant" : "Active",
			min: 0,
			max: 1,
			step: 1,
			set: state.setTectonicMode,
		},
		{
			label: "Detail",
			help: "Higher detail sharpens coastlines and terrain, but takes longer to build.",
			value: state.numPoints,
			display: state.numPoints.toLocaleString(),
			min: 5000,
			max: 2560000,
			step: 1000,
			set: state.setNumPoints,
		},
		{
			label: "Irregularity",
			help: "Controls how even or organic the underlying mesh feels.",
			value: state.jitter,
			display: state.jitter.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setJitter,
		},
		{
			label: "Plates",
			help: "More plates create more tectonic boundaries, coasts, and terrain partitions in both active and stagnant-lid worlds.",
			value: state.numPlates,
			display: String(state.numPlates),
			min: 4,
			max: 120,
			step: 1,
			set: state.setNumPlates,
		},
		{
			label: "Roughness",
			help: "Adds fractal detail to mountains, ridges, and coastlines.",
			value: state.roughness,
			display: state.roughness.toFixed(2),
			min: 0,
			max: 0.5,
			step: 0.01,
			set: state.setRoughness,
		},
		{
			label: "Size Variety",
			help: "Makes plate-driven landmasses or seas more equal-sized or more uneven in both tectonic modes.",
			value: state.continentSizeVariety,
			display: state.continentSizeVariety.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setContinentSizeVariety,
		},
		{
			label: "Terrain Warp",
			help: "Twists the raw terrain field into more organic coastlines and ridges.",
			value: state.terrainWarp,
			display: state.terrainWarp.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setTerrainWarp,
		},
		{
			label: "Smoothing",
			help: "Softens hard tectonic edges and blends abrupt elevation transitions.",
			value: state.smoothing,
			display: state.smoothing.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setSmoothing,
		},
		{
			label: "Hydraulic Erosion",
			help: "Cuts river valleys and drainage networks into the terrain.",
			value: state.hydraulicErosion,
			display: state.hydraulicErosion.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setHydraulicErosion,
		},
		{
			label: "Thermal Erosion",
			help: "Moves loose material downhill, softening ridges and steep slopes.",
			value: state.thermalErosion,
			display: state.thermalErosion.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setThermalErosion,
		},
		{
			label: "Ridge Sharpening",
			help: "Pushes ridgelines above their surroundings for a stronger mountain silhouette.",
			value: state.ridgeSharpening,
			display: state.ridgeSharpening.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setRidgeSharpening,
		},
		{
			label: "Glacial Erosion",
			help: "Carves fjords, basins, and U-shaped valleys into cold high terrain.",
			value: state.glacialErosion,
			display: state.glacialErosion.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setGlacialErosion,
		},
		{
			label: "Volcanism",
			help: "Scales hotspot activity in active mode and hotspot plus volcanic-province uplift in stagnant lid mode.",
			value: state.volcanism,
			display: state.volcanism.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setVolcanism,
		},
		{
			label: "Craters",
			help: "Stamps impact craters onto the surface. Higher values produce more and larger craters.",
			value: state.craters,
			display: state.craters.toFixed(2),
			min: 0,
			max: 1,
			step: 0.05,
			set: state.setCraters,
		},
	]
}

export function resetWorldDefaults(tectonicMode: number, setters: {
	setTectonicMode: (v: number) => void
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
	const isStagnant = tectonicMode === 1
	const t = isStagnant ? { ...DEFAULT_WORLD_PARAMS, ...STAGNANT_TERRAIN_OVERRIDES } : DEFAULT_WORLD_PARAMS

	setters.setTectonicMode(tectonicMode)
	setters.setNumPoints(t.numPoints)
	setters.setJitter(t.jitter)
	setters.setNumPlates(t.numPlates)
	setters.setLandDistribution(t.landDistribution)
	setters.setContinentSizeVariety(t.continentSizeVariety)
	setters.setLandCoverage(t.landCoverage)
	setters.setRoughness(t.roughness)
	setters.setPlanetRadiusKm(t.planetRadiusKm)
	setters.setObliquity(t.obliquity)
	setters.setEccentricity(t.eccentricity)
	setters.setSunTempFactor(t.sunTempFactor)
	setters.setDaysPerYear(t.daysPerYear)
	setters.setHoursPerDay(t.hoursPerDay)
	setters.setTidallyLocked(false)
	setters.setAntistellarLon(t.antistellarLon)
	setters.setPerihelion(t.perihelion)
	setters.setPressure(t.pressure)
	setters.setTerrainWarp(t.terrainWarp)
	setters.setSmoothing(t.smoothing)
	setters.setHydraulicErosion(t.hydraulicErosion)
	setters.setThermalErosion(t.thermalErosion)
	setters.setRidgeSharpening(t.ridgeSharpening)
	setters.setGlacialErosion(t.glacialErosion)
	setters.setVolcanism(t.volcanism)
	setters.setCraters(t.craters)
}
