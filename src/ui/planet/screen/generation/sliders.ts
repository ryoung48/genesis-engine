import type { TideLock } from "@/model/celestial/orbit-body/types"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import { SLIDER_RANGES } from "@/model/genesis-params/ranges"
import { SEA_LEVEL } from "@/model/geography/terrain/sea-level"
import { UNITS } from "@/model/shared/units"
import type { SocietyEra } from "@/model/society/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import type { UnitSystem } from "@/ui/planet/screen/shared/ui-format"

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
	landDistribution: number
	landCoverage: number
	tideLock: TideLock | null
	substellarLon: number
	setPlanetRadiusKm: (v: number) => void
	setObliquity: (v: number) => void
	setEccentricity: (v: number) => void
	setPerihelion: (v: number) => void
	setOrbitalDistanceAU: (v: number) => void
	setHoursPerDay: (v: number) => void
	setPressure: (v: number) => void
	setAxialTiltDirection: (v: number) => void
	setLandDistribution: (v: number) => void
	setLandCoverage: (v: number) => void
	setSubstellarLon: (v: number) => void
}): SliderDef[] {
	return [
		{
			label: "Radius",
			help: "Sets the planet's physical size for climate and distance calculations.",
			value: state.planetRadiusKm,
			display: `${(state.planetRadiusKm / UNITS.defaultPlanetRadiusKm).toFixed(2)}x`,
			...SR.planetRadiusKm,
			set: state.setPlanetRadiusKm,
		},
		(() => {
			const cls: MainSequenceClass = STAR.isValidSpectralClass(
				state.spectralClass,
			)
				? state.spectralClass
				: "G"
			const lum = STAR.getStarLuminositySol({ cls, subtype: state.starSubtype })
			const hz = STAR.getHabitableZoneAU(lum)
			const hzFactor = hz > 0 ? state.orbitalDistanceAU / hz : 1
			return {
				label: "Orbital Distance",
				help: "Distance from the star relative to the habitable zone centre. 1.00Ã— HZ = ideal insolation for liquid water.",
				value: hzFactor,
				display: `${hzFactor.toFixed(2)}Ã— HZ`,
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
			help: "Sets the planet's true obliquity. Prograde uses the 0 to 90 degree range; retrograde uses the 90 to 180 degree range. The direction control flips between the prograde and retrograde complements (x and 180 - x).",
			value: state.obliquity,
			display: `${state.obliquity.toFixed(1)}°`,
			min: state.obliquity <= 90 ? 0 : 90,
			max: state.obliquity <= 90 ? 90 : 180,
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
			disabled: state.tideLock?.type === "solar",
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
			help: "Orbital angle of closest approach to the star in degrees, measured from a fixed reference direction. Affects when peak insolation occurs during the year.",
			value: state.perihelion,
			display: `${state.perihelion.toFixed(0)}\u00B0`,
			...SR.perihelion,
			set: state.setPerihelion,
		},
		...(state.tideLock?.type !== "solar"
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
		...(state.tideLock?.type === "solar"
			? [
					{
						label: "Substellar Lon",
						help: "Longitude of the substellar point (permanent day side center).",
						value: state.substellarLon,
						display: `${state.substellarLon.toFixed(0)}\u00B0`,
						...SR.substellarLon,
						set: state.setSubstellarLon,
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
	]
}

export function buildTerrainSliders(state: {
	continentSizeVariety: number
	seaLevel: number
	unitSystem: UnitSystem
	setContinentSizeVariety: (v: number) => void
	setSeaLevel: (v: number) => void
}): SliderDef[] {
	return [
		{
			label: "Size Variety",
			help: "Makes plate-driven landmasses or seas more equal-sized or more uneven.",
			value: state.continentSizeVariety,
			display: state.continentSizeVariety.toFixed(2),
			...SR.continentSizeVariety,
			set: state.setContinentSizeVariety,
		},
		{
			label: "Sea Level",
			help: "Shifts the final shoreline after volcanism and craters are applied. 1.00x keeps the baseline sea level unchanged.",
			value: state.seaLevel,
			display: (() => {
				const offsetKm = SEA_LEVEL.computeSeaLevelOffsetKm({
					seaLevel: state.seaLevel,
					maxDepthKm: UNITS.getMaxOceanDepthKm(UNITS.defaultPlanetRadiusKm),
				})
				const sign = offsetKm > 0 ? "+" : offsetKm < 0 ? "−" : ""
				if (state.unitSystem === "imperial") {
					return `${sign}${Math.round(Math.abs(offsetKm) * 3280.84).toLocaleString()} ft`
				}
				return `${sign}${Math.round(Math.abs(offsetKm) * 1000).toLocaleString()} m`
			})(),
			...SR.seaLevel,
			set: state.setSeaLevel,
		},
	]
}

export function resetWorldDefaults(setters: {
	setLandDistribution: (v: number) => void
	setContinentSizeVariety: (v: number) => void
	setLandCoverage: (v: number) => void
	setPlanetRadiusKm: (v: number) => void
	setObliquity: (v: number) => void
	setEccentricity: (v: number) => void
	setSpectralClass: (v: string) => void
	setStarSubtype: (v: number) => void
	setOrbitalDistanceAU: (v: number) => void
	setHoursPerDay: (v: number) => void
	setTideLock: (v: TideLock | null) => void
	setSubstellarLon: (v: number) => void
	setPerihelion: (v: number) => void
	setPressure: (v: number) => void
	setRestSeed: (v: number) => void
	setSeaLevel: (v: number) => void
	setEra: (v: SocietyEra) => void
}): void {
	setters.setLandDistribution(DEFAULT_WORLD_PARAMS.landDistribution)
	setters.setContinentSizeVariety(DEFAULT_WORLD_PARAMS.continentSizeVariety)
	setters.setLandCoverage(DEFAULT_WORLD_PARAMS.landCoverage)
	setters.setPlanetRadiusKm(DEFAULT_WORLD_PARAMS.planetRadiusKm)
	setters.setObliquity(DEFAULT_WORLD_PARAMS.obliquity)
	setters.setEccentricity(DEFAULT_WORLD_PARAMS.eccentricity)
	setters.setSpectralClass(DEFAULT_WORLD_PARAMS.spectralClass)
	setters.setStarSubtype(DEFAULT_WORLD_PARAMS.starSubtype)
	setters.setOrbitalDistanceAU(DEFAULT_WORLD_PARAMS.orbitalDistanceAU)
	setters.setHoursPerDay(DEFAULT_WORLD_PARAMS.hoursPerDay)
	setters.setTideLock(null)
	setters.setSubstellarLon(DEFAULT_WORLD_PARAMS.substellarLon)
	setters.setPerihelion(DEFAULT_WORLD_PARAMS.perihelion)
	setters.setPressure(DEFAULT_WORLD_PARAMS.pressure)
	setters.setRestSeed(SOL_DATA.solSeed)
	setters.setSeaLevel(DEFAULT_WORLD_PARAMS.seaLevel)
	setters.setEra(DEFAULT_WORLD_PARAMS.era)
}
