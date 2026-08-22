import React from "react"
import { TEXT } from "@/model/shared/text"
import type { SerializedRoutes } from "@/model/society/infrastructure/transport/types"
import { TIMEZONE } from "@/model/society/timezone"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { SeriesBars } from "@/ui/components/primitives/charts/SeriesBars"
import type {
	HoverDtr,
	HoverHazards,
	HoverHotspot,
	HoverHumidity,
	HoverInfo,
	HoverLandmark,
	HoverMisery,
	HoverOceanCurrents,
	HoverRainfallSeries,
	HoverRiver,
	HoverTemperatureSeries,
	HoverTerrainFeature,
} from "@/ui/genesis/hover/hover"
import { getHoverTradeGood } from "@/ui/genesis/hover/hover"
import {
	aetColor,
	currentImpactColor,
	dtrChartColor,
	flowColor,
	formatCompactNumber,
	gddColor,
	gintColor,
	humidityChartColor,
	miseryChartColor,
	petColor,
	rainColor,
	tempColor,
} from "@/ui/genesis/hover/info-panel-format"
import {
	buildHoverPortLabel,
	buildHoverRouteLabel,
	buildSummary,
	computeLakeAverageAnnualPrecipitation,
	windSpeedColorCss,
} from "@/ui/genesis/hover/info-panel-labels"
import {
	buildClimateSwatchColor,
	buildDemographicDisplayData,
	buildGovernmentDisplayData,
	buildHoverChartData,
	buildPastaMonthlyData,
	buildProvinceDisplayData,
	buildTerrainFeatureSwatches,
	buildTopographySwatchColor,
	buildTradeGoodSwatchColor,
	buildVegetationSwatchColor,
} from "@/ui/genesis/hover/info-panel-model"
import {
	MultiSwatchRow,
	Row,
	SwatchRow,
} from "@/ui/genesis/hover/info-panel-rows"
import {
	type ColorMode,
	cloudCoverColor,
	cycloneLandColor,
	dangerColor,
	tidalTierColor,
	tornadoLandColor,
	volcanicLandColor,
} from "@/ui/genesis/shared/colors"
import { daylightColor } from "@/ui/genesis/shared/colors/misc"
import { monthLabels } from "@/ui/genesis/shared/constants"
import {
	type DataVariant,
	getDataVariant,
} from "@/ui/genesis/shared/data-variant"
import {
	getMapModePrimary,
	type PopulationMapMode,
} from "@/ui/genesis/shared/map-modes"
import {
	formatDistance,
	formatElevation,
	formatFlowRate,
	formatPrecipitation,
	formatTemperature,
	formatTemperatureDelta,
	rgbToCss,
	type UnitSystem,
} from "@/ui/genesis/shared/ui-format"

const MONTH_SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

interface DemographicEntry {
	label: string
	value: string
	color: string | null
}

interface InfoPanelProps {
	hoverInfo: HoverInfo | null
	hoverElevationKm: number | null
	hoverTopography: string | null
	hoverCoordinates: string | null
	hoverTimezone: string | null
	hoverLandmark: HoverLandmark | null
	hoverIsLand: boolean | null
	hoverTemperatureDelta: number | null
	hoverRealTemperature: HoverTemperatureSeries | null
	hoverTemperatureDiff: HoverTemperatureSeries | null
	hoverRainfall: number | null
	hoverCloudCover: HoverRainfallSeries | null
	hoverRealRainfall: HoverRainfallSeries | null
	hoverRealCloudCover: HoverRainfallSeries | null
	hoverRainfallDiff: HoverRainfallSeries | null
	hoverDtr: HoverDtr | null
	hoverRealDtr: HoverDtr | null
	hoverDtrDiff: HoverDtr | null
	hoverHumidity: HoverHumidity | null
	hoverRealHumidity: HoverHumidity | null
	hoverHumidityDiff: HoverHumidity | null
	hoverMisery: HoverMisery | null
	hoverClimateDisplay: string | null
	hoverIceSummary: string | null
	hoverBiome: string | null
	hoverProvince: number | null
	hoverNationId: number | null
	hoverOccupation: {
		id: number
		name: string
		color: string
		rebel: boolean
	} | null
	hoverOceanDist: number | null
	hoverDistCoast: number | null
	hoverDistCoastKm: number | null
	hoverHazards: HoverHazards | null
	hoverHotspot: HoverHotspot | null
	hoverRiver: HoverRiver | null
	hoverTerrainFeature: HoverTerrainFeature | null
	hoverOceanCurrents: HoverOceanCurrents | null
	hoverWindSpeed: number | null
	hoverWindDir: string | null
	hoverWindMonthly: Array<{ speedMs: number; dir: string }> | null
	showWindArrows?: boolean
	showRivers?: boolean
	showGdd?: boolean
	showGint?: boolean
	showPet?: boolean
	showAet?: boolean
	showOceanCurrentOverlay?: boolean
	colorMode: ColorMode
	dangerSubMode: "earthquake" | "volcanic" | "cyclone" | "tornado" | "tidal"
	populationMode: PopulationMapMode
	dataVariant: DataVariant
	selectedTimeMs: number | null
	displayMonth: number
	clockMonthMode: "annual" | "monthly"
	clockMonth: number
	unitSystem: UnitSystem
	world: SerializedGenesisWorld | null
	routes?: SerializedRoutes | null
	hoverCardRef: React.RefObject<HTMLDivElement | null>
	getProvinceName?: (provinceId: number) => string
	getNationName: (nationId: number) => string
	getLeaderName?: (nationId: number, timeMs: number) => string
	getDynastyName?: (dynastyId: number) => string
	getCultureName: (cultureId: number) => string
	getHeritageName: (heritageId: number) => string
	getLandmarkName: (landmarkId: number) => string
	getRiverName: (riverId: number) => string
	hoverNationAdjOffset?: Int32Array | null
	hoverNationAdjList?: Int32Array | null
	hoverNationCounts?: Map<number, number> | null
	relationAt?: ((a: number, b: number) => number) | null
	/** Overrides the Nation/Government/Culture/Religion rows with real
	 * history for the currently-scrubbed date. Resolved by the caller
	 * (GenesisView); undefined when earth-history isn't active
	 * for the hovered province, in which case the usual procedural builders
	 * are used unchanged. */
	earthHistoryHoverOverride?: {
		nationName: string | null
		nationColor: string | null
		governmentLabel: string | null
		governmentColor: string | null
		cultureName: string | null
		cultureColor: string | null
		religionName: string | null
		religionColor: string | null
		/** Real EU4 province name (geo-explorer's political.json), overrides
		 * the generic "Province N" placeholder from procedural naming. */
		provinceName: string | null
		/** EU4 area/region/superregion names (geo-explorer's
		 * area.json/region.json/superregion.json), shown in place of the
		 * procedural landmark/ocean/continent row when hovering an Earth
		 * import in geography map mode. */
		area: string | null
		region: string | null
		superregion: string | null
	}
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
	hoverInfo,
	hoverElevationKm,
	hoverTopography,
	hoverCoordinates,
	hoverTimezone,
	hoverLandmark,
	hoverIsLand,
	hoverTemperatureDelta,
	hoverRealTemperature,
	hoverTemperatureDiff,
	hoverRainfall,
	hoverCloudCover,
	hoverRealRainfall,
	hoverRealCloudCover,
	hoverRainfallDiff,
	hoverDtr,
	hoverRealDtr,
	hoverDtrDiff,
	hoverHumidity,
	hoverRealHumidity,
	hoverHumidityDiff,
	hoverMisery,
	hoverClimateDisplay,
	hoverIceSummary,
	hoverBiome,
	hoverProvince,
	hoverNationId,
	hoverOceanDist,
	hoverDistCoast,
	hoverDistCoastKm,
	hoverHazards,
	hoverRiver,
	hoverTerrainFeature,
	hoverOceanCurrents,
	hoverWindSpeed,
	hoverWindDir,
	hoverWindMonthly,
	showWindArrows = false,
	showRivers = false,
	showGdd = false,
	showGint = false,
	showPet = false,
	showAet = false,
	showOceanCurrentOverlay = false,
	colorMode,
	dangerSubMode,
	populationMode,
	dataVariant,
	displayMonth,
	clockMonthMode,
	clockMonth,
	unitSystem,
	world,
	routes,
	hoverCardRef,
	getNationName,
	getCultureName,
	getHeritageName,
	getLandmarkName,
	getRiverName,
	earthHistoryHoverOverride,
}) => {
	const activeBarIndex =
		clockMonthMode === "monthly" ? clockMonth : displayMonth - 1
	const activePrimary = getMapModePrimary(colorMode)
	const showGeography = activePrimary === "geography"
	const showSociety = activePrimary === "society"
	const hoverRegion = hoverInfo?.region ?? null
	const chartData =
		showGeography && hoverInfo
			? buildHoverChartData(hoverInfo, hoverElevationKm, world)
			: null
	const showObservedPasta = getDataVariant(colorMode) === "observed"
	const activePastaDebug = showObservedPasta
		? world?.realPastaDebug
		: world?.pastaDebug
	const pastaMonthlyData =
		showGeography && hoverInfo
			? buildPastaMonthlyData(hoverInfo, world, showObservedPasta)
			: null
	const landmarkShare =
		hoverLandmark?.size != null && world?.mesh.numRegions
			? (hoverLandmark.size / world.mesh.numRegions) * 100
			: null
	const annualTemp =
		hoverRegion !== null
			? (world?.climate?.temperature_avg?.[hoverRegion] ?? null)
			: null
	const annualPrecip = chartData
		? chartData.precip.reduce((sum, value) => sum + value, 0)
		: null
	const lakeAverageAnnualPrecip = showGeography
		? computeLakeAverageAnnualPrecipitation(hoverLandmark, world)
		: null
	const showPrecipChart =
		!!chartData && (!!chartData.isLand || !!chartData.isLake)
	const activeDtrSeries =
		colorMode === "dtr"
			? hoverDtr
			: colorMode === "realDtr"
				? hoverRealDtr
				: colorMode === "dtrDiff"
					? hoverDtrDiff
					: null
	const climateColor = showGeography
		? buildClimateSwatchColor(hoverRegion, world, colorMode)
		: null
	const vegetationSwatch = showGeography
		? buildVegetationSwatchColor(hoverRegion, world, colorMode)
		: null
	const topographySwatch = showGeography
		? buildTopographySwatchColor(hoverRegion, world)
		: null
	const timezoneSwatch =
		hoverRegion !== null && world
			? rgbToCss(
					(hoverIsLand ?? true)
						? TIMEZONE.timezoneLandColor(
								TIMEZONE.regionTimezoneOffset({ world, region: hoverRegion }),
							)
						: TIMEZONE.timezoneWaterColor(
								TIMEZONE.regionTimezoneOffset({ world, region: hoverRegion }),
							),
				)
			: null
	const terrainFeatureSwatches = showGeography
		? buildTerrainFeatureSwatches(hoverTerrainFeature)
		: []
	const slopeScoreByRegion = world?.slopeScore ?? null
	const hoverSlopePercent =
		showGeography && hoverRegion !== null && slopeScoreByRegion
			? slopeScoreByRegion[hoverRegion] * 100
			: null
	const hoverRouteLabel = showGeography
		? buildHoverRouteLabel(hoverRegion, routes ?? null)
		: null
	const hasCurrentImpact =
		showGeography &&
		dataVariant !== "observed" &&
		hoverOceanCurrents !== null &&
		hoverOceanCurrents.monthlySst.some((value) => Math.abs(value) > 0.01)
	const hasSstAnomaly =
		showGeography &&
		dataVariant === "observed" &&
		hoverOceanCurrents !== null &&
		hoverOceanCurrents.sstAnomalyMonthly !== null
	const { provinceName, provinceNation } = buildProvinceDisplayData({
		hoverProvince,
		hoverNationId,
		world,
	})
	const hoverProvinceDisplayId =
		world?.isEarthImport &&
		hoverProvince !== null &&
		hoverProvince >= 0 &&
		world.provinces?.realIds &&
		hoverProvince < world.provinces.realIds.length
			? world.provinces.realIds[hoverProvince]
			: hoverProvince
	const governmentDisplay = showSociety
		? buildGovernmentDisplayData({ hoverNationId, world })
		: null
	const demographicModes: PopulationMapMode[] = [
		"density",
		"urban",
		"development",
		"culture",
		"religion",
	]
	const hoverTradeGood =
		colorMode === "trade_goods" || showGeography
			? getHoverTradeGood(hoverInfo, world)
			: null
	const demographicDisplays = showSociety
		? demographicModes.flatMap((mode) => {
				const display = buildDemographicDisplayData({
					populationMode: mode,
					colorMode,
					hoverProvince,
					world,
					unitSystem,
					getCultureName,
					getHeritageName,
				})
				return display ? [display] : []
			})
		: []
	const urbanPopulation =
		showSociety &&
		hoverProvince !== null &&
		hoverProvince >= 0 &&
		(populationMode === "urban"
			? world?.realUrbanPopulation?.population
			: world?.urbanPopulation) &&
		world?.provinces &&
		hoverProvince <
			(populationMode === "urban"
				? (world.realUrbanPopulation?.population.length ?? 0)
				: world.urbanPopulation.length) &&
		hoverProvince < world.provinces.desolate.length &&
		!world.provinces.desolate[hoverProvince]
			? Math.round(
					populationMode === "urban"
						? (world.realUrbanPopulation?.population[hoverProvince] ?? 0)
						: (world.urbanPopulation[hoverProvince] ?? 0),
				)
			: null
	const hoverPortLabel = showSociety
		? buildHoverPortLabel(hoverProvince, world, getLandmarkName)
		: null
	const demographicEntries: DemographicEntry[] = [...demographicDisplays]
	if (urbanPopulation !== null && urbanPopulation > 0) {
		demographicEntries.push({
			label: "Urban Pop",
			value: formatCompactNumber(urbanPopulation),
			color: null,
		})
	}
	if (hoverPortLabel) {
		demographicEntries.push({
			label: "Port",
			value: hoverPortLabel,
			color: null,
		})
	}
	const settlementName =
		showSociety && hoverProvince !== null && hoverProvince >= 0
			? (world?.realSettlement?.names[hoverProvince] ?? null)
			: null
	const settlementPopulation =
		world?.realSettlement?.population[hoverProvince ?? -1]
	if (settlementName && settlementPopulation && settlementPopulation > 0) {
		demographicEntries.push({
			label: "Settlement",
			value: `${settlementName} · ${formatCompactNumber(settlementPopulation)}`,
			color: null,
		})
	}
	const demographicEntryMap = new Map(
		demographicEntries.map((entry) => [entry.label, entry] as const),
	)
	// When earth-history is active, it always wins over the procedural
	// Culture/Religion entries computed above (via buildDemographicDisplayData
	// off world.cultures/religions) -- including suppressing them entirely
	// for a province with no real owner/culture/religion data, rather than
	// silently falling back to generation-time procedural values.
	if (earthHistoryHoverOverride) {
		if (earthHistoryHoverOverride.cultureName) {
			demographicEntryMap.set("Culture", {
				label: "Culture",
				value: earthHistoryHoverOverride.cultureName,
				color: earthHistoryHoverOverride.cultureColor,
			})
		} else {
			demographicEntryMap.delete("Culture")
		}
		if (earthHistoryHoverOverride.religionName) {
			demographicEntryMap.set("Religion", {
				label: "Religion",
				value: earthHistoryHoverOverride.religionName,
				color: earthHistoryHoverOverride.religionColor,
			})
		} else {
			demographicEntryMap.delete("Religion")
		}
	}
	const orderedSocietyEntries = [
		demographicEntryMap.get("Culture"),
		demographicEntryMap.get("Religion"),
		demographicEntryMap.get("Development"),
		demographicEntryMap.get("Population") ??
			demographicEntryMap.get("Population (Real)") ??
			demographicEntryMap.get("Population Δ"),
		demographicEntryMap.get("Urban Pop"),
		demographicEntryMap.get("Settlement"),
		demographicEntryMap.get("Port"),
	].filter((entry): entry is DemographicEntry => entry !== undefined)
	return (
		<FloatingPanel
			className="absolute top-3 right-3 z-20 w-64 px-3 py-2"
			padding="sm"
		>
			<div ref={hoverCardRef} className="space-y-0.5">
				{hoverCoordinates && <Row label="Coords" value={hoverCoordinates} />}
				{hoverRegion !== null && (
					<Row label="Region" value={`${hoverRegion}`} />
				)}
				{showGeography && (
					<>
						{world?.isEarthImport && earthHistoryHoverOverride ? (
							<>
								{earthHistoryHoverOverride.superregion && (
									<Row
										label="Superregion"
										value={earthHistoryHoverOverride.superregion}
									/>
								)}
								{earthHistoryHoverOverride.region && (
									<Row
										label="Region"
										value={earthHistoryHoverOverride.region}
									/>
								)}
								{earthHistoryHoverOverride.area && (
									<Row label="Area" value={earthHistoryHoverOverride.area} />
								)}
							</>
						) : (
							hoverLandmark && (
								<Row
									label={
										hoverLandmark.type
											? TEXT.titleCase(hoverLandmark.type)
											: "Landmark"
									}
									value={`${getLandmarkName(hoverLandmark.id)}${landmarkShare !== null ? ` (${landmarkShare.toFixed(1)}%)` : ""}`}
								/>
							)
						)}
						<Row
							label="Elev"
							value={`${formatElevation(hoverElevationKm, unitSystem)}${hoverSlopePercent !== null ? ` (${hoverSlopePercent.toFixed(1)}%)` : ""}`}
						/>
						{hoverRouteLabel && <Row label="Route" value={hoverRouteLabel} />}
						{colorMode === "temperatureDelta" &&
							hoverTemperatureDelta !== null && (
								<Row
									label="Temp Δ"
									value={formatTemperatureDelta(
										hoverTemperatureDelta,
										unitSystem,
									)}
								/>
							)}
						{colorMode === "realTemperature" && hoverRealTemperature && (
							<Row
								label="Observed"
								value={formatTemperature(
									hoverRealTemperature.value,
									unitSystem,
									1,
								)}
							/>
						)}
						{colorMode === "temperatureDiff" && hoverTemperatureDiff && (
							<Row
								label="EBM - Real"
								value={formatTemperatureDelta(
									hoverTemperatureDiff.value,
									unitSystem,
									1,
								)}
							/>
						)}
						{colorMode === "realDtr" && hoverRealDtr && (
							<Row
								label="Observed DTR"
								value={formatTemperatureDelta(
									hoverRealDtr.value,
									unitSystem,
									1,
								)}
							/>
						)}
						{colorMode === "dtrDiff" && hoverDtrDiff && (
							<Row
								label="DTR Diff"
								value={`${hoverDtrDiff.value >= 0 ? "+" : ""}${formatTemperatureDelta(
									hoverDtrDiff.value,
									unitSystem,
									1,
								)}`}
							/>
						)}
						{colorMode === "humidity" && hoverHumidity && (
							<Row
								label="Humidity"
								value={`${hoverHumidity.value.toFixed(0)}%`}
							/>
						)}
						{colorMode === "realHumidity" && hoverRealHumidity && (
							<Row
								label="Observed RH"
								value={`${hoverRealHumidity.value.toFixed(0)}%`}
							/>
						)}
						{colorMode === "humidityDiff" && hoverHumidityDiff && (
							<Row
								label="RH Diff"
								value={`${hoverHumidityDiff.value >= 0 ? "+" : ""}${hoverHumidityDiff.value.toFixed(0)}%`}
							/>
						)}
						{!hoverWindMonthly &&
							hoverWindSpeed !== null &&
							hoverWindDir !== null && (
								<Row
									label="Wind"
									value={`${hoverWindDir} ${unitSystem === "imperial" ? `${(hoverWindSpeed * 2.237).toFixed(1)} mph` : `${hoverWindSpeed.toFixed(1)} m/s`}`}
								/>
							)}
						{colorMode === "pastaClimate" && hoverIceSummary && (
							<Row label="Ice" value={hoverIceSummary} />
						)}
						{colorMode === "terrainFeatures" &&
							terrainFeatureSwatches.length > 0 && (
								<MultiSwatchRow
									label="Features"
									values={terrainFeatureSwatches}
								/>
							)}
						{colorMode === "dangerZones" &&
							hoverHazards &&
							(() => {
								if (dangerSubMode === "cyclone") {
									return (
										<SwatchRow
											label="Cyclone"
											value={`${Math.round(hoverHazards.cyclone * 100)}%`}
											color={rgbToCss(cycloneLandColor(hoverHazards.cyclone))}
										/>
									)
								}
								if (dangerSubMode === "tornado") {
									return (
										<SwatchRow
											label="Tornado"
											value={`${Math.round(hoverHazards.tornado * 100)}%`}
											color={rgbToCss(tornadoLandColor(hoverHazards.tornado))}
										/>
									)
								}
								if (dangerSubMode === "tidal") {
									const tidalM = hoverHazards.tidal
									const tidalDisplay =
										unitSystem === "imperial"
											? `${(tidalM * 3.28084).toFixed(1)} ft`
											: `${tidalM.toFixed(1)} m`
									const swatchRgb = tidalTierColor(tidalM)
									return (
										<SwatchRow
											label="Tidal Range"
											value={tidalDisplay}
											color={rgbToCss(swatchRgb)}
										/>
									)
								}
								if (dangerSubMode === "volcanic") {
									return (
										<SwatchRow
											label="Volcanic"
											value={`${Math.round(hoverHazards.volcano * 100)}%`}
											color={rgbToCss(volcanicLandColor(hoverHazards.volcano))}
										/>
									)
								}
								if (dangerSubMode === "earthquake") {
									return (
										<SwatchRow
											label="Earthquake"
											value={`${Math.round(hoverHazards.earthquake * 100)}%`}
											color={rgbToCss(dangerColor(hoverHazards.danger))}
										/>
									)
								}
								// Show the combined danger score for the default case
								return (
									<SwatchRow
										label="Danger"
										value={`${Math.round(hoverHazards.danger * 100)}%`}
										color={rgbToCss(dangerColor(hoverHazards.danger))}
									/>
								)
							})()}
						{hoverTopography && (
							<SwatchRow
								label="Topography"
								value={hoverTopography}
								color={topographySwatch}
							/>
						)}
						{hoverClimateDisplay && (
							<SwatchRow
								label="Climate"
								value={hoverClimateDisplay}
								color={climateColor}
							/>
						)}
						{hoverBiome && (
							<SwatchRow
								label="Veg"
								value={hoverBiome}
								color={vegetationSwatch}
							/>
						)}
						{lakeAverageAnnualPrecip !== null && (
							<Row
								label="Lake Avg Rain"
								value={formatPrecipitation(
									lakeAverageAnnualPrecip,
									unitSystem,
									0,
								)}
							/>
						)}
						{colorMode === "precipitation" && hoverRainfall !== null && (
							<Row
								label="Rain"
								value={formatPrecipitation(hoverRainfall, unitSystem, 0)}
							/>
						)}
						{colorMode === "moisture" &&
							hoverRegion !== null &&
							world?.rainfall && (
								<>
									<Row
										label="East Moisture"
										value={`${(world.rainfall.east[hoverRegion] * 100).toFixed(0)}%`}
									/>
									<Row
										label="West Moisture"
										value={`${(world.rainfall.west[hoverRegion] * 100).toFixed(0)}%`}
									/>
								</>
							)}
						{colorMode === "cloudCover" && hoverCloudCover && (
							<Row
								label="Cloud Cover"
								value={`${(hoverCloudCover.value * 100).toFixed(0)}%`}
							/>
						)}
						{colorMode === "realPrecipitation" && hoverRealRainfall && (
							<Row
								label="Observed Rain"
								value={formatPrecipitation(
									hoverRealRainfall.value,
									unitSystem,
									0,
								)}
							/>
						)}
						{colorMode === "realCloudCover" && hoverRealCloudCover && (
							<Row
								label="Observed Clouds"
								value={`${(hoverRealCloudCover.value * 100).toFixed(0)}%`}
							/>
						)}
						{colorMode === "precipitationDiff" && hoverRainfallDiff && (
							<Row
								label="Rain Diff"
								value={`${hoverRainfallDiff.value >= 0 ? "+" : ""}${formatPrecipitation(
									hoverRainfallDiff.value,
									unitSystem,
									0,
								)}`}
							/>
						)}
						{hoverTradeGood && (
							<SwatchRow
								label="Trade Good"
								value={hoverTradeGood.name}
								color={buildTradeGoodSwatchColor(hoverTradeGood.materialIndex)}
							/>
						)}
						{hoverOceanDist !== null && hoverOceanDist > 0 && (
							<Row
								label="Ocean dist"
								value={formatDistance(hoverOceanDist, unitSystem)}
							/>
						)}
						{hoverDistCoast !== null && (
							<Row
								label="Coast dist"
								value={
									hoverDistCoastKm === Infinity
										? "∞"
										: hoverDistCoastKm !== null
											? formatDistance(hoverDistCoastKm, unitSystem)
											: "—"
								}
							/>
						)}
					</>
				)}
				{showSociety && hoverTimezone && (
					<SwatchRow
						label="Timezone"
						value={hoverTimezone}
						color={timezoneSwatch}
					/>
				)}
				{showSociety && hoverProvince !== null && hoverProvince >= 0 && (
					<>
						{(earthHistoryHoverOverride?.provinceName ?? provinceName) && (
							<SwatchRow
								label="Province"
								value={`#${hoverProvinceDisplayId} ${earthHistoryHoverOverride?.provinceName ?? provinceName ?? ""}`}
								color={null}
							/>
						)}
						{earthHistoryHoverOverride
							? earthHistoryHoverOverride.nationName && (
									<SwatchRow
										label="Nation"
										value={earthHistoryHoverOverride.nationName}
										color={earthHistoryHoverOverride.nationColor}
									/>
								)
							: provinceNation && (
									<SwatchRow
										label="Nation"
										value={getNationName(provinceNation.id)}
										color={provinceNation.color}
									/>
								)}
						{earthHistoryHoverOverride
							? earthHistoryHoverOverride.governmentLabel && (
									<SwatchRow
										label="Government"
										value={earthHistoryHoverOverride.governmentLabel}
										color={earthHistoryHoverOverride.governmentColor}
									/>
								)
							: provinceNation &&
								governmentDisplay && (
									<SwatchRow
										label="Government"
										value={governmentDisplay.label}
										color={governmentDisplay.color}
									/>
								)}
					</>
				)}
				{showSociety && (
					<>
						{orderedSocietyEntries.map((item) =>
							item.color ? (
								<SwatchRow
									key={item.label}
									label={item.label}
									value={item.value}
									color={item.color}
								/>
							) : (
								<Row key={item.label} label={item.label} value={item.value} />
							),
						)}
					</>
				)}
				{showGeography && chartData && world?.climate && (
					<div className="space-y-2 border-t border-white/5 pt-1">
						<SeriesBars
							values={chartData.daylight}
							labels={MONTH_SHORT}
							label="Daylight"
							colorForValue={(value) => rgbToCss(daylightColor(value))}
							activeIndex={activeBarIndex}
							summary={buildSummary(
								chartData.daylight.reduce((sum, value) => sum + value, 0) /
									chartData.daylight.length,
								{
									prefix: "AVG",
									unit: "h",
									formatValue: (value) => value.toFixed(1),
								},
							)}
							formatValue={(value) => value.toFixed(0)}
							tooltipLabel={({ index, value }) =>
								`${monthLabels[index + 1]}: ${value.toFixed(0)} h`
							}
							showValues
						/>
						{activeDtrSeries &&
						(colorMode === "dtr" ||
							colorMode === "realDtr" ||
							colorMode === "dtrDiff") &&
						activeDtrSeries.monthly.length === 12 ? (
							<SeriesBars
								values={activeDtrSeries.monthly}
								labels={MONTH_SHORT}
								label={
									colorMode === "realDtr"
										? "Observed DTR"
										: colorMode === "dtrDiff"
											? "DTR Diff"
											: "DTR"
								}
								colorForValue={(value) =>
									colorMode === "dtrDiff"
										? currentImpactColor(value)
										: dtrChartColor(value)
								}
								activeIndex={activeBarIndex}
								summary={buildSummary(activeDtrSeries.annual, {
									prefix: "AVG",
									formatValue: (value) =>
										`${colorMode === "dtrDiff" && value >= 0 ? "+" : ""}${formatTemperatureDelta(value, unitSystem, 1)}`,
								})}
								formatValue={(value) => {
									const formatted = formatTemperatureDelta(
										value,
										unitSystem,
										1,
									).replace(/ ?°[CF]$/, "")
									return colorMode === "dtrDiff" && value >= 0
										? `+${formatted}`
										: formatted
								}}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${value >= 0 && colorMode === "dtrDiff" ? "+" : ""}${formatTemperatureDelta(value, unitSystem, 1)}`
								}
								showValues
							/>
						) : (colorMode === "misery" || colorMode === "realMisery") &&
							hoverMisery &&
							hoverMisery.monthly.length === 12 ? (
							<SeriesBars
								values={hoverMisery.monthly}
								labels={MONTH_SHORT}
								label={colorMode === "realMisery" ? "Observed MI" : "MI"}
								colorForValue={(value) => miseryChartColor(value)}
								activeIndex={activeBarIndex}
								summary={buildSummary(hoverMisery.annual, {
									prefix: "AVG",
									formatValue: (value) =>
										formatTemperature(value, unitSystem, 1),
								})}
								formatValue={(value) =>
									formatTemperature(value, unitSystem, 1).replace(
										/ ?°[CF]$/,
										"",
									)
								}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${formatTemperature(value, unitSystem, 1)}`
								}
								showValues
							/>
						) : colorMode === "cloudCover" &&
							hoverCloudCover &&
							hoverCloudCover.monthly.length === 12 ? (
							<SeriesBars
								values={hoverCloudCover.monthly}
								labels={MONTH_SHORT}
								label="Cloud Cover"
								colorForValue={(value) => rgbToCss(cloudCoverColor(value))}
								activeIndex={activeBarIndex}
								summary={buildSummary(hoverCloudCover.annual, {
									prefix: "AVG",
									formatValue: (value) => `${(value * 100).toFixed(0)}%`,
								})}
								formatValue={(value) => `${(value * 100).toFixed(0)}`}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${(value * 100).toFixed(0)}%`
								}
								showValues
							/>
						) : colorMode === "realCloudCover" &&
							hoverRealCloudCover &&
							hoverRealCloudCover.monthly.length === 12 ? (
							<SeriesBars
								values={hoverRealCloudCover.monthly}
								labels={MONTH_SHORT}
								label="Observed Cloud"
								colorForValue={(value) => rgbToCss(cloudCoverColor(value))}
								activeIndex={activeBarIndex}
								summary={buildSummary(hoverRealCloudCover.annual, {
									prefix: "AVG",
									formatValue: (value) => `${(value * 100).toFixed(0)}%`,
								})}
								formatValue={(value) => `${(value * 100).toFixed(0)}`}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${(value * 100).toFixed(0)}%`
								}
								showValues
							/>
						) : dataVariant === "observed" &&
							hoverRealTemperature &&
							hoverRealTemperature.monthly.length === 12 ? (
							<SeriesBars
								values={chartData.realTemps}
								labels={MONTH_SHORT}
								label="Observed Temp"
								colorForValue={(value) => tempColor(value)}
								activeIndex={activeBarIndex}
								summary={buildSummary(hoverRealTemperature.annual, {
									prefix: "AVG",
									formatValue: (value) =>
										formatTemperature(value, unitSystem, 1),
								})}
								formatValue={(value) =>
									formatTemperature(value, unitSystem, 1).replace(
										/ ?°[CF]$/,
										"",
									)
								}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${formatTemperature(value, unitSystem, 1)}`
								}
								showValues
							/>
						) : colorMode === "temperatureDiff" &&
							hoverTemperatureDiff &&
							hoverTemperatureDiff.monthly.length === 12 ? (
							<SeriesBars
								values={chartData.tempDiffs}
								labels={MONTH_SHORT}
								label="EBM - Real"
								colorForValue={(value) =>
									value >= 0 ? "rgb(220, 90, 56)" : "rgb(64, 126, 220)"
								}
								activeIndex={activeBarIndex}
								summary={buildSummary(hoverTemperatureDiff.annual, {
									prefix: "AVG",
									formatValue: (value) =>
										formatTemperatureDelta(value, unitSystem, 1),
								})}
								formatValue={(value) =>
									formatTemperatureDelta(value, unitSystem, 1).replace(
										/ ?°[CF]$/,
										"",
									)
								}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${formatTemperatureDelta(value, unitSystem, 1)}`
								}
								showValues
							/>
						) : (
							<SeriesBars
								values={chartData.temps}
								labels={MONTH_SHORT}
								label="Temp"
								colorForValue={(value) => tempColor(value)}
								activeIndex={activeBarIndex}
								summary={buildSummary(annualTemp ?? undefined, {
									prefix: "AVG",
									formatValue: (value) =>
										formatTemperature(value, unitSystem, 1),
								})}
								formatValue={(value) =>
									formatTemperature(value, unitSystem, 1).replace(
										/ ?°[CF]$/,
										"",
									)
								}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${formatTemperature(value, unitSystem, 1)}`
								}
								showValues
							/>
						)}
						{hoverRegion !== null &&
							activePastaDebug?.minT &&
							activePastaDebug?.maxT && (
								<div className="flex justify-between font-mono text-[9px] text-slate-400">
									<span>
										MIN{" "}
										<span className="text-slate-200">
											{formatTemperature(
												activePastaDebug.minT[hoverRegion],
												unitSystem,
											)}
										</span>
									</span>
									<span>
										MAX{" "}
										<span className="text-slate-200">
											{formatTemperature(
												activePastaDebug.maxT[hoverRegion],
												unitSystem,
											)}
										</span>
									</span>
								</div>
							)}
						{(colorMode === "humidity" ||
							colorMode === "realHumidity" ||
							colorMode === "humidityDiff") &&
						(colorMode === "humidity"
							? hoverHumidity
							: colorMode === "realHumidity"
								? hoverRealHumidity
								: hoverHumidityDiff
						)?.monthly.length === 12 ? (
							<SeriesBars
								values={
									(colorMode === "humidity"
										? hoverHumidity
										: colorMode === "realHumidity"
											? hoverRealHumidity
											: hoverHumidityDiff
									)?.monthly ?? []
								}
								labels={MONTH_SHORT}
								label={
									colorMode === "realHumidity"
										? "Observed RH"
										: colorMode === "humidityDiff"
											? "RH Diff"
											: "Humidity"
								}
								colorForValue={(value) =>
									colorMode === "humidityDiff"
										? currentImpactColor(value)
										: humidityChartColor(value)
								}
								activeIndex={activeBarIndex}
								summary={buildSummary(
									(colorMode === "humidity"
										? hoverHumidity
										: colorMode === "realHumidity"
											? hoverRealHumidity
											: hoverHumidityDiff
									)?.annual,
									{
										prefix: "AVG",
										formatValue: (value) =>
											`${colorMode === "humidityDiff" && value >= 0 ? "+" : ""}${value.toFixed(0)}%`,
									},
								)}
								formatValue={(value) =>
									`${colorMode === "humidityDiff" && value >= 0 ? "+" : ""}${value.toFixed(0)}`
								}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${colorMode === "humidityDiff" && value >= 0 ? "+" : ""}${value.toFixed(0)}%`
								}
								showValues
							/>
						) : dataVariant === "observed" &&
							hoverRealRainfall &&
							hoverRealRainfall.monthly.length === 12 ? (
							<SeriesBars
								values={hoverRealRainfall.monthly}
								labels={MONTH_SHORT}
								label="Observed Rain"
								colorForValue={(value) => rainColor(value)}
								activeIndex={activeBarIndex}
								summary={buildSummary(hoverRealRainfall.annual, {
									prefix: "ANN",
									formatValue: (value) =>
										formatPrecipitation(value, unitSystem, 0),
								})}
								formatValue={(value) =>
									formatPrecipitation(value, unitSystem, 0).replace(
										/ (mm|in)$/,
										"",
									)
								}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${formatPrecipitation(value, unitSystem, 0)}`
								}
								showValues
							/>
						) : colorMode === "precipitationDiff" &&
							hoverRainfallDiff &&
							hoverRainfallDiff.monthly.length === 12 ? (
							<SeriesBars
								values={hoverRainfallDiff.monthly}
								labels={MONTH_SHORT}
								label="Rain Diff"
								colorForValue={(value) =>
									value >= 0 ? "rgb(66, 148, 170)" : "rgb(196, 116, 46)"
								}
								activeIndex={activeBarIndex}
								summary={buildSummary(hoverRainfallDiff.annual, {
									prefix: "ANN",
									formatValue: (value) =>
										`${value >= 0 ? "+" : ""}${formatPrecipitation(value, unitSystem, 0)}`,
								})}
								formatValue={(value) =>
									`${value >= 0 ? "+" : ""}${formatPrecipitation(
										value,
										unitSystem,
										0,
									).replace(/ (mm|in)$/, "")}`
								}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${value >= 0 ? "+" : ""}${formatPrecipitation(value, unitSystem, 0)}`
								}
								showValues
							/>
						) : (
							showPrecipChart && (
								<SeriesBars
									values={chartData.precip}
									labels={MONTH_SHORT}
									label="Precip"
									colorForValue={(value) => rainColor(value)}
									activeIndex={activeBarIndex}
									summary={buildSummary(annualPrecip ?? undefined, {
										prefix: "ANN",
										formatValue: (value) =>
											formatPrecipitation(value, unitSystem, 0),
									})}
									formatValue={(value) =>
										formatPrecipitation(value, unitSystem, 0).replace(
											/ (mm|in)$/,
											"",
										)
									}
									tooltipLabel={({ index, value }) =>
										`${monthLabels[index + 1]}: ${formatPrecipitation(value, unitSystem, 0)}`
									}
									showValues
								/>
							)
						)}
						{showPet && !!chartData?.isLand && (
							<SeriesBars
								values={chartData.pet}
								labels={MONTH_SHORT}
								label="PET"
								colorForValue={(value) => petColor(value)}
								activeIndex={activeBarIndex}
								summary={buildSummary(
									chartData.pet.reduce((sum, value) => sum + value, 0),
									{
										prefix: "ANN",
										formatValue: (value) =>
											formatPrecipitation(value, unitSystem, 0),
									},
								)}
								formatValue={(value) =>
									formatPrecipitation(value, unitSystem, 0).replace(
										/ (mm|in)$/,
										"",
									)
								}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${formatPrecipitation(value, unitSystem, 0)}`
								}
								showValues
							/>
						)}
						{showAet &&
							!!chartData?.isLand &&
							chartData.aet.some((v) => v > 0) && (
								<SeriesBars
									values={chartData.aet}
									labels={MONTH_SHORT}
									label="AET"
									colorForValue={(value) => aetColor(value)}
									activeIndex={activeBarIndex}
									summary={buildSummary(
										chartData.aet.reduce((sum, value) => sum + value, 0),
										{
											prefix: "ANN",
											formatValue: (value) =>
												formatPrecipitation(value, unitSystem, 0),
										},
									)}
									formatValue={(value) =>
										formatPrecipitation(value, unitSystem, 0).replace(
											/ (mm|in)$/,
											"",
										)
									}
									tooltipLabel={({ index, value }) =>
										`${monthLabels[index + 1]}: ${formatPrecipitation(value, unitSystem, 0)}`
									}
									showValues
								/>
							)}
						{showGdd &&
							pastaMonthlyData &&
							!!chartData?.isLand &&
							(() => {
								const rawGdd = activePastaDebug?.gdd[hoverRegion] ?? undefined
								const isInfGdd = rawGdd !== undefined && rawGdd >= 99999
								return (
									<SeriesBars
										values={pastaMonthlyData.gdd}
										labels={MONTH_SHORT}
										label="GDD"
										colorForValue={(value) => gddColor(value)}
										activeIndex={activeBarIndex}
										summary={buildSummary(rawGdd, {
											prefix: isInfGdd ? "" : "ANN",
											formatValue: (value) =>
												value >= 99999 ? "∞" : value.toFixed(0),
										})}
										formatValue={(value) =>
											value >= 99999 ? "∞" : value.toFixed(0)
										}
										tooltipLabel={({ index, value }) =>
											`${monthLabels[index + 1]}: ${value >= 99999 ? "∞" : value.toFixed(0)}`
										}
										showValues
									/>
								)
							})()}
						{showGint && pastaMonthlyData && !!chartData?.isLand && (
							<SeriesBars
								values={pastaMonthlyData.gint}
								labels={MONTH_SHORT}
								label="GInt"
								colorForValue={(value) => gintColor(value)}
								activeIndex={activeBarIndex}
								summary={buildSummary(
									activePastaDebug?.gint[hoverRegion] !== undefined
										? activePastaDebug.gint[hoverRegion] >= 99999
											? 12
											: activePastaDebug.gint[hoverRegion]
										: undefined,
									{
										prefix: "ANN",
										formatValue: (value) => value.toFixed(0),
									},
								)}
								formatValue={(value) => value.toFixed(0)}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${value.toFixed(0)}`
								}
								showValues
							/>
						)}
						{(colorMode === "oceanCurrents" || showOceanCurrentOverlay) &&
							hasCurrentImpact &&
							hoverOceanCurrents !== null && (
								<div className="space-y-1 border-t border-white/5 pt-1">
									<SeriesBars
										values={hoverOceanCurrents.monthlySst}
										labels={MONTH_SHORT}
										label="Modeled SST Anomaly"
										colorForValue={(value) => currentImpactColor(value)}
										activeIndex={activeBarIndex}
										formatValue={(value) =>
											`${value >= 0 ? "+" : ""}${formatTemperatureDelta(value, unitSystem, 1).replace(/ ?°[CF]$/, "")}`
										}
										summary={buildSummary(hoverOceanCurrents.sst, {
											prefix: "avg",
											formatValue: (value) =>
												`${value >= 0 ? "+" : ""}${formatTemperatureDelta(value, unitSystem, 1)}`,
										})}
										tooltipLabel={({ index, value }) =>
											`${monthLabels[index + 1]}: ${value >= 0 ? "+" : ""}${formatTemperatureDelta(value, unitSystem, 1)}`
										}
										showValues
									/>
								</div>
							)}
						{(colorMode === "oceanCurrents" || showOceanCurrentOverlay) &&
							hasSstAnomaly &&
							hoverOceanCurrents !== null &&
							hoverOceanCurrents.sstAnomalyMonthly !== null && (
								<div className="space-y-1 border-t border-white/5 pt-1">
									<SeriesBars
										values={hoverOceanCurrents.sstAnomalyMonthly}
										labels={MONTH_SHORT}
										label="Observed SST Anomaly"
										colorForValue={(value) => currentImpactColor(value)}
										activeIndex={activeBarIndex}
										formatValue={(value) =>
											`${value >= 0 ? "+" : ""}${formatTemperatureDelta(value, unitSystem, 1).replace(/ ?°[CF]$/, "")}`
										}
										summary={buildSummary(
											hoverOceanCurrents.sstAnomalyAverage ?? undefined,
											{
												prefix: "avg",
												formatValue: (value) =>
													`${value >= 0 ? "+" : ""}${formatTemperatureDelta(value, unitSystem, 1)}`,
											},
										)}
										tooltipLabel={({ index, value }) =>
											`${monthLabels[index + 1]}: ${value >= 0 ? "+" : ""}${formatTemperatureDelta(value, unitSystem, 1)}`
										}
										showValues
									/>
								</div>
							)}
						{showRivers &&
							hoverRiver &&
							hoverRiver.flow_monthly.length === 12 && (
								<SeriesBars
									values={hoverRiver.flow_monthly}
									labels={MONTH_SHORT}
									label={
										hoverRiver.riverId >= 0
											? `${getRiverName(hoverRiver.riverId)} River`
											: `River #${hoverRiver.riverId}`
									}
									colorForValue={(value) => flowColor(value)}
									activeIndex={activeBarIndex}
									summary={buildSummary(hoverRiver.flow, {
										formatValue: (value) =>
											formatFlowRate(value, unitSystem, formatCompactNumber),
									})}
									formatValue={(value) =>
										formatFlowRate(
											value,
											unitSystem,
											formatCompactNumber,
										).replace(/ (m³\/s|ft³\/s)$/, "")
									}
									tooltipLabel={({ index, value }) =>
										`${monthLabels[index + 1]}: ${formatFlowRate(value, unitSystem, formatCompactNumber)}`
									}
									showValues
								/>
							)}
						{showRivers && hoverRiver && hoverRiver.lengthKm > 0 && (
							<div className="-mt-1 font-mono text-[9px] text-slate-500">
								Length {formatDistance(hoverRiver.lengthKm, unitSystem)}
							</div>
						)}
						{showWindArrows &&
							hoverWindMonthly &&
							(() => {
								const speedFmt = (v: number) =>
									unitSystem === "imperial"
										? `${(v * 2.237).toFixed(0)}`
										: `${v.toFixed(0)}`
								return (
									<SeriesBars
										values={hoverWindMonthly.map((m) => m.speedMs)}
										labels={hoverWindMonthly.map((m) => m.dir)}
										subLabels={MONTH_SHORT}
										label="Wind"
										colorForValue={(value) => windSpeedColorCss(value)}
										activeIndex={activeBarIndex}
										summary={buildSummary(
											hoverWindMonthly.reduce((sum, m) => sum + m.speedMs, 0) /
												hoverWindMonthly.length,
											{
												prefix: "AVG",
												unit: unitSystem === "imperial" ? "mph" : "m/s",
												formatValue: (value) =>
													unitSystem === "imperial"
														? (value * 2.237).toFixed(1)
														: value.toFixed(1),
											},
										)}
										formatValue={speedFmt}
										tooltipLabel={({ label, value, index }) =>
											`${monthLabels[index + 1]}: ${value.toFixed(1)} m/s from ${label}`
										}
										showValues
									/>
								)
							})()}
					</div>
				)}
			</div>
		</FloatingPanel>
	)
}
