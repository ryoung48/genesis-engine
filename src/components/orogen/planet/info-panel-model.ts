import {
	koppenClimateColor,
	koppenTrueColor,
} from "@/model/orogen/climate/koppen"
import { pastaClimateColor, pastaTrueColor } from "@/model/orogen/climate/pasta"
import { OROGEN_TERRAIN_FEATURE_LABELS } from "@/model/orogen/types"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import type { ColorMode } from "../colors"
import { climateTempColor, climateZoneColor, vegetationColor } from "../colors"
import type { HoverInfo, HoverTerrainFeature, HoverWind } from "./hover"
import { getTerrainFeatureColor, getTopographyColor } from "./region-colors"
import { rgbToCss } from "./ui-format"

export interface HoverChartData {
	temps: number[]
	precip: number[]
	daylight: number[]
	pet: number[]
	aet: number[]
	isLand: number | undefined
	iceThickness: number
	iceMin: number
	iceMax: number
}

export interface HoverWindData {
	speeds: number[]
	annualSpeed: number
}

export interface HoverPastaMonthlyData {
	gdd: number[]
	gint: number[]
}

export interface HoverProvinceDisplayData {
	provinceColor: string | null
	provinceNation: {
		id: number
		color: string | null
	} | null
	regionDisplayColor: string | null
}

export function buildHoverChartData(
	hoverInfo: HoverInfo | null,
	hoverElevationKm: number | null,
	world: SerializedOrogenWorld | null,
): HoverChartData | null {
	if (!hoverInfo || hoverElevationKm === null || !world) return null
	const region = hoverInfo.region
	const regionCount = world.mesh.numRegions
	const temps: number[] = []
	const precip: number[] = []
	const daylight: number[] = []
	const pet: number[] = []
	const aet: number[] = []
	for (let month = 0; month < 12; month++) {
		temps.push(
			world.climate
				? world.climate.temperature_monthly[month * regionCount + region]
				: 0,
		)
		precip.push(
			world.rainfall ? world.rainfall.monthly[month * regionCount + region] : 0,
		)
		daylight.push(
			world.climate?.daylight_hours_monthly
				? world.climate.daylight_hours_monthly[month * regionCount + region]
				: 0,
		)
		pet.push(
			world.climate?.pet_monthly
				? world.climate.pet_monthly[month * regionCount + region]
				: 0,
		)
		aet.push(
			world.hydrology?.aet_monthly
				? world.hydrology.aet_monthly[month * regionCount + region]
				: 0,
		)
	}
	return {
		temps,
		precip,
		daylight,
		pet,
		aet,
		isLand: world.isLand?.[region],
		iceThickness: world.iceThickness?.[region] ?? 0,
		iceMin: world.iceMinMonthly?.[region] ?? 0,
		iceMax: world.iceMaxMonthly?.[region] ?? 0,
	}
}

export function buildHoverWindData(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): HoverWindData | null {
	if (!hoverInfo || !world?.wind) return null
	const region = hoverInfo.region
	const regionCount = world.mesh.numRegions
	const speeds: number[] = []
	for (let month = 0; month < 12; month++) {
		speeds.push(world.wind.wind_speed_monthly[month * regionCount + region])
	}
	return {
		speeds,
		annualSpeed: speeds.reduce((sum, value) => sum + value, 0) / speeds.length,
	}
}

export function buildPastaMonthlyData(
	hoverInfo: HoverInfo | null,
	world: SerializedOrogenWorld | null,
): HoverPastaMonthlyData | null {
	if (
		!hoverInfo ||
		!world?.pastaDebug?.gdd_monthly ||
		!world.pastaDebug.gint_monthly
	) {
		return null
	}
	const region = hoverInfo.region
	const regionCount = world.mesh.numRegions
	const gdd: number[] = []
	const gint: number[] = []
	for (let month = 0; month < 12; month++) {
		gdd.push(world.pastaDebug.gdd_monthly[month * regionCount + region])
		gint.push(world.pastaDebug.gint_monthly[month * regionCount + region])
	}
	return { gdd, gint }
}

export function buildTerrainFeatureSwatches(
	hoverTerrainFeature: HoverTerrainFeature | null,
): Array<{ label: string; color: string | null }> {
	if (!hoverTerrainFeature) return []
	return Array.from(
		new Set(
			[hoverTerrainFeature.dominant, ...hoverTerrainFeature.all].filter(
				(feature): feature is string => Boolean(feature),
			),
		),
	).map((feature) => {
		const featureIndex = OROGEN_TERRAIN_FEATURE_LABELS.indexOf(
			feature as (typeof OROGEN_TERRAIN_FEATURE_LABELS)[number],
		)
		const featureColor =
			featureIndex >= 0 ? getTerrainFeatureColor(featureIndex) : null
		return {
			label: feature,
			color: featureColor ? rgbToCss(featureColor) : null,
		}
	})
}

export function buildProvinceDisplayData(params: {
	hoverProvince: number | null
	hoverNationId: number | null
	hoverRegionColor: [number, number, number] | null
	world: SerializedOrogenWorld | null
}): HoverProvinceDisplayData {
	const { hoverProvince, hoverNationId, hoverRegionColor, world } = params
	const regionDisplayColor = hoverRegionColor
		? rgbToCss(hoverRegionColor)
		: null
	const provinceNation =
		hoverProvince !== null &&
		hoverProvince >= 0 &&
		hoverNationId !== null &&
		hoverNationId >= 0 &&
		world?.nations &&
		hoverProvince < world.nations.assignment.length
			? {
					id: hoverNationId,
					color: regionDisplayColor,
				}
			: null
	const provinceColor =
		hoverProvince !== null &&
		hoverProvince >= 0 &&
		world?.provinces &&
		hoverProvince * 3 + 2 < world.provinces.colors.length
			? rgbToCss([
					world.provinces.colors[hoverProvince * 3],
					world.provinces.colors[hoverProvince * 3 + 1],
					world.provinces.colors[hoverProvince * 3 + 2],
				])
			: null
	return { provinceColor, provinceNation, regionDisplayColor }
}

export function buildClimateSwatchColor(
	hoverRegion: number | null,
	world: SerializedOrogenWorld | null,
	colorMode: ColorMode,
): string | null {
	if (hoverRegion === null || !world) return null
	if (colorMode === "pastaClimate" && world.pastaClimate)
		return rgbToCss(pastaClimateColor(world.pastaClimate[hoverRegion]))
	if (colorMode === "satellite" && world.pastaClimate)
		return rgbToCss(pastaTrueColor(world.pastaClimate[hoverRegion]))
	if (colorMode === "koppenClimate" && world.koppenClimate)
		return rgbToCss(koppenClimateColor(world.koppenClimate[hoverRegion]))
	if (colorMode === "satelliteKoppen" && world.koppenClimate)
		return rgbToCss(koppenTrueColor(world.koppenClimate[hoverRegion]))
	if (!world.climateZones) return null
	return rgbToCss(
		colorMode === "climate" && world.climate
			? climateTempColor(world.climate.temperature_avg[hoverRegion])
			: climateZoneColor(world.climateZones[hoverRegion]),
	)
}

export function buildVegetationSwatchColor(
	hoverRegion: number | null,
	world: SerializedOrogenWorld | null,
): string | null {
	if (hoverRegion === null || !world?.vegetation) return null
	return rgbToCss(vegetationColor(world.vegetation[hoverRegion]))
}

export function buildTopographySwatchColor(
	hoverRegion: number | null,
	world: SerializedOrogenWorld | null,
): string | null {
	if (hoverRegion === null || !world?.topography) return null
	const color = getTopographyColor(world.topography[hoverRegion])
	return color ? rgbToCss(color) : null
}

export function formatWindSummary(wind: HoverWind): string {
	const deg = (Math.atan2(-wind.east, -wind.north) * 180) / Math.PI
	const from = ((deg % 360) + 360) % 360
	const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
	const dir = dirs[Math.round(from / 45) % 8]
	return `${dir} ${from.toFixed(0)}° · ${wind.speed.toFixed(2)} m/s`
}
