import React from "react"
import { titleCase } from "@/model/shared/text"
import { LANDMARK_TYPES } from "@/model/terrain/landmarks"
import {
	forEachRoute,
	ROUTE_LAND_MAJOR,
	ROUTE_LAND_MINOR,
	ROUTE_SEA,
	type SerializedOrogenWorld,
	type SerializedRoutes,
} from "@/model/transport/worker-types"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { SeriesBars } from "@/ui/components/primitives/charts/SeriesBars"
import { LabeledValueRow } from "@/ui/components/primitives/LabeledValueRow"
import { Swatch } from "@/ui/components/primitives/Swatch"
import {
	type ColorMode,
	cycloneLandColor,
	dangerColor,
	daylightColor,
	tidalTierColor,
	tornadoLandColor,
	volcanicLandColor,
	windSpeedColor,
} from "../colors"
import { monthLabels } from "../screen/shared/constants"
import {
	getMapModePrimary,
	type PopulationMapMode,
} from "../screen/shared/map-modes"
import {
	formatDistance,
	formatElevation,
	formatFlowRate,
	formatPrecipitation,
	formatTemperature,
	formatTemperatureDelta,
	rgbToCss,
	type UnitSystem,
} from "../screen/shared/ui-format"
import type {
	HoverDtr,
	HoverHazards,
	HoverHotspot,
	HoverHumidity,
	HoverInfo,
	HoverLandmark,
	HoverMisery,
	HoverOceanCurrents,
	HoverRiver,
	HoverTerrainFeature,
} from "./hover"
import { getHoverTradeGood } from "./hover"
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
} from "./info-panel-format"
import {
	buildClimateSwatchColor,
	buildDemographicDisplayData,
	buildGovernmentDisplayData,
	buildHoverChartData,
	buildHoverNationRelationDistribution,
	buildPastaMonthlyData,
	buildPoliticalDisplayData,
	buildProvinceDisplayData,
	buildTerrainFeatureSwatches,
	buildTopographySwatchColor,
	buildTradeGoodSwatchColor,
	buildVegetationSwatchColor,
} from "./info-panel-model"

const MONTH_SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

function buildSummary(
	value: number | undefined,
	options: {
		prefix?: string
		unit?: string
		formatValue?: (value: number) => string
	},
): string | undefined {
	if (value === undefined) return undefined

	const prefix = options.prefix?.trim()
	const formatted = options.formatValue
		? options.formatValue(value)
		: `${value}`
	const unit = options.unit?.trim()

	return [prefix, formatted, unit].filter(Boolean).join(" ")
}

function computeLakeAverageAnnualPrecipitation(
	hoverLandmark: HoverLandmark | null,
	world: SerializedOrogenWorld | null,
): number | null {
	if (
		hoverLandmark?.type !== "lake" ||
		!world?.rainfall?.annual ||
		!world.landmarks?.regionLandmark
	) {
		return null
	}

	let sum = 0
	let count = 0
	for (let region = 0; region < world.mesh.numRegions; region++) {
		if (world.landmarks.regionLandmark[region] !== hoverLandmark.id) continue
		sum += world.rainfall.annual[region] ?? 0
		count++
	}

	return count > 0 ? sum / count : null
}

function Row({ label, value }: { label: string; value: string }) {
	return <LabeledValueRow label={label} value={value} tone="overlay" />
}

function buildHoverRouteLabel(
	hoverRegion: number | null,
	routes: SerializedRoutes | null,
): string | null {
	if (hoverRegion === null || !routes) return null
	let hasImperialRoute = false
	let hasMinorRoute = false
	let hasSeaRoute = false
	forEachRoute(routes, (route) => {
		if (!route.pathRegions.includes(hoverRegion)) return
		if (route.kind === ROUTE_SEA) {
			hasSeaRoute = true
		} else if (route.kind === ROUTE_LAND_MAJOR) {
			hasImperialRoute = true
		} else if (route.kind === ROUTE_LAND_MINOR) {
			hasMinorRoute = true
		}
	})
	const labels: string[] = []
	if (hasImperialRoute) labels.push("Major")
	if (hasMinorRoute) labels.push("Minor")
	if (hasSeaRoute) labels.push("Sea")
	return labels.length > 0 ? labels.join(" / ") : null
}

function buildHoverPortLabel(
	hoverProvince: number | null,
	world: SerializedOrogenWorld | null,
	getLandmarkName: (landmarkId: number) => string,
): string | null {
	if (
		hoverProvince === null ||
		hoverProvince < 0 ||
		!world?.settlementWaterLandmarks ||
		hoverProvince >= world.settlementWaterLandmarks.length
	) {
		return null
	}
	const landmarkId = world.settlementWaterLandmarks[hoverProvince]
	if (landmarkId < 0) return null
	const landmarkTypeCode = world.landmarks?.type?.[landmarkId]
	const landmarkType =
		typeof landmarkTypeCode === "number"
			? titleCase(LANDMARK_TYPES[landmarkTypeCode] ?? "water body")
			: "Water Body"
	return `${getLandmarkName(landmarkId)} (${landmarkType})`
}

function SwatchRow({
	label,
	value,
	color,
	striped = false,
	stripeBackground = "rgba(15, 23, 42, 0.85)",
}: {
	label: string
	value: string
	color: string | null
	striped?: boolean
	stripeBackground?: string
}) {
	return (
		<LabeledValueRow
			label={label}
			tone="overlay"
			value={
				<span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-100">
					<Swatch
						color={color}
						striped={striped}
						stripeBackground={stripeBackground}
						className="border-white/15"
					/>
					<span>{value}</span>
				</span>
			}
		/>
	)
}

function MultiSwatchRow({
	label,
	values,
}: {
	label: string
	values: Array<{ label: string; color: string | null }>
}) {
	return (
		<LabeledValueRow
			label={label}
			tone="overlay"
			value={
				<span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 font-mono text-[10px] text-slate-100">
					{values.map((value, index) => (
						<React.Fragment key={`${value.label}-${index}`}>
							<span className="inline-flex items-center gap-1.5">
								<Swatch color={value.color} className="border-white/15" />
								<span>{value.label}</span>
							</span>
							{index < values.length - 1 && (
								<span className="text-slate-500">,</span>
							)}
						</React.Fragment>
					))}
				</span>
			}
		/>
	)
}

interface DemographicEntry {
	label: string
	value: string
	color: string | null
}

function windSpeedColorCss(speed: number): string {
	const [r, g, b] = windSpeedColor(speed)
	return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
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
	hoverRainfall: number | null
	hoverDtr: HoverDtr | null
	hoverHumidity: HoverHumidity | null
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
	selectedTimeMs: number | null
	displayMonth: number
	climateTimeMode: "current" | "annual" | "monthly"
	climateMonth: number
	unitSystem: UnitSystem
	world: SerializedOrogenWorld | null
	routes?: SerializedRoutes | null
	hoverCardRef: React.RefObject<HTMLDivElement | null>
	getProvinceName?: (provinceId: number) => string
	getNationName: (nationId: number) => string
	getLeaderName?: (nationId: number, timeMs: number) => string
	getDynastyName?: (dynastyId: number) => string
	getCultureName: (cultureId: number) => string
	getHeritageName: (heritageId: number) => string
	getFaithName: (faithId: number) => string
	getReligionName: (religionId: number) => string
	getLandmarkName: (landmarkId: number) => string
	getRiverName: (riverId: number) => string
	hoverNationAdjOffset?: Int32Array | null
	hoverNationAdjList?: Int32Array | null
	hoverNationCounts?: Map<number, number> | null
	relationAt?: ((a: number, b: number) => number) | null
	detailsDrawerOpen?: boolean
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
	hoverInfo,
	hoverElevationKm,
	hoverTopography,
	hoverCoordinates,
	hoverTimezone,
	hoverLandmark,
	hoverTemperatureDelta,
	hoverDtr,
	hoverHumidity,
	hoverMisery,
	hoverClimateDisplay,
	hoverIceSummary,
	hoverBiome,
	hoverProvince,
	hoverNationId,
	hoverOccupation,
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
	selectedTimeMs,
	displayMonth,
	climateTimeMode,
	climateMonth,
	unitSystem,
	world,
	routes,
	hoverCardRef,
	getProvinceName,
	getNationName,
	getLeaderName,
	getDynastyName,
	getCultureName,
	getHeritageName,
	getFaithName,
	getReligionName,
	getLandmarkName,
	getRiverName,
	hoverNationAdjOffset,
	hoverNationAdjList,
	hoverNationCounts,
	relationAt,
	detailsDrawerOpen,
}) => {
	const activeBarIndex =
		climateTimeMode === "monthly" ? climateMonth : displayMonth - 1
	const activePrimary = getMapModePrimary(colorMode)
	const showGeography = activePrimary === "geography"
	const showPolitical = activePrimary === "political"
	const showDemographics = activePrimary === "demographics"
	const hoverRegion = hoverInfo?.region ?? null
	const hoverNationRelationDistribution = showPolitical
		? buildHoverNationRelationDistribution({
				hoverNationId,
				adjOffset: hoverNationAdjOffset ?? null,
				adjList: hoverNationAdjList ?? null,
				nationCounts: hoverNationCounts ?? new Map(),
				relationAt: relationAt ?? null,
			})
		: []
	const chartData =
		showGeography && hoverInfo
			? buildHoverChartData(hoverInfo, hoverElevationKm, world)
			: null
	const pastaMonthlyData =
		showGeography && hoverInfo ? buildPastaMonthlyData(hoverInfo, world) : null
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
	const climateColor = showGeography
		? buildClimateSwatchColor(hoverRegion, world, colorMode)
		: null
	const vegetationSwatch = showGeography
		? buildVegetationSwatchColor(hoverRegion, world)
		: null
	const topographySwatch = showGeography
		? buildTopographySwatchColor(hoverRegion, world)
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
		hoverOceanCurrents !== null &&
		hoverOceanCurrents.monthlyDelta.some((value) => Math.abs(value) > 0.01)
	const { provinceColor, provinceNation } = buildProvinceDisplayData({
		hoverProvince,
		hoverNationId,
		world,
	})
	const { dynasty: provinceDynasty, ruler: provinceRuler } =
		buildPoliticalDisplayData({
			hoverNationId,
			selectedTimeMs,
			world,
			getLeaderName,
			getDynastyName,
		})
	const governmentDisplay = showPolitical
		? buildGovernmentDisplayData({ hoverNationId, world })
		: null
	const demographicModes: PopulationMapMode[] = [
		populationMode,
		...(
			[
				"density",
				"development",
				"migration",
				"culture",
				"heritage",
				"faith",
				"religion",
			] as const
		).filter((mode) => mode !== populationMode),
	]
	const hoverTradeGood =
		colorMode === "trade_goods" || showGeography
			? getHoverTradeGood(hoverInfo, world)
			: null
	const demographicDisplays = showDemographics
		? demographicModes.flatMap((mode) => {
				const display = buildDemographicDisplayData({
					populationMode: mode,
					hoverProvince,
					world,
					unitSystem,
					getCultureName,
					getHeritageName,
					getFaithName,
					getReligionName,
				})
				return display ? [display] : []
			})
		: []
	const habitabilityEntry: DemographicEntry | null =
		showDemographics &&
		hoverProvince !== null &&
		hoverProvince >= 0 &&
		world?.population?.habitability &&
		hoverProvince < world.population.habitability.length &&
		!world.provinces?.desolate?.[hoverProvince]
			? {
					label: "Habitability",
					value: world.population.habitability[hoverProvince].toFixed(2),
					color: null,
				}
			: null
	const urbanPopulation =
		showDemographics &&
		hoverProvince !== null &&
		hoverProvince >= 0 &&
		world?.urbanPopulation &&
		world?.provinces &&
		hoverProvince < world.urbanPopulation.length &&
		hoverProvince < world.provinces.desolate.length &&
		!world.provinces.desolate[hoverProvince]
			? Math.round(world.urbanPopulation[hoverProvince])
			: null
	const hoverPortLabel = showDemographics
		? buildHoverPortLabel(hoverProvince, world, getLandmarkName)
		: null
	const demographicEntries: DemographicEntry[] = []
	for (const entry of demographicDisplays) {
		demographicEntries.push(entry)
		if (entry.label === "Population" && habitabilityEntry) {
			demographicEntries.push(habitabilityEntry)
		}
	}
	if (urbanPopulation !== null && urbanPopulation > 0) {
		demographicEntries.push({
			label: "Urban Pop",
			value: urbanPopulation.toLocaleString(),
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
	const demographicGroups = showDemographics
		? [
				{
					id: "population",
					title: "Population",
					labels: [
						"Population",
						"Habitability",
						"Urban Pop",
						"Port",
						"Development",
						"Migration",
					],
				},
				{
					id: "culture",
					title: "Culture",
					labels: ["Culture", "Heritage"],
				},
				{
					id: "belief",
					title: "Belief",
					labels: ["Faith", "Religion"],
				},
			]
				.map((group) => ({
					...group,
					items: demographicEntries.filter((entry) =>
						group.labels.includes(entry.label),
					),
				}))
				.filter((group) => group.items.length > 0)
		: []
	const selectedDemographicGroupId =
		populationMode === "culture" || populationMode === "heritage"
			? "culture"
			: populationMode === "faith" || populationMode === "religion"
				? "belief"
				: "population"
	const orderedDemographicGroups = [
		...demographicGroups.filter(
			(group) => group.id === selectedDemographicGroupId,
		),
		...demographicGroups.filter(
			(group) => group.id !== selectedDemographicGroupId,
		),
	]
	return (
		<FloatingPanel
			className={`absolute top-3 z-20 w-64 px-3 py-2 ${detailsDrawerOpen ? "right-3" : "right-12"}`}
			padding="sm"
		>
			<div ref={hoverCardRef} className="space-y-0.5">
				{hoverCoordinates && <Row label="Coords" value={hoverCoordinates} />}
				{showGeography && (
					<>
						{hoverLandmark && (
							<Row
								label={
									hoverLandmark.type
										? titleCase(hoverLandmark.type)
										: "Landmark"
								}
								value={`${getLandmarkName(hoverLandmark.id)}${landmarkShare !== null ? ` (${landmarkShare.toFixed(1)}%)` : ""}`}
							/>
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
				{showPolitical && hoverTimezone && (
					<Row label="Timezone" value={hoverTimezone} />
				)}
				{showPolitical && hoverProvince !== null && hoverProvince >= 0 && (
					<>
						<SwatchRow
							label="Province"
							value={`${getProvinceName?.(hoverProvince) ?? `#${hoverProvince}`}${world?.provinces?.desolate[hoverProvince] ? " (desolate)" : ""}`}
							color={provinceColor}
						/>
						{provinceNation && (
							<SwatchRow
								label="Nation"
								value={getNationName(provinceNation.id)}
								color={provinceNation.color}
							/>
						)}
						{provinceNation && governmentDisplay && (
							<SwatchRow
								label="Government"
								value={governmentDisplay.label}
								color={governmentDisplay.color}
							/>
						)}
						{hoverOccupation && (
							<SwatchRow
								label="Occupier"
								value={`${hoverOccupation.name}${hoverOccupation.rebel ? " (rebels)" : ""}`}
								color={hoverOccupation.color}
							/>
						)}
						{world?.waterAccess && hoverProvince < world.waterAccess.length && (
							<Row
								label="Water Access"
								value={
									world.waterAccess[hoverProvince] >= 2
										? "Ocean"
										: world.riverAccess?.[hoverProvince]
											? "River"
											: world.lakeAccess?.[hoverProvince]
												? "Lake"
												: world.waterAccess[hoverProvince] >= 1
													? "River/Lake"
													: "None"
								}
							/>
						)}
						{provinceDynasty && (
							<SwatchRow
								label="Dynasty"
								value={provinceDynasty.name}
								color={provinceDynasty.color}
							/>
						)}
						{provinceRuler && (
							<Row
								label="Ruler"
								value={[
									provinceRuler.name,
									provinceRuler.genderSymbol,
									provinceRuler.age !== null ? `${provinceRuler.age}` : null,
								]
									.filter(Boolean)
									.join(" · ")}
							/>
						)}
						{hoverNationRelationDistribution.length > 0 && (
							<div className="border-t border-white/5 pt-1">
								<SeriesBars
									label="Relations"
									values={hoverNationRelationDistribution.map((b) => b.count)}
									labels={hoverNationRelationDistribution.map(
										(b) => b.shortLabel,
									)}
									colorForValue={(_, i) =>
										hoverNationRelationDistribution[i]?.color ?? "#aaa"
									}
									tooltipLabel={({ value, index }) =>
										`${hoverNationRelationDistribution[index]?.label ?? ""}: ${value}`
									}
								/>
							</div>
						)}
					</>
				)}
				{showDemographics && (
					<>
						{orderedDemographicGroups.map((group) => (
							<div key={group.id} className="space-y-0.5">
								{group.items.map((item) =>
									item.color ? (
										<SwatchRow
											key={item.label}
											label={item.label}
											value={item.value}
											color={item.color}
										/>
									) : (
										<Row
											key={item.label}
											label={item.label}
											value={item.value}
										/>
									),
								)}
							</div>
						))}
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
						{colorMode === "dtr" &&
						hoverDtr &&
						hoverDtr.monthly.length === 12 ? (
							<SeriesBars
								values={hoverDtr.monthly}
								labels={MONTH_SHORT}
								label="DTR"
								colorForValue={(value) => dtrChartColor(value)}
								activeIndex={activeBarIndex}
								summary={buildSummary(hoverDtr.annual, {
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
						) : colorMode === "misery" &&
							hoverMisery &&
							hoverMisery.monthly.length === 12 ? (
							<SeriesBars
								values={hoverMisery.monthly}
								labels={MONTH_SHORT}
								label="MI"
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
							world.pastaDebug?.minT &&
							world.pastaDebug?.maxT && (
								<div className="flex justify-between font-mono text-[9px] text-slate-400">
									<span>
										MIN{" "}
										<span className="text-slate-200">
											{formatTemperature(
												world.pastaDebug.minT[hoverRegion],
												unitSystem,
											)}
										</span>
									</span>
									<span>
										MAX{" "}
										<span className="text-slate-200">
											{formatTemperature(
												world.pastaDebug.maxT[hoverRegion],
												unitSystem,
											)}
										</span>
									</span>
								</div>
							)}
						{colorMode === "humidity" &&
						hoverHumidity &&
						hoverHumidity.monthly.length === 12 ? (
							<SeriesBars
								values={hoverHumidity.monthly}
								labels={MONTH_SHORT}
								label="Humidity"
								colorForValue={(value) => humidityChartColor(value)}
								activeIndex={activeBarIndex}
								summary={buildSummary(hoverHumidity.annual, {
									prefix: "AVG",
									formatValue: (value) => `${value.toFixed(0)}%`,
								})}
								formatValue={(value) => value.toFixed(0)}
								tooltipLabel={({ index, value }) =>
									`${monthLabels[index + 1]}: ${value.toFixed(0)}%`
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
								const rawGdd = world.pastaDebug?.gdd[hoverRegion] ?? undefined
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
									world.pastaDebug?.gint[hoverRegion] !== undefined
										? world.pastaDebug.gint[hoverRegion] >= 99999
											? 12
											: world.pastaDebug.gint[hoverRegion]
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
										values={hoverOceanCurrents.monthlyDelta}
										labels={MONTH_SHORT}
										label="Ocean Current"
										colorForValue={(value) => currentImpactColor(value)}
										activeIndex={activeBarIndex}
										formatValue={(value) =>
											`${value >= 0 ? "+" : ""}${formatTemperatureDelta(value, unitSystem, 1).replace(/ ?°[CF]$/, "")}`
										}
										summary={buildSummary(hoverOceanCurrents.averageDelta, {
											prefix: `${hoverOceanCurrents.mode} · avg`,
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
						{showRivers &&
							hoverRiver &&
							hoverRiver.flow_monthly.length === 12 && (
								<SeriesBars
									values={hoverRiver.flow_monthly}
									labels={MONTH_SHORT}
									label={
										hoverRiver.riverId >= 0
											? getRiverName(hoverRiver.riverId)
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
