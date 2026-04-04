import {
	DEFAULT_PLANET_RADIUS_KM,
	meanEdgeLengthKm,
} from "@/model/orogen/units"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"

export interface PlanetStat {
	label: string
	value: string
}

export function computePlanetStats(
	world: SerializedOrogenWorld | null,
	params: {
		obliquity: number
		eccentricity: number
		perihelion: number
		antistellarLon: number
		sunTempFactor: number
		daysPerYear: number
		hoursPerDay: number
		planetRadiusKm: number
		pressure: number
		tidallyLocked: boolean
	},
): PlanetStat[] {
	const activeParams = world?.params
	const obliquityValue = activeParams?.obliquity ?? params.obliquity
	const eccentricityValue = activeParams?.eccentricity ?? params.eccentricity
	const sunTempFactorValue = activeParams?.sunTempFactor ?? params.sunTempFactor
	const daysPerYearValue = activeParams?.daysPerYear ?? params.daysPerYear
	const hoursPerDayValue = activeParams?.hoursPerDay ?? params.hoursPerDay
	const radiusKm = activeParams?.planetRadiusKm ?? params.planetRadiusKm
	const surfaceAreaKm2 = 4 * Math.PI * radiusKm * radiusKm

	let avgCellLengthKm: number | null = null
	if (world) avgCellLengthKm = meanEdgeLengthKm(world.mesh, radiusKm)

	let landAreaKm2: number | null = null
	let landPercent: number | null = null
	if (world?.elevation) {
		let landCells = 0
		for (let i = 0; i < world.elevation.length; i++) {
			if (world.elevation[i] > 0) landCells++
		}
		landPercent = (landCells / Math.max(1, world.elevation.length)) * 100
		landAreaKm2 = surfaceAreaKm2 * (landPercent / 100)
	}

	let avgAnnualTempC: number | null = null
	if (world?.climate?.temperature_avg) {
		let sum = 0
		for (let i = 0; i < world.climate.temperature_avg.length; i++)
			sum += world.climate.temperature_avg[i]
		avgAnnualTempC = sum / Math.max(1, world.climate.temperature_avg.length)
	}

	let minAnnualTempC: number | null = null
	if (world?.climate?.temperature_min) {
		minAnnualTempC = Infinity
		for (let i = 0; i < world.climate.temperature_min.length; i++) {
			minAnnualTempC = Math.min(
				minAnnualTempC,
				world.climate.temperature_min[i],
			)
		}
		if (!Number.isFinite(minAnnualTempC)) minAnnualTempC = null
	}

	let maxAnnualTempC: number | null = null
	if (world?.climate?.temperature_max) {
		maxAnnualTempC = -Infinity
		for (let i = 0; i < world.climate.temperature_max.length; i++) {
			maxAnnualTempC = Math.max(
				maxAnnualTempC,
				world.climate.temperature_max[i],
			)
		}
		if (!Number.isFinite(maxAnnualTempC)) maxAnnualTempC = null
	}

	let avgAnnualPrecipMm: number | null = null
	if (world?.rainfall?.annual) {
		let sum = 0
		for (let i = 0; i < world.rainfall.annual.length; i++)
			sum += world.rainfall.annual[i]
		avgAnnualPrecipMm = sum / Math.max(1, world.rainfall.annual.length)
	}

	const pressureValue = activeParams?.pressure ?? params.pressure
	const isTidal = activeParams?.tidallyLocked ?? params.tidallyLocked
	const habitabilityScore =
		world?.population?.habitabilityScore ??
		(world?.population?.totalPopulation != null
			? world.population.totalPopulation / 215_000_000
			: null)
	return [
		{
			label: "Habitability",
			value: habitabilityScore != null ? habitabilityScore.toFixed(3) : "0.000",
		},
		...(isTidal ? [{ label: "Lock", value: "Tidal" }] : []),
		{ label: "Tilt", value: `${obliquityValue.toFixed(1)}°` },
		{ label: "Ecc", value: eccentricityValue.toFixed(3) },
		{ label: "Sun", value: `${sunTempFactorValue.toFixed(2)}x` },
		{ label: "Year", value: `${daysPerYearValue.toFixed(0)} d` },
		{ label: "Day", value: `${hoursPerDayValue.toFixed(1)} h` },
		{ label: "Pressure", value: `${pressureValue.toFixed(1)} bar` },
		{
			label: "Radius",
			value: `${(radiusKm / DEFAULT_PLANET_RADIUS_KM).toFixed(2)}x`,
		},
		{
			label: "Continents",
			value: world?.continentCount != null ? String(world.continentCount) : "—",
		},
		{
			label: "Provinces",
			value:
				world?.provinces?.count != null ? String(world.provinces.count) : "—",
		},
		{
			label: "Population",
			value:
				world?.population?.totalPopulation != null
					? `${(world.population.totalPopulation / 1_000_000).toFixed(1)}M`
					: "—",
		},
		{
			label: "Cell",
			value:
				avgCellLengthKm !== null ? `${avgCellLengthKm.toFixed(0)} km` : "—",
		},
		{
			label: "Land Area",
			value:
				landAreaKm2 !== null && landPercent !== null
					? `${(landAreaKm2 / 1_000_000).toFixed(1)}M km² (${landPercent.toFixed(1)}%)`
					: "—",
		},
		{
			label: "Avg Temp",
			value: avgAnnualTempC !== null ? `${avgAnnualTempC.toFixed(1)} °C` : "—",
		},
		{
			label: "Δ Temp",
			value:
				maxAnnualTempC !== null
					? `${(maxAnnualTempC - minAnnualTempC).toFixed(1)} °C`
					: "—",
		},
		{
			label: "Avg Rain",
			value:
				avgAnnualPrecipMm !== null ? `${avgAnnualPrecipMm.toFixed(0)} mm` : "—",
		},
	]
}
