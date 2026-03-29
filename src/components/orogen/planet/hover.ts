import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import type { ColorMode } from "../colors"
import { OROGEN_TOPOGRAPHY_LABELS } from "@/model/orogen/types"
import { BIOME_LABELS, CLIMATE_LABELS } from "@/model/orogen/climate/vegetation"
import { PASTA_LABELS, pastaClimateName } from "@/model/orogen/climate/pasta"
import { KOPPEN_LABELS, koppenClimateName } from "@/model/orogen/climate/koppen"
import { LANDMARK_TYPES } from "@/model/orogen/provinces/landmarks"
import { meanEdgeLengthKm } from "@/model/orogen/units"

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

export interface HoverWind {
	east: number
	north: number
	speed: number
}

export function getHoverElevationKm(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): number | null {
	return hoverInfo && world
		? world.elevation_km[hoverInfo.region] ?? 0
		: null
}

export function getHoverTopography(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): string | null {
	return hoverInfo && world?.topography
		? OROGEN_TOPOGRAPHY_LABELS[world.topography[hoverInfo.region]] ?? null
		: null
}

export function getHoverCoordinates(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): string | null {
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

export function getHoverTemperature(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null, temperatureMonth: number): number | null {
	return hoverInfo && world?.climate
		? (temperatureMonth === 0
			? world.climate.temperature_avg[hoverInfo.region]
			: world.climate.temperature_monthly[(temperatureMonth - 1) * world.mesh.numRegions + hoverInfo.region])
		: null
}

export function getHoverBiotemperature(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): number | null {
	return hoverInfo && world?.climate
		? Math.max(0, world.climate.temperature_avg[hoverInfo.region])
		: null
}

export function getHoverTemperatureDelta(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): number | null {
	return hoverInfo && world?.climate
		? world.climate.temperature_max[hoverInfo.region] - world.climate.temperature_min[hoverInfo.region]
		: null
}

export function getHoverRainfall(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null, rainfallMonth: number): number | null {
	return hoverInfo && world?.rainfall && world.elevation[hoverInfo.region] > 0
		? (rainfallMonth === 0
			? world.rainfall.annual[hoverInfo.region]
			: world.rainfall.monthly[(rainfallMonth - 1) * world.mesh.numRegions + hoverInfo.region])
		: null
}

export function getHoverClimateZone(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): string | null {
	return hoverInfo && world?.climateZones && world?.isLand?.[hoverInfo.region]
		? CLIMATE_LABELS[world.climateZones[hoverInfo.region]] ?? null
		: null
}

export function getHoverPastaClimate(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): { code: string | null; name: string } | null {
	return hoverInfo && world?.pastaClimate
		? {
			code: PASTA_LABELS[world.pastaClimate[hoverInfo.region]] ?? null,
			name: pastaClimateName(world.pastaClimate[hoverInfo.region]),
		}
		: null
}

export function getHoverIceDebug(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null, colorMode: ColorMode): string | null {
	if (!(hoverInfo && world?.climate && (colorMode === "pastaClimate" || colorMode === "satellite"))) return null
	const r = hoverInfo.region
	const N = world.mesh.numRegions
	const isOcean = !world.isLand?.[r]
	let warmest = -Infinity, coldest = Infinity, annualPrecip = 0
	for (let m = 0; m < 12; m++) {
		const t = world.climate.temperature_monthly[m * N + r]
		if (t > warmest) warmest = t
		if (t < coldest) coldest = t
		if (world.rainfall && world.isLand?.[r]) annualPrecip += world.rainfall.monthly[m * N + r]
	}
	if (isOcean) {
		const iceMin = world.iceMinMonthly?.[r] ?? 0
		const iceMax = world.iceMaxMonthly?.[r] ?? 0
		return `ice min ${(iceMin / 1000).toFixed(2)}m max ${(iceMax / 1000).toFixed(2)}m · ${coldest.toFixed(1)}–${warmest.toFixed(1)}°C`
	}
	const iceVal = world.iceThickness?.[r] ?? 0
	const iceLabel = iceVal > 0 ? ` · ice ${(iceVal / 1000).toFixed(2)}m` : ""
	return `${warmest.toFixed(1)}°C warm · ${coldest.toFixed(1)}°C cold · ${annualPrecip.toFixed(0)}mm/yr${iceLabel}`
}

export function getHoverKoppenClimate(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): { code: string | null; name: string } | null {
	return hoverInfo && world?.koppenClimate && world?.isLand?.[hoverInfo.region]
		? {
			code: KOPPEN_LABELS[world.koppenClimate[hoverInfo.region]] ?? null,
			name: koppenClimateName(world.koppenClimate[hoverInfo.region]),
		}
		: null
}

export function getHoverBiome(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): string | null {
	return hoverInfo && world?.vegetation && world?.isLand?.[hoverInfo.region]
		? BIOME_LABELS[world.vegetation[hoverInfo.region]] ?? null
		: null
}

export function getHoverProvince(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): number | null {
	return hoverInfo && world?.provinces
		? world.provinces.regionProvince[hoverInfo.region]
		: null
}

export function getHoverLandmark(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): HoverLandmark | null {
	if (!(hoverInfo && world?.landmarks)) return null
	const landmarkId = world.landmarks.regionLandmark[hoverInfo.region]
	if (landmarkId < 0) return null
	return {
		id: landmarkId,
		type: LANDMARK_TYPES[world.landmarks.type[landmarkId]] ?? null,
		size: world.landmarks.size[landmarkId] ?? null,
	}
}

export function getHoverIsLand(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): boolean | null {
	return hoverInfo && world?.isLand
		? world.isLand[hoverInfo.region]
		: null
}

export function getHoverOceanDist(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): number | null {
	return hoverInfo && world?.oceanDist
		? world.oceanDist[hoverInfo.region]
		: null
}

export function getHoverDistCoast(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null): number | null {
	return hoverInfo && world?.distCoast && world.elevation[hoverInfo.region] <= 0
		? world.distCoast[hoverInfo.region]
		: null
}

export function getHoverWind(hoverInfo: HoverInfo | null, world: SerializedOrogenWorld | null, windMonth: number): HoverWind | null {
	if (!(hoverInfo && world?.wind)) return null
	const r = hoverInfo.region
	const N = world.mesh.numRegions
	const m = windMonth === 0 ? -1 : windMonth - 1
	if (m < 0) {
		let eSum = 0, nSum = 0, sSum = 0
		for (let i = 0; i < 12; i++) {
			eSum += world.wind.wind_east_monthly[i * N + r]
			nSum += world.wind.wind_north_monthly[i * N + r]
			sSum += world.wind.wind_speed_monthly[i * N + r]
		}
		return { east: eSum / 12, north: nSum / 12, speed: sSum / 12 }
	}
	return {
		east: world.wind.wind_east_monthly[m * N + r],
		north: world.wind.wind_north_monthly[m * N + r],
		speed: world.wind.wind_speed_monthly[m * N + r],
	}
}

export function getCoastHopLengthKm(world: SerializedOrogenWorld | null): number | null {
	if (!world) return null
	return meanEdgeLengthKm(world.mesh, world.params.planetRadiusKm)
}

export function getHoverDistCoastKm(hoverDistCoast: number | null, coastHopLengthKm: number | null): number | null {
	return hoverDistCoast !== null && coastHopLengthKm !== null
		? (Number.isFinite(hoverDistCoast) ? hoverDistCoast * coastHopLengthKm : Infinity)
		: null
}

export function getHoverClimateDisplay(
	colorMode: ColorMode,
	hoverPastaClimate: { code: string | null; name: string } | null,
	hoverKoppenClimate: { code: string | null; name: string } | null,
	hoverClimateZone: string | null,
): string | null {
	if ((colorMode === "pastaClimate" || colorMode === "satellite") && hoverPastaClimate) {
		return `${hoverPastaClimate.name}${hoverPastaClimate.code ? ` (${hoverPastaClimate.code})` : ""}`
	}
	if ((colorMode === "koppenClimate" || colorMode === "satelliteKoppen") && hoverKoppenClimate) {
		return `${hoverKoppenClimate.name}${hoverKoppenClimate.code ? ` (${hoverKoppenClimate.code})` : ""}`
	}
	if (hoverClimateZone) {
		return hoverClimateZone
	}
	return null
}
