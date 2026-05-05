import { OROGEN_TERRAIN_FEATURE_LABELS } from "@/model"
import { koppenClimateColor } from "@/model/climate/koppen"
import { pastaClimateColor } from "@/model/climate/pasta"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import type { ColorMode } from "../colors"
import { climateTempColor, climateZoneColor, vegetationColor } from "../colors"
import {
	getDynastyColor,
	getTerrainFeatureColor,
	getTopographyColor,
} from "../screen/display/region-colors"
import { buildRulerDisplayMeta } from "../screen/display/ruler-display"
import type { PopulationMapMode } from "../screen/shared/map-modes"
import {
	formatDensity,
	rgbToCss,
	type UnitSystem,
} from "../screen/shared/ui-format"
import type { HoverInfo, HoverTerrainFeature } from "./hover"

interface HoverChartData {
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

interface HoverPastaMonthlyData {
	gdd: number[]
	gint: number[]
}

interface HoverProvinceDisplayData {
	provinceColor: string | null
	provinceNation: {
		id: number
		color: string | null
	} | null
	regionDisplayColor: string | null
}

interface HoverDemographicDisplayData {
	label: string
	value: string
	color: string | null
}

interface HoverPoliticalDisplayData {
	dynasty: {
		id: number
		name: string
		color: string
	} | null
	ruler: {
		name: string
		age: number | null
		genderSymbol: string | null
	} | null
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

export function buildPoliticalDisplayData(params: {
	hoverNationId: number | null
	selectedTimeMs: number | null
	world: SerializedOrogenWorld | null
	getLeaderName?: (nationId: number, timeMs: number) => string
	getDynastyName?: (dynastyId: number) => string
}): HoverPoliticalDisplayData {
	const {
		hoverNationId,
		selectedTimeMs,
		world,
		getLeaderName,
		getDynastyName,
	} = params
	if (hoverNationId === null || hoverNationId < 0) {
		return { dynasty: null, ruler: null }
	}

	const dynastyId = world?.leaderDynasty?.[hoverNationId] ?? -1
	const dynasty =
		dynastyId >= 0 && getDynastyName
			? {
					id: dynastyId,
					name: getDynastyName(dynastyId),
					color: rgbToCss(getDynastyColor(dynastyId)),
				}
			: null
	const rulerMeta = buildRulerDisplayMeta({
		world,
		nationId: hoverNationId,
		timeMs: selectedTimeMs,
	})
	const ruler =
		selectedTimeMs !== null && getLeaderName
			? {
					name: getLeaderName(hoverNationId, selectedTimeMs),
					age: rulerMeta.age,
					genderSymbol: rulerMeta.genderSymbol,
				}
			: null
	return { dynasty, ruler }
}

export function buildClimateSwatchColor(
	hoverRegion: number | null,
	world: SerializedOrogenWorld | null,
	colorMode: ColorMode,
): string | null {
	if (hoverRegion === null || !world) return null
	if (colorMode === "pastaClimate" && world.pastaClimate)
		return rgbToCss(pastaClimateColor(world.pastaClimate[hoverRegion]))
	if (colorMode === "koppenClimate" && world.koppenClimate)
		return rgbToCss(koppenClimateColor(world.koppenClimate[hoverRegion]))
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

export function buildDemographicDisplayData(params: {
	populationMode: PopulationMapMode
	hoverProvince: number | null
	world: SerializedOrogenWorld | null
	unitSystem: UnitSystem
	getCultureName: (cultureId: number) => string
	getHeritageName: (heritageId: number) => string
	getFaithName: (faithId: number) => string
	getReligionName: (religionId: number) => string
}): HoverDemographicDisplayData | null {
	const {
		populationMode,
		hoverProvince,
		world,
		unitSystem,
		getCultureName,
		getHeritageName,
		getFaithName,
		getReligionName,
	} = params
	if (
		hoverProvince === null ||
		hoverProvince < 0 ||
		!world?.provinces ||
		hoverProvince >= world.provinces.desolate.length
	) {
		return null
	}
	const province = hoverProvince
	const isDesolate = !!world.provinces.desolate[province]

	if (populationMode === "density") {
		const pop = world.population?.population?.[province] ?? 0
		if (isDesolate || pop <= 0) return null
		const popStr =
			pop >= 1_000_000
				? `${(pop / 1_000_000).toFixed(1)}M`
				: pop >= 1_000
					? `${(pop / 1_000).toFixed(0)}K`
					: Math.round(pop).toLocaleString()
		const radiusKm = world.params?.planetRadiusKm ?? 6371
		const cellAreaKm2 =
			(4 * Math.PI * radiusKm * radiusKm) / world.mesh.numRegions
		const areaKm2 = world.provinces.size[province] * cellAreaKm2
		const density = areaKm2 > 0 ? pop / areaKm2 : 0
		return {
			label: "Population",
			value: `${popStr} · ${formatDensity(density, unitSystem)}`,
			color: null,
		}
	}

	if (populationMode === "development") {
		if (isDesolate || !world.development) return null
		return {
			label: "Development",
			value: world.development[province].toFixed(2),
			color: null,
		}
	}

	const cultureIdx = world.cultures?.assignment[province] ?? -1
	const heritageIdx =
		cultureIdx >= 0 ? (world.heritages?.assignment[cultureIdx] ?? -1) : -1
	const faithIdx =
		cultureIdx >= 0 ? (world.faiths?.assignment[cultureIdx] ?? -1) : -1
	const religionIdx =
		faithIdx >= 0 ? (world.religions?.assignment[faithIdx] ?? -1) : -1
	const selected =
		populationMode === "culture"
			? {
					idx: cultureIdx,
					label: "Culture",
					partition: world.cultures,
					name: getCultureName,
				}
			: populationMode === "heritage"
				? {
						idx: heritageIdx,
						label: "Heritage",
						partition: world.heritages,
						name: getHeritageName,
					}
				: populationMode === "faith"
					? {
							idx: faithIdx,
							label: "Faith",
							partition: world.faiths,
							name: getFaithName,
						}
					: {
							idx: religionIdx,
							label: "Religion",
							partition: world.religions,
							name: getReligionName,
						}

	if (!selected.partition || selected.idx < 0) return null

	return {
		label: selected.label,
		value: selected.name(selected.idx),
		color:
			selected.idx * 3 + 2 < selected.partition.colors.length
				? rgbToCss([
						selected.partition.colors[selected.idx * 3],
						selected.partition.colors[selected.idx * 3 + 1],
						selected.partition.colors[selected.idx * 3 + 2],
					])
				: null,
	}
}
