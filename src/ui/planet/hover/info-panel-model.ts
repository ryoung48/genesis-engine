import { GENESIS_TERRAIN_FEATURE_LABELS } from "@/model"
import { koppenClimateColor } from "@/model/climate/koppen"
import { pastaClimateColor } from "@/model/climate/pasta"
import { tradeGoodColor } from "@/model/economy/trade-goods"
import { GOVERNMENT_TYPE_LABELS, GOVERNMENT_TYPES } from "@/model/society/eras"
import {
	RELIGION_TYPE_COLORS,
	RELIGION_TYPE_NAMES,
} from "@/model/society/religion"
import { LANDMARK_TYPE_LAKE } from "@/model/terrain/landmarks"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import type { ColorMode } from "../colors"
import {
	climateTempColor,
	climateZoneColor,
	temperatureDifferenceColor,
	VEGETATION_WATER_BLUE,
	vegetationColor,
	vegetationMapColor,
	vegetationSatelliteColor,
} from "../colors"
import {
	getTerrainFeatureColor,
	getTopographyColor,
	toPastelNationColor,
} from "../screen/display/region-colors"
import {
	getReligionColorForProvince,
	getReligionTypeIndexForProvince,
} from "../screen/display/religion-type"
import type { PopulationMapMode } from "../screen/shared/map-modes"
import {
	formatDensity,
	rgbToCss,
	type UnitSystem,
} from "../screen/shared/ui-format"
import type { HoverInfo, HoverTerrainFeature } from "./hover"

interface HoverChartData {
	temps: number[]
	realTemps: number[]
	tempDiffs: number[]
	precip: number[]
	daylight: number[]
	pet: number[]
	aet: number[]
	isLand: number | undefined
	isLake: number | undefined
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
}

interface HoverDemographicDisplayData {
	label: string
	value: string
	color: string | null
}

export function buildHoverChartData(
	hoverInfo: HoverInfo | null,
	hoverElevationKm: number | null,
	world: SerializedGenesisWorld | null,
): HoverChartData | null {
	if (!hoverInfo || hoverElevationKm === null || !world) return null
	const region = hoverInfo.region
	const regionCount = world.mesh.numRegions
	const temps: number[] = []
	const realTemps: number[] = []
	const tempDiffs: number[] = []
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
		realTemps.push(
			world.climate?.real_temperature_monthly
				? world.climate.real_temperature_monthly[month * regionCount + region]
				: 0,
		)
		tempDiffs.push(
			world.climate?.temperature_diff_monthly
				? world.climate.temperature_diff_monthly[month * regionCount + region]
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
		realTemps,
		tempDiffs,
		precip,
		daylight,
		pet,
		aet,
		isLand: world.isLand?.[region],
		isLake:
			world.landmarks != null &&
			world.landmarks.regionLandmark[region] >= 0 &&
			world.landmarks.type[world.landmarks.regionLandmark[region]] ===
				LANDMARK_TYPE_LAKE
				? 1
				: undefined,
		iceThickness: world.iceThickness?.[region] ?? 0,
		iceMin: world.iceMinMonthly?.[region] ?? 0,
		iceMax: world.iceMaxMonthly?.[region] ?? 0,
	}
}

export function buildPastaMonthlyData(
	hoverInfo: HoverInfo | null,
	world: SerializedGenesisWorld | null,
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
		const featureIndex = GENESIS_TERRAIN_FEATURE_LABELS.indexOf(
			feature as (typeof GENESIS_TERRAIN_FEATURE_LABELS)[number],
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
	world: SerializedGenesisWorld | null
}): HoverProvinceDisplayData {
	const { hoverProvince, hoverNationId, world } = params
	const nationColor =
		hoverNationId !== null &&
		hoverNationId >= 0 &&
		world?.nations?.colors &&
		hoverNationId * 3 + 2 < world.nations.colors.length
			? rgbToCss([
					...toPastelNationColor([
						world.nations.colors[hoverNationId * 3],
						world.nations.colors[hoverNationId * 3 + 1],
						world.nations.colors[hoverNationId * 3 + 2],
					]),
				])
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
					color: nationColor,
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
	return { provinceColor, provinceNation }
}

export function buildClimateSwatchColor(
	hoverRegion: number | null,
	world: SerializedGenesisWorld | null,
	colorMode: ColorMode,
): string | null {
	if (hoverRegion === null || !world) return null
	if (colorMode === "pastaClimate" && world.pastaClimate)
		return rgbToCss(pastaClimateColor(world.pastaClimate[hoverRegion]))
	if (colorMode === "koppenClimate" && world.koppenClimate)
		return rgbToCss(koppenClimateColor(world.koppenClimate[hoverRegion]))
	if (colorMode === "realTemperature" && world.climate?.real_temperature_avg)
		return rgbToCss(
			climateTempColor(world.climate.real_temperature_avg[hoverRegion]),
		)
	if (colorMode === "temperatureDiff" && world.climate?.temperature_diff_avg)
		return rgbToCss(
			temperatureDifferenceColor(
				world.climate.temperature_diff_avg[hoverRegion],
			),
		)
	if (!world.climateZones) return null
	return rgbToCss(
		colorMode === "climate" && world.climate
			? climateTempColor(world.climate.temperature_avg[hoverRegion])
			: climateZoneColor(world.climateZones[hoverRegion]),
	)
}

export function buildVegetationSwatchColor(
	hoverRegion: number | null,
	world: SerializedGenesisWorld | null,
	colorMode: ColorMode,
): string | null {
	if (
		hoverRegion === null ||
		!world ||
		(colorMode === "vegetationSatellite"
			? !world.pastaClimate
			: !world.vegetation)
	) {
		return null
	}
	const color = !world.isLand?.[hoverRegion]
		? VEGETATION_WATER_BLUE
		: colorMode === "vegetationSatellite" && world.pastaClimate
			? vegetationSatelliteColor(world.pastaClimate[hoverRegion])
			: colorMode === "vegetationMaps"
				? vegetationMapColor(
						world.vegetation[hoverRegion],
						world.climateZones?.[hoverRegion],
					)
				: vegetationColor(world.vegetation[hoverRegion])
	return rgbToCss(color)
}

export function buildTopographySwatchColor(
	hoverRegion: number | null,
	world: SerializedGenesisWorld | null,
): string | null {
	if (hoverRegion === null || !world?.topography) return null
	const color = getTopographyColor(world.topography[hoverRegion])
	return color ? rgbToCss(color) : null
}

export function buildDemographicDisplayData(params: {
	populationMode: PopulationMapMode
	hoverProvince: number | null
	world: SerializedGenesisWorld | null
	unitSystem: UnitSystem
	getCultureName: (cultureId: number) => string
	getHeritageName: (heritageId: number) => string
}): HoverDemographicDisplayData | null {
	const {
		populationMode,
		hoverProvince,
		world,
		unitSystem,
		getCultureName,
		getHeritageName,
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

	if (populationMode === "migration") {
		const wave = world.population?.migrationWave?.[province] ?? -1
		if (isDesolate || wave < 0) return null
		const pct = Math.round(wave * 100)
		return {
			label: "Migration",
			value: pct === 0 ? "Cradle" : `${pct}%`,
			color: null,
		}
	}

	const cultureIdx = world.cultures?.assignment[province] ?? -1
	const heritageIdx =
		cultureIdx >= 0 ? (world.heritages?.assignment[cultureIdx] ?? -1) : -1

	if (populationMode === "culture") {
		if (!world.cultures || cultureIdx < 0) return null
		return {
			label: "Culture",
			value: getCultureName(cultureIdx),
			color:
				cultureIdx * 3 + 2 < world.cultures.colors.length
					? rgbToCss([
							world.cultures.colors[cultureIdx * 3],
							world.cultures.colors[cultureIdx * 3 + 1],
							world.cultures.colors[cultureIdx * 3 + 2],
						])
					: null,
		}
	}

	if (populationMode === "heritage") {
		if (!world.heritages || heritageIdx < 0) return null
		return {
			label: "Heritage",
			value: getHeritageName(heritageIdx),
			color:
				heritageIdx * 3 + 2 < world.heritages.colors.length
					? rgbToCss([
							world.heritages.colors[heritageIdx * 3],
							world.heritages.colors[heritageIdx * 3 + 1],
							world.heritages.colors[heritageIdx * 3 + 2],
						])
					: null,
		}
	}

	if (populationMode === "religion") {
		const typeIdx = getReligionTypeIndexForProvince(world, hoverProvince)
		if (typeIdx < 0) return null
		const typeColor =
			getReligionColorForProvince(world, hoverProvince) ??
			RELIGION_TYPE_COLORS[typeIdx] ??
			RELIGION_TYPE_COLORS[0]
		return {
			label: "Religion",
			value: RELIGION_TYPE_NAMES[typeIdx] ?? "Unknown",
			color: rgbToCss([typeColor[0], typeColor[1], typeColor[2]]),
		}
	}

	return null
}

export const GOVERNMENT_COLORS_CSS: Record<number, string> = {
	// tribal — orange / brown
	0: "rgb(204, 143, 71)", // chiefdom
	1: "rgb(140, 89, 36)", // tribal monarchy
	2: "rgb(237, 194, 128)", // tribal federation
	3: "rgb(112, 61, 28)", // native council
	// monarchy — blue
	4: "rgb(107, 138, 184)", // feudal monarchy
	5: "rgb(140, 199, 242)", // elective monarchy
	6: "rgb(15, 41, 112)", // absolute monarchy
	7: "rgb(33, 102, 217)", // constitutional monarchy
	// republic — green
	8: "rgb(26, 143, 117)", // merchant republic
	9: "rgb(28, 92, 46)", // noble republic
	10: "rgb(163, 204, 61)", // city-state confederation
	11: "rgb(61, 163, 87)", // presidential republic
	12: "rgb(122, 214, 117)", // parliamentary republic
	// theocracy — purple / magenta
	13: "rgb(133, 61, 179)", // theocracy
	14: "rgb(71, 28, 117)", // monastic state
	15: "rgb(194, 143, 230)", // prince-bishopric
	16: "rgb(209, 46, 148)", // imperial cult
	// republic extensions
	17: "rgb(189, 36, 36)", // socialist state
	18: "rgb(112, 117, 61)", // military junta
	// colonial — red family
	19: "rgb(230, 84, 61)", // trading company — vermilion red
	20: "rgb(245, 140, 128)", // settler colony — light salmon red
}

export function buildGovernmentDisplayData(params: {
	hoverNationId: number | null
	world: SerializedGenesisWorld | null
}): { label: string; color: string } | null {
	const { hoverNationId, world } = params
	if (
		hoverNationId === null ||
		hoverNationId < 0 ||
		!world?.nations?.governmentType ||
		hoverNationId >= world.nations.governmentType.length
	) {
		return null
	}
	// governmentType is per-province (like leaderDynasty), so hoverNationId
	// (a province index in the display system) indexes it directly.
	const typeIndex = world.nations.governmentType[hoverNationId] ?? 4
	const key = GOVERNMENT_TYPES[typeIndex]
	const label = key ? (GOVERNMENT_TYPE_LABELS[key] ?? key) : "Kingdom"
	return {
		label,
		color: GOVERNMENT_COLORS_CSS[typeIndex] ?? GOVERNMENT_COLORS_CSS[7],
	}
}

/**
 * Returns the CSS color string for the given trade good material index,
 * or null if the index is 0 (unassigned).
 */
export function buildTradeGoodSwatchColor(
	materialIndex: number,
): string | null {
	if (materialIndex <= 0) return null
	return rgbToCss(tradeGoodColor(materialIndex))
}
