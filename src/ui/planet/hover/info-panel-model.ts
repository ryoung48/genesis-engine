import { KOPPEN } from "@/model/climate/koppen"
import { PASTA } from "@/model/climate/pasta"
import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { ERAS } from "@/model/society/eras"
import { TRADE_GOODS } from "@/model/society/infrastructure/trade/trade-goods"
import { RELIGION } from "@/model/society/religion"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import {
	type ColorMode,
	VEGETATION_WATER_BLUE,
} from "@/ui/planet/colors"
import { climateZoneColor } from "@/ui/planet/colors/misc"
import {
	climateTempColor,
	temperatureDifferenceColor,
} from "@/ui/planet/colors/temperature"
import {
	vegetationColor,
	vegetationMapColor,
	vegetationSatelliteColor,
} from "@/ui/planet/colors/vegetation"
import type { HoverInfo, HoverTerrainFeature } from "@/ui/planet/hover/hover"
import { GOVERNMENT_COLORS_CSS } from "@/ui/planet/screen/display/government-colors"
import {
	getTerrainFeatureColor,
	getTopographyColor,
	toPastelNationColor,
} from "@/ui/planet/screen/display/region-colors/palette"
import {
	getReligionColorForProvince,
	getReligionTypeIndexForProvince,
} from "@/ui/planet/screen/display/religion-type"
import {
	getBaseMapMode,
	getDataVariant,
} from "@/ui/planet/screen/shared/data-variant"
import type { PopulationMapMode } from "@/ui/planet/screen/shared/map-modes"
import { getProvincePopulationDensity } from "@/ui/planet/screen/shared/population-density"
import {
	formatDensity,
	rgbToCss,
	type UnitSystem,
} from "@/ui/planet/screen/shared/ui-format"

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
	provinceName: string | null
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

function formatPopulationValue(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0"
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
	if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
	return Math.round(value).toLocaleString()
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
				LANDMARKS.landmarkTypeLake
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
		const featureIndex = TERRAIN_FEATURES.genesisTerrainFeatureLabels.indexOf(
			feature as (typeof TERRAIN_FEATURES.genesisTerrainFeatureLabels)[number],
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
	const provinceName =
		hoverProvince !== null &&
		hoverProvince >= 0 &&
		world?.provinces?.names &&
		hoverProvince < world.provinces.names.length
			? world.provinces.names[hoverProvince]
			: null
	return { provinceColor, provinceName, provinceNation }
}

export function buildClimateSwatchColor(
	hoverRegion: number | null,
	world: SerializedGenesisWorld | null,
	colorMode: ColorMode,
): string | null {
	if (hoverRegion === null || !world) return null
	if (colorMode === "pastaClimate" && world.pastaClimate)
		return rgbToCss(PASTA.pastaClimateColor(world.pastaClimate[hoverRegion]))
	if (colorMode === "koppenClimate" && world.koppenClimate)
		return rgbToCss(KOPPEN.koppenClimateColor(world.koppenClimate[hoverRegion]))
	if (colorMode === "realPastaClimate" && world.realPastaClimate)
		return rgbToCss(
			PASTA.pastaClimateColor(world.realPastaClimate[hoverRegion]),
		)
	if (colorMode === "realKoppenClimate" && world.realKoppenClimate)
		return rgbToCss(
			KOPPEN.koppenClimateColor(world.realKoppenClimate[hoverRegion]),
		)
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
		(colorMode === "climate" || colorMode === "realClimate") && world.climate
			? climateTempColor(
					colorMode === "realClimate"
						? (world.climate.real_temperature_avg?.[hoverRegion] ??
								world.climate.temperature_avg[hoverRegion])
						: world.climate.temperature_avg[hoverRegion],
				)
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
		((colorMode === "vegetationSatellite" ||
			colorMode === "realVegetationSatellite")
			? !(colorMode === "realVegetationSatellite"
					? world.realPastaClimate
					: world.pastaClimate)
			: !(colorMode === "realVegetation" || colorMode === "realVegetationMaps"
					? world.realVegetation
					: world.vegetation))
	) {
		return null
	}
	const vegetation =
		colorMode === "realVegetation" || colorMode === "realVegetationMaps"
			? world.realVegetation
			: world.vegetation
	const satellitePastaClimate =
		colorMode === "realVegetationSatellite"
			? world.realPastaClimate
			: world.pastaClimate
	const color =
		(colorMode === "vegetationSatellite" ||
			colorMode === "realVegetationSatellite") &&
		satellitePastaClimate
			? vegetationSatelliteColor(satellitePastaClimate[hoverRegion])
			: !world.isLand?.[hoverRegion]
				? VEGETATION_WATER_BLUE
			: (colorMode === "vegetationMaps" || colorMode === "realVegetationMaps") &&
				vegetation
				? vegetationMapColor(
						vegetation[hoverRegion],
						world.climateZones?.[hoverRegion],
					)
				: vegetationColor(vegetation?.[hoverRegion] ?? 0)
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
	colorMode: ColorMode
	hoverProvince: number | null
	world: SerializedGenesisWorld | null
	unitSystem: UnitSystem
	getCultureName: (cultureId: number) => string
	getHeritageName: (heritageId: number) => string
}): HoverDemographicDisplayData | null {
	const {
		populationMode,
		colorMode,
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
	const populationVariant =
		getBaseMapMode(colorMode) === "population"
			? getDataVariant(colorMode)
			: "generated"

	if (populationMode === "density") {
		const densitySource =
			populationVariant === "observed"
				? (world.realPopulation?.population?.[province] ?? 0)
				: populationVariant === "diff"
					? (world.realPopulation?.difference?.[province] ?? 0)
					: (world.population?.population?.[province] ?? 0)
		if (isDesolate || !Number.isFinite(densitySource)) return null
		if (populationVariant !== "diff" && densitySource <= 0) return null
		const density = getProvincePopulationDensity(world, province, densitySource)
		const densityText =
			populationVariant === "diff"
				? `${density >= 0 ? "+" : ""}${formatDensity(Math.abs(density), unitSystem)}`
				: formatDensity(density, unitSystem)
		const populationText =
			populationVariant === "diff"
				? `${densitySource >= 0 ? "+" : ""}${formatPopulationValue(Math.abs(densitySource))}`
				: formatPopulationValue(densitySource)
		return {
			label: "Population",
			value: `${densityText} · ${populationText}`,
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

	if (populationMode === "urban") {
		const urbanPopulation =
			world.realUrbanPopulation?.population?.[province] ?? 0
		if (isDesolate || urbanPopulation <= 0) return null
		return {
			label: "Urban Pop",
			value: formatPopulationValue(urbanPopulation),
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
			RELIGION.religionTypeColors[typeIdx] ??
			RELIGION.religionTypeColors[0]
		return {
			label: "Religion",
			value: RELIGION.religionTypeNames[typeIdx] ?? "Unknown",
			color: rgbToCss([typeColor[0], typeColor[1], typeColor[2]]),
		}
	}

	return null
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
	const key = ERAS.governmentTypes[typeIndex]
	const label = key ? (ERAS.governmentTypeLabels[key] ?? key) : "Kingdom"
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
	return rgbToCss(TRADE_GOODS.tradeGoodColor(materialIndex))
}
