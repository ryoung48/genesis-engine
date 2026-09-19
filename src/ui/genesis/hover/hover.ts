import { KOPPEN } from "@/model/climate/classification/koppen"
import { PASTA } from "@/model/climate/classification/pasta"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { OCEAN_CURRENTS } from "@/model/climate/ocean/currents"
import { HEURISTIC_CURRENTS } from "@/model/climate/ocean/currents/heuristic"
import { CLOUD_COVER } from "@/model/climate/precipitation/cloud-cover"
import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import { APPARENT_TEMP } from "@/model/climate/temperature/apparent-temp"
import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { TRADE_GOODS_TABLE } from "@/model/society/infrastructure/trade/trade-goods-table"
import { TIMEZONE } from "@/model/society/timezone"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type {
	GetHoverClimateDisplayParams,
	GetHoverDtrSeriesParams,
	GetHoverMiseryParams,
	GetHoverModeledCloudCoverParams,
	GetHoverMonthlySeriesParams,
	GetHoverRainfallSeriesFromArraysParams,
} from "@/ui/genesis/hover/types"
import type { ColorMode } from "@/ui/genesis/shared/colors"

const GENESIS_TOPOGRAPHY_LABELS = CLASSIFICATION.genesisTopographyLabels

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

export interface HoverTerrainFeature {
	dominant: string | null
	all: string[]
}

export interface HoverOceanCurrents {
	/** Modeled SST anomaly, -1..+1 (display-only; not applied to climate). */
	sst: number
	mode: "warm" | "cold"
	monthlySst: number[]
	sstAnomalyMonthly: number[] | null
	sstAnomalyAverage: number | null
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
): string | null {
	if (!hoverInfo || !world) return null
	return hoverInfo && world?.topography
		? (GENESIS_TOPOGRAPHY_LABELS[world.topography[hoverInfo.region]] ?? null)
		: null
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
	return TIMEZONE.regionTimezoneLabel({ world, region: hoverInfo.region })
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
					LANDMARKS.landmarkTypeLake))
	return hoverInfo && world?.rainfall && canShowRainfall
		? rainfallMonth === 0
			? world.rainfall.annual[region]
			: world.rainfall.monthly[
					(rainfallMonth - 1) * world.mesh.numRegions + region
				]
		: null
}

function getHoverRainfallSeriesFromArrays({
	hoverInfo,
	world,
	rainfallMonth,
	annual,
	monthly,
}: GetHoverRainfallSeriesFromArraysParams): HoverRainfallSeries | null {
	const region = hoverInfo?.region
	const canShowRainfall =
		region !== undefined &&
		annual &&
		(!!world?.isLand?.[region] ||
			(world?.landmarks != null &&
				world.landmarks.regionLandmark[region] >= 0 &&
				world.landmarks.type[world.landmarks.regionLandmark[region]] ===
					LANDMARKS.landmarkTypeLake))
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
	return getHoverRainfallSeriesFromArrays({
		hoverInfo,
		world,
		rainfallMonth,
		annual: world?.rainfall?.real_annual,
		monthly: world?.rainfall?.real_monthly,
	})
}

export function getHoverRealCloudCover(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	rainfallMonth: number,
): HoverRainfallSeries | null {
	return getHoverMonthlySeries({
		hoverInfo,
		world,
		month: rainfallMonth,
		annual: world?.observedCloudCover?.real_annual,
		monthly: world?.observedCloudCover?.real_monthly,
	})
}

export function getHoverModeledCloudCover({
	hoverInfo,
	world,
	rainfallMonth,
}: GetHoverModeledCloudCoverParams): HoverRainfallSeries | null {
	if (!(hoverInfo && world?.isLand?.[hoverInfo.region])) return null
	const r = hoverInfo.region
	const N = world.mesh.numRegions

	// Prefer the cached estimate (climate.real_cloud_cover_monthly mirrors
	// this function's own observed-preferred-else-modeled fallback order;
	// climate.cloud_cover_monthly is the pure-modeled fallback for a
	// procedural world with no observed data at all) over recomputing
	// CLOUD_COVER.estimate here -- see real-earth-data's
	// attachCachedCloudCoverEstimate and the cloud-cover temperature
	// modifier, which populate these once during generation.
	const cached =
		world.climate?.real_cloud_cover_monthly ??
		world.climate?.cloud_cover_monthly
	let monthly: number[]
	if (cached) {
		monthly = []
		for (let m = 0; m < 12; m++) monthly.push(cached[m * N + r])
	} else {
		const aetMonthly =
			world?.observedHydrology?.aet_monthly ?? world?.hydrology?.aet_monthly
		const petMonthly =
			world?.observedHydrology?.pet_monthly ?? world?.climate?.pet_monthly
		const rainfallMonthly =
			world?.rainfall?.real_monthly ?? world?.rainfall?.monthly
		const dtrMonthly = world?.observedDtr?.real_monthly ?? world?.dtr_monthly
		const temperatureMonthly =
			world?.climate?.real_temperature_monthly ??
			world?.climate?.temperature_monthly
		if (
			!(
				aetMonthly &&
				petMonthly &&
				rainfallMonthly &&
				dtrMonthly &&
				temperatureMonthly
			)
		)
			return null
		monthly = []
		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			monthly.push(
				CLOUD_COVER.estimate({
					aetMm: aetMonthly[idx],
					petMm: petMonthly[idx],
					rainfallMm: rainfallMonthly[idx],
					dtrC: dtrMonthly[idx],
					temperatureC: temperatureMonthly[idx],
					oceanDistanceKm: world.oceanDist[r],
				}),
			)
		}
	}
	const annual = monthly.reduce((sum, value) => sum + value, 0) / monthly.length
	return {
		value:
			rainfallMonth === 0 ? annual : (monthly[rainfallMonth - 1] ?? annual),
		annual,
		monthly,
	}
}

export function getHoverRainfallDiff(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	rainfallMonth: number,
): HoverRainfallSeries | null {
	return getHoverRainfallSeriesFromArrays({
		hoverInfo,
		world,
		rainfallMonth,
		annual: world?.rainfall?.diff_annual,
		monthly: world?.rainfall?.diff_monthly,
	})
}

export function getHoverDtr(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverDtr | null {
	return getHoverDtrSeries({
		hoverInfo,
		world,
		dtrMonth,
		annual: world?.dtr_annual,
		monthlySource: world?.dtr_monthly,
	})
}

function getHoverDtrSeries({
	hoverInfo,
	world,
	dtrMonth,
	annual,
	monthlySource,
}: GetHoverDtrSeriesParams): HoverDtr | null {
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
	return getHoverDtrSeries({
		hoverInfo,
		world,
		dtrMonth,
		annual: world?.observedDtr?.real_annual,
		monthlySource: world?.observedDtr?.real_monthly,
	})
}

export function getHoverDtrDiff(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	dtrMonth: number,
): HoverDtr | null {
	return getHoverDtrSeries({
		hoverInfo,
		world,
		dtrMonth,
		annual: world?.observedDtr?.diff_annual,
		monthlySource: world?.observedDtr?.diff_monthly,
	})
}

function getHoverMonthlySeries({
	hoverInfo,
	world,
	month,
	annual,
	monthly,
}: GetHoverMonthlySeriesParams): HoverTemperatureSeries | null {
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
	const annual = HUMIDITY.relativeHumidityFromTempRange({
		meanTempC: world.climate.temperature_avg[r],
		dtrC: world.dtr_annual[r],
		annualAridity,
		annualRainfallMm: annualRainfall,
		distFromOceanKm,
	})
	const monthly: number[] = []
	if (world.dtr_monthly && world.climate.temperature_monthly) {
		for (let m = 0; m < 12; m++) {
			monthly.push(
				HUMIDITY.relativeHumidityFromTempRange({
					meanTempC: world.climate.temperature_monthly[m * N + r],
					dtrC: world.dtr_monthly[m * N + r] ?? world.dtr_annual[r],
					annualAridity,
					annualRainfallMm: annualRainfall,
					distFromOceanKm,
				}),
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
	return getHoverMonthlySeries({
		hoverInfo,
		world,
		month: temperatureMonth,
		annual: world?.climate?.real_temperature_avg,
		monthly: world?.climate?.real_temperature_monthly,
	})
}

export function getHoverTemperatureDiff(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	temperatureMonth: number,
): HoverTemperatureSeries | null {
	return getHoverMonthlySeries({
		hoverInfo,
		world,
		month: temperatureMonth,
		annual: world?.climate?.temperature_diff_avg,
		monthly: world?.climate?.temperature_diff_monthly,
	})
}

function getHoverObservedAnnualWindSpeed(
	world: SerializedGenesisWorld,
	region: number,
): number | undefined {
	const monthlySource = world.observedWind?.real_speed_monthly
	if (!monthlySource) return undefined
	const N = world.mesh.numRegions
	let sum = 0
	for (let m = 0; m < 12; m++) sum += monthlySource[m * N + region]
	return sum / 12
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

/** `useObserved` selects the data source for temperature, humidity, and wind
 * together (the "misery"/"realMisery" colorMode pair, mirroring
 * temperature/realTemperature) -- observed values are used where available
 * and fall back to the modeled estimate only when missing, model mode never
 * touches observed data at all. */
export function getHoverMisery({
	hoverInfo,
	world,
	dtrMonth,
	windSpeedMs,
	monthlyWindSpeedMs,
	useObserved,
}: GetHoverMiseryParams): HoverMisery | null {
	if (!(hoverInfo && world?.climate && world.dtr_annual)) return null
	const r = hoverInfo.region
	if (world.isLand && !world.isLand[r]) return null
	const N = world.mesh.numRegions
	const observedHumidity = useObserved
		? getHoverObservedHumiditySeries(hoverInfo, world, dtrMonth)
		: null

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
	const modeledAnnualWind = windSpeedMs ?? 0
	const observedAnnualWind = useObserved
		? getHoverObservedAnnualWindSpeed(world, r)
		: undefined
	const annualWind = observedAnnualWind ?? modeledAnnualWind
	const modeledAnnualT = world.climate.temperature_avg[r]
	const observedAnnualT = world.climate.real_temperature_avg?.[r]
	const annualT =
		useObserved && Number.isFinite(observedAnnualT)
			? (observedAnnualT as number)
			: modeledAnnualT
	const annualRh =
		observedHumidity?.annual ??
		HUMIDITY.relativeHumidityFromTempRange({
			meanTempC: annualT,
			dtrC: world.dtr_annual[r],
			annualAridity,
			annualRainfallMm: annualRainfall,
		})
	const annual = APPARENT_TEMP.apparentTemperatureC({
		tempC: annualT,
		rhPercent: annualRh,
		windSpeedMs: annualWind,
	})

	const monthly: number[] = []
	if (world.dtr_monthly && world.climate.temperature_monthly) {
		for (let m = 0; m < 12; m++) {
			const modeledT = world.climate.temperature_monthly[m * N + r]
			const observedT = world.climate.real_temperature_monthly?.[m * N + r]
			const T =
				useObserved && Number.isFinite(observedT)
					? (observedT as number)
					: modeledT
			const dtr = world.dtr_monthly[m * N + r] ?? world.dtr_annual[r]
			const rh =
				observedHumidity?.monthly[m] ??
				HUMIDITY.relativeHumidityFromTempRange({
					meanTempC: T,
					dtrC: dtr,
					annualAridity,
					annualRainfallMm: annualRainfall,
				})
			const observedWindMonthly = useObserved
				? world.observedWind?.real_speed_monthly?.[m * N + r]
				: undefined
			const wind = observedWindMonthly ?? monthlyWindSpeedMs?.[m] ?? annualWind
			monthly.push(
				APPARENT_TEMP.apparentTemperatureC({
					tempC: T,
					rhPercent: rh,
					windSpeedMs: wind,
				}),
			)
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
	colorMode: ColorMode,
): string | null {
	if (!hoverInfo || !world) return null
	const region = hoverInfo.region
	const climateZones =
		colorMode === "realClimate" ? world.realClimateZones : world.climateZones
	return climateZones && world.isLand?.[region]
		? (VEGETATION.climateLabels[climateZones[region]] ?? null)
		: null
}

export function getHoverPastaClimate(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): { code: string | null; name: string } | null {
	return hoverInfo && world?.pastaClimate
		? {
				code: PASTA.pastaLabels[world.pastaClimate[hoverInfo.region]] ?? null,
				name: PASTA.pastaClimateName(world.pastaClimate[hoverInfo.region]),
			}
		: null
}

export function getHoverKoppenClimate(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): { code: string | null; name: string } | null {
	return hoverInfo && world?.koppenClimate && world?.isLand?.[hoverInfo.region]
		? {
				code:
					KOPPEN.koppenLabels[world.koppenClimate[hoverInfo.region]] ?? null,
				name: KOPPEN.koppenClimateName(world.koppenClimate[hoverInfo.region]),
			}
		: null
}

export function getHoverRealPastaClimate(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): { code: string | null; name: string } | null {
	return hoverInfo && world?.realPastaClimate
		? {
				code:
					PASTA.pastaLabels[world.realPastaClimate[hoverInfo.region]] ?? null,
				name: PASTA.pastaClimateName(world.realPastaClimate[hoverInfo.region]),
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
				code:
					KOPPEN.koppenLabels[world.realKoppenClimate[hoverInfo.region]] ??
					null,
				name: KOPPEN.koppenClimateName(
					world.realKoppenClimate[hoverInfo.region],
				),
			}
		: null
}

export function getHoverBiome(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
	colorMode: ColorMode,
): string | null {
	if (!hoverInfo || !world) return null
	const region = hoverInfo.region
	const vegetation =
		colorMode === "realVegetation" || colorMode === "realVegetationMaps"
			? world.realVegetation
			: world.vegetation
	return vegetation && world.isLand?.[region]
		? (VEGETATION.biomeLabels[vegetation[region]] ?? null)
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
		type: LANDMARKS.landmarkTypes[world.landmarks.type[landmarkId]] ?? null,
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

export function getHoverTerrainFeature(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): HoverTerrainFeature | null {
	if (!(hoverInfo && world?.terrainFeatures)) return null
	const r = hoverInfo.region
	const mask = world.terrainFeatures.featureMask[r]
	if (!mask) return null
	const all: string[] = []
	for (
		let bit = 1;
		bit < TERRAIN_FEATURES.genesisTerrainFeatureLabels.length;
		bit++
	) {
		if (mask & (1 << (bit - 1)))
			all.push(TERRAIN_FEATURES.genesisTerrainFeatureLabels[bit])
	}
	return {
		dominant:
			TERRAIN_FEATURES.genesisTerrainFeatureLabels[
				world.terrainFeatures.dominantFeature[r]
			] ?? null,
		all,
	}
}

export function getHoverOceanCurrents(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
): HoverOceanCurrents | null {
	if (!(hoverInfo && world?.oceanCurrents)) return null
	const r = hoverInfo.region
	const N = world.mesh.numRegions
	// Stored sst is normalized -1..+1 for the color scale; scale back up to an
	// approximate °C anomaly so it reads on the same units/verbiage as the
	// observed SST anomaly below.
	const saturationC =
		world.params.tideLock?.type === "solar"
			? OCEAN_CURRENTS.sstAnomalySaturationC
			: HEURISTIC_CURRENTS.sstAnomalySaturationC
	const monthlySst: number[] = []
	for (let m = 0; m < 12; m++) {
		monthlySst.push(world.oceanCurrents.sstMonthly[m * N + r] * saturationC)
	}
	const sst = world.oceanCurrents.sst[r] * saturationC

	const sstAnomalyRaster = world.observedCurrent?.real_sst_anomaly_monthly
	let sstAnomalyMonthly: number[] | null = null
	let sstAnomalyAverage: number | null = null
	if (sstAnomalyRaster && !world.isLand?.[r]) {
		const values: number[] = []
		for (let m = 0; m < 12; m++) values.push(sstAnomalyRaster[m * N + r])
		if (values.every((value) => Number.isFinite(value))) {
			sstAnomalyMonthly = values
			sstAnomalyAverage =
				values.reduce((sum, value) => sum + value, 0) / values.length
		}
	}

	return {
		sst,
		mode: sst >= 0 ? "warm" : "cold",
		monthlySst,
		sstAnomalyMonthly,
		sstAnomalyAverage,
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

export function getHoverClimateDisplay({
	colorMode,
	hoverPastaClimate,
	hoverKoppenClimate,
	hoverClimateZone,
	hoverRealPastaClimate,
	hoverRealKoppenClimate,
}: GetHoverClimateDisplayParams): string | null {
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
	const raw = TRADE_GOODS_TABLE.tradeGoodLabels[idx] ?? "unknown"
	const name = raw.replace(/^goods_/, "").replace(/_/g, " ")
	return { name, materialIndex: idx }
}
