import {
	computeSolarDayHours,
	inferRetrogradeRotationFromAxialTiltDeg,
} from "@/model/celestial/day-length"
import { getClimateGeometry } from "@/model/climate/rain"
import {
	DEFAULT_PLANET_RADIUS_KM,
	getMaxOceanDepthKm,
	meanEdgeLengthKm,
} from "@/model/shared/units"
import { computeSeaLevelOffsetKm } from "@/model/terrain/sea-level"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
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

function formatDayHours(hours: number | null): string {
	if (hours == null) return "-"
	if (!Number.isFinite(hours)) return "Infinite"
	return `${hours.toFixed(1)} h`
}

export function computePlanetStats(
	world: SerializedGenesisWorld | null,
	params: {
		obliquity: number
		eccentricity: number
		perihelion: number
		substellarLon: number
		spectralClass: string
		starSubtype: number
		daysPerYear: number
		hoursPerDay: number
		planetRadiusKm: number
		pressure: number
		tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
		seaLevel?: number
		maxElevation?: number
		avgWindSpeedMs?: number | null
		maxWindSpeedMs?: number | null
	},
	unitSystem: UnitSystem,
): PlanetStat[] {
	const activeParams = world?.params
	const obliquityValue = activeParams?.obliquity ?? params.obliquity
	const eccentricityValue = activeParams?.eccentricity ?? params.eccentricity
	const perihelionValue = activeParams?.perihelion ?? params.perihelion
	const spectralClassValue = activeParams?.spectralClass ?? params.spectralClass
	const starSubtypeValue = activeParams?.starSubtype ?? params.starSubtype
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

	// Earth import carries true per-province areas measured from the EU4 source
	// geometry (see attachEarthProvinceAreas), so average those directly rather
	// than dividing total land area by the province count. The two disagree for
	// an import: land area is derived from every land mesh cell, including
	// Antarctica and other ground EU4 has no province for, which inflates the
	// quotient. Procedural worlds have no areaKm2 and keep the quotient.
	let avgProvinceAreaKm2: number | null = null
	const provinceAreasKm2 = world?.provinces?.areaKm2
	if (provinceAreasKm2 && world?.provinces?.count) {
		let areaSum = 0
		let counted = 0
		for (let province = 0; province < world.provinces.count; province++) {
			const area = provinceAreasKm2[province]
			if (!Number.isFinite(area) || area <= 0) continue
			areaSum += area
			counted++
		}
		if (counted > 0) avgProvinceAreaKm2 = areaSum / counted
	}
	if (
		avgProvinceAreaKm2 === null &&
		landAreaKm2 !== null &&
		world?.provinces?.count
	) {
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

	let poleEqGradientC: number | null = null
	if (world?.climate?.temperature_avg && world?.mesh?.r_xyz) {
		const { latDeg } = getClimateGeometry(world.mesh)
		const temp = world.climate.temperature_avg
		let eqSum = 0,
			eqCount = 0,
			polSum = 0,
			polCount = 0
		for (let r = 0; r < temp.length; r++) {
			const lat = Math.abs(latDeg[r])
			if (lat < 15) {
				eqSum += temp[r]
				eqCount++
			} else if (lat > 60) {
				polSum += temp[r]
				polCount++
			}
		}
		if (eqCount > 0 && polCount > 0)
			poleEqGradientC = eqSum / eqCount - polSum / polCount
	}

	let avgDtrC: number | null = null
	if (world?.dtr_annual) {
		let sum = 0
		for (let i = 0; i < world.dtr_annual.length; i++) sum += world.dtr_annual[i]
		avgDtrC = sum / Math.max(1, world.dtr_annual.length)
	}

	let riverCount: number | null = null
	let longestRiverKm: number | null = null
	if (
		world?.rivers?.riverId &&
		world.rivers.visible &&
		world.rivers.riverLengthKm
	) {
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
	const isTidal = (activeParams?.tideLock ?? params.tideLock)?.type === "solar"
	const retrograde = inferRetrogradeRotationFromAxialTiltDeg(obliquityValue)
	const solarDayHours = computeSolarDayHours({
		siderealDayHours: hoursPerDayValue,
		orbitalPeriodDays: daysPerYearValue,
		retrograde,
	})
	const habitabilityScore = world?.population?.habitabilityScore ?? 0

	const avgWindSpeedMs = params.avgWindSpeedMs ?? null
	const maxWindSpeedMs = params.maxWindSpeedMs ?? null

	function formatWindSpeed(ms: number): string {
		if (unitSystem === "imperial") {
			return `${(ms * 2.237).toFixed(1)} mph`
		}
		return `${ms.toFixed(1)} m/s`
	}

	const seaLevelValue = activeParams?.seaLevel ?? params.seaLevel
	let seaLevelShiftStat: PlanetStat | null = null
	if (seaLevelValue != null && seaLevelValue !== 1) {
		const maxDepthKm = getMaxOceanDepthKm(radiusKm)
		const offsetKm = computeSeaLevelOffsetKm(seaLevelValue, maxDepthKm)
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
		{
			label: "Moons",
			value: String(world?.tidalSchedule?.events[0]?.moonForces.length ?? 1),
		},
		...(world?.tidalSchedule
			? [
					{
						label: "Spring Tide",
						value: `${world.tidalSchedule.maxForce.toFixed(2)}× Earth`,
					},
					...(() => {
						const { events } = world.tidalSchedule
						const peaks = events.filter(
							(e) => e.tidalForce >= world.tidalSchedule!.maxForce * 0.8,
						)
						if (peaks.length < 2) return []
						const gaps: number[] = []
						for (let i = 1; i < peaks.length; i++)
							gaps.push(peaks[i]!.dayOfYear - peaks[i - 1]!.dayOfYear)
						const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length
						return [{ label: "Spring Interval", value: `~${avg.toFixed(0)} d` }]
					})(),
					...(() => {
						const nextEclipse = world.tidalSchedule.events.find(
							(e) => e.eclipseType !== "none",
						)
						return nextEclipse
							? [
									{
										label: "Next Eclipse",
										value: `Day ${nextEclipse.dayOfYear}`,
									},
								]
							: []
					})(),
				]
			: []),
		{ label: "Tilt", value: `${obliquityValue.toFixed(1)} deg` },
		{ label: "Ecc", value: eccentricityValue.toFixed(3) },
		{
			label: "Perihelion",
			value: `${perihelionValue.toFixed(0)} deg`,
		},
		{
			label: "Star",
			value: `${spectralClassValue}${Math.round(starSubtypeValue)}`,
		},
		{ label: "Year", value: `${daysPerYearValue.toFixed(0)} d` },
		{ label: "Sidereal Day", value: formatDayHours(hoursPerDayValue) },
		{ label: "Solar Day", value: formatDayHours(solarDayHours) },
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
				landAreaKm2 !== null
					? formatArea(landAreaKm2, unitSystem, { digits: 1, compact: "M" })
					: "-",
		},
		{
			label: "Land Coverage",
			value: landPercent !== null ? `${landPercent.toFixed(1)}%` : "-",
		},
		...(seaLevelShiftStat ? [seaLevelShiftStat] : []),
		{
			label: "Major Rivers",
			value: riverCount !== null ? riverCount.toLocaleString() : "-",
		},
		{
			label: "Longest River",
			value:
				longestRiverKm !== null
					? formatDistance(longestRiverKm, unitSystem)
					: "-",
		},
		{
			label: "Avg Temp",
			value:
				avgAnnualTempC !== null
					? formatTemperature(avgAnnualTempC, unitSystem, 1)
					: "-",
		},
		{
			label: "Pole-Eq Gradient",
			value:
				poleEqGradientC !== null
					? formatTemperatureDelta(poleEqGradientC, unitSystem, 1)
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
		{
			label: "Avg Wind",
			value: avgWindSpeedMs !== null ? formatWindSpeed(avgWindSpeedMs) : "-",
		},
		{
			label: "Max Wind",
			value: maxWindSpeedMs !== null ? formatWindSpeed(maxWindSpeedMs) : "-",
		},
	]
}
