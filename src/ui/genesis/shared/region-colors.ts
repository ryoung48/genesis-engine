import { KOPPEN } from "@/model/climate/classification/koppen"
import { PASTA } from "@/model/climate/classification/pasta"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLOUD_COVER } from "@/model/climate/precipitation/cloud-cover"
import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { MESH } from "@/model/mesh"
import { TRADE_GOODS } from "@/model/society/infrastructure/trade/trade-goods"
import { RELIGION } from "@/model/society/religion"
import { TIMEZONE } from "@/model/society/timezone"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { DangerSubMode } from "@/ui/genesis/controls/OverlayControls"
import type { ElevationKmForLonLat } from "@/ui/genesis/political/eu4-nation-fill-overlay"
import { governmentColorForIndex } from "@/ui/genesis/political/government-colors"
import type { PoliticalMapWar } from "@/ui/genesis/political/political-conflict-display"
import {
	getReligionColorForProvince,
	getReligionTypeIndexForProvince,
} from "@/ui/genesis/political/religion-type"
import {
	darkenClimateAtElevation,
	darkenPoliticalAtElevation,
	darkenVegetationAtElevation,
} from "@/ui/genesis/shared/color-helpers"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import {
	cloudCoverColor,
	cycloneLandColor,
	developmentColor,
	dtrColor,
	dtrDifferenceColor,
	EU5_CLIMATE_COLORS,
	EU5_TOPOGRAPHY_COLORS,
	EU5_VEGETATION_COLORS,
	earthquakeLandColor,
	getColor,
	hotspotColor,
	humidityColor,
	humidityDifferenceColor,
	migrationColor,
	OCEAN_LIGHT_BLUE,
	populationColor,
	populationDifferenceColor,
	slopeColor,
	tidalTierColor,
	tornadoLandColor,
	VEGETATION_WATER_BLUE,
	volcanicLandColor,
} from "@/ui/genesis/shared/colors"
import {
	climateZoneColor,
	oceanCurrentColor,
} from "@/ui/genesis/shared/colors/misc"
import {
	moistureDirectionalColor,
	precipitationAnnualColor,
	precipitationColor,
	precipitationDifferenceColor,
} from "@/ui/genesis/shared/colors/precipitation"
import {
	climateTempColor,
	temperatureColor,
	temperatureDeltaColor,
	temperatureDifferenceColor,
} from "@/ui/genesis/shared/colors/temperature"
import {
	vegetationColor,
	vegetationMapColor,
	vegetationSatelliteColor,
} from "@/ui/genesis/shared/colors/vegetation"
import { getDataVariant } from "@/ui/genesis/shared/data-variant"
import type {
	NationMapMode,
	PopulationMapMode,
} from "@/ui/genesis/shared/map-modes"
import { getProvincePopulationDensity } from "@/ui/genesis/shared/population-density"
import {
	basinColor,
	getDynastyColor,
	TERRAIN_FEATURE_COLORS,
	TOPOGRAPHY_COLORS,
	toPastelNationColor,
} from "@/ui/genesis/shared/region-colors/palette"

/**
 * Relation values the diplomacy map mode colors by. These mirrored the
 * procedural history sim's REL enum, which no longer exists; the numbering is
 * kept so an `relationAt` supplied by any future relation source stays
 * compatible.
 */
const REL = {
	NONE: 0,
	OVERLORD: 1,
	VASSAL: 2,
	PU_SENIOR: 3,
	PU_JUNIOR: 4,
	ALLY: 5,
	FRIENDLY: 6,
	NEUTRAL: 7,
	SUSPICIOUS: 8,
	RIVAL: 9,
	WAR: 10,
	COLONY: 11,
} as const

// Relation value → RGB tuple
const DIPLOMACY_RGB_COLORS: Record<number, [number, number, number]> = {
	[REL.NONE]: [0.58, 0.64, 0.69],
	[REL.OVERLORD]: [0.659, 0.333, 0.969],
	[REL.VASSAL]: [0.659, 0.333, 0.969],
	[REL.PU_SENIOR]: [0.388, 0.4, 0.945],
	[REL.PU_JUNIOR]: [0.388, 0.4, 0.945],
	[REL.ALLY]: [0.231, 0.51, 0.965],
	[REL.FRIENDLY]: [0.133, 0.773, 0.369],
	[REL.NEUTRAL]: [0.788, 0.788, 0.788],
	[REL.SUSPICIOUS]: [0.918, 0.702, 0.031],
	[REL.RIVAL]: [0.976, 0.451, 0.086],
	[REL.WAR]: [0.976, 0.22, 0.086],
	[REL.COLONY]: [0.961, 0.549, 0.502],
}
const CULTURE_ELEVATION_BUMP_SCALE = 1.6

function hasPartitionElevationBump(populationMode: PopulationMapMode): boolean {
	return (
		populationMode === "culture" ||
		populationMode === "heritage" ||
		populationMode === "religion"
	)
}

function darkenPartitionAtElevation(
	color: [number, number, number],
	heightKm: number,
): [number, number, number] {
	return darkenPoliticalAtElevation(
		color,
		heightKm * CULTURE_ELEVATION_BUMP_SCALE,
	)
}

export function computeRegionColors(
	world: SerializedGenesisWorld,
	colorMode: ColorMode,
	nationMode: NationMapMode,
	populationMode: PopulationMapMode,
	temperatureMonth: number,
	rainfallMonth: number,
	dtrMonth: number,
	currentMonth: number,
	viewMode: "globe" | "map" = "globe",
	showElevation = true,
	_occupiedRegions?: Set<number>,
	_activeWars?: readonly PoliticalMapWar[] | null,
	selectedNationId?: number | null,
	relationAt?: ((a: number, b: number) => number) | null,
	dangerSubMode: DangerSubMode = "earthquake",
): Float32Array | null {
	if (colorMode === "landHeightmap") return null

	const N = world.mesh.numRegions
	const rgb = new Float32Array(N * 3)
	const isLakeRegion = (region: number) => {
		if (world.topography?.[region] === 6) return true
		if (!world.landmarks) return false
		const landmark = world.landmarks.regionLandmark[region]
		return (
			landmark >= 0 &&
			world.landmarks.type[landmark] === LANDMARKS.landmarkTypeLake
		)
	}
	const isLandRegion = (region: number) => {
		if (isLakeRegion(region)) return false
		if ((world.elevation?.[region] ?? -1) > 0) return true
		return !!world.isLand?.[region]
	}
	const isOceanRegion = (region: number) => !isLandRegion(region)
	const oceanRgb = (r: number): [number, number, number] =>
		darkenVegetationAtElevation(OCEAN_LIGHT_BLUE, world.elevation_km[r])

	if (colorMode === "timezone") {
		const provinces = world.provinces

		for (let r = 0; r < N; r++) {
			const p = provinces ? provinces.regionProvince[r] : -1
			if (p < 0) {
				// Water: the timezone stripe under the region itself.
				const [cr, cg, cb] = TIMEZONE.timezoneWaterColor(
					TIMEZONE.regionTimezoneOffset({ world, region: r }),
				)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
				continue
			}
			if (provinces?.desolate[p]) {
				rgb[3 * r] = 0.35
				rgb[3 * r + 1] = 0.33
				rgb[3 * r + 2] = 0.32
				continue
			}
			// Land: the province's single zone (its nation's capital zone if any).
			const base = TIMEZONE.timezoneLandColor(
				TIMEZONE.regionTimezoneOffset({ world, region: r }),
			)
			const [cr, cg, cb] = darkenPoliticalAtElevation(
				base,
				world.elevation_km[r],
			)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "slope") {
		const slopeScoreByRegion = world.slopeScore
		for (let r = 0; r < N; r++) {
			const slopeScore = slopeScoreByRegion?.[r] ?? 0
			const [cr, cg, cb] = slopeColor(slopeScore)
			if (isLandRegion(r)) {
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				rgb[3 * r] = cr * 0.45
				rgb[3 * r + 1] = cg * 0.55
				rgb[3 * r + 2] = Math.min(1, cb * 0.8 + 0.18)
			}
		}
		return rgb
	}

	if (colorMode === "topography" && world.topography) {
		for (let r = 0; r < N; r++) {
			const topo = world.topography[r]
			const isWater = topo === 5 || topo === 6
			if (isWater) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				const [cr, cg, cb] = TOPOGRAPHY_COLORS[topo] ?? [1, 1, 1]
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	if (
		colorMode === "eu5Topography" ||
		colorMode === "eu5Vegetation" ||
		colorMode === "eu5Climate"
	) {
		const codes =
			colorMode === "eu5Topography"
				? world.eu5Topography
				: colorMode === "eu5Vegetation"
					? world.eu5Vegetation
					: world.eu5Climate
		const palette =
			colorMode === "eu5Topography"
				? EU5_TOPOGRAPHY_COLORS
				: colorMode === "eu5Vegetation"
					? EU5_VEGETATION_COLORS
					: EU5_CLIMATE_COLORS
		// Outside the EU5 map's coverage (most of the globe -- this is a
		// regional dataset, not a whole-world one) or nodata: fall back to
		// ocean shading for water, neutral gray for land.
		const NO_COVERAGE_LAND: [number, number, number] = [0.55, 0.53, 0.5]
		for (let r = 0; r < N; r++) {
			const code = codes?.[r] ?? -1
			const color =
				code >= 0 && code < palette.length
					? palette[code]
					: isOceanRegion(r)
						? oceanRgb(r)
						: NO_COVERAGE_LAND
			rgb[3 * r] = color[0]
			rgb[3 * r + 1] = color[1]
			rgb[3 * r + 2] = color[2]
		}
		return rgb
	}

	if (
		(colorMode === "temperature" ||
			colorMode === "realTemperature" ||
			colorMode === "temperatureDiff" ||
			colorMode === "temperatureDelta") &&
		world.climate
	) {
		const darkenMapWaterTemperature =
			(colorMode === "temperature" || colorMode === "realTemperature") &&
			(viewMode === "map" || !showElevation)
		const temps =
			colorMode === "realTemperature"
				? temperatureMonth === 0
					? world.climate.real_temperature_avg
					: world.climate.real_temperature_monthly?.subarray(
							(temperatureMonth - 1) * N,
							temperatureMonth * N,
						)
				: colorMode === "temperatureDiff"
					? temperatureMonth === 0
						? world.climate.temperature_diff_avg
						: world.climate.temperature_diff_monthly?.subarray(
								(temperatureMonth - 1) * N,
								temperatureMonth * N,
							)
					: temperatureMonth === 0
						? world.climate.temperature_avg
						: world.climate.temperature_monthly.subarray(
								(temperatureMonth - 1) * N,
								temperatureMonth * N,
							)
		for (let r = 0; r < N; r++) {
			// Earth imports color the ocean with the same flat blue rain uses
			// (oceanRgb) rather than the temperature gradient -- real sea-surface
			// temperature isn't modeled here, so letting ocean cells take the
			// land temperature palette just shows noisy, misleading color.
			if (world.isEarthImport && isOceanRegion(r)) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
				continue
			}
			const [cr, cg, cb] =
				colorMode === "temperatureDelta"
					? temperatureDeltaColor(
							world.climate.temperature_max[r] -
								world.climate.temperature_min[r],
						)
					: colorMode === "temperatureDiff"
						? temperatureDifferenceColor(temps?.[r] ?? 0)
						: temperatureColor(temps?.[r] ?? world.climate.temperature_avg[r])
			const factor = darkenMapWaterTemperature && isOceanRegion(r) ? 0.74 : 1
			rgb[3 * r] = cr * factor
			rgb[3 * r + 1] = cg * factor
			rgb[3 * r + 2] = cb * factor
		}
		return rgb
	}

	if (colorMode === "realCloudCover" && world.observedCloudCover) {
		const monthly =
			rainfallMonth === 0 ? null : world.observedCloudCover.real_monthly
		const offset = monthly ? (rainfallMonth - 1) * N : 0
		for (let r = 0; r < N; r++) {
			const value = monthly
				? monthly[offset + r]
				: world.observedCloudCover.real_annual[r]
			const [cr, cg, cb] = cloudCoverColor(value)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	const cloudAetMonthly =
		world.observedHydrology?.aet_monthly ?? world.hydrology?.aet_monthly
	const cloudPetMonthly =
		world.observedHydrology?.pet_monthly ?? world.climate?.pet_monthly
	const cloudRainfallMonthly =
		world.rainfall?.real_monthly ?? world.rainfall?.monthly
	const cloudDtrMonthly = world.observedDtr?.real_monthly ?? world.dtr_monthly
	const cloudTemperatureMonthly =
		world.climate?.real_temperature_monthly ??
		world.climate?.temperature_monthly
	if (
		colorMode === "cloudCover" &&
		cloudAetMonthly &&
		cloudPetMonthly &&
		cloudRainfallMonthly &&
		cloudDtrMonthly &&
		cloudTemperatureMonthly
	) {
		const monthlyOffset = rainfallMonth > 0 ? (rainfallMonth - 1) * N : 0
		for (let r = 0; r < N; r++) {
			if (isOceanRegion(r)) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
				continue
			}
			let cloudFraction = 0
			if (rainfallMonth === 0) {
				for (let month = 0; month < 12; month++) {
					const idx = month * N + r
					cloudFraction += CLOUD_COVER.estimate({
						aetMm: cloudAetMonthly[idx],
						petMm: cloudPetMonthly[idx],
						rainfallMm: cloudRainfallMonthly[idx],
						dtrC: cloudDtrMonthly[idx],
						temperatureC: cloudTemperatureMonthly[idx],
						oceanDistanceKm: world.oceanDist[r],
					})
				}
				cloudFraction /= 12
			} else {
				cloudFraction = CLOUD_COVER.estimate({
					aetMm: cloudAetMonthly[monthlyOffset + r],
					petMm: cloudPetMonthly[monthlyOffset + r],
					rainfallMm: cloudRainfallMonthly[monthlyOffset + r],
					dtrC: cloudDtrMonthly[monthlyOffset + r],
					temperatureC: cloudTemperatureMonthly[monthlyOffset + r],
					oceanDistanceKm: world.oceanDist[r],
				})
			}
			const [cr, cg, cb] = cloudCoverColor(cloudFraction)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (
		(colorMode === "precipitation" ||
			colorMode === "realPrecipitation" ||
			colorMode === "precipitationDiff") &&
		world.rainfall
	) {
		if (rainfallMonth === 0) {
			for (let r = 0; r < N; r++) {
				const annualValue =
					colorMode === "realPrecipitation"
						? world.rainfall.real_annual?.[r]
						: colorMode === "precipitationDiff"
							? world.rainfall.diff_annual?.[r]
							: world.rainfall.annual[r]
				const baseColor =
					colorMode === "precipitationDiff"
						? precipitationDifferenceColor(annualValue ?? 0)
						: precipitationAnnualColor(annualValue ?? 0)
				const [cr, cg, cb] = isOceanRegion(r)
					? oceanRgb(r)
					: darkenClimateAtElevation(baseColor, world.elevation_km[r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		} else {
			const offset = (rainfallMonth - 1) * N
			for (let r = 0; r < N; r++) {
				const monthlyValue =
					colorMode === "realPrecipitation"
						? world.rainfall.real_monthly?.[offset + r]
						: colorMode === "precipitationDiff"
							? world.rainfall.diff_monthly?.[offset + r]
							: world.rainfall.monthly[offset + r]
				const baseColor =
					colorMode === "precipitationDiff"
						? precipitationDifferenceColor(monthlyValue ?? 0)
						: precipitationColor(monthlyValue ?? 0)
				const [cr, cg, cb] = isOceanRegion(r)
					? oceanRgb(r)
					: darkenClimateAtElevation(baseColor, world.elevation_km[r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	if (colorMode === "moisture" && world.rainfall) {
		if (rainfallMonth === 0) {
			for (let r = 0; r < N; r++) {
				if (isOceanRegion(r)) {
					const [cr, cg, cb] = oceanRgb(r)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else {
					const east = world.rainfall.east[r]
					const west = world.rainfall.west[r]
					const moisture = Math.max(east, west)
					const dominantIsEast =
						Math.abs(east - west) < 0.02 ? moisture >= 0.35 : east > west
					const [cr, cg, cb] = moistureDirectionalColor(
						moisture,
						dominantIsEast,
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
		} else {
			for (let r = 0; r < N; r++) {
				if (isOceanRegion(r)) {
					const [cr, cg, cb] = oceanRgb(r)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else {
					const east = world.rainfall.east[r]
					const west = world.rainfall.west[r]
					const moisture = Math.max(east, west)
					const dominantIsEast =
						Math.abs(east - west) < 0.02 ? moisture >= 0.35 : east > west
					const [cr, cg, cb] = moistureDirectionalColor(
						moisture,
						dominantIsEast,
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
		}
		return rgb
	}

	const isObservedVegetation =
		colorMode === "realVegetation" || colorMode === "realVegetationMaps"
	const vegetation = isObservedVegetation
		? world.realVegetation
		: world.vegetation
	if (
		(colorMode === "vegetation" ||
			colorMode === "vegetationMaps" ||
			colorMode === "realVegetation" ||
			colorMode === "realVegetationMaps") &&
		vegetation
	) {
		for (let r = 0; r < N; r++) {
			if (isOceanRegion(r)) {
				const [cr, cg, cb] = VEGETATION_WATER_BLUE
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				const biomeColor =
					colorMode === "vegetationMaps" || colorMode === "realVegetationMaps"
						? vegetationMapColor(vegetation[r], world.climateZones?.[r])
						: vegetationColor(vegetation[r])
				const [cr, cg, cb] =
					colorMode === "vegetationMaps" || colorMode === "realVegetationMaps"
						? biomeColor
						: darkenVegetationAtElevation(biomeColor, world.elevation_km[r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	const satellitePastaClimate =
		colorMode === "realVegetationSatellite"
			? world.realPastaClimate
			: world.pastaClimate
	const satelliteTemperature =
		colorMode === "realVegetationSatellite"
			? (world.climate.real_temperature_avg ?? world.climate.temperature_avg)
			: world.climate.temperature_avg
	const satelliteRainfall =
		colorMode === "realVegetationSatellite"
			? (world.rainfall.real_annual ?? world.rainfall.annual)
			: world.rainfall.annual
	if (
		(colorMode === "vegetationSatellite" ||
			colorMode === "realVegetationSatellite") &&
		satellitePastaClimate
	) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = vegetationSatelliteColor(
				world.isLand[r] !== 0,
				satelliteTemperature[r],
				satelliteRainfall[r],
			)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "pastaClimate" && world.pastaClimate) {
		const darkenMapWaterPastaClimate =
			viewMode === "map" && colorMode === "pastaClimate"
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = PASTA.pastaClimateColor(world.pastaClimate[r])
			const factor = darkenMapWaterPastaClimate && isOceanRegion(r) ? 0.74 : 1
			rgb[3 * r] = cr * factor
			rgb[3 * r + 1] = cg * factor
			rgb[3 * r + 2] = cb * factor
		}
		return rgb
	}

	if (colorMode === "koppenClimate" && world.koppenClimate) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = KOPPEN.koppenClimateColor(world.koppenClimate[r])
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "realPastaClimate" && world.realPastaClimate) {
		const darkenMapWaterRealPastaClimate =
			viewMode === "map" && colorMode === "realPastaClimate"
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = PASTA.pastaClimateColor(world.realPastaClimate[r])
			const factor =
				darkenMapWaterRealPastaClimate && isOceanRegion(r) ? 0.74 : 1
			rgb[3 * r] = cr * factor
			rgb[3 * r + 1] = cg * factor
			rgb[3 * r + 2] = cb * factor
		}
		return rgb
	}

	if (colorMode === "realKoppenClimate" && world.realKoppenClimate) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = KOPPEN.koppenClimateColor(world.realKoppenClimate[r])
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (
		(colorMode === "climate" || colorMode === "realClimate") &&
		world.climate
	) {
		const BLEND_THRESHOLD = 15
		const chaoticRgb = climateZoneColor(8)
		for (let r = 0; r < N; r++) {
			if (isOceanRegion(r)) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
				continue
			}
			const temperatureAvg =
				colorMode === "realClimate"
					? world.climate.real_temperature_avg?.[r]
					: world.climate.temperature_avg[r]
			let temperatureMin = world.climate.temperature_min[r]
			let temperatureMax = world.climate.temperature_max[r]
			if (
				colorMode === "realClimate" &&
				world.climate.real_temperature_monthly
			) {
				temperatureMin = Infinity
				temperatureMax = -Infinity
				for (let month = 0; month < 12; month++) {
					const temperature =
						world.climate.real_temperature_monthly[month * N + r]
					if (temperature < temperatureMin) temperatureMin = temperature
					if (temperature > temperatureMax) temperatureMax = temperature
				}
			}
			let [cr, cg, cb] = climateTempColor(
				temperatureAvg ?? world.climate.temperature_avg[r],
			)
			const minT = Math.min(
				BLEND_THRESHOLD,
				Math.max(VEGETATION.chaoticMin - temperatureMin, 0),
			)
			const maxT = Math.min(
				BLEND_THRESHOLD,
				Math.max(temperatureMax - VEGETATION.chaoticMax, 0),
			)
			if (minT > 0 && maxT > 0) {
				const t = (minT + maxT) / 2 / BLEND_THRESHOLD
				cr += (chaoticRgb[0] - cr) * t
				cg += (chaoticRgb[1] - cg) * t
				cb += (chaoticRgb[2] - cb) * t
			}
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (
		(colorMode === "dtr" ||
			colorMode === "realDtr" ||
			colorMode === "dtrDiff") &&
		world.dtr_annual
	) {
		const annual =
			colorMode === "realDtr"
				? world.observedDtr?.real_annual
				: colorMode === "dtrDiff"
					? world.observedDtr?.diff_annual
					: world.dtr_annual
		const monthly =
			dtrMonth === 0
				? null
				: colorMode === "realDtr"
					? world.observedDtr?.real_monthly
					: colorMode === "dtrDiff"
						? world.observedDtr?.diff_monthly
						: world.dtr_monthly
		const offset = monthly ? (dtrMonth - 1) * N : 0
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = isLandRegion(r)
				? colorMode === "dtrDiff"
					? dtrDifferenceColor(
							monthly
								? (monthly[offset + r] ?? annual?.[r] ?? 0)
								: (annual?.[r] ?? 0),
						)
					: dtrColor(
							monthly
								? (monthly[offset + r] ?? annual?.[r] ?? 0)
								: (annual?.[r] ?? 0),
						)
				: oceanRgb(r)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (
		(colorMode === "humidity" ||
			colorMode === "realHumidity" ||
			colorMode === "humidityDiff") &&
		world.climate &&
		world.dtr_annual
	) {
		// Earth imports can carry observed RH sampled from WorldClim vapor
		// pressure + observed temperature. Otherwise fall back to the temp/DTR
		// estimate, which follows the same month index as DTR.
		const monthlyTemp =
			dtrMonth === 0 ? null : world.climate.temperature_monthly
		const monthlyDtr = dtrMonth === 0 ? null : world.dtr_monthly
		const offset = dtrMonth === 0 ? 0 : (dtrMonth - 1) * N
		const aet = world.hydrology?.aet_monthly
		const pet = world.climate.pet_monthly
		for (let r = 0; r < N; r++) {
			if (isOceanRegion(r)) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
				continue
			}
			const meanT = monthlyTemp
				? monthlyTemp[offset + r]
				: world.climate.temperature_avg[r]
			const dtr = monthlyDtr
				? (monthlyDtr[offset + r] ?? world.dtr_annual[r])
				: world.dtr_annual[r]
			const observedRh =
				dtrMonth === 0
					? world.observedHumidity?.real_annual?.[r]
					: world.observedHumidity?.real_monthly?.[offset + r]
			let annualAridity: number | undefined
			if (aet && pet) {
				let aetSum = 0
				let petSum = 0
				for (let m = 0; m < 12; m++) {
					aetSum += aet[m * N + r]
					petSum += pet[m * N + r]
				}
				annualAridity = petSum > 0 ? aetSum / petSum : 1
			}
			const modeledRh = HUMIDITY.relativeHumidityFromTempRange({
				meanTempC: meanT,
				dtrC: dtr,
				annualAridity,
				annualRainfallMm: world.rainfall?.annual[r],
				distFromOceanKm: world.oceanDist[r],
			})
			const value =
				colorMode === "realHumidity"
					? observedRh
					: colorMode === "humidityDiff" && Number.isFinite(observedRh)
						? modeledRh - observedRh
						: modeledRh
			const [cr, cg, cb] =
				colorMode === "humidityDiff"
					? humidityDifferenceColor(value)
					: humidityColor(Number.isFinite(value) ? value : modeledRh)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "oceanCurrents" && world.oceanCurrents) {
		const { sst, sstMonthly } = world.oceanCurrents
		const monthly = currentMonth === 0 ? null : sstMonthly
		const offset = monthly ? (currentMonth - 1) * N : 0
		for (let r = 0; r < N; r++) {
			const colorValue = monthly ? (monthly[offset + r] ?? sst[r]) : sst[r]
			const [cr, cg, cb] = oceanCurrentColor(colorValue)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (
		colorMode === "dangerZones" &&
		dangerSubMode === "tidal" &&
		world.tidalRange
	) {
		for (let r = 0; r < N; r++) {
			const tidalVal = world.tidalRange[r] ?? 0
			const isLand = isLandRegion(r)
			let cr: number, cg: number, cb: number
			if (isLand && tidalVal > 1e-5) {
				;[cr, cg, cb] = darkenVegetationAtElevation(
					tidalTierColor(tidalVal),
					world.elevation_km[r],
				)
			} else if (!isLand) {
				;[cr, cg, cb] = oceanRgb(r)
			} else {
				;[cr, cg, cb] = darkenVegetationAtElevation(
					[1, 1, 1],
					world.elevation_km[r],
				)
			}
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "dangerZones" && world.hazards) {
		const isOcean = (r: number) => isOceanRegion(r)
		for (let r = 0; r < N; r++) {
			if (isOcean(r)) {
				const [cr, cg, cb] = OCEAN_LIGHT_BLUE
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
				continue
			}
			let landColor: [number, number, number]
			if (dangerSubMode === "cyclone") {
				const risk = world.cycloneRisk?.[r] ?? 0
				landColor = cycloneLandColor(risk)
			} else if (dangerSubMode === "tornado") {
				const risk = world.tornadoRisk?.[r] ?? 0
				landColor = tornadoLandColor(risk)
			} else if (dangerSubMode === "volcanic") {
				const score = world.hazards.volcano[r] ?? 0
				landColor = volcanicLandColor(score)
			} else {
				const score = world.hazards.earthquake[r] ?? 0
				landColor = earthquakeLandColor(score)
			}
			const [cr, cg, cb] = darkenVegetationAtElevation(
				landColor,
				world.elevation_km[r],
			)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "hotspots" && world.volcanism) {
		let maxHotspot = 0
		for (let r = 0; r < N; r++) {
			if (world.volcanism.hotspot[r] > maxHotspot)
				maxHotspot = world.volcanism.hotspot[r]
		}
		const invMax = maxHotspot > 1e-6 ? 1 / maxHotspot : 0
		for (let r = 0; r < N; r++) {
			const isLand = isLandRegion(r)
			if (!isLand) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				const score = Math.max(
					0,
					Math.min(1, world.volcanism.hotspot[r] * invMax),
				)
				const [cr, cg, cb] = darkenVegetationAtElevation(
					hotspotColor(score),
					world.elevation_km[r],
				)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	if (colorMode === "nations" && world.provinces) {
		if (nationMode === "government" && world.nations?.governmentType) {
			const { regionProvince, desolate } = world.provinces
			const migrationWaveGov = world.population?.migrationWave
			const settlementWaveGov = world.population?.settlementWave ?? 1.0
			for (let r = 0; r < N; r++) {
				const p = regionProvince[r]
				if (p < 0) {
					const [cr, cg, cb] = oceanRgb(r)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (desolate[p]) {
					const [cr, cg, cb] = darkenPoliticalAtElevation(
						[0.35, 0.33, 0.32],
						world.elevation_km[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (world.nations.assignment[p] < 0) {
					const wave = migrationWaveGov?.[p] ?? 0
					if (wave <= settlementWaveGov) {
						const [cr, cg, cb] = darkenPoliticalAtElevation(
							[0.96, 0.94, 0.9],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					} else {
						const [cr, cg, cb] = darkenPoliticalAtElevation(
							[0.72, 0.7, 0.68],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				} else {
					const nationId = world.nations.assignment[p]
					const govType = world.nations.governmentType[nationId] ?? 1
					const baseColor = governmentColorForIndex(govType)
					const [cr, cg, cb] = darkenPoliticalAtElevation(
						baseColor,
						world.elevation_km[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
			return rgb
		}
		if (nationMode === "dynasty") {
			const { regionProvince, desolate } = world.provinces
			const migrationWaveDyn = world.population?.migrationWave
			const settlementWaveDyn = world.population?.settlementWave ?? 1.0
			for (let r = 0; r < N; r++) {
				const p = regionProvince[r]
				const assignedNationId =
					p >= 0 ? (world.nations?.assignment?.[p] ?? -1) : -1
				const rulerNationId = assignedNationId
				const dynastyId =
					rulerNationId >= 0 ? (world.leaderDynasty?.[rulerNationId] ?? -1) : -1
				if (p < 0) {
					const [cr, cg, cb] = oceanRgb(r)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (desolate[p]) {
					const [cr, cg, cb] = darkenPoliticalAtElevation(
						[0.35, 0.33, 0.32],
						world.elevation_km[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (dynastyId < 0) {
					const wave = migrationWaveDyn?.[p] ?? 0
					if (wave <= settlementWaveDyn) {
						const [cr, cg, cb] = darkenPoliticalAtElevation(
							[0.96, 0.94, 0.9],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					} else {
						const [cr, cg, cb] = darkenPoliticalAtElevation(
							[0.72, 0.7, 0.68],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				} else {
					const [cr, cg, cb] = darkenPoliticalAtElevation(
						toPastelNationColor(getDynastyColor(dynastyId)),
						world.elevation_km[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
			return rgb
		}
		if (nationMode === "provinces" || nationMode === "earthProvinces") {
			const { regionProvince, colors: provColors, desolate } = world.provinces
			for (let r = 0; r < N; r++) {
				const p = regionProvince[r]
				if (p < 0) {
					const [cr, cg, cb] = oceanRgb(r)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (desolate[p]) {
					rgb[3 * r] = 0.35
					rgb[3 * r + 1] = 0.33
					rgb[3 * r + 2] = 0.32
				} else {
					const [cr, cg, cb] = darkenPoliticalAtElevation(
						[provColors[3 * p], provColors[3 * p + 1], provColors[3 * p + 2]],
						world.elevation_km[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
			return rgb
		}
		if (nationMode === "diplomacy" && world.nations) {
			const { regionProvince, desolate } = world.provinces
			const NEUTRAL_COLOR = DIPLOMACY_RGB_COLORS[REL.NEUTRAL]
			const migrationWaveDip = world.population?.migrationWave
			const settlementWaveDip = world.population?.settlementWave ?? 1.0
			for (let r = 0; r < N; r++) {
				const p = regionProvince[r]
				if (p < 0) {
					const [cr, cg, cb] = oceanRgb(r)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (desolate[p]) {
					const [cr, cg, cb] = darkenPoliticalAtElevation(
						[0.35, 0.33, 0.32],
						world.elevation_km[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (world.nations.assignment[p] < 0) {
					const wave = migrationWaveDip?.[p] ?? 0
					if (wave <= settlementWaveDip) {
						const [cr, cg, cb] = darkenPoliticalAtElevation(
							[0.96, 0.94, 0.9],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					} else {
						const [cr, cg, cb] = darkenPoliticalAtElevation(
							[0.72, 0.7, 0.68],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				} else if (
					selectedNationId === null ||
					selectedNationId === undefined ||
					!relationAt
				) {
					const [cr, cg, cb] = darkenPoliticalAtElevation(
						NEUTRAL_COLOR,
						world.elevation_km[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else {
					const nationId = world.nations.assignment[p]
					const [cr, cg, cb] =
						nationId === selectedNationId
							? darkenPoliticalAtElevation([1, 1, 1], world.elevation_km[r])
							: darkenPoliticalAtElevation(
									DIPLOMACY_RGB_COLORS[
										relationAt(selectedNationId, nationId)
									] ?? NEUTRAL_COLOR,
									world.elevation_km[r],
								)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				}
			}
			return rgb
		}
		{
			const { regionProvince, desolate } = world.provinces
			const migrationWave = world.population?.migrationWave
			const settlementWave = world.population?.settlementWave ?? 1.0
			for (let r = 0; r < N; r++) {
				const p = regionProvince[r]
				if (p < 0) {
					const [cr, cg, cb] = oceanRgb(r)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (desolate[p]) {
					const [cr, cg, cb] = darkenPoliticalAtElevation(
						[0.35, 0.33, 0.32],
						world.elevation_km[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (world.nations && world.nations.assignment[p] >= 0) {
					const displayColorNationId = world.nations.assignment[p]
					const [cr, cg, cb] = darkenPoliticalAtElevation(
						toPastelNationColor([
							world.nations.colors[3 * displayColorNationId],
							world.nations.colors[3 * displayColorNationId + 1],
							world.nations.colors[3 * displayColorNationId + 2],
						]),
						world.elevation_km[r],
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else {
					// no nation: settled-stateless → cream-white, unsettled → medium gray
					const wave = migrationWave?.[p] ?? 0
					if (wave <= settlementWave) {
						const [cr, cg, cb] = darkenPoliticalAtElevation(
							[0.96, 0.94, 0.9],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					} else {
						const [cr, cg, cb] = darkenPoliticalAtElevation(
							[0.72, 0.7, 0.68],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				}
			}
			return rgb
		}
	}

	if (
		(colorMode === "provinces" || colorMode === "earthProvinces") &&
		world.provinces
	) {
		const { regionProvince, colors: provColors, desolate } = world.provinces
		for (let r = 0; r < N; r++) {
			const p = regionProvince[r]
			if (p < 0) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else if (desolate[p]) {
				rgb[3 * r] = 0.35
				rgb[3 * r + 1] = 0.33
				rgb[3 * r + 2] = 0.32
			} else {
				const [cr, cg, cb] = darkenPoliticalAtElevation(
					[provColors[3 * p], provColors[3 * p + 1], provColors[3 * p + 2]],
					world.elevation_km[r],
				)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	if (
		(colorMode === "population" ||
			colorMode === "realPopulation" ||
			colorMode === "populationDiff") &&
		world.provinces
	) {
		const { regionProvince, desolate } = world.provinces
		const populationVariant = getDataVariant(colorMode)
		const pop =
			populationMode === "density"
				? populationVariant === "observed"
					? world.realPopulation?.population
					: world.population?.population
				: world.population?.population
		const urbanPop = world.realUrbanPopulation?.population
		let maxDensity = 0
		if (populationMode === "density" && pop) {
			for (let i = 0; i < world.provinces.count; i++) {
				if (!desolate[i]) {
					const d = getProvincePopulationDensity(world, i, pop[i])
					if (d > maxDensity) maxDensity = d
				}
			}
		}
		let maxAbsDensityDiff = 0
		if (
			populationMode === "density" &&
			populationVariant === "diff" &&
			world.realPopulation?.difference
		) {
			for (let i = 0; i < world.provinces.count; i++) {
				if (!desolate[i]) {
					const d = getProvincePopulationDensity(
						world,
						i,
						world.realPopulation.difference[i],
					)
					const absD = Math.abs(d)
					if (absD > maxAbsDensityDiff) maxAbsDensityDiff = absD
				}
			}
		}
		let maxDevelopment = 0
		if (populationMode === "development" && world.development) {
			for (let i = 0; i < world.provinces.count; i++) {
				if (!desolate[i] && world.development[i] > maxDevelopment)
					maxDevelopment = world.development[i]
			}
		}
		let maxUrbanPopulation = 0
		if (populationMode === "urban" && urbanPop) {
			for (let i = 0; i < world.provinces.count; i++) {
				if (!desolate[i] && urbanPop[i] > maxUrbanPopulation) {
					maxUrbanPopulation = urbanPop[i]
				}
			}
		}
		const invMax = maxDensity > 0 ? 1 / maxDensity : 0
		const invAbsDiffMax = maxAbsDensityDiff > 0 ? 1 / maxAbsDensityDiff : 0
		const invDevelopmentMax = maxDevelopment > 0 ? 1 / maxDevelopment : 0
		const invUrbanMax = maxUrbanPopulation > 0 ? 1 / maxUrbanPopulation : 0
		for (let r = 0; r < N; r++) {
			const p = regionProvince[r]
			if (p < 0) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else if (desolate[p]) {
				const [cr, cg, cb] = hasPartitionElevationBump(populationMode)
					? darkenPartitionAtElevation(
							[0.35, 0.33, 0.32],
							world.elevation_km[r],
						)
					: [0.35, 0.33, 0.32]
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				if (
					populationMode === "density" &&
					populationVariant !== "diff" &&
					pop
				) {
					const [cr, cg, cb] = populationColor(
						getProvincePopulationDensity(world, p, pop[p]) * invMax,
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (
					populationMode === "density" &&
					populationVariant === "diff" &&
					world.realPopulation?.difference
				) {
					const [cr, cg, cb] = populationDifferenceColor(
						getProvincePopulationDensity(
							world,
							p,
							world.realPopulation.difference[p],
						) * invAbsDiffMax,
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (populationMode === "urban" && urbanPop) {
					const [cr, cg, cb] = populationColor(urbanPop[p] * invUrbanMax)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (populationMode === "development" && world.development) {
					const [cr, cg, cb] = developmentColor(
						world.development[p] * invDevelopmentMax,
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (
					populationMode === "migration" &&
					world.population?.migrationWave
				) {
					const t = world.population.migrationWave[p]
					if (t < 0) {
						rgb[3 * r] = 0.35
						rgb[3 * r + 1] = 0.33
						rgb[3 * r + 2] = 0.32
					} else {
						const [cr, cg, cb] = migrationColor(t)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				} else if (populationMode === "culture") {
					const cultureIdx = world.cultures?.assignment[p] ?? -1
					if (cultureIdx < 0 || !world.cultures) {
						const [cr, cg, cb] = darkenPartitionAtElevation(
							[0.35, 0.33, 0.32],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					} else {
						const [cr, cg, cb] = darkenPartitionAtElevation(
							[
								world.cultures.colors[3 * cultureIdx],
								world.cultures.colors[3 * cultureIdx + 1],
								world.cultures.colors[3 * cultureIdx + 2],
							],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				} else if (populationMode === "heritage") {
					const cultureIdx = world.cultures?.assignment[p] ?? -1
					const heritageIdx =
						cultureIdx >= 0
							? (world.heritages?.assignment[cultureIdx] ?? -1)
							: -1
					if (heritageIdx < 0 || !world.heritages) {
						const [cr, cg, cb] = darkenPartitionAtElevation(
							[0.35, 0.33, 0.32],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					} else {
						const [cr, cg, cb] = darkenPartitionAtElevation(
							[
								world.heritages.colors[3 * heritageIdx],
								world.heritages.colors[3 * heritageIdx + 1],
								world.heritages.colors[3 * heritageIdx + 2],
							],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				} else if (populationMode === "religion") {
					const typeIdx = getReligionTypeIndexForProvince(world, p)
					if (typeIdx < 0) {
						const [cr, cg, cb] = darkenPartitionAtElevation(
							[0.35, 0.33, 0.32],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					} else {
						const typeColor =
							getReligionColorForProvince(world, p) ??
							RELIGION.religionTypeColors[typeIdx] ??
							RELIGION.religionTypeColors[0]
						const [cr, cg, cb] = darkenPartitionAtElevation(
							[typeColor[0], typeColor[1], typeColor[2]],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				} else {
					// density/development/migration handled above; fallback neutral
					rgb[3 * r] = 0.35
					rgb[3 * r + 1] = 0.33
					rgb[3 * r + 2] = 0.32
				}
			}
		}
		return rgb
	}

	if (colorMode === "basins" && world.rivers?.basinId) {
		for (let r = 0; r < N; r++) {
			const basinId = world.rivers.basinId[r] ?? -1
			if (basinId < 0) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				const [cr, cg, cb] = basinColor(basinId)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	if (colorMode === "terrainFeatures" && world.terrainFeatures) {
		const { featureMask, dominantFeature } = world.terrainFeatures
		for (let r = 0; r < N; r++) {
			const base = getColor(world.elevation_km[r], "terrain")
			const mask = featureMask[r]
			if (!mask) {
				rgb[3 * r] = base[0] * 0.32
				rgb[3 * r + 1] = base[1] * 0.32
				rgb[3 * r + 2] = base[2] * 0.32
				continue
			}
			let feature = dominantFeature[r]
			if (!(mask & (1 << (feature - 1)))) {
				feature = 0
				for (let bit = 1; bit <= 11; bit++) {
					if (mask & (1 << (bit - 1))) {
						feature = bit
						break
					}
				}
			}
			const accent = TERRAIN_FEATURE_COLORS[feature] ?? [1, 1, 1]
			rgb[3 * r] = base[0] * 0.2 + accent[0] * 0.8
			rgb[3 * r + 1] = base[1] * 0.2 + accent[1] * 0.8
			rgb[3 * r + 2] = base[2] * 0.2 + accent[2] * 0.8
		}
		return rgb
	}

	// Terrain / heightmap modes
	if (colorMode === "trade_goods" && world.tradeGoods && world.locations) {
		const { regionLocation } = world.locations
		for (let r = 0; r < N; r++) {
			if (isOceanRegion(r)) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				const l = regionLocation[r]
				const tgIdx = l != null && l >= 0 ? (world.tradeGoods[l] ?? 0) : 0
				const [cr, cg, cb] = TRADE_GOODS.tradeGoodColor(tgIdx)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	// Terrain / heightmap modes
	const shelfLandR = 0xac / 255,
		shelfLandG = 0xd0 / 255,
		shelfLandB = 0xa5 / 255
	const basinLandR = 0xa7 / 255,
		basinLandG = 0xdf / 255,
		basinLandB = 0xd2 / 255
	for (let r = 0; r < N; r++) {
		const km = world.elevation_km[r]
		if (isLakeRegion(r)) {
			const [cr, cg, cb] = getColor(Math.min(0, km), "terrain")
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		} else if (isOceanRegion(r)) {
			const [cr, cg, cb] = getColor(Math.min(0, km), "terrain")
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		} else if (km <= 0) {
			const depthKm = -km
			const t = Math.min(1, Math.sqrt(depthKm))
			rgb[3 * r] = shelfLandR + (basinLandR - shelfLandR) * t
			rgb[3 * r + 1] = shelfLandG + (basinLandG - shelfLandG) * t
			rgb[3 * r + 2] = shelfLandB + (basinLandB - shelfLandB) * t
		} else {
			const [cr, cg, cb] = getColor(km, colorMode)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
	}
	return rgb
}

export function buildElevationLookup(
	world: SerializedGenesisWorld | null | undefined,
): ElevationKmForLonLat | undefined {
	if (!world?.mesh || !world.elevation_km) return undefined
	let lookup = elevationLookupCache.get(world.mesh)
	if (!lookup) {
		const index = MESH.buildRegionSpatialIndex(world.mesh)
		const elevationKm = world.elevation_km
		lookup = (lonDeg, latDeg) => {
			const region = index.nearest(lonDeg, latDeg)
			return region >= 0 ? elevationKm[region] : 0
		}
		elevationLookupCache.set(world.mesh, lookup)
	}
	return lookup
}

// lon/lat -> elevation_km, via nearest-mesh-region snapping (same technique
// import-heightmap.ts uses to place real river lines at the right height).
// Keyed by mesh object identity so it's built once per world's mesh, not
// once per rebuildNationBorders() call (which fires on most color-mode/
// timeline changes, far more often than the mesh itself changes).
const elevationLookupCache = new WeakMap<object, ElevationKmForLonLat>()
