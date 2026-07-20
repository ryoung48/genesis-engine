import {
	GENESIS_TERRAIN_FEATURE_LABELS,
	GENESIS_TOPOGRAPHY_LABELS,
} from "@/model"
import { apparentTemperatureC } from "@/model/climate/apparent-temp"
import { relativeHumidityFromTempRange } from "@/model/climate/humidity"
import { KOPPEN_LABELS, koppenClimateName } from "@/model/climate/koppen"
import { PASTA_LABELS, pastaClimateName } from "@/model/climate/pasta"
import { BIOME_LABELS, CLIMATE_LABELS } from "@/model/climate/vegetation"
import { TRADE_GOOD_LABELS } from "@/model/economy/trade-goods"
import { regionTimezoneLabel } from "@/model/society/timezone"
import { LANDMARK_TYPE_LAKE, LANDMARK_TYPES } from "@/model/terrain/landmarks"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import {
	type ColorMode,
	EU5_CLIMATE_CATEGORIES,
	EU5_TOPOGRAPHY_CATEGORIES,
	EU5_VEGETATION_CATEGORIES,
} from "../colors"
import type { DataVariant } from "../screen/shared/data-variant"

export interface HoverInfo {
	region: number
	x: number
	y: number
}

interface HoverLonLat {
	lonDeg: number
	latDeg: number
}

export interface HoverLandmark {
	id: number
	type: string | null
	size: number | null
}

export interface HoverHazards {
	earthquake: number
	volcano: number
	danger: number
	cyclone: number
	tornado: number
	/** Raw tidal range in metres for the hovered cell. */
	tidal: number
}

export interface HoverHotspot {
	value: number
}

export interface HoverRiver {
	flow: number
	flow_monthly: number[]
	riverId: number
	lengthKm: number
}

export interface HoverOceanCurrents {
	warmth: number
	delta: number
	averageDelta: number
	mode: "warm" | "cold"
	monthlyDelta: number[]
}

export interface HoverTerrainFeature {
	dominant: string | null
	all: string[]
}

export interface HoverDtr {
	value: number
	annual: number
	monthly: number[]
}

export interface HoverTemperatureSeries {
	value: number
	annual: number
	monthly: number[]
}

export interface HoverRainfallSeries {
	value: number
	annual: number
	monthly: number[]
}

export interface HoverHumidity {
	value: number
	annual: number
	monthly: number[]
}

export interface HoverMisery {
	value: number
	annual: number
	monthly: number[]
}

export function getHoverElevationKm(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): number | null {
	return hoverInfo && world ? (world.elevation_km[hoverInfo.region] ?? 0) : null
}

export function getHoverTopography(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dataVariant: DataVariant,
): string | null {
	if (!hoverInfo || !world) return null
	const region = hoverInfo.region
	if (dataVariant === "observed" && world.isEarthImport) {
		const code = world.eu5Topography?.[region] ?? -1
		return code >= 0
			? formatObservedCategoryLabel(EU5_TOPOGRAPHY_CATEGORIES[code])
			: "unmapped"
	}
	return hoverInfo && world?.topography
		? (GENESIS_TOPOGRAPHY_LABELS[world.topography[hoverInfo.region]] ?? null)
		: null
}

function formatObservedCategoryLabel(value: string | undefined): string | null {
	return value ? value.replace(/_/g, " ") : null
}

export function getHoverCoordinates(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): string | null {
	const lonLat = getHoverLonLat(hoverInfo, world)
	if (!lonLat) return null
	const { lonDeg: lon, latDeg: lat } = lonLat
	const latLabel = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`
	const lonLabel = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`
	return `${latLabel}, ${lonLabel}`
}

export function getHoverLonLat(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): HoverLonLat | null {
	if (!hoverInfo || !world) return null
	const base = hoverInfo.region * 3
	const x = world.mesh.r_xyz[base]
	const y = world.mesh.r_xyz[base + 1]
	const z = world.mesh.r_xyz[base + 2]
	return {
		latDeg: Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI),
		lonDeg: Math.atan2(y, x) * (180 / Math.PI),
	}
}

export function getHoverTimezone(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): string | null {
	if (!hoverInfo || !world) return null
	// Reuse the colorer's band resolution so the hovered offset always matches
	// the stripe under the cursor: land follows its province/nation, water
	// follows the region's own longitude.
	return regionTimezoneLabel(world, hoverInfo.region)
}

export function getHoverTemperatureDelta(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): number | null {
	return hoverInfo && world?.climate
		? world.climate.temperature_max[hoverInfo.region] -
				world.climate.temperature_min[hoverInfo.region]
		: null
}

export function getHoverRainfall(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	rainfallMonth: number,
): number | null {
	const region = hoverInfo?.region
	const canShowRainfall =
		region !== undefined &&
		(!!world?.isLand?.[region] ||
			(world?.landmarks != null &&
				world.landmarks.regionLandmark[region] >= 0 &&
				world.landmarks.type[world.landmarks.regionLandmark[region]] ===
					LANDMARK_TYPE_LAKE))
	return hoverInfo && world?.rainfall && canShowRainfall
		? rainfallMonth === 0
			? world.rainfall.annual[region]
			: world.rainfall.monthly[
					(rainfallMonth - 1) * world.mesh.numRegions + region
				]
		: null
}

function getHoverRainfallSeriesFromArrays(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	rainfallMonth: number,
	annual: Float32Array | undefined,
	monthly: Float32Array | undefined,
): HoverRainfallSeries | null {
	const region = hoverInfo?.region
	const canShowRainfall =
		region !== undefined &&
		annual &&
		(!!world?.isLand?.[region] ||
			(world?.landmarks != null &&
				world.landmarks.regionLandmark[region] >= 0 &&
				world.landmarks.type[world.landmarks.regionLandmark[region]] ===
					LANDMARK_TYPE_LAKE))
	if (!(hoverInfo && world && canShowRainfall)) return null
	const r = hoverInfo.region
	const N = world.mesh.numRegions
	const monthlyValues: number[] = []
	if (monthly) {
		for (let m = 0; m < 12; m++)
			monthlyValues.push(monthly[m * N + r] ?? annual[r])
	}
	return {
		value:
			rainfallMonth === 0
				? annual[r]
				: (monthlyValues[rainfallMonth - 1] ?? annual[r]),
		annual: annual[r],
		monthly: monthlyValues,
	}
}

export function getHoverRealRainfall(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	rainfallMonth: number,
): HoverRainfallSeries | null {
	return getHoverRainfallSeriesFromArrays(
		hoverInfo,
		world,
		rainfallMonth,
		world?.rainfall?.real_annual,
		world?.rainfall?.real_monthly,
	)
}

export function getHoverRainfallDiff(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	rainfallMonth: number,
): HoverRainfallSeries | null {
	return getHoverRainfallSeriesFromArrays(
		hoverInfo,
		world,
		rainfallMonth,
		world?.rainfall?.diff_annual,
		world?.rainfall?.diff_monthly,
	)
}

export function getHoverDtr(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverDtr | null {
	return getHoverDtrSeries(
		hoverInfo,
		world,
		dtrMonth,
		world?.dtr_annual,
		world?.dtr_monthly,
	)
}

function getHoverDtrSeries(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
	annual: Float32Array | undefined,
	monthlySource: Float32Array | undefined,
): HoverDtr | null {
	if (!(hoverInfo && world && annual)) return null
	const r = hoverInfo.region
	const annualValue = annual[r]
	const monthly: number[] = []
	if (monthlySource) {
		const N = world.mesh.numRegions
		for (let m = 0; m < 12; m++) {
			monthly.push(monthlySource[m * N + r] ?? annualValue)
		}
	}
	return {
		value:
			dtrMonth === 0 ? annualValue : (monthly[dtrMonth - 1] ?? annualValue),
		annual: annualValue,
		monthly,
	}
}

export function getHoverRealDtr(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverDtr | null {
	return getHoverDtrSeries(
		hoverInfo,
		world,
		dtrMonth,
		world?.observedDtr?.real_annual,
		world?.observedDtr?.real_monthly,
	)
}

export function getHoverDtrDiff(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverDtr | null {
	return getHoverDtrSeries(
		hoverInfo,
		world,
		dtrMonth,
		world?.observedDtr?.diff_annual,
		world?.observedDtr?.diff_monthly,
	)
}

function getHoverMonthlySeries(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	month: number,
	annual: Float32Array | undefined,
	monthly: Float32Array | undefined,
): HoverTemperatureSeries | null {
	if (!(hoverInfo && world && annual)) return null
	const r = hoverInfo.region
	const annualValue = annual[r]
	const monthlyValues: number[] = []
	if (monthly) {
		const N = world.mesh.numRegions
		for (let m = 0; m < 12; m++)
			monthlyValues.push(monthly[m * N + r] ?? annualValue)
	}
	return {
		value:
			month === 0 ? annualValue : (monthlyValues[month - 1] ?? annualValue),
		annual: annualValue,
		monthly: monthlyValues,
	}
}

function getHoverModeledHumiditySeries(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverHumidity | null {
	if (!(hoverInfo && world?.climate && world.dtr_annual)) return null
	const r = hoverInfo.region
	if (world.isLand && !world.isLand[r]) return null
	const N = world.mesh.numRegions

	let annualAridity: number | undefined
	const aet = world.hydrology?.aet_monthly
	const pet = world.climate.pet_monthly
	if (aet && pet) {
		let aetSum = 0
		let petSum = 0
		for (let m = 0; m < 12; m++) {
			aetSum += aet[m * N + r]
			petSum += pet[m * N + r]
		}
		annualAridity = petSum > 0 ? aetSum / petSum : 1
	}

	const annualRainfall = world.rainfall?.annual[r]
	const distFromOceanKm = world.oceanDist[r]
	const annual = relativeHumidityFromTempRange(
		world.climate.temperature_avg[r],
		world.dtr_annual[r],
		annualAridity,
		annualRainfall,
		distFromOceanKm,
	)
	const monthly: number[] = []
	if (world.dtr_monthly && world.climate.temperature_monthly) {
		for (let m = 0; m < 12; m++) {
			monthly.push(
				relativeHumidityFromTempRange(
					world.climate.temperature_monthly[m * N + r],
					world.dtr_monthly[m * N + r] ?? world.dtr_annual[r],
					annualAridity,
					annualRainfall,
					distFromOceanKm,
				),
			)
		}
	}
	return {
		value: dtrMonth === 0 ? annual : (monthly[dtrMonth - 1] ?? annual),
		annual,
		monthly,
	}
}

function getHoverObservedHumiditySeries(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverHumidity | null {
	if (
		!(hoverInfo && world && world.observedHumidity?.real_annual) ||
		(world.isLand && !world.isLand[hoverInfo.region])
	) {
		return null
	}
	const r = hoverInfo.region
	const annualValue = world.observedHumidity.real_annual[r]
	const monthly: number[] = []
	const monthlySource = world.observedHumidity.real_monthly
	if (monthlySource) {
		const N = world.mesh.numRegions
		for (let m = 0; m < 12; m++)
			monthly.push(monthlySource[m * N + r] ?? annualValue)
	}
	return {
		value:
			dtrMonth === 0 ? annualValue : (monthly[dtrMonth - 1] ?? annualValue),
		annual: annualValue,
		monthly,
	}
}

export function getHoverRealTemperature(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	temperatureMonth: number,
): HoverTemperatureSeries | null {
	return getHoverMonthlySeries(
		hoverInfo,
		world,
		temperatureMonth,
		world?.climate?.real_temperature_avg,
		world?.climate?.real_temperature_monthly,
	)
}

export function getHoverTemperatureDiff(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	temperatureMonth: number,
): HoverTemperatureSeries | null {
	return getHoverMonthlySeries(
		hoverInfo,
		world,
		temperatureMonth,
		world?.climate?.temperature_diff_avg,
		world?.climate?.temperature_diff_monthly,
	)
}

export function getHoverHumidity(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverHumidity | null {
	return getHoverModeledHumiditySeries(hoverInfo, world, dtrMonth)
}

export function getHoverRealHumidity(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverHumidity | null {
	return getHoverObservedHumiditySeries(hoverInfo, world, dtrMonth)
}

export function getHoverHumidityDiff(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverHumidity | null {
	const modeled = getHoverModeledHumiditySeries(hoverInfo, world, dtrMonth)
	const observed = getHoverObservedHumiditySeries(hoverInfo, world, dtrMonth)
	if (!(modeled && observed)) return null
	const monthly = modeled.monthly.map(
		(value, index) => value - (observed.monthly[index] ?? observed.annual),
	)
	const annual = modeled.annual - observed.annual
	return {
		value: dtrMonth === 0 ? annual : (monthly[dtrMonth - 1] ?? annual),
		annual,
		monthly,
	}
}

export function getHoverMisery(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
	windSpeedMs: number | null,
	monthlyWindSpeedMs: number[] | null,
): HoverMisery | null {
	if (!(hoverInfo && world?.climate && world.dtr_annual)) return null
	const r = hoverInfo.region
	if (world.isLand && !world.isLand[r]) return null
	const N = world.mesh.numRegions
	const observedHumidity = getHoverObservedHumiditySeries(
		hoverInfo,
		world,
		dtrMonth,
	)

	let annualAridity: number | undefined
	const aet = world.hydrology?.aet_monthly
	const pet = world.climate.pet_monthly
	if (aet && pet) {
		let aetSum = 0
		let petSum = 0
		for (let m = 0; m < 12; m++) {
			aetSum += aet[m * N + r]
			petSum += pet[m * N + r]
		}
		annualAridity = petSum > 0 ? aetSum / petSum : 1
	}

	const annualRainfall = world.rainfall?.annual[r]
	const annualWind = windSpeedMs ?? 0
	const annualRh =
		observedHumidity?.annual ??
		relativeHumidityFromTempRange(
			world.climate.temperature_avg[r],
			world.dtr_annual[r],
			annualAridity,
			annualRainfall,
		)
	const annual = apparentTemperatureC(
		world.climate.temperature_avg[r],
		annualRh,
		annualWind,
	)

	const monthly: number[] = []
	if (world.dtr_monthly && world.climate.temperature_monthly) {
		for (let m = 0; m < 12; m++) {
			const T = world.climate.temperature_monthly[m * N + r]
			const dtr = world.dtr_monthly[m * N + r] ?? world.dtr_annual[r]
			const rh =
				observedHumidity?.monthly[m] ??
				relativeHumidityFromTempRange(T, dtr, annualAridity, annualRainfall)
			const wind = monthlyWindSpeedMs?.[m] ?? annualWind
			monthly.push(apparentTemperatureC(T, rh, wind))
		}
	}

	return {
		value: dtrMonth === 0 ? annual : (monthly[dtrMonth - 1] ?? annual),
		annual,
		monthly,
	}
}

export function getHoverClimateZone(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dataVariant: DataVariant,
): string | null {
	if (!hoverInfo || !world) return null
	const region = hoverInfo.region
	if (dataVariant === "observed" && world.isEarthImport) {
		const code = world.eu5Climate?.[region] ?? -1
		return code >= 0
			? formatObservedCategoryLabel(EU5_CLIMATE_CATEGORIES[code])
			: "unmapped"
	}
	return hoverInfo && world?.climateZones && world?.isLand?.[hoverInfo.region]
		? (CLIMATE_LABELS[world.climateZones[hoverInfo.region]] ?? null)
		: null
}

export function getHoverPastaClimate(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): { code: string | null; name: string } | null {
	return hoverInfo && world?.pastaClimate
		? {
				code: PASTA_LABELS[world.pastaClimate[hoverInfo.region]] ?? null,
				name: pastaClimateName(world.pastaClimate[hoverInfo.region]),
			}
		: null
}

export function getHoverKoppenClimate(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): { code: string | null; name: string } | null {
	return hoverInfo && world?.koppenClimate && world?.isLand?.[hoverInfo.region]
		? {
				code: KOPPEN_LABELS[world.koppenClimate[hoverInfo.region]] ?? null,
				name: koppenClimateName(world.koppenClimate[hoverInfo.region]),
			}
		: null
}

export function getHoverRealPastaClimate(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): { code: string | null; name: string } | null {
	return hoverInfo && world?.realPastaClimate
		? {
				code: PASTA_LABELS[world.realPastaClimate[hoverInfo.region]] ?? null,
				name: pastaClimateName(world.realPastaClimate[hoverInfo.region]),
			}
		: null
}

export function getHoverRealKoppenClimate(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): { code: string | null; name: string } | null {
	return hoverInfo &&
		world?.realKoppenClimate &&
		world?.isLand?.[hoverInfo.region]
		? {
				code: KOPPEN_LABELS[world.realKoppenClimate[hoverInfo.region]] ?? null,
				name: koppenClimateName(world.realKoppenClimate[hoverInfo.region]),
			}
		: null
}

export function getHoverBiome(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dataVariant: DataVariant,
): string | null {
	if (!hoverInfo || !world) return null
	const region = hoverInfo.region
	if (dataVariant === "observed" && world.isEarthImport) {
		const code = world.eu5Vegetation?.[region] ?? -1
		return code >= 0
			? formatObservedCategoryLabel(EU5_VEGETATION_CATEGORIES[code])
			: "unmapped"
	}
	return hoverInfo && world?.vegetation && world?.isLand?.[hoverInfo.region]
		? (BIOME_LABELS[world.vegetation[hoverInfo.region]] ?? null)
		: null
}

export function getHoverProvince(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): number | null {
	return hoverInfo && world?.provinces
		? world.provinces.regionProvince[hoverInfo.region]
		: null
}

export function getHoverLandmark(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): HoverLandmark | null {
	if (!(hoverInfo && world?.landmarks)) return null
	const landmarkId = world.landmarks.regionLandmark[hoverInfo.region]
	if (landmarkId < 0) return null
	return {
		id: landmarkId,
		type: LANDMARK_TYPES[world.landmarks.type[landmarkId]] ?? null,
		size: world.landmarks.size[landmarkId] ?? null,
	}
}

export function getHoverIsLand(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): boolean | null {
	return hoverInfo && world?.isLand ? !!world.isLand[hoverInfo.region] : null
}

export function getHoverOceanDist(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): number | null {
	return hoverInfo && world?.oceanDist
		? world.oceanDist[hoverInfo.region]
		: null
}

export function getHoverDistCoast(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): number | null {
	return hoverInfo && world?.distCoast && world.elevation[hoverInfo.region] <= 0
		? world.distCoast[hoverInfo.region]
		: null
}

export function getHoverHazards(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): HoverHazards | null {
	return hoverInfo && world?.hazards
		? {
				earthquake: world.hazards.earthquake[hoverInfo.region],
				volcano: world.hazards.volcano[hoverInfo.region],
				danger: world.hazards.danger[hoverInfo.region],
				cyclone: world.cycloneRisk?.[hoverInfo.region] ?? 0,
				tornado: world.tornadoRisk?.[hoverInfo.region] ?? 0,
				// Raw metres from the model; InfoPanel formats to m/ft
				tidal: world.tidalRange?.[hoverInfo.region] ?? 0,
			}
		: null
}

export function getHoverHotspot(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): HoverHotspot | null {
	return hoverInfo && world?.volcanism
		? {
				value: world.volcanism.hotspot[hoverInfo.region],
			}
		: null
}

export function getHoverRiver(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): HoverRiver | null {
	if (!(hoverInfo && world?.rivers?.visible && world.rivers.flow)) return null
	const r = hoverInfo.region
	if (!world.rivers.visible[r]) return null
	const N = world.mesh.numRegions
	const monthly: number[] = []
	if (world.rivers.flow_monthly) {
		for (let m = 0; m < 12; m++)
			monthly.push(world.rivers.flow_monthly[m * N + r])
	}
	return {
		flow: world.rivers.flow[r],
		flow_monthly: monthly,
		riverId: world.rivers.riverId?.[r] ?? -1,
		lengthKm: world.rivers.riverLengthKm?.[r] ?? 0,
	}
}

export function getHoverOceanCurrents(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): HoverOceanCurrents | null {
	if (!(hoverInfo && world?.oceanCurrents)) return null
	const r = hoverInfo.region
	const isLand = !!world.isLand?.[r]
	const warmth = isLand
		? world.oceanCurrents.coastalWarmth[r]
		: world.oceanCurrents.oceanWarmth[r]
	const delta = world.oceanCurrents.temperatureDelta?.[r] ?? 0
	const monthlyDelta: number[] = []
	const monthly = world.oceanCurrents.temperatureDeltaMonthly
	const N = world.mesh.numRegions
	if (monthly) {
		for (let m = 0; m < 12; m++) {
			monthlyDelta.push(monthly[m * N + r] ?? delta)
		}
	} else {
		for (let m = 0; m < 12; m++) monthlyDelta.push(delta)
	}
	const averageDelta =
		monthlyDelta.reduce((sum, value) => sum + value, 0) / monthlyDelta.length
	return {
		warmth,
		delta: averageDelta,
		averageDelta,
		mode: averageDelta >= 0 ? "warm" : "cold",
		monthlyDelta,
	}
}

export function getHoverTerrainFeature(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): HoverTerrainFeature | null {
	if (!(hoverInfo && world?.terrainFeatures)) return null
	const r = hoverInfo.region
	const mask = world.terrainFeatures.featureMask[r]
	if (!mask) return null
	const all: string[] = []
	for (let bit = 1; bit < GENESIS_TERRAIN_FEATURE_LABELS.length; bit++) {
		if (mask & (1 << (bit - 1))) all.push(GENESIS_TERRAIN_FEATURE_LABELS[bit])
	}
	return {
		dominant:
			GENESIS_TERRAIN_FEATURE_LABELS[
				world.terrainFeatures.dominantFeature[r]
			] ?? null,
		all,
	}
}

// computeCoastDistances (src/model/shared/stats.ts) returns distCoast
// already in real km (a Dijkstra shortest-path distance, not a hop count),
// so no further per-hop conversion is needed here — this used to multiply
// by an average edge length to convert a hop count into km, which is now
// stale and would double-convert an already-km value.
export function getHoverDistCoastKm(
	hoverDistCoast: number | null,
): number | null {
	return hoverDistCoast !== null
		? Number.isFinite(hoverDistCoast)
			? hoverDistCoast
			: Infinity
		: null
}

export function getHoverClimateDisplay(
	colorMode: ColorMode,
	hoverPastaClimate: { code: string | null; name: string } | null,
	hoverKoppenClimate: { code: string | null; name: string } | null,
	hoverClimateZone: string | null,
	hoverRealPastaClimate?: { code: string | null; name: string } | null,
	hoverRealKoppenClimate?: { code: string | null; name: string } | null,
): string | null {
	if (colorMode === "pastaClimate" && hoverPastaClimate) {
		return hoverPastaClimate.name.toLowerCase()
	}
	if (colorMode === "koppenClimate" && hoverKoppenClimate) {
		return `${hoverKoppenClimate.name}${hoverKoppenClimate.code ? ` (${hoverKoppenClimate.code})` : ""}`
	}
	if (colorMode === "realPastaClimate" && hoverRealPastaClimate) {
		return hoverRealPastaClimate.name.toLowerCase()
	}
	if (colorMode === "realKoppenClimate" && hoverRealKoppenClimate) {
		return `${hoverRealKoppenClimate.name}${hoverRealKoppenClimate.code ? ` (${hoverRealKoppenClimate.code})` : ""}`
	}
	return hoverClimateZone
}

/**
 * Returns the trade good name and its 1-based material index for the
 * location that contains the hovered region, or null if unavailable.
 */
export function getHoverTradeGood(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): { name: string; materialIndex: number } | null {
	if (!(hoverInfo && world?.tradeGoods && world?.locations)) return null
	const l = world.locations.regionLocation[hoverInfo.region]
	if (l == null || l < 0 || l >= world.tradeGoods.length) return null
	const idx = world.tradeGoods[l]
	if (!idx) return null
	const raw = TRADE_GOOD_LABELS[idx] ?? "unknown"
	const name = raw.replace(/^goods_/, "").replace(/_/g, " ")
	return { name, materialIndex: idx }
}
