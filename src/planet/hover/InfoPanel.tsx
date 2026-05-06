import React from "react"
import {
	FloatingPanel,
	LabeledValueRow,
	SeriesBars,
	Swatch,
} from "@/components"
import { titleCase } from "@/model/shared/text"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import { type ColorMode, dangerColor, daylightColor } from "../colors"
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
	HoverInfo,
	HoverLandmark,
	HoverOceanCurrents,
	HoverRiver,
	HoverTerrainFeature,
} from "./hover"
import {
	aetColor,
	currentImpactColor,
	dtrChartColor,
	flowColor,
	formatCompactNumber,
	gddColor,
	gintColor,
	petColor,
	rainColor,
	tempColor,
} from "./info-panel-format"
import {
	buildClimateSwatchColor,
	buildDemographicDisplayData,
	buildHoverChartData,
	buildHoverNationRelationDistribution,
	buildPastaMonthlyData,
	buildPoliticalDisplayData,
	buildProvinceDisplayData,
	buildTerrainFeatureSwatches,
	buildTopographySwatchColor,
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

function Row({ label, value }: { label: string; value: string }) {
	return <LabeledValueRow label={label} value={value} tone="overlay" />
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

interface InfoPanelProps {
	hoverInfo: HoverInfo | null
	hoverElevationKm: number | null
	hoverTopography: string | null
	hoverCoordinates: string | null
	hoverLandmark: HoverLandmark | null
	hoverIsLand: boolean | null
	hoverTemperatureDelta: number | null
	hoverRainfall: number | null
	hoverDtr: HoverDtr | null
	hoverClimateDisplay: string | null
	hoverIceSummary: string | null
	hoverBiome: string | null
	hoverProvince: number | null
	hoverNationId: number | null
	hoverRegionColor: [number, number, number] | null
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
	colorMode: ColorMode
	populationMode: PopulationMapMode
	selectedTimeMs: number | null
	displayMonth: number
	unitSystem: UnitSystem
	world: SerializedOrogenWorld | null
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
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
	hoverInfo,
	hoverElevationKm,
	hoverTopography,
	hoverCoordinates,
	hoverLandmark,
	hoverTemperatureDelta,
	hoverDtr,
	hoverClimateDisplay,
	hoverIceSummary,
	hoverBiome,
	hoverProvince,
	hoverNationId,
	hoverRegionColor,
	hoverOccupation,
	hoverOceanDist,
	hoverDistCoast,
	hoverDistCoastKm,
	hoverHazards,
	hoverRiver,
	hoverTerrainFeature,
	hoverOceanCurrents,
	colorMode,
	populationMode,
	selectedTimeMs,
	displayMonth,
	unitSystem,
	world,
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
}) => {
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
	const hasCurrentImpact =
		showGeography &&
		hoverOceanCurrents !== null &&
		hoverOceanCurrents.monthlyDelta.some((value) => Math.abs(value) > 0.01)
	const { provinceColor, provinceNation } = buildProvinceDisplayData({
		hoverProvince,
		hoverNationId,
		hoverRegionColor,
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
	const demographicModes: PopulationMapMode[] = [
		populationMode,
		...(
			[
				"density",
				"development",
				"culture",
				"heritage",
				"faith",
				"religion",
			] as const
		).filter((mode) => mode !== populationMode),
	]
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
	const demographicEntries: DemographicEntry[] = [
		...demographicDisplays,
		...(urbanPopulation !== null && urbanPopulation > 0
			? [
					{
						label: "Urban Pop",
						value: urbanPopulation.toLocaleString(),
						color: null,
					},
				]
			: []),
	]
	const demographicGroups = showDemographics
		? [
				{
					id: "population",
					title: "Population",
					labels: ["Population", "Urban Pop", "Development"],
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
			className="absolute top-3 left-3 z-20 w-64 px-3 py-2"
			padding="sm"
		>
			<div ref={hoverCardRef} className="space-y-0.5">
				{hoverCoordinates && <Row label="Coords" value={hoverCoordinates} />}
				{showGeography && (
					<>
						<Row
							label="Elev"
							value={`${formatElevation(hoverElevationKm, unitSystem)}${hoverSlopePercent !== null ? ` (${hoverSlopePercent.toFixed(1)}%)` : ""}`}
						/>
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
						{colorMode === "dtr" && hoverDtr !== null && (
							<Row
								label={`DTR ${monthLabels[displayMonth] ?? `M${displayMonth}`}`}
								value={formatTemperatureDelta(hoverDtr.value, unitSystem)}
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
						{colorMode === "dangerZones" && hoverHazards && (
							<SwatchRow
								label="Danger"
								value={`${Math.round(hoverHazards.danger * 100)}%${
									hoverHazards.danger >= 0.2
										? hoverHazards.earthquake >= hoverHazards.volcano
											? " (quakes)"
											: " (volcanic)"
										: ""
								}`}
								color={rgbToCss(dangerColor(hoverHazards.danger))}
							/>
						)}
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
						{hoverOccupation && (
							<SwatchRow
								label="Occupier"
								value={`${hoverOccupation.name}${hoverOccupation.rebel ? " (rebels)" : ""}`}
								color={hoverOccupation.color}
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
							activeIndex={displayMonth - 1}
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
						<SeriesBars
							values={chartData.temps}
							labels={MONTH_SHORT}
							label="Temp"
							colorForValue={(value) => tempColor(value)}
							activeIndex={displayMonth - 1}
							summary={buildSummary(annualTemp ?? undefined, {
								prefix: "AVG",
								formatValue: (value) => formatTemperature(value, unitSystem, 1),
							})}
							formatValue={(value) =>
								formatTemperature(value, unitSystem, 1).replace(/ ?°[CF]$/, "")
							}
							tooltipLabel={({ index, value }) =>
								`${monthLabels[index + 1]}: ${formatTemperature(value, unitSystem, 1)}`
							}
							showValues
						/>
						{colorMode === "pastaClimate" &&
							hoverRegion !== null &&
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
						{!!chartData.isLand && (
							<SeriesBars
								values={chartData.precip}
								labels={MONTH_SHORT}
								label="Precip"
								colorForValue={(value) => rainColor(value)}
								activeIndex={displayMonth - 1}
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
						)}
						{colorMode === "precipitation" && !!chartData?.isLand && (
							<>
								<SeriesBars
									values={chartData.pet}
									labels={MONTH_SHORT}
									label="PET"
									colorForValue={(value) => petColor(value)}
									activeIndex={displayMonth - 1}
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
								{chartData.aet.some((v) => v > 0) && (
									<SeriesBars
										values={chartData.aet}
										labels={MONTH_SHORT}
										label="AET"
										colorForValue={(value) => aetColor(value)}
										activeIndex={displayMonth - 1}
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
							</>
						)}
						{colorMode === "pastaClimate" &&
							pastaMonthlyData &&
							!!chartData?.isLand && (
								<>
									{(() => {
										const rawGdd =
											world.pastaDebug?.gdd[hoverRegion] ?? undefined
										const isInfGdd = rawGdd !== undefined && rawGdd >= 99999
										return (
											<SeriesBars
												values={pastaMonthlyData.gdd}
												labels={MONTH_SHORT}
												label="GDD"
												colorForValue={(value) => gddColor(value)}
												activeIndex={displayMonth - 1}
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
									<SeriesBars
										values={pastaMonthlyData.gint}
										labels={MONTH_SHORT}
										label="GInt"
										colorForValue={(value) => gintColor(value)}
										activeIndex={displayMonth - 1}
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
								</>
							)}
						{colorMode === "dtr" &&
							hoverDtr &&
							hoverDtr.monthly.length === 12 && (
								<SeriesBars
									values={hoverDtr.monthly}
									labels={MONTH_SHORT}
									label="DTR"
									colorForValue={(value) => dtrChartColor(value)}
									activeIndex={displayMonth - 1}
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
							)}
						{colorMode === "oceanCurrents" &&
							hasCurrentImpact &&
							hoverOceanCurrents !== null && (
								<div className="space-y-1 border-t border-white/5 pt-1">
									<SeriesBars
										values={hoverOceanCurrents.monthlyDelta}
										labels={MONTH_SHORT}
										label="Ocean Current"
										colorForValue={(value) => currentImpactColor(value)}
										activeIndex={displayMonth - 1}
										formatValue={(value) =>
											`${value >= 0 ? "+" : ""}${formatTemperatureDelta(Math.abs(value), unitSystem, 1).replace(/ ?°[CF]$/, "")}`
										}
										summary={buildSummary(hoverOceanCurrents.averageDelta, {
											prefix: `${hoverOceanCurrents.mode} · avg`,
											formatValue: (value) =>
												`${value >= 0 ? "+" : ""}${formatTemperatureDelta(Math.abs(value), unitSystem, 1)}`,
										})}
										tooltipLabel={({ index, value }) =>
											`${monthLabels[index + 1]}: ${value >= 0 ? "+" : ""}${formatTemperatureDelta(Math.abs(value), unitSystem, 1)}`
										}
										showValues
									/>
								</div>
							)}
						{hoverRiver && hoverRiver.flow_monthly.length === 12 && (
							<SeriesBars
								values={hoverRiver.flow_monthly}
								labels={MONTH_SHORT}
								label={
									hoverRiver.riverId >= 0
										? getRiverName(hoverRiver.riverId)
										: `River #${hoverRiver.riverId}`
								}
								colorForValue={(value) => flowColor(value)}
								activeIndex={displayMonth - 1}
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
						{hoverRiver && hoverRiver.lengthKm > 0 && (
							<div className="-mt-1 font-mono text-[9px] text-slate-500">
								Length {formatDistance(hoverRiver.lengthKm, unitSystem)}
							</div>
						)}
					</div>
				)}
			</div>
		</FloatingPanel>
	)
}
