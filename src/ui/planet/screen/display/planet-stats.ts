import {
	DEFAULT_PLANET_RADIUS_KM,
	getMaxOceanDepthKm,
	meanEdgeLengthKm,
} from "@/model/shared/units"
import { computeSeaLevelOffsetKm } from "@/model/terrain/sea-level"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import {
	formatArea,
	formatDistance,
	formatPrecipitation,
	formatTemperature,
	formatTemperatureDelta,
	type UnitSystem,
} from "../shared/ui-format"

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
		seaLevel?: number
		maxElevation?: number
	},
	unitSystem: UnitSystem,
): PlanetStat[] {
	const activeParams = world?.params
	const obliquityValue = activeParams?.obliquity ?? params.obliquity
	const eccentricityValue = activeParams?.eccentricity ?? params.eccentricity
	const perihelionValue = activeParams?.perihelion ?? params.perihelion
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

	let avgProvinceAreaKm2: number | null = null
	if (landAreaKm2 !== null && world?.provinces?.count) {
		avgProvinceAreaKm2 = landAreaKm2 / world.provinces.count
	}

	let avgLocationAreaKm2: number | null = null
	if (landAreaKm2 !== null && world?.locations?.count) {
		avgLocationAreaKm2 = landAreaKm2 / world.locations.count
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

	let avgDtrC: number | null = null
	if (world?.dtr_annual) {
		let sum = 0
		for (let i = 0; i < world.dtr_annual.length; i++) sum += world.dtr_annual[i]
		avgDtrC = sum / Math.max(1, world.dtr_annual.length)
	}

	let riverCount: number | null = null
	let longestRiverKm: number | null = null
	if (world?.rivers?.riverId && world.rivers.visible && world.rivers.riverLengthKm) {
		const { riverId, visible, riverLengthKm } = world.rivers
		const seenIds = new Set<number>()
		for (let r = 0; r < visible.length; r++) {
			if (!visible[r]) continue
			const id = riverId[r]
			if (id >= 0) seenIds.add(id)
			const len = riverLengthKm[r]
			if (len > (longestRiverKm ?? 0)) longestRiverKm = len
		}
		riverCount = seenIds.size
	}

	const pressureValue = activeParams?.pressure ?? params.pressure
	const isTidal = activeParams?.tidallyLocked ?? params.tidallyLocked
	const habitabilityScore = world?.population?.habitabilityScore ?? 0

	const seaLevelValue = activeParams?.seaLevel ?? params.seaLevel
	const maxElevationValue = activeParams?.maxElevation ?? params.maxElevation
	let seaLevelShiftStat: PlanetStat | null = null
	if (seaLevelValue != null && seaLevelValue !== 1) {
		const maxElevKm = (maxElevationValue ?? 6000) / 1000
		const maxDepthKm = getMaxOceanDepthKm(radiusKm)
		const offsetKm = computeSeaLevelOffsetKm(seaLevelValue, maxElevKm, maxDepthKm)
		const sign = offsetKm >= 0 ? "+" : "−"
		const absValue =
			unitSystem === "imperial"
				? `${Math.round(Math.abs(offsetKm) * 3280.84).toLocaleString()} ft`
				: `${Math.round(Math.abs(offsetKm) * 1000).toLocaleString()} m`
		seaLevelShiftStat = { label: "Sea Level", value: `${sign}${absValue}` }
	}

	return [
		{
			label: "Habitability",
			value: habitabilityScore != null ? habitabilityScore.toFixed(3) : "0.000",
		},
		...(isTidal ? [{ label: "Lock", value: "Tidal" }] : []),
		{ label: "Tilt", value: `${obliquityValue.toFixed(1)} deg` },
		{ label: "Ecc", value: eccentricityValue.toFixed(3) },
		{ label: "Perihelion", value: `${perihelionValue.toFixed(0)} deg` },
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
			value: world?.continentCount != null ? String(world.continentCount) : "-",
		},
		{
			label: "Provinces",
			value:
				world?.provinces?.count != null ? String(world.provinces.count) : "-",
		},
		{
			label: "Avg Province Area",
			value:
				avgProvinceAreaKm2 !== null
					? formatArea(avgProvinceAreaKm2, unitSystem, {
							digits: 0,
							compact: "k",
						})
					: "-",
		},
		{
			label: "Locations",
			value:
				world?.locations?.count != null ? String(world.locations.count) : "-",
		},
		{
			label: "Avg Location Area",
			value:
				avgLocationAreaKm2 !== null
					? formatArea(avgLocationAreaKm2, unitSystem, {
							digits: 0,
							compact: "k",
						})
					: "-",
		},
		{
			label: "Population",
			value:
				world?.population?.totalPopulation != null
					? `${(world.population.totalPopulation / 1_000_000).toFixed(1)}M`
					: "-",
		},
		{
			label: "Cell",
			value:
				avgCellLengthKm !== null
					? formatDistance(avgCellLengthKm, unitSystem)
					: "-",
		},
		{
			label: "Land Area",
			value:
				landAreaKm2 !== null && landPercent !== null
					? `${formatArea(landAreaKm2, unitSystem, { digits: 1, compact: "M" })} (${landPercent.toFixed(1)}%)`
					: "-",
		},
		...(seaLevelShiftStat ? [seaLevelShiftStat] : []),
		{
			label: "Major Rivers",
			value: riverCount !== null ? riverCount.toLocaleString() : "-",
		},
		{
			label: "Longest River",
			value:
				longestRiverKm !== null ? formatDistance(longestRiverKm, unitSystem) : "-",
		},
		{
			label: "Avg Temp",
			value:
				avgAnnualTempC !== null
					? formatTemperature(avgAnnualTempC, unitSystem, 1)
					: "-",
		},
		{
			label: "Delta Temp",
			value:
				minAnnualTempC !== null && maxAnnualTempC !== null
					? formatTemperatureDelta(
							maxAnnualTempC - minAnnualTempC,
							unitSystem,
							1,
						)
					: "-",
		},
		{
			label: "Avg Rain",
			value:
				avgAnnualPrecipMm !== null
					? formatPrecipitation(avgAnnualPrecipMm, unitSystem, 0)
					: "-",
		},
		{
			label: "Avg DTR",
			value:
				avgDtrC !== null ? formatTemperatureDelta(avgDtrC, unitSystem, 1) : "-",
		},
	]
}
