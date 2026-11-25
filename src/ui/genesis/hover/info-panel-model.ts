import { KOPPEN } from "@/model/climate/classification/koppen"
import { PASTA } from "@/model/climate/classification/pasta"
import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import { CAVES } from "@/model/geography/terrain/caves"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { OASES } from "@/model/geography/terrain/groundwater/oases"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { WETLANDS } from "@/model/geography/terrain/groundwater/wetlands"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { KARST } from "@/model/geography/terrain/karst"
import { KARST_CAVES } from "@/model/geography/terrain/karst-caves"
import { LAKES } from "@/model/geography/terrain/lakes"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { ROCKS } from "@/model/geography/terrain/rocks"
import { SHORE } from "@/model/geography/terrain/shore"
import { SHORE_EXPOSURE } from "@/model/geography/terrain/shore/exposure"
import { SHORE_MATERIAL } from "@/model/geography/terrain/shore/material"
import { SHORE_RELIEF } from "@/model/geography/terrain/shore/relief"
import { SHORE_SETTING } from "@/model/geography/terrain/shore/setting"
import { SOILS } from "@/model/geography/terrain/soils"
import { DATE } from "@/model/history/earth/date"
import { TIME } from "@/model/shared/time"
import type { WayOfLifeShares } from "@/model/society/farming/types"
import { TRADE_GOODS } from "@/model/society/infrastructure/trade/trade-goods"
import { MIGRATION } from "@/model/society/migration"
import { TECH_LEVEL } from "@/model/society/tech-level"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { HoverInfo, HoverTerrainFeature } from "@/ui/genesis/hover/hover"
import {
	getReligionColorForProvince,
	getReligionIndexForProvince,
} from "@/ui/genesis/political/religion-type"
import {
	type ColorMode,
	VEGETATION_WATER_BLUE,
} from "@/ui/genesis/shared/colors"
import { climateZoneColor } from "@/ui/genesis/shared/colors/misc"
import {
	climateTempColor,
	temperatureDifferenceColor,
} from "@/ui/genesis/shared/colors/temperature"
import {
	vegetationColor,
	vegetationMapColor,
	vegetationSatelliteColor,
} from "@/ui/genesis/shared/colors/vegetation"
import {
	getBaseMapMode,
	getDataVariant,
} from "@/ui/genesis/shared/data-variant"
import {
	displayYear,
	getFarming,
	getWayOfLife,
} from "@/ui/genesis/shared/farming-display"
import type { SocietyMapMode } from "@/ui/genesis/shared/map-modes"
import {
	getArrivalRampYears,
	getArrivalYears,
} from "@/ui/genesis/shared/migration-arrival"
import { getProvincePopulationDensity } from "@/ui/genesis/shared/population-density"
import {
	CAVE_DOT_COLORS,
	getTerrainFeatureColor,
	getTopographyColor,
	KARST_CLASS_COLORS,
	rockColor,
	SALT_PAN_COLOR,
	SHORE_LABEL_COLORS,
	soilColor,
	WATER_DOT_COLORS,
	WATER_DOT_LABELS,
	WETLAND_KIND_COLORS,
	waterTableClass,
	waterTableColor,
} from "@/ui/genesis/shared/region-colors/palette"
import {
	formatDensity,
	formatFlowRate,
	formatHeight,
	formatPassage,
	formatPrecipitation,
	rgbToCss,
	type UnitSystem,
} from "@/ui/genesis/shared/ui-format"

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
	const daylightScale =
		world.params?.tideLock?.type === "solar" && world.params.hoursPerDay > 0
			? TIME.constants.hoursPerDay / world.params.hoursPerDay
			: 1
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
				? world.climate.daylight_hours_monthly[month * regionCount + region] *
						daylightScale
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
	useReal = false,
): HoverPastaMonthlyData | null {
	const pastaDebug = useReal ? world?.realPastaDebug : world?.pastaDebug
	if (!hoverInfo || !pastaDebug?.gdd_monthly || !pastaDebug.gint_monthly) {
		return null
	}
	const region = hoverInfo.region
	const regionCount = world!.mesh.numRegions
	const gdd: number[] = []
	const gint: number[] = []
	for (let month = 0; month < 12; month++) {
		gdd.push(pastaDebug.gdd_monthly[month * regionCount + region])
		gint.push(pastaDebug.gint_monthly[month * regionCount + region])
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

export function buildProvinceName(params: {
	hoverProvince: number | null
	world: SerializedGenesisWorld | null
}): string | null {
	const { hoverProvince, world } = params
	return hoverProvince !== null &&
		hoverProvince >= 0 &&
		world?.provinces?.names &&
		hoverProvince < world.provinces.names.length
		? world.provinces.names[hoverProvince]
		: null
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
		(colorMode === "vegetationSatellite" ||
		colorMode === "realVegetationSatellite"
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
			? vegetationSatelliteColor(
					world.isLand[hoverRegion] !== 0,
					(colorMode === "realVegetationSatellite"
						? (world.climate.real_temperature_avg ??
							world.climate.temperature_avg)
						: world.climate.temperature_avg)[hoverRegion],
					(colorMode === "realVegetationSatellite"
						? (world.rainfall.real_annual ?? world.rainfall.annual)
						: world.rainfall.annual)[hoverRegion],
				)
			: !world.isLand?.[hoverRegion]
				? VEGETATION_WATER_BLUE
				: (colorMode === "vegetationMaps" ||
							colorMode === "realVegetationMaps") &&
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
	const code = world.topography[hoverRegion]
	const color = CLASSIFICATION.isSaltFlat({
		code,
		lakeKind: world.rivers?.lakeKind?.[hoverRegion],
	})
		? SALT_PAN_COLOR
		: getTopographyColor(code)
	return color ? rgbToCss(color) : null
}

const WAY_OF_LIFE_MIN_SHARE = 0.05

export function buildFarmingDisplayData(params: {
	populationMode: SocietyMapMode
	hoverProvince: number | null
	world: SerializedGenesisWorld | null
	timeMs: number | null
	getProvinceName: (provinceId: number) => string
}): HoverDemographicDisplayData[] {
	const { populationMode, hoverProvince, world, timeMs, getProvinceName } =
		params
	const farming = getFarming(world)
	if (
		(populationMode !== "farming" && populationMode !== "wayOfLife") ||
		!world?.provinces ||
		!farming ||
		hoverProvince === null ||
		hoverProvince < 0 ||
		hoverProvince >= world.provinces.desolate.length ||
		world.provinces.desolate[hoverProvince]
	)
		return []
	const year = farming.farmingYear[hoverProvince]
	const source = farming.hearthOf[hoverProvince]
	const at = {
		farming,
		province: hoverProvince,
		year: displayYear({ timeMs, world }),
		techLevel: TECH_LEVEL.averageLevel({
			target: world.params.targetTechLevel,
		}),
	}
	const describeMix = (shares: WayOfLifeShares) =>
		(["farm", "herd", "forage"] as const)
			.filter((way) => shares[way] >= WAY_OF_LIFE_MIN_SHARE)
			.map(
				(way) =>
					`${way[0].toUpperCase()}${way.slice(1)} ${Math.round(100 * shares[way])}%`,
			)
			.join(" · ")
	const field = getWayOfLife({ world, year: at.year })
	const people = field
		? describeMix({
				forage: field.forage[hoverProvince],
				farm: field.farm[hoverProvince],
				herd: field.herd[hoverProvince],
			})
		: ""

	return [
		{
			label: "Farming arrival",
			value: year === MIGRATION.sentinel ? "Never" : DATE.formatEu4Year(year),
			color: null,
		},
		{
			label: "Farming hearth",
			value:
				source < 0
					? "—"
					: source === hoverProvince
						? "Own hearth"
						: getProvinceName(source),
			color: null,
		},
		{
			label: "Way of life",
			value: people || "Uninhabited",
			color: null,
		},
	]
}

export function buildDemographicDisplayData(params: {
	populationMode: SocietyMapMode
	colorMode: ColorMode
	hoverProvince: number | null
	world: SerializedGenesisWorld | null
	unitSystem: UnitSystem
	getCultureName: (cultureId: number) => string
	getHeritageName: (heritageId: number) => string
	getReligionName: (religionId: number) => string
}): HoverDemographicDisplayData | null {
	const {
		populationMode,
		colorMode,
		hoverProvince,
		world,
		unitSystem,
		getCultureName,
		getHeritageName,
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

	if (populationMode === "development" || populationMode === "knowledge") {
		const values =
			populationMode === "knowledge" ? world.knowledge : world.development
		if (isDesolate || !values) return null
		return {
			label: populationMode === "knowledge" ? "Knowledge" : "Development",
			value: values[province].toFixed(2),
			color: null,
		}
	}

	if (populationMode === "techLevel") {
		const techLevel = world.population?.techLevel[province]
		if (isDesolate || techLevel === undefined || !Number.isFinite(techLevel))
			return null
		return {
			label: "Tech level",
			value: `TL ${techLevel.toFixed(2)} · ${TECH_LEVEL.describe({ techLevel })}`,
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
		const year = getArrivalYears(world)?.[province]
		const rampYear = getArrivalRampYears(world)?.[province]
		if (isDesolate || year === undefined || rampYear === undefined) return null
		return {
			label: "Migration arrival",
			value:
				year === MIGRATION.sentinel
					? "Unreached"
					: `${DATE.formatEu4Year(year)} · ramp ${DATE.formatEu4Year(rampYear)}`,
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
		const religionIdx = getReligionIndexForProvince(world, hoverProvince)
		const religionColor = getReligionColorForProvince(world, hoverProvince)
		if (religionIdx < 0 || !religionColor) return null
		return {
			label: "Religion",
			value: getReligionName(religionIdx),
			color: rgbToCss([religionColor[0], religionColor[1], religionColor[2]]),
		}
	}

	return null
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

interface HoverGeology {
	rock: string
	rockColor: string
	soil: string
	soilColor: string
}

export function buildHoverGeology({
	world,
	region,
}: {
	world: SerializedGenesisWorld | null
	region: number | null
}): HoverGeology | null {
	if (
		!world?.rock ||
		!world.youngKind ||
		!world.soilFertility ||
		!world.soilModifier ||
		region === null ||
		!world.isLand[region]
	)
		return null
	const rock = ROCKS.kinds[world.rock[region]]
	const young = ROCKS.youngKinds[world.youngKind[region]]
	const fertility = world.soilFertility[region]
	const modifier = SOILS.modifierWord(
		SOILS.modifiers[world.soilModifier[region]],
	)
	const rockName =
		rock === "young" && young !== "none"
			? `${ROCKS.info.young.name} (${young})`
			: ROCKS.info[rock].name
	return {
		rock: rockName,
		rockColor: rgbToCss(rockColor({ rock, young })),
		soil: `${SOILS.kindWord({ rock, young })}${modifier ? `, ${modifier}` : ""} · ${SOILS.grade(fertility)} ${(fertility * 100).toFixed(0)}%`,
		soilColor: rgbToCss(soilColor(fertility)),
	}
}

export interface HoverGroundwaterRow {
	label: string
	value: string
	color: string | null
}

const SHARE_BYTE = 255

const percentOf = (share: number) => `${Math.round(share * 100)}%`

export function buildHoverLakeKind({
	world,
	region,
}: {
	world: SerializedGenesisWorld | null
	region: number | null
}): string | null {
	const code = region === null ? 0 : (world?.rivers?.lakeKind?.[region] ?? 0)
	if (code === 0) return null
	return LAKES.kinds[code]
}

export function buildHoverGroundwater({
	world,
	region,
	colorMode,
	unitSystem,
}: {
	world: SerializedGenesisWorld | null
	region: number | null
	colorMode: ColorMode
	unitSystem: UnitSystem
}): HoverGroundwaterRow[] {
	const layers = world?.groundwater
	if (
		!layers ||
		region === null ||
		!world.isLand[region] ||
		(colorMode !== "waterTable" && colorMode !== "wetlands")
	)
		return []
	const flow = (value: number) =>
		formatFlowRate(value, unitSystem, (v) => v.toFixed(2))
	const rate = (mm: number) => `${formatPrecipitation(mm, unitSystem, 0)}/yr`
	const rows: HoverGroundwaterRow[] = []
	const spring = SPRINGS.kinds[layers.spring[region]]
	const oasis = OASES.kinds[layers.oasis[region]]
	if (spring !== "none")
		rows.push({
			label: "Springs",
			value: WATER_DOT_LABELS[spring],
			color: rgbToCss(WATER_DOT_COLORS[spring]),
		})
	else if (oasis !== "none")
		rows.push({ label: "Springs", value: "None classified", color: null })
	if (oasis !== "none")
		rows.push({
			label: "Oasis",
			value: WATER_DOT_LABELS[oasis],
			color: rgbToCss(WATER_DOT_COLORS[oasis]),
		})
	if (colorMode === "waterTable") {
		const depth = layers.waterTableM[region]
		const classes = GROUNDWATER_CONFIG.depthClassesM
		rows.push(
			{
				label: "Water table",
				value: formatHeight({ value: depth, unitSystem }),
				color: rgbToCss(waterTableColor(waterTableClass(depth))),
			},
			{
				label: "Shallow share",
				value: classes
					.map(
						(limit, k) =>
							`${percentOf(layers.shallowShare[region * classes.length + k] / SHARE_BYTE)} ≤${formatHeight({ value: limit, unitSystem })}`,
					)
					.join(" · "),
				color: null,
			},
			{
				label: "Recharge",
				value: rate(layers.rechargeMm[region]),
				color: null,
			},
			{
				label: "Lateral inflow",
				value: flow(layers.lateralInM3s[region]),
				color: null,
			},
			{
				label: "Surfacing",
				value: flow(layers.surfaceM3s[region]),
				color: null,
			},
			{
				label: "Channel recharge",
				value: flow(layers.channelRechargeM3s[region]),
				color: null,
			},
			{ label: "Well yield", value: rate(layers.wellMm[region]), color: null },
			{
				label: "Texture",
				value: `${layers.sand[region].toFixed(0)}% sand · ${layers.clay[region].toFixed(0)}% clay · ${formatHeight({ value: layers.soilDepthM[region], unitSystem })}`,
				color: null,
			},
		)
		return rows
	}
	const kind = WETLANDS.kinds[layers.wetlandKind[region]]
	rows.push({
		label: "Wetland",
		value: `${kind.replace(/([A-Z])/g, " $1").toLowerCase()} ${percentOf(layers.wetlandShare[region])}`,
		color: rgbToCss(WETLAND_KIND_COLORS[layers.wetlandKind[region]]),
	})
	rows.push({
		label: "Causes",
		value: `groundwater ${percentOf(layers.wetGw[region])} · flood ${percentOf(layers.wetFlood[region])} · coast ${percentOf(layers.wetCoast[region])} · lake ${percentOf(layers.wetLake[region])}`,
		color: null,
	})
	return rows
}

const camelWords = (kind: string) =>
	kind.replace(/([A-Z])/g, " $1").toLowerCase()

function caveRange({
	sites,
	region,
}: {
	sites: NonNullable<SerializedGenesisWorld["caveSites"]>
	region: number
}): [number, number] {
	let lo = 0
	let hi = sites.region.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (sites.region[mid] < region) lo = mid + 1
		else hi = mid
	}
	const start = lo
	while (lo < sites.region.length && sites.region[lo] === region) lo++
	return [start, lo]
}

export function buildHoverKarst({
	world,
	region,
	colorMode,
	unitSystem,
}: {
	world: SerializedGenesisWorld | null
	region: number | null
	colorMode: ColorMode
	unitSystem: UnitSystem
}): HoverGroundwaterRow[] {
	const karst = world?.karst
	if (
		!karst ||
		!world.isLand ||
		region === null ||
		colorMode !== "karst" ||
		!world.isLand[region]
	)
		return []
	const className = KARST_CAVES.classes[karst.karstClass[region]]
	const rows: HoverGroundwaterRow[] = [
		{
			label: "Karst class",
			value: className,
			color: rgbToCss(KARST_CLASS_COLORS[className]),
		},
	]
	const kind = KARST.kinds[karst.kind[region]]
	if (kind !== "none") {
		rows.push(
			{ label: "Karst kind", value: camelWords(kind), color: null },
			{
				label: "Karst potential",
				value: percentOf(karst.potential[region]),
				color: null,
			},
			{
				label: "Karst activity",
				value: KARST.activities[karst.activity[region]],
				color: null,
			},
		)
	}
	const sites = world.caveSites
	if (sites) {
		const [start, end] = caveRange({ sites, region })
		for (let i = start; i < end; i++) {
			const type = CAVES.types[sites.type[i]]
			rows.push({
				label: "Cave",
				value: `${camelWords(type)} · ${formatPassage({ value: sites.lengthM[i], unitSystem })}`,
				color: rgbToCss(CAVE_DOT_COLORS[type]),
			})
		}
	}
	return rows
}

export function buildHoverShore({
	world,
	region,
	colorMode,
	unitSystem,
}: {
	world: SerializedGenesisWorld | null
	region: number | null
	colorMode: ColorMode
	unitSystem: UnitSystem
}): HoverGroundwaterRow[] {
	const layers = world?.shore
	if (
		!layers ||
		region === null ||
		colorMode !== "shore" ||
		layers.label[region] === 0
	)
		return []
	const label = SHORE.labels[layers.label[region]]
	const height = (value: number) => formatHeight({ value, unitSystem })
	const rows: HoverGroundwaterRow[] = [
		{
			label: "Shore",
			value: camelWords(label),
			color: rgbToCss(SHORE_LABEL_COLORS[label]),
		},
		{
			label: "Exposure",
			value: `open ${height(layers.exposureOpenM[region])} (${SHORE_EXPOSURE.classes[SHORE_EXPOSURE.classOf({ exposureM: layers.exposureOpenM[region] })]}) · lee ${height(layers.exposureLeeM[region])} (${SHORE_EXPOSURE.classes[SHORE_EXPOSURE.classOf({ exposureM: layers.exposureLeeM[region] })]})`,
			color: null,
		},
		{
			label: "Relief",
			value: SHORE_RELIEF.kinds[layers.relief[region]],
			color: null,
		},
		{
			label: "Material",
			value: layers.volcanicSand[region]
				? `${SHORE_MATERIAL.kinds[layers.material[region]]} (volcanic)`
				: SHORE_MATERIAL.kinds[layers.material[region]],
			color: null,
		},
	]
	const habitat = SHORE.habitats[layers.habitat[region]]
	if (habitat !== "none")
		rows.push({ label: "Habitat", value: camelWords(habitat), color: null })
	const setting = SHORE_SETTING.kinds[layers.setting[region]]
	if (setting !== "none")
		rows.push({ label: "Setting", value: setting, color: null })
	return rows
}
