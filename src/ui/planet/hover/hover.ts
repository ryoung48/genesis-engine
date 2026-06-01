import {
	OROGEN_TERRAIN_FEATURE_LABELS,
	OROGEN_TOPOGRAPHY_LABELS,
} from "@/model"
import { apparentTemperatureC } from "@/model/climate/apparent-temp"
import { relativeHumidityFromTempRange } from "@/model/climate/humidity"
import { KOPPEN_LABELS, koppenClimateName } from "@/model/climate/koppen"
import { PASTA_LABELS, pastaClimateName } from "@/model/climate/pasta"
import { BIOME_LABELS, CLIMATE_LABELS } from "@/model/climate/vegetation"
import { TRADE_GOOD_LABELS } from "@/model/economy/trade-goods"
import { meanEdgeLengthKm } from "@/model/shared/units"
import { regionTimezoneLabel } from "@/model/society/timezone"
import { LANDMARK_TYPES } from "@/model/terrain/landmarks"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import type { ColorMode } from "../colors"

export interface HoverInfo {
	region: number
	x: number
	y: number
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
	world: SerializedOrogenWorld | null,
): number | null {
	return hoverInfo && world ? (world.elevation_km[hoverInfo.region] ?? 0) : null
}

export function getHoverTopography(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): string | null {
	return hoverInfo && world?.topography
		? (OROGEN_TOPOGRAPHY_LABELS[world.topography[hoverInfo.region]] ?? null)
		: null
}

export function getHoverCoordinates(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): string | null {
	if (!hoverInfo || !world) return null
	const base = hoverInfo.region * 3
	const x = world.mesh.r_xyz[base]
	const y = world.mesh.r_xyz[base + 1]
	const z = world.mesh.r_xyz[base + 2]
	const lat = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
	const lon = Math.atan2(y, x) * (180 / Math.PI)
	const latLabel = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`
	const lonLabel = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`
	return `${latLabel}, ${lonLabel}`
}

export function getHoverTimezone(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): string | null {
	if (!hoverInfo || !world) return null
	// Reuse the colorer's band resolution so the hovered offset always matches
	// the stripe under the cursor: land follows its province/nation, water
	// follows the region's own longitude.
	return regionTimezoneLabel(world, hoverInfo.region)
}

export function getHoverTemperatureDelta(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): number | null {
	return hoverInfo && world?.climate
		? world.climate.temperature_max[hoverInfo.region] -
				world.climate.temperature_min[hoverInfo.region]
		: null
}

export function getHoverRainfall(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
	rainfallMonth: number,
): number | null {
	return hoverInfo && world?.rainfall && world.elevation[hoverInfo.region] > 0
		? rainfallMonth === 0
			? world.rainfall.annual[hoverInfo.region]
			: world.rainfall.monthly[
					(rainfallMonth - 1) * world.mesh.numRegions + hoverInfo.region
				]
		: null
}

export function getHoverDtr(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
	dtrMonth: number,
): HoverDtr | null {
	if (!(hoverInfo && world?.dtr_annual)) return null
	const r = hoverInfo.region
	const annual = world.dtr_annual[r]
	const monthly: number[] = []
	if (world.dtr_monthly) {
		const N = world.mesh.numRegions
		for (let m = 0; m < 12; m++) {
			monthly.push(world.dtr_monthly[m * N + r] ?? annual)
		}
	}
	return {
		value: dtrMonth === 0 ? annual : (monthly[dtrMonth - 1] ?? annual),
		annual,
		monthly,
	}
}

export function getHoverHumidity(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
	dtrMonth: number,
): HoverHumidity | null {
	if (!(hoverInfo && world?.climate && world.dtr_annual)) return null
	const r = hoverInfo.region
	if (world.isLand && !world.isLand[r]) return null
	const N = world.mesh.numRegions

	// Annual aridity ratio for the FAO-56 dewpoint correction.
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
	const annual = relativeHumidityFromTempRange(
		world.climate.temperature_avg[r],
		world.dtr_annual[r],
		annualAridity,
		annualRainfall,
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

export function getHoverMisery(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
	dtrMonth: number,
	windSpeedMs: number | null,
	monthlyWindSpeedMs: number[] | null,
): HoverMisery | null {
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
	const annualWind = windSpeedMs ?? 0
	const annualRh = relativeHumidityFromTempRange(
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
			const rh = relativeHumidityFromTempRange(T, dtr, annualAridity, annualRainfall)
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
	world: SerializedOrogenWorld | null,
): string | null {
	return hoverInfo && world?.climateZones && world?.isLand?.[hoverInfo.region]
		? (CLIMATE_LABELS[world.climateZones[hoverInfo.region]] ?? null)
		: null
}

export function getHoverPastaClimate(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
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
	world: SerializedOrogenWorld | null,
): { code: string | null; name: string } | null {
	return hoverInfo && world?.koppenClimate && world?.isLand?.[hoverInfo.region]
		? {
				code: KOPPEN_LABELS[world.koppenClimate[hoverInfo.region]] ?? null,
				name: koppenClimateName(world.koppenClimate[hoverInfo.region]),
			}
		: null
}

export function getHoverBiome(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): string | null {
	return hoverInfo && world?.vegetation && world?.isLand?.[hoverInfo.region]
		? (BIOME_LABELS[world.vegetation[hoverInfo.region]] ?? null)
		: null
}

export function getHoverProvince(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): number | null {
	return hoverInfo && world?.provinces
		? world.provinces.regionProvince[hoverInfo.region]
		: null
}

export function getHoverLandmark(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
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
	world: SerializedOrogenWorld | null,
): boolean | null {
	return hoverInfo && world?.isLand ? !!world.isLand[hoverInfo.region] : null
}

export function getHoverOceanDist(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): number | null {
	return hoverInfo && world?.oceanDist
		? world.oceanDist[hoverInfo.region]
		: null
}

export function getHoverDistCoast(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): number | null {
	return hoverInfo && world?.distCoast && world.elevation[hoverInfo.region] <= 0
		? world.distCoast[hoverInfo.region]
		: null
}

export function getHoverHazards(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
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
	world: SerializedOrogenWorld | null,
): HoverHotspot | null {
	return hoverInfo && world?.volcanism
		? {
				value: world.volcanism.hotspot[hoverInfo.region],
			}
		: null
}

export function getHoverRiver(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
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
	world: SerializedOrogenWorld | null,
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
	world: SerializedOrogenWorld | null,
): HoverTerrainFeature | null {
	if (!(hoverInfo && world?.terrainFeatures)) return null
	const r = hoverInfo.region
	const mask = world.terrainFeatures.featureMask[r]
	if (!mask) return null
	const all: string[] = []
	for (let bit = 1; bit < OROGEN_TERRAIN_FEATURE_LABELS.length; bit++) {
		if (mask & (1 << (bit - 1))) all.push(OROGEN_TERRAIN_FEATURE_LABELS[bit])
	}
	return {
		dominant:
			OROGEN_TERRAIN_FEATURE_LABELS[world.terrainFeatures.dominantFeature[r]] ??
			null,
		all,
	}
}

export function getCoastHopLengthKm(
	world: SerializedOrogenWorld | null,
): number | null {
	if (!world) return null
	return meanEdgeLengthKm(world.mesh, world.params.planetRadiusKm)
}

export function getHoverDistCoastKm(
	hoverDistCoast: number | null,
	coastHopLengthKm: number | null,
): number | null {
	return hoverDistCoast !== null && coastHopLengthKm !== null
		? Number.isFinite(hoverDistCoast)
			? hoverDistCoast * coastHopLengthKm
			: Infinity
		: null
}

export function getHoverClimateDisplay(
	colorMode: ColorMode,
	hoverPastaClimate: { code: string | null; name: string } | null,
	hoverKoppenClimate: { code: string | null; name: string } | null,
	hoverClimateZone: string | null,
): string | null {
	if (colorMode === "pastaClimate" && hoverPastaClimate) {
		return hoverPastaClimate.name.toLowerCase()
	}
	if (colorMode === "koppenClimate" && hoverKoppenClimate) {
		return `${hoverKoppenClimate.name}${hoverKoppenClimate.code ? ` (${hoverKoppenClimate.code})` : ""}`
	}
	return hoverClimateZone
}

/**
 * Returns the trade good name and its 1-based material index for the
 * location that contains the hovered region, or null if unavailable.
 */
export function getHoverTradeGood(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
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
