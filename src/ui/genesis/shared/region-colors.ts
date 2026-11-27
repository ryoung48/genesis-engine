import { KOPPEN } from "@/model/climate/classification/koppen"
import { PASTA } from "@/model/climate/classification/pasta"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLOUD_COVER } from "@/model/climate/precipitation/cloud-cover"
import { HUMIDITY_MARINE } from "@/model/climate/precipitation/humidity/marine"
import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import { KARST_CAVES } from "@/model/geography/terrain/karst-caves"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { ROCKS } from "@/model/geography/terrain/rocks"
import { SHORE } from "@/model/geography/terrain/shore"
import { RELIGION } from "@/model/history/sim/religion"
import { MESH } from "@/model/mesh"
import { TRADE_GOODS } from "@/model/society/infrastructure/trade/trade-goods"
import { MIGRATION } from "@/model/society/migration"
import { TIMEZONE } from "@/model/society/timezone"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { ElevationKmForLonLat } from "@/ui/genesis/political/eu4-nation-fill-overlay"
import {
	getReligionColorForProvince,
	getReligionTypeIndexForProvince,
} from "@/ui/genesis/political/religion-type"
import {
	darkenClimateAtElevation,
	darkenPoliticalAtElevation,
	darkenVegetationAtElevation,
} from "@/ui/genesis/shared/color-helpers"
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
	humidityColor,
	humidityDifferenceColor,
	knowledgeColor,
	migrationColor,
	OCEAN_LIGHT_BLUE,
	populationColor,
	populationDifferenceColor,
	slopeColor,
	TIDAL_LAND_COLOR,
	tidalTierColor,
	tornadoLandColor,
	VEGETATION_WATER_BLUE,
	volcanicLandColor,
	wayOfLifeBlend,
} from "@/ui/genesis/shared/colors"
import {
	climateZoneColor,
	oceanCurrentColor,
} from "@/ui/genesis/shared/colors/misc"
import { populationDensityColor } from "@/ui/genesis/shared/colors/population-density"
import {
	precipitationAnnualColor,
	precipitationColor,
	precipitationDifferenceColor,
	rainfallSeasonalityColor,
} from "@/ui/genesis/shared/colors/precipitation"
import { techLevelColor } from "@/ui/genesis/shared/colors/tech-level"
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
import { DEPOSITS_VIEW } from "@/ui/genesis/shared/deposits-view"
import { TRADE_GOODS_VIEW } from "@/ui/genesis/shared/trade-goods-view"
import { getFarming, getWayOfLife } from "@/ui/genesis/shared/farming-display"
import type { SocietyMapMode } from "@/ui/genesis/shared/map-modes"
import {
	getArrivalRampYears,
	getArrivalScale,
} from "@/ui/genesis/shared/migration-arrival"
import { supportsOceanClimate } from "@/ui/genesis/shared/ocean-climate"
import { getProvincePopulationDensity } from "@/ui/genesis/shared/population-density"
import { getRainfallSeasonality } from "@/ui/genesis/shared/rainfall-seasonality"
import {
	basinColor,
	FROZEN_COLOR,
	getLakeKindColor,
	KARST_CLASS_COLORS,
	rockColor,
	SHORE_LABEL_COLORS,
	soilColor,
	TERRAIN_FEATURE_COLORS,
	TOPOGRAPHY_COLORS,
	UNOWNED_GRAY,
	waterTableClass,
	waterTableColor,
	wetlandColor,
} from "@/ui/genesis/shared/region-colors/palette"
import {
	topographySeabedColor,
	vegetationSeabedColor,
} from "@/ui/genesis/shared/region-colors/seabed"
import type { RegionColorsInput } from "@/ui/genesis/shared/region-colors/types"

const CULTURE_ELEVATION_BUMP_SCALE = 1.6

function hasPartitionElevationBump(populationMode: SocietyMapMode): boolean {
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

export function computeRegionColors({
	world,
	colorMode,
	nationMode,
	populationMode,
	temperatureMonth,
	rainfallMonth,
	dtrMonth,
	currentMonth,
	viewMode,
	dangerSubMode,
	religionMode,
	depositsView,
	tradeGoodsView,
	year,
}: RegionColorsInput): Float32Array | null {
	if (colorMode === "landHeightmap") return null

	const N = world.mesh.numRegions
	const rgb = new Float32Array(N * 3)
	const hasOceanClimate = supportsOceanClimate(world)
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

	if (
		(colorMode === "waterTable" || colorMode === "wetlands") &&
		world.groundwater
	) {
		const groundwater = world.groundwater
		for (let r = 0; r < N; r++) {
			const active = isLandRegion(r) && world.pastaClimate[r] !== PASTA.iceCode
			const [cr, cg, cb] = !isLandRegion(r)
				? oceanRgb(r)
				: !active
					? FROZEN_COLOR
					: colorMode === "waterTable"
						? waterTableColor(waterTableClass(groundwater.waterTableM[r]))
						: wetlandColor({
								kind: groundwater.wetlandKind[r],
								share: groundwater.wetlandShare[r],
							})
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "shore" && world.shore) {
		const labelCode = world.shore.label
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = !isLandRegion(r)
				? oceanRgb(r)
				: labelCode[r] === 0
					? UNOWNED_GRAY
					: SHORE_LABEL_COLORS[SHORE.labels[labelCode[r]]]
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "deposits" && world.deposits) {
		const { rows } = world.deposits
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = DEPOSITS_VIEW.paint({
				rows,
				numRegions: N,
				region: r,
				view: depositsView,
				isLand: world.isLand[r] === 1,
				base: isLandRegion(r) ? UNOWNED_GRAY : oceanRgb(r),
			})
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "karst" && world.karst) {
		const classCode = world.karst.karstClass
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = !isLandRegion(r)
				? oceanRgb(r)
				: KARST_CLASS_COLORS[KARST_CAVES.classes[classCode[r]]]
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "topography" && world.topography) {
		for (let r = 0; r < N; r++) {
			const topo = world.topography[r]
			const isWater = topo === 5 || topo === 6
			const lakeColor = getLakeKindColor({
				code: topo,
				lakeKind: world.rivers?.lakeKind?.[r],
			})
			if (lakeColor) {
				const [cr, cg, cb] = lakeColor
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else if (isWater) {
				const [cr, cg, cb] = topographySeabedColor({
					seabed: world.seabed,
					region: r,
					base: oceanRgb(r),
				})
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
			if (
				isOceanRegion(r) &&
				!(
					(colorMode === "temperature" || colorMode === "temperatureDelta") &&
					hasOceanClimate
				)
			) {
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
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
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

	// Prefer the cache populated once during generation (real_cloud_cover_monthly
	// mirrors this same observed-preferred-else-modeled fallback order;
	// cloud_cover_monthly is the pure-modeled fallback for a procedural world
	// with no observed data) over recomputing CLOUD_COVER.estimate for every
	// cell/month on every render -- see real-earth-data's
	// attachCachedCloudCoverEstimate and the cloud-cover temperature modifier.
	const cachedCloudCoverMonthly =
		world.climate?.real_cloud_cover_monthly ??
		world.climate?.cloud_cover_monthly
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
		(cachedCloudCoverMonthly ||
			(cloudAetMonthly &&
				cloudPetMonthly &&
				cloudRainfallMonthly &&
				cloudDtrMonthly &&
				cloudTemperatureMonthly))
	) {
		const monthlyOffset = rainfallMonth > 0 ? (rainfallMonth - 1) * N : 0
		for (let r = 0; r < N; r++) {
			if (isOceanRegion(r) && !hasOceanClimate) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
				continue
			}
			let cloudFraction = 0
			if (cachedCloudCoverMonthly) {
				if (rainfallMonth === 0) {
					for (let month = 0; month < 12; month++) {
						cloudFraction += cachedCloudCoverMonthly[month * N + r]
					}
					cloudFraction /= 12
				} else {
					cloudFraction = cachedCloudCoverMonthly[monthlyOffset + r]
				}
			} else if (rainfallMonth === 0) {
				for (let month = 0; month < 12; month++) {
					const idx = month * N + r
					cloudFraction += CLOUD_COVER.estimate({
						aetMm: cloudAetMonthly![idx],
						petMm: cloudPetMonthly![idx],
						rainfallMm: cloudRainfallMonthly![idx],
						dtrC: cloudDtrMonthly![idx],
						temperatureC: cloudTemperatureMonthly![idx],
						oceanDistanceKm: world.oceanDist[r],
					})
				}
				cloudFraction /= 12
			} else {
				cloudFraction = CLOUD_COVER.estimate({
					aetMm: cloudAetMonthly![monthlyOffset + r],
					petMm: cloudPetMonthly![monthlyOffset + r],
					rainfallMm: cloudRainfallMonthly![monthlyOffset + r],
					dtrC: cloudDtrMonthly![monthlyOffset + r],
					temperatureC: cloudTemperatureMonthly![monthlyOffset + r],
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

	if (colorMode === "rainfallSeasonality" && world.rainfall) {
		for (let r = 0; r < N; r++) {
			const range = getRainfallSeasonality({
				monthly: world.rainfall.monthly,
				numRegions: N,
				region: r,
			})
			const [cr, cg, cb] =
				isOceanRegion(r) && !hasOceanClimate
					? oceanRgb(r)
					: rainfallSeasonalityColor(range)
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
					? colorMode === "precipitation" && hasOceanClimate
						? baseColor
						: oceanRgb(r)
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
					? colorMode === "precipitation" && hasOceanClimate
						? baseColor
						: oceanRgb(r)
					: darkenClimateAtElevation(baseColor, world.elevation_km[r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
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
				const [cr, cg, cb] = vegetationSeabedColor({
					seabed: world.seabed,
					region: r,
					base: VEGETATION_WATER_BLUE,
				})
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				const isMaps =
					colorMode === "vegetationMaps" || colorMode === "realVegetationMaps"
				const biomeColor = isMaps
					? vegetationMapColor(vegetation[r], world.climateZones?.[r])
					: vegetationColor(vegetation[r])
				const [cr, cg, cb] = isMaps
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
			const [cr, cg, cb] = vegetationSeabedColor({
				seabed: world.seabed,
				region: r,
				base: vegetationSatelliteColor(
					world.isLand[r] !== 0,
					satelliteTemperature[r],
					satelliteRainfall[r],
				),
			})
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
			const [cr, cg, cb] =
				isLandRegion(r) || (colorMode === "dtr" && hasOceanClimate)
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
		const modeled = HUMIDITY_MARINE.fields(world)
		const offset = dtrMonth === 0 ? 0 : (dtrMonth - 1) * N
		for (let r = 0; r < N; r++) {
			if (isOceanRegion(r) && !(colorMode === "humidity" && hasOceanClimate)) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
				continue
			}
			const observedRh =
				dtrMonth === 0
					? world.observedHumidity?.real_annual?.[r]
					: world.observedHumidity?.real_monthly?.[offset + r]
			const modeledRh =
				dtrMonth === 0 ? modeled.annual[r] : modeled.monthly[offset + r]
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
			const [cr, cg, cb] = isLandRegion(r)
				? TIDAL_LAND_COLOR
				: tidalTierColor(world.tidalRange[r] ?? 0)
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

	if (colorMode === "nations" && world.provinces) {
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
		const developmentValues =
			populationMode === "knowledge" ? world.knowledge : world.development
		let minDevelopment = populationMode === "knowledge" ? Infinity : 0
		let maxDevelopment = populationMode === "knowledge" ? -Infinity : 0
		if (
			(populationMode === "development" || populationMode === "knowledge") &&
			developmentValues
		) {
			for (let i = 0; i < world.provinces.count; i++) {
				if (desolate[i]) continue
				minDevelopment = Math.min(minDevelopment, developmentValues[i])
				maxDevelopment = Math.max(maxDevelopment, developmentValues[i])
			}
		}
		const techLevels =
			populationMode === "techLevel" ? world.population?.techLevel : undefined
		let maxUrbanPopulation = 0
		if (populationMode === "urban" && urbanPop) {
			for (let i = 0; i < world.provinces.count; i++) {
				if (!desolate[i] && urbanPop[i] > maxUrbanPopulation) {
					maxUrbanPopulation = urbanPop[i]
				}
			}
		}
		const arrivalYears =
			populationMode === "migration" ? getArrivalRampYears(world) : undefined
		const farming =
			populationMode === "farming" || populationMode === "wayOfLife"
				? getFarming(world)
				: undefined
		const wayOfLife =
			populationMode === "wayOfLife" && farming
				? getWayOfLife({ world, year })
				: undefined
		const arrivalScale = arrivalYears
			? getArrivalScale({ years: arrivalYears, desolate })
			: farming && populationMode === "farming"
				? getArrivalScale({ years: farming.farmingYear, desolate })
				: { min: 0, span: 0 }
		const neutralArrival =
			(arrivalYears || farming) &&
			world.historyMigration.pipeline === "distribution"
				? UNOWNED_GRAY
				: [0.35, 0.33, 0.32]
		const invAbsDiffMax = maxAbsDensityDiff > 0 ? 1 / maxAbsDensityDiff : 0
		const developmentRange = maxDevelopment - minDevelopment
		const invDevelopmentRange = developmentRange > 0 ? 1 / developmentRange : 0
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
					const [cr, cg, cb] = populationDensityColor(
						getProvincePopulationDensity(world, p, pop[p]),
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
				} else if (
					(populationMode === "development" ||
						populationMode === "knowledge") &&
					developmentValues
				) {
					const color =
						populationMode === "knowledge" ? knowledgeColor : developmentColor
					const normalized =
						populationMode === "knowledge" && developmentRange === 0
							? 0.5
							: (developmentValues[p] - minDevelopment) * invDevelopmentRange
					const [cr, cg, cb] = color(normalized)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (populationMode === "techLevel" && techLevels) {
					const level = techLevels[p]
					const [cr, cg, cb] = Number.isFinite(level)
						? techLevelColor(level)
						: [0.35, 0.33, 0.32]
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (populationMode === "migration" && arrivalYears) {
					const arrival = arrivalYears[p]
					if (desolate[p] || arrival === MIGRATION.sentinel) {
						rgb[3 * r] = neutralArrival[0]
						rgb[3 * r + 1] = neutralArrival[1]
						rgb[3 * r + 2] = neutralArrival[2]
					} else {
						const [cr, cg, cb] = migrationColor(
							arrivalScale.span > 0
								? (arrival - arrivalScale.min) / arrivalScale.span
								: 0,
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				} else if (populationMode === "farming" && farming) {
					const arrival = farming.farmingYear[p]
					if (arrival === MIGRATION.sentinel) {
						rgb[3 * r] = neutralArrival[0]
						rgb[3 * r + 1] = neutralArrival[1]
						rgb[3 * r + 2] = neutralArrival[2]
					} else {
						const [cr, cg, cb] = migrationColor(
							arrivalScale.span > 0
								? (arrival - arrivalScale.min) / arrivalScale.span
								: 0,
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					}
				} else if (populationMode === "wayOfLife" && wayOfLife) {
					const shares = {
						forage: wayOfLife.forage[p],
						farm: wayOfLife.farm[p],
						herd: wayOfLife.herd[p],
					}
					const [cr, cg, cb] =
						shares.forage + shares.farm + shares.herd > 0
							? wayOfLifeBlend(shares)
							: neutralArrival
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
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
					const religionColor = getReligionColorForProvince(world, p)
					const color =
						religionMode === "types" && typeIdx >= 0
							? (RELIGION.religionTypeColors[typeIdx] ??
								RELIGION.religionTypeColors[0])
							: religionColor
					if (!color) {
						const [cr, cg, cb] = darkenPartitionAtElevation(
							[0.35, 0.33, 0.32],
							world.elevation_km[r],
						)
						rgb[3 * r] = cr
						rgb[3 * r + 1] = cg
						rgb[3 * r + 2] = cb
					} else {
						const [cr, cg, cb] = darkenPartitionAtElevation(
							[color[0], color[1], color[2]],
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

	if (
		(colorMode === "rock" || colorMode === "soil") &&
		world.rock &&
		world.youngKind &&
		world.soilFertility
	) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = !isLandRegion(r)
				? oceanRgb(r)
				: colorMode === "soil"
					? soilColor(world.soilFertility[r])
					: rockColor({
							rock: ROCKS.kinds[world.rock[r]],
							young: ROCKS.youngKinds[world.youngKind[r]],
						})
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
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
				for (
					let bit = 1;
					bit < TERRAIN_FEATURES.genesisTerrainFeatureLabels.length;
					bit++
				) {
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
		const filter = TRADE_GOODS_VIEW.filterIndex(tradeGoodsView)
		for (let r = 0; r < N; r++) {
			if (isOceanRegion(r)) {
				const [cr, cg, cb] = oceanRgb(r)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				const l = regionLocation[r]
				const tgIdx = l != null && l >= 0 ? (world.tradeGoods[l] ?? 0) : 0
				const [cr, cg, cb] = TRADE_GOODS_VIEW.paint({
					filter,
					good: tgIdx,
					color: TRADE_GOODS.tradeGoodColor(tgIdx),
					base: UNOWNED_GRAY,
				})
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
	const waterColorMode = colorMode === "terrainRed" ? "terrainRed" : "terrain"
	for (let r = 0; r < N; r++) {
		const km = world.elevation_km[r]
		if (isLakeRegion(r)) {
			const [cr, cg, cb] = getColor(Math.min(0, km), waterColorMode)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		} else if (isOceanRegion(r)) {
			const [cr, cg, cb] = getColor(Math.min(0, km), waterColorMode)
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
