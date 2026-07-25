import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { StageTiming } from "@/model"
import { GENESIS_TOPOGRAPHY_LABELS } from "@/model"
import { computeGravityG } from "@/model/celestial/body-metrics"
import type { MoonBody } from "@/model/celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	resolveMoonOrbitHoursPerDay,
} from "@/model/celestial/moons/orbital-mechanics"
import type { MainSequenceClass } from "@/model/celestial/star/star-types"
import {
	DEFAULT_SPECTRAL_CLASS,
	getKeplerYearYears,
	getStarLuminositySol,
	getStarMassSol,
	isValidSpectralClass,
} from "@/model/celestial/star/star-types"
import {
	generateStarName,
	generateSystemBodies,
	getStarAgeGyr,
	type SystemBody,
} from "@/model/celestial/system/generate-system-bodies"
import {
	SOL_DEFAULT_SOLAR_SYSTEM,
	SOL_LUNA_DEFAULT,
	SOL_MAIN_WORLD_DEFAULTS,
	SOL_SEED,
	SOL_STAR_AGE_GYR,
	type SolarSystemState,
} from "@/model/celestial/system/sol-system"
import { hydrosphereCodeFromWaterPct } from "@/model/celestial/system/system-environment"
import { applySystemSeismology } from "@/model/celestial/system/system-seismology"
import { apparentTemperatureC } from "@/model/climate/apparent-temp"
import { relativeHumidityFromTempRange } from "@/model/climate/humidity"
import {
	computeMonthlyLibration,
	computeMonthlyLockedDeclination,
	getSubstellarDirWithOffsetAndDeclination,
} from "@/model/climate/locked/heat"
import { buildLockedOceanCurrentGrid } from "@/model/climate/locked/ocean-currents"
import { buildOceanCurrentGrid } from "@/model/climate/ocean-currents"
import {
	computeThermalEquatorLine,
	getClimateGeometry,
} from "@/model/climate/rain"
import {
	buildSurfaceTidesSeismologyCallbacks,
	computeMoonSurfaceTidesM,
	computeMoonTidalSchedule,
	computeSurfaceTidesM,
	computeTidalSchedule,
} from "@/model/climate/tidal-schedule"
import { BIOME_LABELS, CLIMATE_LABELS } from "@/model/climate/vegetation"
import { computeWindGrid, computeWindVectors } from "@/model/climate/wind"
import {
	dynastyColor,
	hashColorForKey,
	rgb01ToCss,
} from "@/model/earth/history/color"
import {
	type Eu4ProvinceFillGeometry,
	loadEu4ProvinceFillGeometry,
	type RawOrganizationReference,
	type RawWarParticipantEvent,
} from "@/model/earth/history/data-source"
import {
	eu4DateToDays,
	eu4DaysToYear,
	formatEu4Days,
} from "@/model/earth/history/date"
import {
	collectOrgForeignHolderNations,
	collectOrgMemberProvinceRawIds,
	type FoldedState,
	fold,
} from "@/model/earth/history/fold"
import {
	EARTH_HISTORY_GOVERNMENT_FAMILIES,
	EARTH_HISTORY_GOVERNMENT_FAMILY_COLORS,
	EARTH_HISTORY_GOVERNMENT_FAMILY_LABELS,
	EARTH_HISTORY_NO_GOVERNMENT_COLOR,
	formatEarthHistoryGovernmentLabel,
	getEarthHistoryGovernmentColor,
	getEarthHistoryGovernmentFamily,
} from "@/model/earth/history/government"
import {
	listOrgMembers,
	ORG_CATEGORY_SCHEMAS,
	type OrgCategorizer,
	type OrgProvinceCategory,
} from "@/model/earth/history/organization-categories"
import {
	TRADE_GOOD_LABELS,
	tradeGoodColor,
	tradeGoodDisplayName,
} from "@/model/economy/trade-goods"
import { SEED_MAX } from "@/model/shared/planet-code"
import { seedStringToNumber } from "@/model/shared/rng"
import {
	formatSeedLabel,
	makeRandomSeedLabel,
	resolveSeedLabel,
} from "@/model/shared/seed-label"
import { titleCase } from "@/model/shared/text"
import {
	getEffectiveObliquityDeg,
	isRetrogradeObliquity,
} from "@/model/shared/units"
import {
	GOVERNMENT_TYPE_LABELS,
	GOVERNMENT_TYPES,
	type SocietyEra,
} from "@/model/society/eras"
import {
	RELIGION_TYPE_COLORS,
	RELIGION_TYPE_NAMES,
} from "@/model/society/religion"
import { TOPO_LAKE, TOPO_OCEAN } from "@/model/terrain/classification"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { ShieldHalfFullIcon } from "@/ui/components/primitives/icons/ShieldHalfFullIcon"
import { SwordCrossIcon } from "@/ui/components/primitives/icons/SwordCrossIcon"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { GenerationPanel } from "../wiki/GenerationPanel"
import type { NationWikiData } from "../wiki/nation/NationWikiPage"
import type { OrganizationWikiData } from "../wiki/organization/OrganizationWikiPage"
import type {
	WikiTimelineEvent as NationTimelineEvent,
	WikiCountHistoryPoint,
} from "../wiki/shared/WikiTimeline"
import {
	buildDistributionForRegions,
	buildEu5TopographyDistribution,
	buildStringIdDistributionForProvinces,
} from "../wiki/stats/nation/nation-distributions"
import { buildNationWikiStats } from "../wiki/stats/nation/nation-stats"
import { updateBodyDiameter } from "../wiki/stats/orbit/body-mutations"
import { buildPressureAtmosphereProfile } from "../wiki/stats/orbit/formatters"
import { resolveBodyTideLockSiderealDayHours } from "../wiki/stats/orbit/tide-lock-stats"
import { buildOrganizationWikiStats } from "../wiki/stats/organization/organization-stats"
import type { WarWikiData } from "../wiki/war/WarWikiPage"
import { scaleClockDialHourToDayLength } from "./clock"
import type { ColorMode } from "./colors"
import {
	climateZoneColor,
	EU5_CLIMATE_CATEGORIES,
	EU5_CLIMATE_COLORS,
	EU5_VEGETATION_CATEGORIES,
	EU5_VEGETATION_COLORS,
	miseryColor,
	OCEAN_LIGHT_BLUE,
	vegetationColor,
	windSpeedColor,
} from "./colors"
import { EarthHistoryBookmarks } from "./controls/EarthHistoryBookmarks"
import { ModeBar } from "./controls/ModeBar"
import {
	type ClimateSubMode,
	type ExportWidthPreset,
	type LabelMode,
	type MeasureMode,
	OverlayControls,
	type TopographySubMode,
	type VegetationSubMode,
} from "./controls/OverlayControls"
import { SimulationControls } from "./controls/SimulationControls"
import { DetailsDrawer } from "./details/DetailsDrawer"
import { createDrawerNationClickHandler } from "./details/nation-clicks"
import type { DistributionBucket } from "./details/shared"
import { useEarthHistoryTimeline } from "./hooks/useEarthHistoryTimeline"
import { findEu4ProvinceForLonLat } from "./hover/eu4-hover-province"
import {
	getHoverBiome,
	getHoverClimateDisplay,
	getHoverClimateZone,
	getHoverCoordinates,
	getHoverDistCoast,
	getHoverDistCoastKm,
	getHoverDtr,
	getHoverDtrDiff,
	getHoverElevationKm,
	getHoverHazards,
	getHoverHotspot,
	getHoverHumidity,
	getHoverHumidityDiff,
	getHoverIsLand,
	getHoverKoppenClimate,
	getHoverLandmark,
	getHoverLonLat,
	getHoverMisery,
	getHoverOceanCurrents,
	getHoverOceanDist,
	getHoverPastaClimate,
	getHoverProvince,
	getHoverRainfall,
	getHoverRainfallDiff,
	getHoverRealDtr,
	getHoverRealHumidity,
	getHoverRealKoppenClimate,
	getHoverRealPastaClimate,
	getHoverRealRainfall,
	getHoverRealTemperature,
	getHoverRiver,
	getHoverTemperatureDelta,
	getHoverTemperatureDiff,
	getHoverTerrainFeature,
	getHoverTimezone,
	getHoverTopography,
	type HoverInfo,
	type HoverMisery,
} from "./hover/hover"
import { InfoPanel } from "./hover/InfoPanel"
import { canHandlePlanetClick } from "./measurement-click"
import { OceanCurrentParticleCanvas } from "./OceanCurrentParticleCanvas"
import {
	createGenesisScene,
	type GenesisScene,
	type GenesisViewMode,
	type OrgHighlightSpec,
} from "./renderer"
import {
	buildDisplayNationModel,
	buildDisplayWorld,
	buildNationAdjacency,
} from "./screen/display/display-model"
import { createDisplayNames } from "./screen/display/display-names"
import {
	computeEarthHistoryOccupationOverlay,
	computeEarthHistoryRegionColors,
	computeOrgStripeOverlay,
} from "./screen/display/earth-history-region-colors"
import {
	buildCultureLabelNames,
	buildHeritageLabelNames,
	buildNationDynastyLabelNames,
	buildNationLabelNames,
	buildSettlementLabelNames,
} from "./screen/display/label-names"
import {
	buildNationSizeDistribution,
	buildSelectedNationDetails,
} from "./screen/display/nation-details-model"
import { computePlanetStats } from "./screen/display/planet-stats"
import {
	computeRegionColors,
	getTopographyColor,
} from "./screen/display/region-colors"
import {
	DEFAULT_WORLD_PARAMS,
	GENERATION_SESSION_STORAGE_KEY,
	PLANET_SEED_STORAGE_KEY,
	VIEW_PREFS_STORAGE_KEY,
} from "./screen/generation/defaults"
import {
	type GenerationCallbacks,
	type GenerationParams,
	generateWorld,
	importHeightmap,
	loadImageAsGrayscale,
} from "./screen/generation/generation"
import {
	GENERATION_PREVIEW_TABS,
	type GenerationPreviewTab,
} from "./screen/generation/generation-preview"
import {
	loadGenerationSessionSnapshot,
	loadGenerationSessionSnapshotSync,
	saveGenerationSessionSnapshot,
} from "./screen/generation/session-persistence"
import {
	buildPlanetSliders,
	buildTerrainSliders,
	resetWorldDefaults,
} from "./screen/generation/sliders"
import {
	DEFAULT_VIEW_PREFS,
	parseStoredViewPrefs,
	serializeStoredViewPrefs,
} from "./screen/generation/view-prefs"
import {
	historyTimeToMonth,
	historyYearToTime,
} from "./screen/history/history-time"
import {
	applyDataVariant,
	type DataVariant,
	getBaseMapMode,
	getDataVariant,
} from "./screen/shared/data-variant"
import type {
	NationMapMode,
	PopulationMapMode,
} from "./screen/shared/map-modes"
import {
	DEFAULT_GEOGRAPHY_MODE,
	getMapModePrimary,
	isDebugGeographyMode,
	isDebugNationMode,
	normalizeGeographyColorMode,
	normalizeNationMapMode,
} from "./screen/shared/map-modes"
import {
	formatDistance,
	rgbToCss,
	type UnitSystem,
} from "./screen/shared/ui-format"
import { SolarSystemControls } from "./solar-system/SolarSystemControls"
import { WindParticleCanvas } from "./WindParticleCanvas"

const WIND_DIR_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
// "coming from" convention: negate u/v to get the source direction
function windDirectionLabel(u: number, v: number): string {
	const deg = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360
	return WIND_DIR_LABELS[Math.round(deg / 45) % 8] ?? "N"
}

// Nation focus is anchored on a representative seed province, so province
// count is only a rough proxy for framing. Use a slow logarithmic curve:
// single-province minors need a much tighter view than the default point
// focus, while large nations should pull back only moderately instead of
// hitting the far-out cap early.
function nationFocusDistanceScale(provinceCount: number): number {
	if (provinceCount <= 0) return 1
	const minScale = 0.18
	const maxScale = 1.0
	const referenceProvinceCount = 400
	const t = Math.min(
		1,
		Math.log2(Math.max(1, provinceCount)) / Math.log2(referenceProvinceCount),
	)
	return minScale + (maxScale - minScale) * t
}

// Focusing on a single province (as opposed to a whole nation) should use
// the same tight framing as a single-province nation -- the unscaled
// default (distanceScale 1) is tuned for the far-out nation case and looks
// much too zoomed-out for one province.
const SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE = nationFocusDistanceScale(1)

function buildDistribution(
	labels: ReadonlyArray<string>,
	values: ArrayLike<number> | undefined,
	colorFn: (index: number) => string,
	excludeIndexes: ReadonlySet<number> = new Set(),
) {
	const counts = new Array(labels.length).fill(0)
	if (values) {
		for (let i = 0; i < values.length; i++) {
			const value = values[i]
			if (value >= 0 && value < counts.length && !excludeIndexes.has(value))
				counts[value]++
		}
	}

	return labels
		.map((label, index) => ({
			label: titleCase(label),
			count: counts[index] ?? 0,
			color: colorFn(index),
		}))
		.filter((bucket) => bucket.count > 0)
}

function buildExportTimestamp(date: Date): string {
	return date.toISOString().replace(/[:.]/g, "-")
}

function usePlaybackSampledValue<T>(
	value: T,
	delayMs: number,
	enabled: boolean,
): T {
	const [sampledValue, setSampledValue] = useState(value)
	const latestValueRef = useRef(value)
	latestValueRef.current = value

	useEffect(() => {
		if (!enabled) {
			setSampledValue(value)
			return
		}
		const timer = window.setInterval(() => {
			setSampledValue(latestValueRef.current)
		}, delayMs)
		return () => window.clearInterval(timer)
	}, [delayMs, enabled, value])

	return enabled ? sampledValue : value
}

function sanitizeExportIdentity(
	value: string | null | undefined,
): string | null {
	if (!value) return null
	const sanitized = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
	return sanitized.length > 0 ? sanitized : null
}

function buildMapExportFilename(
	seed: number | null | undefined,
	width: number,
	date: Date = new Date(),
): string {
	const identity =
		sanitizeExportIdentity(seed?.toString()) ?? buildExportTimestamp(date)
	return `genesis-map-${identity}-${width}w.png`
}

interface MonthlyRasterAsset {
	monthly: Int16Array
	width: number
	height: number
	months: number
	scale: number
	nodata: number
}

interface Eu4PopulationTimelineAsset {
	values: Int16Array
	provinceCount: number
	rawProvinceIds: Int32Array
	rawIdToIndex: Map<number, number>
	provinceAreasKm2: Float32Array | null
	times: Int32Array
	timeLabels: string[]
	scale: number
	nodata: number
}

interface RealPopulationSlice {
	population: Float32Array
	difference: Float32Array
	totalPopulation: number
	sourceTimeDays: number
	sourceTimeLabel: string
}

interface RealUrbanPopulationSlice {
	population: Float32Array
	totalPopulation: number
	sourceTimeDays: number
	sourceTimeLabel: string
}

function hydeTimeToEu4Days(label: string): number {
	const match = label.match(/^(-?\d+)-(\d{2})-(\d{2}) /)
	if (!match) throw new Error(`Unsupported HYDE time label: ${label}`)
	const [, year, month, day] = match
	return eu4DateToDays(`${Number(year)}.${Number(month)}.${Number(day)}`)
}

function findSortedTimeBracket(
	times: Int32Array,
	target: number,
): { lo: number; hi: number; t: number } | null {
	if (times.length === 0) return null
	if (times.length === 1) return { lo: 0, hi: 0, t: 0 }
	if (target <= times[0]) return { lo: 0, hi: 0, t: 0 }
	const lastIndex = times.length - 1
	if (target >= times[lastIndex]) return { lo: lastIndex, hi: lastIndex, t: 0 }

	let lo = 0
	let hi = lastIndex
	while (lo + 1 < hi) {
		const mid = Math.floor((lo + hi) / 2)
		if (times[mid] <= target) lo = mid
		else hi = mid
	}
	const start = times[lo]
	const end = times[hi]
	if (end <= start) return { lo, hi: lo, t: 0 }
	return { lo, hi, t: (target - start) / (end - start) }
}

async function loadEarthMonthlyRaster(
	prefix: string,
	label: string,
): Promise<MonthlyRasterAsset> {
	const metaRes = await fetch(`/heightmap/${prefix}.json`)
	if (!metaRes.ok) {
		throw new Error(`Failed to load ${label} metadata: ${metaRes.status}`)
	}
	const meta = (await metaRes.json()) as {
		bin: string
		width: number
		height: number
		months: number
		scale: number
		nodata: number
	}
	const binRes = await fetch(`/heightmap/${meta.bin}`)
	if (!binRes.ok) {
		throw new Error(`Failed to load ${label} raster: ${binRes.status}`)
	}
	const buffer = await binRes.arrayBuffer()
	return {
		monthly: new Int16Array(buffer),
		width: meta.width,
		height: meta.height,
		months: meta.months,
		scale: meta.scale,
		nodata: meta.nodata,
	}
}

async function loadEarthRealClimate(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster("earth-real-temperature", "observed climate")
}

async function loadEarthRealPrecip(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster(
		"earth-real-precipitation",
		"observed precipitation",
	)
}

async function loadEarthRealDtr(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster("earth-real-dtr", "observed DTR")
}

async function loadEarthRealVaporPressure(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster(
		"earth-real-vapor-pressure",
		"observed vapor pressure",
	)
}

async function loadEarthRealElevation(): Promise<{
	raster: Int16Array
	width: number
	height: number
	scale: number
	nodata: number
}> {
	const metaRes = await fetch("/heightmap/earth-real-elevation.json")
	if (!metaRes.ok) {
		throw new Error(
			`Failed to load observed elevation metadata: ${metaRes.status}`,
		)
	}
	const meta = (await metaRes.json()) as {
		bin: string
		width: number
		height: number
		scale: number
		nodata: number
	}
	const binRes = await fetch(`/heightmap/${meta.bin}`)
	if (!binRes.ok) {
		throw new Error(
			`Failed to load observed elevation raster: ${binRes.status}`,
		)
	}
	const buffer = await binRes.arrayBuffer()
	return {
		raster: new Int16Array(buffer),
		width: meta.width,
		height: meta.height,
		scale: meta.scale,
		nodata: meta.nodata,
	}
}

async function loadEarthProvinceTimeline(
	prefix: string,
	label: string,
): Promise<Eu4PopulationTimelineAsset> {
	const metaRes = await fetch(`/heightmap/${prefix}.json`)
	if (!metaRes.ok) {
		throw new Error(`Failed to load ${label} metadata: ${metaRes.status}`)
	}
	const meta = (await metaRes.json()) as {
		bin: string
		provinceCount: number
		rawProvinceIds: number[]
		provinceAreasKm2?: number[]
		times: string[]
		encoding: { scale: number }
		nodata: number
	}
	const binRes = await fetch(`/heightmap/${meta.bin}`)
	if (!binRes.ok) {
		throw new Error(`Failed to load ${label} asset: ${binRes.status}`)
	}
	const buffer = await binRes.arrayBuffer()
	const rawProvinceIds = Int32Array.from(meta.rawProvinceIds)
	const rawIdToIndex = new Map<number, number>()
	for (let i = 0; i < rawProvinceIds.length; i++) {
		rawIdToIndex.set(rawProvinceIds[i], i)
	}
	return {
		values: new Int16Array(buffer),
		provinceCount: meta.provinceCount,
		rawProvinceIds,
		rawIdToIndex,
		provinceAreasKm2: meta.provinceAreasKm2
			? Float32Array.from(meta.provinceAreasKm2)
			: null,
		times: Int32Array.from(meta.times.map(hydeTimeToEu4Days)),
		timeLabels: meta.times,
		scale: meta.encoding.scale,
		nodata: meta.nodata,
	}
}

function attachEarthProvinceAreas(params: {
	provinces: SerializedGenesisWorld["provinces"]
	asset: Eu4PopulationTimelineAsset | null
}): SerializedGenesisWorld["provinces"] {
	const { provinces, asset } = params
	if (
		!provinces?.realIds ||
		!asset?.provinceAreasKm2 ||
		asset.provinceAreasKm2.length !== asset.rawProvinceIds.length
	) {
		return provinces
	}
	const areaKm2 = new Float32Array(provinces.count)
	let hasArea = false
	for (let province = 0; province < provinces.count; province++) {
		const rawId = provinces.realIds[province]
		const column = asset.rawIdToIndex.get(rawId)
		if (column === undefined) continue
		const area = asset.provinceAreasKm2[column]
		if (!Number.isFinite(area) || area <= 0) continue
		areaKm2[province] = area
		hasArea = true
	}
	return hasArea ? { ...provinces, areaKm2 } : provinces
}

async function loadEarthRealPopulationEu4(): Promise<Eu4PopulationTimelineAsset> {
	return loadEarthProvinceTimeline(
		"earth-real-population-eu4",
		"observed population",
	)
}

async function loadEarthRealUrbanPopulationEu4(): Promise<Eu4PopulationTimelineAsset> {
	return loadEarthProvinceTimeline(
		"earth-real-urban-population-eu4",
		"observed urban population",
	)
}

function buildInterpolatedProvinceTimelineSlice(params: {
	asset: Eu4PopulationTimelineAsset
	provinces: SerializedGenesisWorld["provinces"]
	selectedDays: number
}): {
	population: Float32Array
	totalPopulation: number
	sourceTimeDays: number
	sourceTimeLabel: string
} | null {
	const { asset, provinces, selectedDays } = params
	if (!provinces?.realIds) return null
	const bracket = findSortedTimeBracket(asset.times, selectedDays)
	if (!bracket) return null
	const provinceCount = provinces.count
	const population = new Float32Array(provinceCount)
	let totalPopulation = 0
	const loOffset = bracket.lo * asset.provinceCount
	const hiOffset = bracket.hi * asset.provinceCount

	for (let province = 0; province < provinceCount; province++) {
		const rawId = provinces.realIds[province]
		const column = asset.rawIdToIndex.get(rawId)
		if (column === undefined) {
			population[province] = 0
			continue
		}
		const loStored = asset.values[loOffset + column]
		const hiStored = asset.values[hiOffset + column]
		const loValue = loStored === asset.nodata ? 0 : loStored * asset.scale
		const hiValue = hiStored === asset.nodata ? loValue : hiStored * asset.scale
		const value = loValue + (hiValue - loValue) * bracket.t
		population[province] = value
		totalPopulation += value
	}

	return {
		population,
		totalPopulation,
		sourceTimeDays: selectedDays,
		sourceTimeLabel: formatEu4Days(selectedDays),
	}
}

function buildRealPopulationSlice(params: {
	asset: Eu4PopulationTimelineAsset
	provinces: SerializedGenesisWorld["provinces"]
	syntheticPopulation: Float32Array | undefined
	selectedDays: number
}): RealPopulationSlice | null {
	const { asset, provinces, syntheticPopulation, selectedDays } = params
	const interpolated = buildInterpolatedProvinceTimelineSlice({
		asset,
		provinces,
		selectedDays,
	})
	if (!interpolated) return null
	const population = interpolated.population
	const provinceCount = population.length
	const difference = new Float32Array(provinceCount)

	for (let province = 0; province < provinceCount; province++) {
		difference[province] =
			(syntheticPopulation?.[province] ?? 0) - population[province]
	}

	return {
		population,
		difference,
		totalPopulation: interpolated.totalPopulation,
		sourceTimeDays: interpolated.sourceTimeDays,
		sourceTimeLabel: interpolated.sourceTimeLabel,
	}
}

function buildRealUrbanPopulationSlice(params: {
	asset: Eu4PopulationTimelineAsset
	provinces: SerializedGenesisWorld["provinces"]
	selectedDays: number
}): RealUrbanPopulationSlice | null {
	const interpolated = buildInterpolatedProvinceTimelineSlice(params)
	if (!interpolated) return null
	return interpolated
}

/** Real named settlements (GHSL, via scripts/build-ghsl-settlements.py) --
 * positioned by raw lon/lat rather than the procedural mesh's province
 * regions, so unlike Eu4PopulationTimelineAsset there's no
 * provinces.realIds indirection needed here at all. */
interface Eu4GhslSettlementAsset {
	settlementCount: number
	values: Int16Array
	times: Int32Array
	scale: number
	nodata: number
	lats: Float32Array
	lons: Float32Array
	names: string[]
	/** Raw EU4 province id each settlement falls within (from
	 * scripts/build-ghsl-settlements.py's point-in-polygon assignment against
	 * the same eu4.json used everywhere else), or -1 if it didn't land inside
	 * any province polygon. Used to render only the largest settlement per
	 * province rather than an arbitrary global top-N. */
	provinceIds: Int32Array
}

async function loadEu4GhslSettlements(): Promise<Eu4GhslSettlementAsset> {
	const metaRes = await fetch("/heightmap/eu4-ghsl-settlements.json")
	if (!metaRes.ok) {
		throw new Error(
			`Failed to load GHSL settlements metadata: ${metaRes.status}`,
		)
	}
	const meta = (await metaRes.json()) as {
		bin: string
		timeCount: number
		settlementCount: number
		times: string[]
		names: string[]
		provinceIds: number[]
		encoding: { scale: number }
		nodata: number
	}
	const binRes = await fetch(`/heightmap/${meta.bin}`)
	if (!binRes.ok) {
		throw new Error(`Failed to load GHSL settlements asset: ${binRes.status}`)
	}
	const buffer = await binRes.arrayBuffer()
	const populationValueCount = meta.timeCount * meta.settlementCount
	const values = new Int16Array(buffer, 0, populationValueCount)
	const coordsView = new DataView(buffer, populationValueCount * 2)
	const lats = new Float32Array(meta.settlementCount)
	const lons = new Float32Array(meta.settlementCount)
	for (let i = 0; i < meta.settlementCount; i++) {
		lats[i] = coordsView.getFloat32(i * 8, true)
		lons[i] = coordsView.getFloat32(i * 8 + 4, true)
	}
	return {
		settlementCount: meta.settlementCount,
		values,
		times: Int32Array.from(meta.times.map(hydeTimeToEu4Days)),
		scale: meta.encoding.scale,
		nodata: meta.nodata,
		lats,
		lons,
		names: meta.names,
		provinceIds: Int32Array.from(meta.provinceIds),
	}
}

/** Interpolated population per settlement at selectedDays, same time-bracket
 * linear-interpolation convention as buildInterpolatedProvinceTimelineSlice. */
function buildGhslSettlementPopulationSlice(
	asset: Eu4GhslSettlementAsset,
	selectedDays: number,
): Float32Array | null {
	const bracket = findSortedTimeBracket(asset.times, selectedDays)
	if (!bracket) return null
	const population = new Float32Array(asset.settlementCount)
	const loOffset = bracket.lo * asset.settlementCount
	const hiOffset = bracket.hi * asset.settlementCount
	for (let s = 0; s < asset.settlementCount; s++) {
		const loStored = asset.values[loOffset + s]
		const hiStored = asset.values[hiOffset + s]
		const loValue = loStored === asset.nodata ? 0 : loStored * asset.scale
		const hiValue = hiStored === asset.nodata ? loValue : hiStored * asset.scale
		population[s] = loValue + (hiValue - loValue) * bracket.t
	}
	return population
}

/** Raw EU4 province id -> index of the single largest-population settlement
 * in that province at the current date -- excludes zero-population (not
 * founded yet / abandoned) entries and settlements that didn't land inside
 * any province (provinceId === -1). One settlement per province is far more
 * meaningful than an arbitrary global population cutoff, and naturally caps
 * the marker count at the province count regardless of era. Shared by the
 * settlement-marker overlay (values()) and the hover panel's "Settlement"
 * row (keyed by province). */
function buildBestSettlementByProvince(
	population: Float32Array,
	provinceIds: Int32Array,
): Map<number, number> {
	const bestIndexByProvince = new Map<number, number>()
	for (let i = 0; i < population.length; i++) {
		const pop = population[i]
		if (pop <= 0) continue
		const provinceId = provinceIds[i]
		if (provinceId < 0) continue
		const currentBest = bestIndexByProvince.get(provinceId)
		if (currentBest === undefined || pop > population[currentBest]) {
			bestIndexByProvince.set(provinceId, i)
		}
	}
	return bestIndexByProvince
}

function topSettlementIndices(
	population: Float32Array,
	provinceIds: Int32Array,
): number[] {
	return Array.from(
		buildBestSettlementByProvince(population, provinceIds).values(),
	)
}

async function loadEu5Categorical(prefix: string): Promise<{
	raster: Int16Array
	width: number
	height: number
	nodata: number
	categories: string[]
}> {
	const metaRes = await fetch(`/heightmap/${prefix}.json`)
	if (!metaRes.ok) {
		throw new Error(`Failed to load ${prefix} metadata: ${metaRes.status}`)
	}
	const meta = (await metaRes.json()) as {
		format: string
		bin: string
		width: number
		height: number
		nodata: number
		categories: string[]
	}
	const binRes = await fetch(`/heightmap/${meta.bin}`)
	if (!binRes.ok) {
		throw new Error(`Failed to load ${prefix} raster: ${binRes.status}`)
	}
	const buffer = await binRes.arrayBuffer()
	const raster =
		meta.format === "uint8-single-band-categorical"
			? Int16Array.from(new Uint8Array(buffer))
			: new Int16Array(buffer)
	return {
		raster,
		width: meta.width,
		height: meta.height,
		nodata: meta.nodata,
		categories: meta.categories,
	}
}

async function loadEu4Provinces(): Promise<{
	raster: Int16Array
	width: number
	height: number
	nodata: number
}> {
	const metaRes = await fetch("/heightmap/eu4-provinces.json")
	if (!metaRes.ok) {
		throw new Error(`Failed to load EU4 provinces metadata: ${metaRes.status}`)
	}
	const meta = (await metaRes.json()) as {
		bin: string
		width: number
		height: number
		nodata: number
		compression?: "gzip"
	}
	const binRes = await fetch(`/heightmap/${meta.bin}`)
	if (!binRes.ok) {
		throw new Error(`Failed to load EU4 provinces raster: ${binRes.status}`)
	}
	// A server may already transparently decode a *.gz file via the standard
	// Content-Encoding response header (e.g. Vite's dev static middleware
	// does this) -- decompressing again here would double-decode garbage.
	// Only run DecompressionStream when the bytes are still actually gzipped.
	const alreadyDecoded = binRes.headers.get("content-encoding") === "gzip"
	const buffer =
		meta.compression === "gzip" && !alreadyDecoded
			? await new Response(
					binRes.body?.pipeThrough(new DecompressionStream("gzip")),
				).arrayBuffer()
			: await binRes.arrayBuffer()
	return {
		raster: new Int16Array(buffer),
		width: meta.width,
		height: meta.height,
		nodata: meta.nodata,
	}
}

async function loadOptionalJson<T>(url: string): Promise<T | undefined> {
	const res = await fetch(url)
	if (!res.ok) return undefined
	const contentType = res.headers.get("content-type") ?? ""
	if (!contentType.includes("application/json")) return undefined
	return (await res.json()) as T
}

function syncLabelModeToMapMode(params: {
	labelMode: LabelMode
	colorMode: ColorMode
	nationMode: NationMapMode
	populationMode: PopulationMapMode
	isEarthImport: boolean
}): LabelMode {
	const { labelMode, colorMode, nationMode, populationMode, isEarthImport } =
		params
	const anyActive =
		labelMode.nations ||
		labelMode.dynasty ||
		labelMode.culture ||
		labelMode.heritage ||
		labelMode.religion
	if (!anyActive) return labelMode

	const politicalFallback = {
		...labelMode,
		nations: nationMode !== "dynasty",
		dynasty: nationMode === "dynasty",
		culture: false,
		heritage: false,
		religion: false,
	}

	if (getBaseMapMode(colorMode) === "population") {
		if (populationMode === "culture") {
			return {
				...labelMode,
				nations: false,
				dynasty: false,
				culture: true,
				heritage: false,
				religion: false,
			}
		}
		if (populationMode === "religion") {
			// Real per-province religion labels only exist for Earth imports
			// (see create-genesis-scene.ts's earthHistoryLabelPartitions);
			// the procedural generator has no religion label overlay at all
			// (world.religions is culture-indexed, not province-indexed), so
			// procedural worlds keep the previous heritage-label
			// approximation rather than showing nothing.
			return isEarthImport
				? {
						...labelMode,
						nations: false,
						dynasty: false,
						culture: false,
						heritage: false,
						religion: true,
					}
				: {
						...labelMode,
						nations: false,
						dynasty: false,
						culture: false,
						heritage: true,
						religion: false,
					}
		}
		if (populationMode === "heritage") {
			return {
				...labelMode,
				nations: false,
				dynasty: false,
				culture: false,
				heritage: true,
				religion: false,
			}
		}
		return politicalFallback
	}
	return politicalFallback
}

// EU4's own "no real value" sentinels, shared by the nation- and
// organization-timeline builders below.
function normalizeTimelineTag(value: unknown): string | null {
	return typeof value === "string" && value !== "---" && value !== "XXX"
		? value
		: null
}

// Cleans an EU4 identifier like "cb_civil_war" or "take_capital_imperial"
// into a readable label ("Civil War", "Take Capital Imperial") for display
// on WarWikiPage -- strips the "cb_" casus-belli prefix (war_goal `type`
// values never have it, so the strip is a no-op there) and title-cases the
// remaining underscore-separated words.
function cleanEu4Identifier(id: string): string {
	return id
		.replace(/^cb_/, "")
		.split("_")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ")
}

function timelineTypeColor(type: string): string {
	switch (type.replace(/\s+\([+-]\)$/, "")) {
		case "Territory":
			return "#16a34a"
		case "Province":
			return "#0891b2"
		case "Culture":
			return "#c026d3"
		case "Religion":
			return "#ca8a04"
		case "Diplomacy":
			return "#0d9488"
		case "War":
			return "#ea580c"
		case "Battle":
			return "#b91c1c"
		case "Government":
			return "#7c3aed"
		case "Capital":
			return "#2563eb"
		case "Ruler":
			return "#db2777"
		case "Heir":
		case "Queen":
		case "Leader":
			return "#be185d"
		case "Name":
			return "#4f46e5"
		case "Tech":
			return "#475569"
		case "Decision":
			return "#9333ea"
		case "Trait":
			return "#e11d48"
		case "Flag":
			return "#64748b"
		case "Economy":
			return "#059669"
		case "Revolution":
			return "#dc2626"
		case "HRE":
			return "#78716c"
		case "Emperor":
			return "#b45309"
		case "Elector":
			return "#a16207"
		case "Organization":
			return "#0e7490"
		case "Site":
			return "#0284c7"
		default:
			return "#64748b"
	}
}

function eventComment(comment: unknown): string | undefined {
	return typeof comment === "string" && comment.trim() ? comment : undefined
}

function isRebelTag(tag: string | null | undefined): boolean {
	return tag === "REB"
}

function formatRebelTypeLabel(rebelType: unknown): string | null {
	if (typeof rebelType !== "string" || !rebelType.trim()) return null
	const normalized = rebelType.trim().toLowerCase()
	return cleanEu4Identifier(normalized.replace(/_rebels$/, ""))
}

function formatRebelName(rebelType?: unknown): string {
	const rebelTypeLabel = formatRebelTypeLabel(rebelType)
	return rebelTypeLabel ? `Rebels (${rebelTypeLabel})` : "Rebels"
}

function paletteColorForDynasty(dynasty: string): string {
	return rgb01ToCss(dynastyColor(dynasty))
}

function formatRulerAgeLabel(
	birthDate: unknown,
	deathDate: unknown,
	selectedDays: number,
): string | null {
	if (
		typeof deathDate === "string" &&
		eu4DateToDays(deathDate) <= selectedDays
	) {
		return "Deceased"
	}
	if (typeof birthDate !== "string") return null
	const age = Math.floor((selectedDays - eu4DateToDays(birthDate)) / 365)
	return Number.isFinite(age) && age >= 0 ? String(age) : null
}

function formatRulerStatLabel(
	payload: Record<string, unknown> | null,
	fallbackName: string,
	selectedDays: number,
): string {
	const rulerName = String(payload?.name ?? fallbackName)
	const parts: string[] = []
	const ageLabel = formatRulerAgeLabel(
		payload?.birthDate,
		payload?.deathDate,
		selectedDays,
	)
	if (ageLabel) parts.push(ageLabel)
	if (
		payload?.regent === true ||
		/^(regency council|interregnum)$/i.test(rulerName.trim())
	) {
		if (payload?.regent === true) parts.push("Regent")
		return parts.join(" · ")
	}
	parts.push(payload?.female === true ? "♀" : "♂")
	return parts.join(" · ")
}

function indefiniteArticle(label: string): "a" | "an" {
	return /^[aeiou]/i.test(label) ? "an" : "a"
}

function subjectTypeLabel(subjectType: unknown): string {
	if (subjectType === "vassal") return "vassal"
	return typeof subjectType === "string" && subjectType.trim()
		? cleanEu4Identifier(subjectType).toLowerCase()
		: "subject"
}

function pluralizeSubjectTypeLabel(label: string): string {
	const words = label.split(" ")
	const lastWord = words[words.length - 1]
	words[words.length - 1] =
		lastWord.endsWith("y") && !/[aeiou]y$/i.test(lastWord)
			? `${lastWord.slice(0, -1)}ies`
			: lastWord.endsWith("s")
				? `${lastWord}es`
				: `${lastWord}s`
	return words.join(" ")
}

function subjectTypeGroupLabel(subjectType: unknown): string {
	const label = cleanEu4Identifier(subjectTypeLabel(subjectType))
	return pluralizeSubjectTypeLabel(label)
}

function subjectRelationDescription(params: {
	title: string
	otherName: string
	isStart: boolean
	isOverlordPage: boolean
	subjectType: unknown
}): string {
	const relation = subjectTypeLabel(params.subjectType)
	const article = indefiniteArticle(relation)
	if (params.isStart) {
		return params.isOverlordPage
			? `${params.title} gained ${params.otherName} as ${article} ${relation}.`
			: `${params.title} became ${article} ${relation} of ${params.otherName}.`
	}
	return params.isOverlordPage
		? `${params.title} lost ${params.otherName} as ${article} ${relation}.`
		: `${params.title} stopped being ${article} ${relation} of ${params.otherName}.`
}

// "A", "A and B", "A, B, and C" -- used to merge same-date war join/leave
// events (multiple nations joining/leaving on the same day, e.g. a shared
// peace treaty) into one WarWikiPage timeline entry instead of one per
// nation.
function joinWithAnd(names: string[]): string {
	if (names.length <= 1) return names[0] ?? ""
	if (names.length === 2) return `${names[0]} and ${names[1]}`
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

function pushTimelineEvent(
	events: NationTimelineEvent[],
	params: {
		id: string
		date: number
		type: string
		description: string
		comment?: string
		plainTextRanges?: NationTimelineEvent["plainTextRanges"]
		nations?: NationTimelineEvent["nations"]
		provinces?: NationTimelineEvent["provinces"]
		cultures?: NationTimelineEvent["cultures"]
		religions?: NationTimelineEvent["religions"]
		dynasties?: NationTimelineEvent["dynasties"]
		organizations?: NationTimelineEvent["organizations"]
		wars?: NationTimelineEvent["wars"]
	},
) {
	events.push({
		id: params.id,
		date: params.date,
		dateLabel: formatEu4Days(params.date),
		type: params.type,
		typeColor: timelineTypeColor(params.type),
		description: params.description,
		comment: params.comment,
		plainTextRanges: params.plainTextRanges,
		nations: params.nations ?? [],
		provinces: params.provinces ?? [],
		cultures: params.cultures ?? [],
		religions: params.religions ?? [],
		dynasties: params.dynasties ?? [],
		organizations: params.organizations ?? [],
		wars: params.wars ?? [],
	})
}

// organization-categories.ts's colors are 0-255 (organizations.json
// convention); rgb01ToCss expects 0-1.
function rgb255ToCss(rgb: [number, number, number]): string {
	return rgb01ToCss([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255])
}

export const GenesisView: React.FC = () => {
	const makeRandomSeed = useCallback(
		() => Math.floor(Math.random() * SEED_MAX),
		[],
	)
	// Refs
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const viewportRef = useRef<HTMLDivElement>(null)
	const sceneRef = useRef<GenesisScene | null>(null)
	const workerRef = useRef<Worker | null>(null)
	const lastWorldRef = useRef<SerializedGenesisWorld | null>(null)
	const hoverCardRef = useRef<HTMLDivElement>(null)
	const initialViewPrefs =
		typeof window === "undefined"
			? DEFAULT_VIEW_PREFS
			: (parseStoredViewPrefs(
					window.localStorage.getItem(VIEW_PREFS_STORAGE_KEY),
				) ?? DEFAULT_VIEW_PREFS)
	const initialGenerationSession =
		typeof window === "undefined" ? null : loadGenerationSessionSnapshotSync()

	// Core state
	const [world, setWorld] = useState<SerializedGenesisWorld | null>(null)
	const [generating, setGenerating] = useState(false)
	const [generationProgress, setGenerationProgress] = useState(0)
	const [generationLabel, setGenerationLabel] = useState("Idle")
	const [generationTimings, setGenerationTimings] = useState<
		StageTiming[] | null
	>(null)
	const [colorMode, setColorMode] = useState<ColorMode>(
		initialViewPrefs.colorMode,
	)
	const [dataVariant, setDataVariant] = useState<DataVariant>(() =>
		getDataVariant(initialViewPrefs.colorMode),
	)
	const setGeographyColorMode = useCallback(
		(mode: ColorMode) => setColorMode(applyDataVariant(mode, dataVariant)),
		[dataVariant],
	)
	const handleSetDataVariant = useCallback((next: DataVariant) => {
		setDataVariant(next)
		setColorMode((current) => applyDataVariant(getBaseMapMode(current), next))
	}, [])
	const [geographyMode, setGeographyMode] = useState<ColorMode>(
		initialViewPrefs.geographyMode,
	)
	const [nationMode, setNationMode] = useState<NationMapMode>(
		initialViewPrefs.nationMode,
	)
	const [populationMode, setPopulationMode] = useState<PopulationMapMode>(
		initialViewPrefs.populationMode,
	)
	const [viewMode, setViewMode] = useState<GenesisViewMode>(
		initialViewPrefs.viewMode,
	)
	const [solarSystemViewActive, setSolarSystemViewActive] = useState(
		initialGenerationSession?.solarSystemViewActive ??
			initialViewPrefs.solarSystemViewActive,
	)
	const [solarSystemControlsExpanded, setSolarSystemControlsExpanded] =
		useState(false)
	const [showSolarSystemEllipticalOrbits, setShowSolarSystemEllipticalOrbits] =
		useState(initialViewPrefs.showSolarSystemEllipticalOrbits)
	const [showSolarSystemDaylight, setShowSolarSystemDaylight] = useState(
		initialViewPrefs.showSolarSystemDaylight,
	)
	const [showSolarSystemInclination, setShowSolarSystemInclination] = useState(
		initialViewPrefs.showSolarSystemInclination,
	)
	const [showSolarSystemAxialTilt, setShowSolarSystemAxialTilt] = useState(
		initialViewPrefs.showSolarSystemAxialTilt,
	)
	const [showSolarSystemRealisticSizes, setShowSolarSystemRealisticSizes] =
		useState(initialViewPrefs.showSolarSystemRealisticSizes)
	const [showSolarSystemBodyNames, setShowSolarSystemBodyNames] = useState(
		initialViewPrefs.showSolarSystemBodyNames,
	)
	const [mapProjectionLatitude, setMapProjectionLatitude] = useState(
		initialViewPrefs.mapProjectionLatitude,
	)
	const [exportCenterLongitude, setExportCenterLongitude] = useState(0)
	const [draftMapProjectionLatitude, setDraftMapProjectionLatitude] = useState(
		initialViewPrefs.mapProjectionLatitude,
	)
	const [unitSystem, setUnitSystem] = useState<UnitSystem>(
		initialViewPrefs.unitSystem,
	)

	// Overlay state
	const [showWireframe, setShowWireframe] = useState(
		initialViewPrefs.showWireframe,
	)
	const [showGrid, setShowGrid] = useState(initialViewPrefs.showGrid)
	const [showNationBorders, setShowNationBorders] = useState(
		initialViewPrefs.showNationBorders,
	)
	const [showLandBorders, setShowLandBorders] = useState(
		initialViewPrefs.showLandBorders,
	)
	const [showNationHierarchy, setShowNationHierarchy] = useState(
		initialViewPrefs.showNationHierarchy,
	)
	const [showThermalEquator, setShowThermalEquator] = useState(
		initialViewPrefs.showThermalEquator,
	)
	const [showCoastlines, setShowCoastlines] = useState(
		initialViewPrefs.showCoastlines,
	)
	const [showWindArrows, setShowWindArrows] = useState(
		initialViewPrefs.showWindArrows,
	)
	const [showOceanCurrents, setShowOceanCurrents] = useState(
		initialViewPrefs.showOceanCurrents,
	)
	const [showRivers, setShowRivers] = useState(initialViewPrefs.showRivers)
	const [showGdd, setShowGdd] = useState(initialViewPrefs.showGdd)
	const [showGint, setShowGint] = useState(initialViewPrefs.showGint)
	const [showPet, setShowPet] = useState(initialViewPrefs.showPet)
	const [showAet, setShowAet] = useState(initialViewPrefs.showAet)
	const [showInfrastructure, setShowInfrastructure] = useState(
		initialViewPrefs.showInfrastructure,
	)
	const [labelMode, setLabelMode] = useState<LabelMode>(
		initialViewPrefs.labelMode,
	)
	useEffect(() => {
		setLabelMode((prev) =>
			syncLabelModeToMapMode({
				labelMode: prev,
				colorMode,
				nationMode,
				populationMode,
				isEarthImport: !!world?.isEarthImport,
			}),
		)
	}, [nationMode, colorMode, populationMode, world?.isEarthImport])
	const [showElevation, setShowElevation] = useState(
		initialViewPrefs.showElevation,
	)
	const [overlaysExpanded, setOverlaysExpanded] = useState(
		initialViewPrefs.overlaysExpanded,
	)
	const [clockDay, setClockDay] = useState(initialViewPrefs.clockDay)
	const [clockCurrent, setClockCurrent] = useState(
		initialViewPrefs.clockCurrent,
	)
	const [showDaylight, setShowDaylight] = useState(
		initialViewPrefs.showDaylight,
	)
	const [clockMonthMode, setClockMonthMode] = useState<"annual" | "monthly">(
		initialViewPrefs.clockMonthMode === "annual" ? "annual" : "monthly",
	)
	const [clockMonth, setClockMonth] = useState(initialViewPrefs.clockMonth)
	const [clockHour, setClockHour] = useState(initialViewPrefs.clockHour)
	const [clockUseMeridiem, setClockUseMeridiem] = useState(
		initialViewPrefs.clockUseMeridiem,
	)
	const [vegetationSubMode, setVegetationSubMode] = useState<VegetationSubMode>(
		initialViewPrefs.vegetationSubMode,
	)
	const [climateSubMode, setClimateSubMode] = useState<ClimateSubMode>(
		initialViewPrefs.climateSubMode,
	)
	const [elevationSubMode, setElevationSubMode] = useState<
		"colored" | "grayscale"
	>(initialViewPrefs.elevationSubMode)
	const [topographySubMode, setTopographySubMode] = useState<TopographySubMode>(
		initialViewPrefs.topographySubMode,
	)
	const [dangerSubMode, setDangerSubMode] = useState<
		"earthquake" | "volcanic" | "cyclone" | "tornado" | "tidal"
	>(initialViewPrefs.dangerSubMode)
	const [debugMapModes, setDebugMapModes] = useState(
		initialViewPrefs.debugMapModes,
	)
	const [gridSpacing, setGridSpacing] = useState(initialViewPrefs.gridSpacing)
	const [worldTab, setWorldTab] = useState<"planet" | "society">("planet")
	const [generationPanelOpen, setGenerationPanelOpen] = useState(
		initialGenerationSession?.generationPanelOpen ?? true,
	)
	const [generationPreviewTab, setGenerationPreviewTab] =
		useState<GenerationPreviewTab>(
			initialGenerationSession?.generationPreviewTab ?? "climate",
		)
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
	const [selectedNationId, setSelectedNationId] = useState<number | null>(null)
	// Separate from selectedNationId above -- that one drives the existing
	// right-side DetailsDrawer (procedural nations only). This is the new
	// left-panel "nation wiki page" selection (Earth import only for now),
	// identified by EU4 tag rather than a procedural nation id.
	const [selectedWikiNationTag, setSelectedWikiNationTagRaw] = useState<
		string | null
	>(null)
	// International organization wiki page selection (e.g. "HRE"/"HSA") --
	// mutually exclusive with the nation wiki page above; selecting either
	// clears the other so GenerationPanel only ever renders one at a time.
	const [selectedWikiOrganizationId, setSelectedWikiOrganizationIdRaw] =
		useState<string | null>(null)
	// War wiki page selection (wars.json warId) -- also mutually exclusive
	// with the nation/organization wiki pages above.
	const [selectedWikiWarId, setSelectedWikiWarIdRaw] = useState<string | null>(
		null,
	)
	const setSelectedWikiNationTag = useCallback((tag: string | null) => {
		setSelectedWikiOrganizationIdRaw(null)
		setSelectedWikiWarIdRaw(null)
		setSelectedWikiNationTagRaw(tag)
	}, [])
	const setSelectedWikiOrganizationId = useCallback((orgId: string | null) => {
		setSelectedWikiNationTagRaw(null)
		setSelectedWikiWarIdRaw(null)
		setSelectedWikiOrganizationIdRaw(orgId)
	}, [])
	const setSelectedWikiWarId = useCallback((warId: string | null) => {
		setSelectedWikiNationTagRaw(null)
		setSelectedWikiOrganizationIdRaw(null)
		setSelectedWikiWarIdRaw(warId)
	}, [])
	const [generationSessionRestored, setGenerationSessionRestored] = useState(
		initialGenerationSession !== null,
	)
	const handleSetWireframe = useCallback((next: boolean) => {
		setShowWireframe(next)
		sceneRef.current?.setWireframeVisible(next)
	}, [])
	const handleSetElevation = useCallback(
		(next: boolean) => {
			setShowElevation(next)
			sceneRef.current?.setElevationVisible(next)
			if (!next && (colorMode === "terrain" || colorMode === "landHeightmap")) {
				setColorMode(geographyMode)
			}
		},
		[colorMode, geographyMode],
	)

	const [earthHistoryPlaying, setEarthHistoryPlaying] = useState(false)
	const simStartTimeMs = historyYearToTime(800)
	const [selectedTimeMs, setSelectedTimeMs] = useState(simStartTimeMs)
	// Earth-imported worlds scrub real Gregorian dates via earthHistory's own
	// slider. selectedTimeMs tracks it so Social's population/culture/heritage/
	// religion counts follow the scrubber. eu4DaysToYear/historyYearToTime share
	// the same linear year axis, so this is a direct year-for-year mapping, not
	// a rescale.
	const earthHistory = useEarthHistoryTimeline(
		world?.provinces,
		!!world?.isEarthImport,
	)
	useEffect(() => {
		if (!world?.isEarthImport) return
		setSelectedTimeMs(
			historyYearToTime(eu4DaysToYear(earthHistory.selectedDays)),
		)
	}, [world?.isEarthImport, earthHistory.selectedDays])
	const [earthRealPopulation, setEarthRealPopulation] =
		useState<Eu4PopulationTimelineAsset | null>(null)
	const [earthRealUrbanPopulation, setEarthRealUrbanPopulation] =
		useState<Eu4PopulationTimelineAsset | null>(null)
	const [eu4GhslSettlements, setEu4GhslSettlements] =
		useState<Eu4GhslSettlementAsset | null>(null)
	useEffect(() => {
		if (!world?.isEarthImport) {
			setEarthHistoryPlaying(false)
			setEarthRealPopulation(null)
			setEarthRealUrbanPopulation(null)
			setEu4GhslSettlements(null)
			return
		}
		let cancelled = false
		loadEarthRealPopulationEu4()
			.then((asset) => {
				if (!cancelled) setEarthRealPopulation(asset)
			})
			.catch((error) => {
				console.error("Failed to load Earth population asset", error)
				if (!cancelled) setEarthRealPopulation(null)
			})
		loadEarthRealUrbanPopulationEu4()
			.then((asset) => {
				if (!cancelled) setEarthRealUrbanPopulation(asset)
			})
			.catch((error) => {
				console.error("Failed to load Earth urban population asset", error)
				if (!cancelled) setEarthRealUrbanPopulation(null)
			})
		loadEu4GhslSettlements()
			.then((asset) => {
				if (!cancelled) setEu4GhslSettlements(asset)
			})
			.catch((error) => {
				console.error("Failed to load GHSL settlements asset", error)
				if (!cancelled) setEu4GhslSettlements(null)
			})
		return () => {
			cancelled = true
		}
	}, [world?.isEarthImport])
	const displayMonth = historyTimeToMonth(selectedTimeMs)
	// When clock is locked to current sim time, sync month control (day resets to 0)
	useEffect(() => {
		if (clockCurrent) {
			setClockMonth(displayMonth - 1)
			setClockDay(0)
		}
	}, [clockCurrent, displayMonth])
	const resolvedClimateMonth =
		clockMonthMode === "annual"
			? 0
			: clockCurrent
				? displayMonth
				: clockMonth + 1
	const temperatureMonth = resolvedClimateMonth
	const rainfallMonth = resolvedClimateMonth
	const dtrMonth = resolvedClimateMonth
	const currentMonth = resolvedClimateMonth
	useEffect(() => {
		if (!world?.isEarthImport || earthHistory.loading || !earthHistoryPlaying)
			return
		const timer = window.setInterval(() => {
			earthHistory.setSelectedDays((prev) => {
				if (prev >= earthHistory.maxDays) {
					setEarthHistoryPlaying(false)
					return prev
				}
				const next = Math.min(prev + 365, earthHistory.maxDays)
				if (next >= earthHistory.maxDays) setEarthHistoryPlaying(false)
				return next
			})
		}, 1000)
		return () => window.clearInterval(timer)
	}, [
		earthHistory.loading,
		earthHistory.maxDays,
		earthHistory.setSelectedDays,
		earthHistoryPlaying,
		world?.isEarthImport,
	])
	useEffect(() => {
		if (earthHistory.selectedDays >= earthHistory.maxDays) {
			setEarthHistoryPlaying(false)
		}
	}, [earthHistory.maxDays, earthHistory.selectedDays])

	// Hover & measurement
	const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
	const [eu4HoverFillGeometry, setEu4HoverFillGeometry] =
		useState<Eu4ProvinceFillGeometry | null>(null)
	const [measureStart, setMeasureStart] = useState<number | null>(null)
	const [measureEnd, setMeasureEnd] = useState<number | null>(null)
	const [measureLabelPos, setMeasureLabelPos] = useState<
		[number, number] | null
	>(null)
	const measureRef = useRef<{ start: number | null; end: number | null }>({
		start: null,
		end: null,
	})

	// Measure state
	const [measureMode, setMeasureModeState] = useState<MeasureMode>(
		initialViewPrefs.measureMode,
	)
	const setMeasureMode = useCallback((mode: MeasureMode) => {
		measureRef.current = { start: null, end: null }
		setMeasureStart(null)
		setMeasureEnd(null)
		setMeasureLabelPos(null)
		sceneRef.current?.setMeasureLine(null, null)
		pathfindingRef.current = { start: null, end: null }
		setPathfindingResult(null)
		sceneRef.current?.setPathfindingOverlay(null, null, null)
		setMeasureModeState(mode)
	}, [])
	const [pathfindingLand, setPathfindingLand] = useState(
		initialViewPrefs.pathfindingLand,
	)
	const [pathfindingSea, setPathfindingSea] = useState(
		initialViewPrefs.pathfindingSea,
	)
	const [pathfindingResult, setPathfindingResult] = useState<{
		distanceKm: number
		landKm: number
		seaKm: number
		travelDays: number
	} | null>(null)
	const pathfindingRef = useRef<{ start: number | null; end: number | null }>({
		start: null,
		end: null,
	})

	// Generation params
	const initialStoredSeed = (() => {
		if (typeof window === "undefined") return null
		const stored = window.localStorage.getItem(PLANET_SEED_STORAGE_KEY)
		return stored ? resolveSeedLabel(stored) : null
	})()
	const initialSeed = initialStoredSeed ?? makeRandomSeed()
	const [seed, setSeed] = useState(() => initialSeed)
	const [seedInput, setSeedInput] = useState(() => formatSeedLabel(initialSeed))
	const [seedInputDirty, setSeedInputDirty] = useState(false)
	const [seedError, setSeedError] = useState(false)
	const [exportWidthPreset, setExportWidthPreset] =
		useState<ExportWidthPreset>("8192")
	const [exportProgress, setExportProgress] = useState<{
		percent: number
		label: string
	} | null>(null)
	const [exportError, setExportError] = useState<string | null>(null)

	// Planet params
	const numPoints = DEFAULT_WORLD_PARAMS.numPoints
	const jitter = DEFAULT_WORLD_PARAMS.jitter
	const numPlates = DEFAULT_WORLD_PARAMS.numPlates
	const roughness = DEFAULT_WORLD_PARAMS.roughness
	const [solarSystem, setSolarSystem] = useState<SolarSystemState>(() =>
		structuredClone(
			initialGenerationSession?.solarSystem ?? SOL_DEFAULT_SOLAR_SYSTEM,
		),
	)
	const spectralClass = solarSystem.star.class
	const starSubtype = solarSystem.star.subtype
	const restSeed =
		solarSystem.star.seed === "sol"
			? SOL_SEED
			: seedStringToNumber(solarSystem.star.seed)
	// Sol always shows its real, curated body names; a procedurally generated
	// system's own language-generated names aren't spoilers either, so a body
	// name is always shown once it exists.
	const namesEnabled = true
	// undefined for Sol -- Sol's star uses its own hardcoded "Sol" name
	// instead of a generated one.
	const starName = useMemo(
		() => (restSeed === SOL_SEED ? undefined : generateStarName(restSeed)),
		[restSeed],
	)
	const setRestSeed = useCallback((value: number) => {
		setSolarSystem((current) => ({
			...current,
			star: {
				...current.star,
				seed: value === SOL_SEED ? "sol" : value.toString(36).padStart(6, "0"),
			},
		}))
	}, [])
	// Whether a star reroll reserves the HZ-center slot for a rolled main
	// world (see generateSystemBodies) -- ignored for Sol, which always has
	// Earth. Plain component state, not persisted, matching spectral
	// class/subtype/seed.
	const [forceMainWorld, setForceMainWorld] = useState(true)

	// --- The main world's own physical/orbital state ---
	// Every one of these fields lives ONLY on the main world's SystemBody
	// entry in `solarSystem.orbits`, exactly like every sibling planet -- no
	// separate slider state to keep in sync. A procedurally generated (non-
	// Sol) main world is fully rolled fresh by generateSystemBodies itself on
	// every restSeed/star-type/forceMainWorld change (see generatedSystemBodies
	// below); its live edits persist via direct solarSystem.orbits mutation
	// (updateEditableSystemBody), never threaded back through regeneration.
	// Sol is the one remaining exception: Earth's live-edited values (e.g.
	// from the heightmap-import flow) DO need to survive a Sol-seed
	// regeneration, so `mainWorldBodyRef` still exists, scoped to that single
	// case, to avoid making every one of those fields a reactive dependency
	// of the memo below (which would otherwise loop: edit -> regenerate ->
	// new object identity -> sync effect -> "changed" again).
	const mainWorldBodyRef = useRef<SystemBody | null>(null)

	// --- Sibling solar system bodies (used by the GenerationPanel stat cards
	// and by the solar system view) ---
	const systemSeismologyContext = useMemo(() => {
		const cls = isValidSpectralClass(spectralClass)
			? (spectralClass as MainSequenceClass)
			: DEFAULT_SPECTRAL_CLASS
		const surfaceTidesCallbacks = buildSurfaceTidesSeismologyCallbacks({
			spectralClass,
			starSubtype,
		})
		if (restSeed === SOL_SEED) {
			return {
				starAgeGyr: SOL_STAR_AGE_GYR,
				starLuminositySol: 1,
				spectralClass: cls,
				...surfaceTidesCallbacks,
			}
		}
		return {
			starAgeGyr: getStarAgeGyr(restSeed, getStarMassSol(cls, starSubtype)),
			starLuminositySol: getStarLuminositySol(cls, starSubtype),
			spectralClass: cls,
			...surfaceTidesCallbacks,
		}
	}, [restSeed, spectralClass, starSubtype])

	const generatedSystemBodies: SystemBody[] = useMemo(() => {
		const cls = isValidSpectralClass(spectralClass)
			? (spectralClass as MainSequenceClass)
			: DEFAULT_SPECTRAL_CLASS
		if (restSeed !== SOL_SEED) {
			// Non-Sol: the main world (if any) is rolled fresh right alongside
			// its siblings -- no external params to build here at all.
			return generateSystemBodies({
				seed: restSeed,
				spectralClass: cls,
				starSubtype,
				forceMainWorld,
			})
		}
		// Sol: Earth's real live-edited slider values need to survive this
		// regeneration (e.g. the heightmap-import flow) -- see mainWorldBodyRef's
		// doc comment above for why this reads off the ref instead of reactive
		// state.
		const prev = mainWorldBodyRef.current
		const planetRadiusKm = prev
			? prev.diameterKm / 2
			: DEFAULT_WORLD_PARAMS.planetRadiusKm
		const orbitalDistanceAU = prev
			? prev.orbitalDistanceAU
			: DEFAULT_WORLD_PARAMS.orbitalDistanceAU
		const hoursPerDay = prev
			? prev.siderealDayHours
			: DEFAULT_WORLD_PARAMS.hoursPerDay
		const eccentricity = prev
			? prev.eccentricity
			: DEFAULT_WORLD_PARAMS.eccentricity
		const perihelion = prev
			? prev.longitudeOfPerihelionDeg
			: DEFAULT_WORLD_PARAMS.perihelion
		const obliquity = prev ? prev.axialTiltDeg : DEFAULT_WORLD_PARAMS.obliquity
		const substellarLon = prev
			? (prev.substellarLon ?? 0)
			: DEFAULT_WORLD_PARAMS.substellarLon
		const pressure = prev
			? (prev.atmosphere?.pressureBar ?? DEFAULT_WORLD_PARAMS.pressure)
			: DEFAULT_WORLD_PARAMS.pressure
		const tideLock = prev ? (prev.tideLock ?? null) : null
		const moons = prev ? prev.moons : [{ ...SOL_LUNA_DEFAULT, idx: 1 }]
		const solMainWorldOverrides = {
			name: SOL_MAIN_WORLD_DEFAULTS.name,
			orbitalDistanceAU,
			diameterKm: planetRadiusKm * 2,
			moons,
			massKg: derivePlanetMassKg(planetRadiusKm),
			gravityG: computeGravityG(
				derivePlanetMassKg(planetRadiusKm),
				planetRadiusKm * 2,
			),
			siderealDayHours: hoursPerDay,
			eccentricity,
			longitudeOfPerihelionDeg: perihelion,
			axialTiltDeg: obliquity,
			substellarLon,
			atmosphere: buildPressureAtmosphereProfile(pressure),
			tideLock,
			landDistribution:
				prev?.landDistribution ?? DEFAULT_WORLD_PARAMS.landDistribution,
			landCoverage: prev?.landCoverage ?? DEFAULT_WORLD_PARAMS.landCoverage,
			continentSizeVariety:
				prev?.continentSizeVariety ?? DEFAULT_WORLD_PARAMS.continentSizeVariety,
			seaLevel: prev?.seaLevel ?? DEFAULT_WORLD_PARAMS.seaLevel,
			maxElevation: 6000,
			albedo: SOL_MAIN_WORLD_DEFAULTS.albedo,
			greenhouseFactor: SOL_MAIN_WORLD_DEFAULTS.greenhouseFactor,
		}
		return generateSystemBodies({
			seed: restSeed,
			spectralClass: cls,
			starSubtype,
			forceMainWorld: true,
			solMainWorldOverrides,
		})
	}, [restSeed, spectralClass, starSubtype, forceMainWorld])
	const resetSourceSystemBodies = useMemo(
		() =>
			restSeed === SOL_SEED
				? SOL_DEFAULT_SOLAR_SYSTEM.orbits
				: generatedSystemBodies,
		[generatedSystemBodies, restSeed],
	)

	const skipNextGeneratedSystemBodiesSyncRef = useRef(false)
	useEffect(() => {
		if (skipNextGeneratedSystemBodiesSyncRef.current) {
			skipNextGeneratedSystemBodiesSyncRef.current = false
			return
		}
		setSolarSystem((current) => ({
			...current,
			orbits: generatedSystemBodies,
		}))
	}, [generatedSystemBodies])
	const systemBodies = solarSystem.orbits
	const mainWorldSystemBody =
		systemBodies.find((body) => body.isMainWorld) ?? null
	const displayMoons = mainWorldSystemBody?.moons ?? []
	const systemBodiesRef = useRef(systemBodies)
	systemBodiesRef.current = systemBodies
	const displayMoonsRef = useRef(displayMoons)
	displayMoonsRef.current = displayMoons
	mainWorldBodyRef.current = mainWorldSystemBody

	// Every physical/orbital field the main world exposes is a plain read off
	// its own SystemBody entry -- editing any of them (from the dedicated
	// Planet-tab sliders below, or from the generic orbit-navigator stat
	// card) goes through `updateMainWorldBody`, which patches that one entry
	// in `solarSystem.orbits` exactly like `updateEditableSystemBody` does
	// for every sibling planet.
	const updateMainWorldBody = useCallback(
		(updater: (body: SystemBody) => SystemBody) => {
			setSolarSystem((current) => ({
				...current,
				orbits: applySystemSeismology({
					bodies: current.orbits.map((body) =>
						body.isMainWorld ? updater(body) : body,
					),
					...systemSeismologyContext,
				}),
			}))
		},
		[systemSeismologyContext],
	)
	const planetRadiusKm =
		(mainWorldSystemBody?.diameterKm ??
			DEFAULT_WORLD_PARAMS.planetRadiusKm * 2) / 2
	const setPlanetRadiusKm = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => updateBodyDiameter(body, value * 2)),
		[updateMainWorldBody],
	)
	const landDistribution =
		mainWorldSystemBody?.landDistribution ??
		DEFAULT_WORLD_PARAMS.landDistribution
	const setLandDistribution = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, landDistribution: value })),
		[updateMainWorldBody],
	)
	const continentSizeVariety =
		mainWorldSystemBody?.continentSizeVariety ??
		DEFAULT_WORLD_PARAMS.continentSizeVariety
	const setContinentSizeVariety = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({
				...body,
				continentSizeVariety: value,
			})),
		[updateMainWorldBody],
	)
	const landCoverage =
		mainWorldSystemBody?.landCoverage ?? DEFAULT_WORLD_PARAMS.landCoverage
	const setLandCoverage = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({
				...body,
				landCoverage: value,
				// Keep hydrosphereCode (and its HYDROSPHERE_DESCRIPTIONS text) in
				// sync with the hand-edited land coverage, instead of leaving it
				// stuck at whatever value it was originally rolled with.
				hydrosphereCode: hydrosphereCodeFromWaterPct((1 - value) * 100),
			})),
		[updateMainWorldBody],
	)
	const obliquity =
		mainWorldSystemBody?.axialTiltDeg ?? DEFAULT_WORLD_PARAMS.obliquity
	const setObliquity = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, axialTiltDeg: value })),
		[updateMainWorldBody],
	)
	const eccentricity =
		mainWorldSystemBody?.eccentricity ?? DEFAULT_WORLD_PARAMS.eccentricity
	const setEccentricity = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, eccentricity: value })),
		[updateMainWorldBody],
	)
	const orbitalDistanceAU =
		mainWorldSystemBody?.orbitalDistanceAU ??
		DEFAULT_WORLD_PARAMS.orbitalDistanceAU
	const setOrbitalDistanceAU = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, orbitalDistanceAU: value })),
		[updateMainWorldBody],
	)
	const hoursPerDay =
		mainWorldSystemBody?.siderealDayHours ?? DEFAULT_WORLD_PARAMS.hoursPerDay
	const setHoursPerDay = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, siderealDayHours: value })),
		[updateMainWorldBody],
	)
	const scaledClockHour = scaleClockDialHourToDayLength(clockHour, hoursPerDay)
	const effectiveStarClass: MainSequenceClass = isValidSpectralClass(
		spectralClass,
	)
		? spectralClass
		: DEFAULT_SPECTRAL_CLASS

	const setSpectralClass = useCallback((cls: string) => {
		const nextClass: MainSequenceClass = isValidSpectralClass(cls)
			? cls
			: DEFAULT_SPECTRAL_CLASS
		setSolarSystem((current) => ({
			...current,
			star: { ...current.star, class: nextClass },
		}))
	}, [])
	const setStarSubtype = useCallback((subtype: number) => {
		setSolarSystem((current) => ({
			...current,
			star: { ...current.star, subtype },
		}))
	}, [])

	// Changing star class/subtype re-rolls the whole system (including the
	// main world) from the same restSeed -- generatedSystemBodies already
	// depends on spectralClass/starSubtype, and deviation 0 is always exactly
	// the new star's HZ center by construction (see generateSystemBodies), so
	// no separate "preserve HZ position" math is needed here anymore.
	const effectiveStarMassSol = getStarMassSol(effectiveStarClass, starSubtype)
	const tideLock = mainWorldSystemBody?.tideLock ?? null
	const setTideLock = useCallback(
		(lock: import("@/model/celestial/moons/moon-types").TideLock | null) =>
			updateMainWorldBody((body) => {
				const siderealDayHours = resolveBodyTideLockSiderealDayHours(lock, body)
				return {
					...body,
					tideLock: lock,
					...(siderealDayHours !== undefined ? { siderealDayHours } : {}),
				}
			}),
		[updateMainWorldBody],
	)
	const tidallyLocked = tideLock?.type === "solar"
	const substellarLon = mainWorldSystemBody?.substellarLon ?? 0
	const setSubstellarLon = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, substellarLon: value })),
		[updateMainWorldBody],
	)
	const perihelion =
		mainWorldSystemBody?.longitudeOfPerihelionDeg ??
		DEFAULT_WORLD_PARAMS.perihelion
	const setPerihelion = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({
				...body,
				longitudeOfPerihelionDeg: value,
			})),
		[updateMainWorldBody],
	)
	const pressure =
		mainWorldSystemBody?.atmosphere?.pressureBar ??
		DEFAULT_WORLD_PARAMS.pressure
	const setPressure = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({
				...body,
				atmosphere: buildPressureAtmosphereProfile(value),
			})),
		[updateMainWorldBody],
	)

	useEffect(() => {
		if (tideLock?.type !== "solar") return
		if (obliquity !== 0) setObliquity(0)
		if (eccentricity !== 0) setEccentricity(0)
	}, [tideLock, obliquity, eccentricity, setObliquity, setEccentricity])

	const daysPerYear = useMemo(() => {
		const keplerHours =
			getKeplerYearYears(orbitalDistanceAU, effectiveStarMassSol) * 365.25 * 24
		const dayHours = resolveMoonOrbitHoursPerDay(hoursPerDay, tideLock)
		return Math.round(keplerHours / dayHours)
	}, [orbitalDistanceAU, effectiveStarMassSol, hoursPerDay, tideLock])

	const effectiveDaysPerYear = tidallyLocked ? 1 : daysPerYear

	// Terrain params
	const terrainWarp = DEFAULT_WORLD_PARAMS.terrainWarp
	const smoothing = DEFAULT_WORLD_PARAMS.smoothing
	const hydraulicErosion = DEFAULT_WORLD_PARAMS.hydraulicErosion
	const thermalErosion = DEFAULT_WORLD_PARAMS.thermalErosion
	const ridgeSharpening = DEFAULT_WORLD_PARAMS.ridgeSharpening
	const glacialErosion = DEFAULT_WORLD_PARAMS.glacialErosion
	const seaLevel =
		mainWorldSystemBody?.seaLevel ?? DEFAULT_WORLD_PARAMS.seaLevel
	const setSeaLevel = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, seaLevel: value })),
		[updateMainWorldBody],
	)
	// Not user-adjustable -- fixed at Earth's real max elevation for every
	// generated world rather than tracked as UI state.
	const maxElevation = 6000
	const [era, setEra] = useState<SocietyEra>(DEFAULT_WORLD_PARAMS.era)

	// --- Three.js scene lifecycle ---
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const genesisScene = createGenesisScene(canvas)
		sceneRef.current = genesisScene
		genesisScene.setHoverHandler((info) => {
			setHoverInfo(
				info ? { region: info.region, x: info.clientX, y: info.clientY } : null,
			)
		})
		const onResize = () => genesisScene.resize()
		window.addEventListener("resize", onResize)
		const ro = new ResizeObserver(() => genesisScene.resize())
		ro.observe(canvas)
		return () => {
			window.removeEventListener("resize", onResize)
			ro.disconnect()
			workerRef.current?.terminate()
			workerRef.current = null
			genesisScene.setHoverHandler(null)
			genesisScene.dispose()
			sceneRef.current = null
		}
	}, [])

	// --- Scene sync effects ---
	useEffect(() => {
		sceneRef.current?.setAtmospherePressure(world?.params.pressure ?? pressure)
	}, [world, pressure])
	useEffect(() => {
		if (!world) {
			setHoverInfo(null)
			return
		}
		setGenerationTimings(world.timings ?? null)
	}, [world])
	useEffect(() => {
		if (typeof window === "undefined") return
		window.localStorage.setItem(PLANET_SEED_STORAGE_KEY, formatSeedLabel(seed))
	}, [seed])
	useEffect(() => {
		if (typeof window === "undefined") return
		window.localStorage.setItem(
			VIEW_PREFS_STORAGE_KEY,
			serializeStoredViewPrefs({
				colorMode,
				geographyMode,
				nationMode,
				populationMode,
				viewMode,
				solarSystemViewActive,
				showSolarSystemEllipticalOrbits,
				showSolarSystemDaylight,
				showSolarSystemInclination,
				showSolarSystemAxialTilt,
				showSolarSystemRealisticSizes,
				showSolarSystemBodyNames,
				showWireframe,
				showGrid,
				showNationBorders,
				showLandBorders,
				showNationHierarchy,
				labelMode,
				showElevation,
				showThermalEquator,
				showCoastlines,
				showWindArrows,
				showGdd,
				showGint,
				showPet,
				showAet,
				showOceanCurrents,
				showRivers,
				showInfrastructure,
				overlaysExpanded,
				gridSpacing,
				unitSystem,
				mapProjectionLatitude,
				debugMapModes,
				measureMode,
				pathfindingLand,
				pathfindingSea,
				showDaylight,
				clockCurrent,
				clockDay,
				clockHour,
				clockUseMeridiem,
				clockMonthMode,
				clockMonth,
				vegetationSubMode,
				climateSubMode,
				elevationSubMode,
				topographySubMode,
				dangerSubMode,
			}),
		)
	}, [
		colorMode,
		solarSystemViewActive,
		showSolarSystemEllipticalOrbits,
		showSolarSystemDaylight,
		showSolarSystemInclination,
		showSolarSystemAxialTilt,
		showSolarSystemRealisticSizes,
		showSolarSystemBodyNames,
		showDaylight,
		clockCurrent,
		clockDay,
		clockHour,
		clockUseMeridiem,
		clockMonthMode,
		clockMonth,
		vegetationSubMode,
		climateSubMode,
		elevationSubMode,
		topographySubMode,
		dangerSubMode,
		debugMapModes,
		geographyMode,
		gridSpacing,
		mapProjectionLatitude,
		nationMode,
		overlaysExpanded,
		populationMode,
		showGrid,
		showInfrastructure,
		showNationBorders,
		showLandBorders,
		showNationHierarchy,
		labelMode,
		showElevation,
		showRivers,
		showThermalEquator,
		showCoastlines,
		showWindArrows,
		showGdd,
		showGint,
		showPet,
		showAet,
		showOceanCurrents,
		showWireframe,
		unitSystem,
		viewMode,
		measureMode,
		pathfindingLand,
		pathfindingSea,
	])
	// --- Color mode guard ---
	useEffect(() => {
		if (!world) return
		const normalizedColorMode = normalizeGeographyColorMode({
			colorMode,
			hasHazards: !!world?.hazards,
			hasVolcanism: !!world?.volcanism,
			isEarthImport: !!world?.isEarthImport,
		})
		if (normalizedColorMode !== colorMode) {
			setColorMode(normalizedColorMode)
			setGeographyMode(normalizedColorMode)
		}
	}, [colorMode, world?.hazards, world?.volcanism, world?.isEarthImport, world])

	// --- Nation mode guard ---
	useEffect(() => {
		if (!world) return
		const normalizedNationMode = normalizeNationMapMode(
			nationMode,
			!!world.isEarthImport,
		)
		if (normalizedNationMode !== nationMode) setNationMode(normalizedNationMode)
	}, [nationMode, world?.isEarthImport, world])

	useEffect(() => {
		if (debugMapModes) return
		if (isDebugGeographyMode(colorMode)) {
			setColorMode(DEFAULT_GEOGRAPHY_MODE)
			setGeographyMode(DEFAULT_GEOGRAPHY_MODE)
			return
		}
		if (colorMode === "nations" && isDebugNationMode(nationMode)) {
			setNationMode("borders")
		}
	}, [colorMode, debugMapModes, nationMode])

	const worldForDisplay = useMemo(() => {
		const displayWorld = buildDisplayWorld({ world })
		if (!displayWorld) return null
		const displayProvinces = attachEarthProvinceAreas({
			provinces: displayWorld.provinces,
			asset: earthRealPopulation,
		})
		const realPopulationSlice =
			displayWorld.isEarthImport && earthRealPopulation
				? buildRealPopulationSlice({
						asset: earthRealPopulation,
						provinces: displayProvinces,
						syntheticPopulation: displayWorld.population?.population,
						selectedDays: earthHistory.selectedDays,
					})
				: null
		const realUrbanPopulationSlice =
			displayWorld.isEarthImport && earthRealUrbanPopulation
				? buildRealUrbanPopulationSlice({
						asset: earthRealUrbanPopulation,
						provinces: displayProvinces,
						selectedDays: earthHistory.selectedDays,
					})
				: null
		const realSettlementSlice =
			displayWorld.isEarthImport &&
			eu4GhslSettlements &&
			displayProvinces.realIds
				? (() => {
						const population = buildGhslSettlementPopulationSlice(
							eu4GhslSettlements,
							earthHistory.selectedDays,
						)
						if (!population) return null
						const bestByProvince = buildBestSettlementByProvince(
							population,
							eu4GhslSettlements.provinceIds,
						)
						const provinceCount = displayProvinces.count
						const names = new Array<string | null>(provinceCount).fill(null)
						const pops = new Float32Array(provinceCount)
						const realIds = displayProvinces.realIds!
						for (let compactIdx = 0; compactIdx < provinceCount; compactIdx++) {
							const settlementIdx = bestByProvince.get(realIds[compactIdx])
							if (settlementIdx === undefined) continue
							names[compactIdx] = eu4GhslSettlements.names[settlementIdx]
							pops[compactIdx] = population[settlementIdx]
						}
						return { names, population: pops }
					})()
				: null
		return realPopulationSlice ||
			realUrbanPopulationSlice ||
			realSettlementSlice ||
			displayProvinces !== displayWorld.provinces
			? {
					...displayWorld,
					provinces: displayProvinces,
					...(realPopulationSlice
						? { realPopulation: realPopulationSlice }
						: {}),
					...(realUrbanPopulationSlice
						? { realUrbanPopulation: realUrbanPopulationSlice }
						: {}),
					...(realSettlementSlice
						? { realSettlement: realSettlementSlice }
						: {}),
				}
			: displayWorld
	}, [
		world,
		earthRealPopulation,
		earthRealUrbanPopulation,
		eu4GhslSettlements,
		earthHistory.selectedDays,
	])
	useEffect(() => {
		let cancelled = false
		if (!worldForDisplay?.isEarthImport) {
			setEu4HoverFillGeometry(null)
			return () => {
				cancelled = true
			}
		}
		loadEu4ProvinceFillGeometry()
			.then((geometry) => {
				if (!cancelled) setEu4HoverFillGeometry(geometry)
			})
			.catch((err) => {
				console.error("Failed to load EU4 province fill geometry:", err)
			})
		return () => {
			cancelled = true
		}
	}, [worldForDisplay?.isEarthImport])
	const earthHistoryFormatLabel = useCallback(
		(timeValue: number) => earthHistory.formatLabel(timeValue),
		[earthHistory.formatLabel],
	)
	const nationModel = useMemo(
		() => buildDisplayNationModel(worldForDisplay),
		[worldForDisplay],
	)
	const nationProvinceCounts = useMemo(() => {
		return nationModel?.counts ?? new Map<number, number>()
	}, [nationModel])
	const nationColorById = useMemo(
		() => nationModel?.colorById ?? new Map<number, [number, number, number]>(),
		[nationModel],
	)
	const getNationColor = useCallback(
		(nationId: number): string | null => {
			if (nationId < 0) return null
			const color = nationColorById.get(nationId)
			return color ? rgbToCss(color) : null
		},
		[nationColorById],
	)
	const drawerWorldPopulation = useMemo(() => {
		if (
			getBaseMapMode(colorMode) === "population" &&
			dataVariant === "observed" &&
			worldForDisplay?.realPopulation
		) {
			return worldForDisplay.realPopulation.totalPopulation
		}
		// worldForDisplay.realPopulation is real, per-real-date data (built from
		// earthRealPopulation/earthRealUrbanPopulation via
		// earthHistory.selectedDays), so prefer it outright for Earth import
		// rather than only when the map's own colorMode happens to be on the
		// population overlay -- otherwise this pins to the static
		// generation-time total regardless of the real-history slider.
		if (worldForDisplay?.isEarthImport && worldForDisplay?.realPopulation) {
			return worldForDisplay.realPopulation.totalPopulation
		}
		return world?.population?.totalPopulation ?? null
	}, [
		colorMode,
		dataVariant,
		worldForDisplay?.isEarthImport,
		worldForDisplay?.realPopulation,
		world?.population?.totalPopulation,
	])

	// Same underlying issue as drawerWorldPopulation above -- Earth import has
	// no procedural timelineBundle to read culture/religion/war counts from,
	// so for that path prefer earthHistory's own real per-date engine
	// (already time-varying with the real-history slider) over the static
	// procedural worldForDisplay fields used below.
	const earthSocialCounts = useMemo(() => {
		if (!world?.isEarthImport || !earthHistory.query) return null
		const frame = earthHistory.query.frame
		return {
			cultureCount: frame.cultureCount,
			religionCount: frame.religionCount,
			activeWarCount: frame.activeWars.length,
		}
	}, [world?.isEarthImport, earthHistory.query])

	useEffect(() => {
		if (!worldForDisplay) {
			setSelectedNationId(null)
			return
		}
		if (!worldForDisplay.nations || selectedNationId === null) return
		if (selectedNationId < 0 || !nationProvinceCounts.has(selectedNationId)) {
			setSelectedNationId(null)
		}
	}, [nationProvinceCounts, selectedNationId, worldForDisplay])

	// --- Hover computations ---
	const hoverElevationKm = getHoverElevationKm(hoverInfo, worldForDisplay)
	const hoverTopography = getHoverTopography(
		hoverInfo,
		worldForDisplay,
		dataVariant,
	)
	const hoverCoordinates = useMemo(
		() => getHoverCoordinates(hoverInfo, worldForDisplay),
		[hoverInfo, worldForDisplay],
	)
	const hoverTimezone = useMemo(
		() => getHoverTimezone(hoverInfo, worldForDisplay),
		[hoverInfo, worldForDisplay],
	)
	const hoverTemperatureDelta = getHoverTemperatureDelta(
		hoverInfo,
		worldForDisplay,
	)
	const hoverRainfall = getHoverRainfall(
		hoverInfo,
		worldForDisplay,
		rainfallMonth,
	)
	const hoverRealRainfall = getHoverRealRainfall(
		hoverInfo,
		worldForDisplay,
		rainfallMonth,
	)
	const hoverRainfallDiff = getHoverRainfallDiff(
		hoverInfo,
		worldForDisplay,
		rainfallMonth,
	)
	const hoverDtr = getHoverDtr(hoverInfo, worldForDisplay, dtrMonth)
	const hoverRealDtr = getHoverRealDtr(hoverInfo, worldForDisplay, dtrMonth)
	const hoverDtrDiff = getHoverDtrDiff(hoverInfo, worldForDisplay, dtrMonth)
	const hoverHumidity = getHoverHumidity(hoverInfo, worldForDisplay, dtrMonth)
	const hoverRealHumidity = getHoverRealHumidity(
		hoverInfo,
		worldForDisplay,
		dtrMonth,
	)
	const hoverHumidityDiff = getHoverHumidityDiff(
		hoverInfo,
		worldForDisplay,
		dtrMonth,
	)
	const hoverRealTemperature = getHoverRealTemperature(
		hoverInfo,
		worldForDisplay,
		temperatureMonth,
	)
	const hoverTemperatureDiff = getHoverTemperatureDiff(
		hoverInfo,
		worldForDisplay,
		temperatureMonth,
	)
	const hoverClimateZone = getHoverClimateZone(
		hoverInfo,
		worldForDisplay,
		dataVariant,
	)
	const hoverPastaClimate = getHoverPastaClimate(hoverInfo, worldForDisplay)
	const hoverKoppenClimate = getHoverKoppenClimate(hoverInfo, worldForDisplay)
	const hoverRealPastaClimate = getHoverRealPastaClimate(
		hoverInfo,
		worldForDisplay,
	)
	const hoverRealKoppenClimate = getHoverRealKoppenClimate(
		hoverInfo,
		worldForDisplay,
	)
	const hoverBiome = getHoverBiome(hoverInfo, worldForDisplay, dataVariant)
	const earthImportRawIdToCompact = useMemo(() => {
		const realIds = worldForDisplay?.provinces?.realIds
		if (!realIds) return null
		const map = new Map<number, number>()
		for (let idx = 0; idx < realIds.length; idx++) {
			map.set(realIds[idx], idx)
		}
		return map
	}, [worldForDisplay?.provinces?.realIds])
	const hoverProvince = useMemo(() => {
		const fallbackProvince = getHoverProvince(hoverInfo, worldForDisplay)
		if (
			!hoverInfo ||
			!worldForDisplay?.isEarthImport ||
			!worldForDisplay.provinces?.realIds ||
			!earthImportRawIdToCompact ||
			!eu4HoverFillGeometry
		) {
			return fallbackProvince
		}
		const lonLat = getHoverLonLat(hoverInfo, worldForDisplay)
		if (!lonLat) return fallbackProvince
		const rawProvinceId = findEu4ProvinceForLonLat(
			eu4HoverFillGeometry,
			lonLat.lonDeg,
			lonLat.latDeg,
		)
		if (rawProvinceId === null) return fallbackProvince
		return earthImportRawIdToCompact.get(rawProvinceId) ?? fallbackProvince
	}, [
		earthImportRawIdToCompact,
		eu4HoverFillGeometry,
		hoverInfo,
		worldForDisplay,
	])
	const hoverLandmark = getHoverLandmark(hoverInfo, worldForDisplay)
	const hoverIsLand = getHoverIsLand(hoverInfo, worldForDisplay)
	const hoverOceanDist = getHoverOceanDist(hoverInfo, worldForDisplay)
	const hoverDistCoast = getHoverDistCoast(hoverInfo, worldForDisplay)
	const hoverHazards = getHoverHazards(hoverInfo, worldForDisplay)
	const hoverHotspot = getHoverHotspot(hoverInfo, worldForDisplay)
	const hoverRiver = getHoverRiver(hoverInfo, worldForDisplay)
	const hoverTerrainFeature = getHoverTerrainFeature(hoverInfo, worldForDisplay)
	const hoverOceanCurrents = getHoverOceanCurrents(hoverInfo, worldForDisplay)
	const hoverNationId = useMemo(() => {
		const assignment = nationModel?.assignment
		if (hoverProvince === null || hoverProvince < 0 || !assignment) return null
		return assignment[hoverProvince] ?? null
	}, [nationModel, hoverProvince])
	const worldNames = useMemo(
		() => (world ? createDisplayNames(world) : null),
		[world],
	)
	const nationLabelsArray = useMemo(() => {
		return buildNationLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const dynastyLabelsArray = useMemo(() => {
		return buildNationDynastyLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const settlementLabelsArray = useMemo(() => {
		return buildSettlementLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const cultureLabelsArray = useMemo(() => {
		return buildCultureLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const heritageLabelsArray = useMemo(() => {
		return buildHeritageLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const labelsPlaybackActive = earthHistoryPlaying
	const sampledNationLabelsArray = usePlaybackSampledValue(
		nationLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const sampledDynastyLabelsArray = usePlaybackSampledValue(
		dynastyLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const sampledSettlementLabelsArray = usePlaybackSampledValue(
		settlementLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const sampledCultureLabelsArray = usePlaybackSampledValue(
		cultureLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const sampledHeritageLabelsArray = usePlaybackSampledValue(
		heritageLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const getNationName = useCallback(
		(nationId: number) => worldNames?.nation(nationId) ?? `#${nationId}`,
		[worldNames],
	)
	const getProvinceName = useCallback(
		(provinceId: number) =>
			worldNames?.province(provinceId) ?? `Province #${provinceId}`,
		[worldNames],
	)
	const getCultureName = useCallback(
		(cultureId: number) =>
			worldNames?.culture(cultureId) ?? `Culture #${cultureId}`,
		[worldNames],
	)
	const getHeritageName = useCallback(
		(heritageId: number) =>
			worldNames?.heritage(heritageId) ?? `Heritage #${heritageId}`,
		[worldNames],
	)
	const getLeaderName = useCallback(
		(nationId: number, timeMs: number) =>
			worldNames?.leader(nationId, timeMs) ?? `Leader #${nationId}`,
		[worldNames],
	)
	const getDynastyName = useCallback(
		(dynastyId: number) =>
			worldNames?.dynasty(dynastyId) ?? `Dynasty #${dynastyId}`,
		[worldNames],
	)
	const getLandmarkName = useCallback(
		(landmarkId: number) =>
			worldNames?.landmark(landmarkId) ?? `#${landmarkId}`,
		[worldNames],
	)
	const getRiverName = useCallback(
		(riverId: number) => worldNames?.river(riverId) ?? `#${riverId}`,
		[worldNames],
	)
	const getProvinceColor = useCallback(
		(provinceId: number) => {
			if (
				!worldForDisplay?.provinces?.colors ||
				provinceId < 0 ||
				provinceId * 3 + 2 >= worldForDisplay.provinces.colors.length
			) {
				return null
			}
			return rgbToCss([
				worldForDisplay.provinces.colors[provinceId * 3],
				worldForDisplay.provinces.colors[provinceId * 3 + 1],
				worldForDisplay.provinces.colors[provinceId * 3 + 2],
			])
		},
		[worldForDisplay],
	)
	const hoverDistCoastKm = getHoverDistCoastKm(hoverDistCoast)
	// Occupation came from the procedural sim's active wars, which no longer
	// exist; Earth import surfaces its own occupation overlay separately.
	const hoverOccupation: {
		id: number
		name: string
		color: string
		rebel: boolean
	} | null = null
	const hoverIceSummary = (() => {
		if (!(hoverInfo && worldForDisplay)) return null
		const r = hoverInfo.region
		const iceThickness = worldForDisplay.iceThickness?.[r] ?? 0
		const iceMin = worldForDisplay.iceMinMonthly?.[r] ?? 0
		const iceMax = worldForDisplay.iceMaxMonthly?.[r] ?? 0
		if (iceThickness <= 0 && iceMax <= 0) return null
		return `${(iceThickness / 1000).toFixed(2)} m (${(iceMin / 1000).toFixed(2)}-${(iceMax / 1000).toFixed(2)})`
	})()
	const hoverClimateDisplay = getHoverClimateDisplay(
		colorMode,
		hoverPastaClimate,
		hoverKoppenClimate,
		hoverClimateZone,
		hoverRealPastaClimate,
		hoverRealKoppenClimate,
	)

	// Shared wind computation — runs when wind arrows or wind color mode is active
	const windVectors = useMemo(() => {
		if (
			!world?.climate ||
			(!showWindArrows &&
				colorMode !== "wind" &&
				colorMode !== "misery" &&
				colorMode !== "realMisery")
		)
			return null
		const month =
			resolvedClimateMonth > 0 ? resolvedClimateMonth - 1 : undefined
		return computeWindVectors(
			world.mesh,
			world.climate,
			world.elevation_km,
			world.params,
			month,
			{
				vegetation: world.vegetation,
				topography: world.topography,
				slopeScore: world.slopeScore,
				oceanDist: world.oceanDist,
			},
		)
	}, [world, showWindArrows, colorMode, resolvedClimateMonth])

	// Monthly wind: computed lazily across setTimeout ticks when wind is active
	const monthlyWindRef = useRef<
		Array<{ windU: Float32Array; windV: Float32Array; windSpeed: Float32Array }>
	>([])
	const [monthlyWindReady, setMonthlyWindReady] = useState(false)
	const windActive =
		showWindArrows ||
		colorMode === "wind" ||
		getMapModePrimary(colorMode) === "geography"
	useEffect(() => {
		if (!world?.climate || !windActive) {
			monthlyWindRef.current = []
			setMonthlyWindReady(false)
			return
		}
		const results: typeof monthlyWindRef.current = []
		setMonthlyWindReady(false)
		let m = 0
		const tick = () => {
			if (m >= 12) {
				monthlyWindRef.current = results
				setMonthlyWindReady(true)
				return
			}
			results.push(
				computeWindVectors(
					world.mesh,
					world.climate,
					world.elevation_km,
					world.params,
					m++,
					{
						vegetation: world.vegetation,
						topography: world.topography,
						slopeScore: world.slopeScore,
						oceanDist: world.oceanDist,
					},
				),
			)
			setTimeout(tick, 0)
		}
		setTimeout(tick, 0)
		return () => {
			setMonthlyWindReady(false)
		}
	}, [world, windActive])

	const projectToScreen = useCallback(
		(xyz: [number, number, number], lonOffsetRad?: number) =>
			sceneRef.current?.projectToScreen(xyz, lonOffsetRad) ?? null,
		[],
	)
	const getGlobeCameraDir = useCallback(
		() => sceneRef.current?.getGlobeCameraDir() ?? null,
		[],
	)

	const hoverWindSpeed =
		hoverInfo && windVectors ? windVectors.windSpeed[hoverInfo.region] : null
	const hoverWindDir =
		hoverInfo && windVectors
			? windDirectionLabel(
					windVectors.windU[hoverInfo.region],
					windVectors.windV[hoverInfo.region],
				)
			: null
	const hoverWindMonthly = useMemo(() => {
		if (!hoverInfo || !monthlyWindReady || monthlyWindRef.current.length < 12)
			return null
		const r = hoverInfo.region
		return monthlyWindRef.current.map((wv) => ({
			speedMs: wv.windSpeed[r],
			dir: windDirectionLabel(wv.windU[r], wv.windV[r]),
		}))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hoverInfo?.region, monthlyWindReady, hoverInfo])

	const hoverMisery: HoverMisery | null = getHoverMisery(
		hoverInfo,
		worldForDisplay,
		dtrMonth,
		hoverWindSpeed,
		hoverWindMonthly?.map((w) => w.speedMs) ?? null,
		colorMode === "realMisery",
	)

	const windStats = useMemo(() => {
		if (!world?.climate) return null
		const vectors = computeWindVectors(
			world.mesh,
			world.climate,
			world.elevation_km,
			world.params,
			undefined,
			{
				vegetation: world.vegetation,
				topography: world.topography,
				slopeScore: world.slopeScore,
				oceanDist: world.oceanDist,
			},
		)
		const speeds = vectors.windSpeed
		let sum = 0
		let max = 0
		for (let i = 0; i < speeds.length; i++) {
			const s = speeds[i]
			sum += s
			if (s > max) max = s
		}
		return { avg: speeds.length > 0 ? sum / speeds.length : 0, max }
	}, [world])

	// Resolves the per-org category schema (organization-categories.ts) into
	// a ready-to-use categorizer + color lookup for one folded state --
	// shared by resolveOrgProvinceColor below (the base region-color fill)
	// and the occupationOverlay memo's stripe pass (computeOrgStripeOverlay),
	// so both always agree on which province belongs to which category. Only
	// built once per (state, org) rather than once per region/call site --
	// see OrgCategorySchema's doc comment for why that matters. Returns null
	// for an org with no registered schema (organization-categories.ts's
	// ORG_CATEGORY_SCHEMAS) -- callers fall back to plain solid-member-color/
	// white-elsewhere coloring with no stripe in that case.
	const buildOrgCategorizer = useCallback(
		(
			state: FoldedState,
			orgRef: RawOrganizationReference,
		): {
			categorize: OrgCategorizer
			categoryColor: (categoryId: string) => [number, number, number]
		} | null => {
			const schema = ORG_CATEGORY_SCHEMAS[orgRef.id]
			if (!schema) return null
			const categorize = schema.createCategorizer(state)
			const colorCache = new Map<string, [number, number, number]>()
			const categoryColor = (categoryId: string): [number, number, number] => {
				let color = colorCache.get(categoryId)
				if (color) return color
				const rgb =
					schema.categories.find((c) => c.id === categoryId)?.color ??
					orgRef.color
				color = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
				colorCache.set(categoryId, color)
				return color
			}
			return { categorize, categoryColor }
		},
		[],
	)

	// Recolors provinces belonging to the currently-open org's wiki page,
	// entirely at region level -- eu4-province-borders-fills.json's real
	// polygon triangulation only covers ~85% of provinces (3522 of 4195),
	// so a mesh-overlay approach left the other ~15% showing whatever the
	// base map already had underneath. The region mesh (world.mesh) always
	// covers 100% of the globe, so painting it directly (same mechanism
	// computeEarthHistoryRegionColors already uses for ordinary political
	// coloring) has no coverage gaps and no separate-mesh depth/elevation
	// concerns. Every org replaces every region's color outright: white
	// outside the organization, and a per-category color (from
	// buildOrgCategorizer) for every province a category covers.
	const resolveOrgProvinceColor = useCallback(
		(
			state: FoldedState,
			orgRef: RawOrganizationReference,
		): ((rawId: number) => [number, number, number] | null) => {
			const WHITE: [number, number, number] = [1, 1, 1]
			const colorByRawId = new Map<number, [number, number, number]>()
			const resolvers = buildOrgCategorizer(state, orgRef)
			if (resolvers) {
				const { categorize, categoryColor } = resolvers
				for (const rawId of state.provinces.keys()) {
					const numericRawId = Number(rawId)
					const category = categorize(numericRawId)
					// Striped categories (HRE's foreign holders, HSA's trade posts)
					// stay white at this base layer -- their diagonal stripe
					// (computeOrgStripeOverlay, fed through the SAME occColor/
					// occMask attributes as the ordinary occupation stripe) is the
					// sole indicator, same convention as the real occupation
					// overlay (owner's own color underneath, controller's color
					// striped on top).
					colorByRawId.set(
						numericRawId,
						category && !category.striped
							? categoryColor(category.categoryId)
							: WHITE,
					)
				}
			} else {
				// No registered schema: fall back to plain solid-member-color/
				// white-elsewhere coloring, so a brand new org still renders
				// reasonably before anyone gets around to giving it a real schema.
				const memberProvinceRawIds = collectOrgMemberProvinceRawIds(
					state,
					orgRef.id,
				)
				const orgColor: [number, number, number] = [
					orgRef.color[0] / 255,
					orgRef.color[1] / 255,
					orgRef.color[2] / 255,
				]
				for (const rawId of state.provinces.keys()) {
					const numericRawId = Number(rawId)
					colorByRawId.set(
						numericRawId,
						memberProvinceRawIds.has(numericRawId) ? orgColor : WHITE,
					)
				}
			}
			return (rawId: number) => colorByRawId.get(rawId) ?? WHITE
		},
		[buildOrgCategorizer],
	)
	const withOrgHighlight = useCallback(
		(baseColors: Float32Array | null): Float32Array | null => {
			if (
				!selectedWikiOrganizationId ||
				!worldForDisplay?.provinces?.regionProvince ||
				!earthHistory.query ||
				!earthHistory.organizationReference ||
				!earthHistory.engine
			)
				return baseColors
			const orgRef = earthHistory.organizationReference.get(
				selectedWikiOrganizationId,
			)
			if (!orgRef) return baseColors
			const provinceColor = resolveOrgProvinceColor(
				earthHistory.query.state,
				orgRef,
			)
			const regionProvince = worldForDisplay.provinces.regionProvince
			const compactToRealId = earthHistory.engine.provinceMap.compactToRealId
			const N = worldForDisplay.mesh.numRegions
			// Mutate baseColors in place rather than copying it first -- every
			// caller (see regionColors' useMemo) computes a brand-new
			// Float32Array on the spot and never reads it again itself, so
			// there's nothing to protect by copying, only a wasted full-array
			// allocation + copy on top of the write loop below.
			const out = baseColors ?? new Float32Array(N * 3)
			for (let region = 0; region < N; region++) {
				const compact = regionProvince[region]
				if (compact < 0 || compact >= compactToRealId.length) continue
				const rawId = compactToRealId[compact]
				const color = provinceColor(rawId)
				if (!color) continue
				out[3 * region] = color[0]
				out[3 * region + 1] = color[1]
				out[3 * region + 2] = color[2]
			}
			return out
		},
		[
			selectedWikiOrganizationId,
			worldForDisplay,
			earthHistory.query,
			earthHistory.organizationReference,
			earthHistory.engine,
			resolveOrgProvinceColor,
		],
	)

	// --- Region colors ---
	const regionColors = useMemo(() => {
		if (!worldForDisplay) return null
		if (colorMode === "wind" && windVectors) {
			const N = worldForDisplay.mesh.numRegions
			const rgb = new Float32Array(N * 3)
			const { windSpeed } = windVectors
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = windSpeedColor(windSpeed[r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return withOrgHighlight(rgb)
		}
		if (
			(colorMode === "misery" || colorMode === "realMisery") &&
			windVectors &&
			worldForDisplay.climate &&
			worldForDisplay.dtr_annual
		) {
			// realMisery uses observed temperature/humidity throughout; misery
			// (model) uses the modeled climate estimates throughout. Wind has no
			// observed variant (no per-region historical wind data is
			// available), so it always comes from the model regardless of mode.
			const isObserved = colorMode === "realMisery"
			const N = worldForDisplay.mesh.numRegions
			const rgb = new Float32Array(N * 3)
			const isMonthly = dtrMonth > 0
			const offset = isMonthly ? (dtrMonth - 1) * N : 0
			const monthlyTemp = isMonthly
				? worldForDisplay.climate.temperature_monthly
				: null
			const monthlyRealTemp = isMonthly
				? worldForDisplay.climate.real_temperature_monthly
				: null
			const monthlyDtr = isMonthly ? worldForDisplay.dtr_monthly : null
			const aet = worldForDisplay.hydrology?.aet_monthly
			const pet = worldForDisplay.climate.pet_monthly
			const { windSpeed } = windVectors
			for (let r = 0; r < N; r++) {
				if (!worldForDisplay.isLand?.[r]) {
					rgb[3 * r] = OCEAN_LIGHT_BLUE[0]
					rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]
					rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
					continue
				}
				const modeledT = monthlyTemp
					? monthlyTemp[offset + r]
					: worldForDisplay.climate.temperature_avg[r]
				const observedT = monthlyRealTemp
					? monthlyRealTemp[offset + r]
					: worldForDisplay.climate.real_temperature_avg?.[r]
				const meanT =
					isObserved && Number.isFinite(observedT) ? observedT : modeledT
				let humidity: number
				if (isObserved) {
					const observedRh = isMonthly
						? worldForDisplay.observedHumidity?.real_monthly?.[offset + r]
						: worldForDisplay.observedHumidity?.real_annual?.[r]
					if (Number.isFinite(observedRh)) {
						humidity = observedRh as number
					} else {
						const dtr = monthlyDtr
							? (monthlyDtr[offset + r] ?? worldForDisplay.dtr_annual[r])
							: worldForDisplay.dtr_annual[r]
						humidity = relativeHumidityFromTempRange(
							meanT,
							dtr,
							undefined,
							worldForDisplay.rainfall?.annual[r],
						)
					}
				} else {
					const dtr = monthlyDtr
						? (monthlyDtr[offset + r] ?? worldForDisplay.dtr_annual[r])
						: worldForDisplay.dtr_annual[r]
					let annualAridity: number | undefined
					if (aet && pet) {
						let aetSum = 0
						let petSum = 0
						for (let m = 0; m < 12; m++) {
							aetSum += aet[m * N + r]
							petSum += pet[m * N + r]
						}
						annualAridity = petSum > 0 ? aetSum / petSum : 1
					}
					humidity = relativeHumidityFromTempRange(
						meanT,
						dtr,
						annualAridity,
						worldForDisplay.rainfall?.annual[r],
					)
				}
				const [cr, cg, cb] = miseryColor(
					apparentTemperatureC(meanT, humidity, windSpeed[r]),
				)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return withOrgHighlight(rgb)
		}
		if (
			worldForDisplay?.isEarthImport &&
			earthHistory.engine &&
			earthHistory.query &&
			earthHistory.nationReference &&
			worldForDisplay.provinces &&
			worldForDisplay.elevation_km
		) {
			const earthColors = computeEarthHistoryRegionColors({
				colorMode,
				nationMode,
				populationMode,
				state: earthHistory.query.state,
				provinceMap: earthHistory.engine.provinceMap,
				nationIds: earthHistory.query.frame.nationIds,
				nationReference: earthHistory.nationReference,
				regionProvince: worldForDisplay.provinces.regionProvince,
				desolate: worldForDisplay.provinces.desolate,
				elevationKm: worldForDisplay.elevation_km,
				isLand: worldForDisplay.isLand,
				religionColorById: earthHistory.religionColorById ?? undefined,
				cultureColorById: earthHistory.cultureColorById ?? undefined,
			})
			if (earthColors) return withOrgHighlight(earthColors)
		}
		return withOrgHighlight(
			computeRegionColors(
				worldForDisplay,
				colorMode,
				nationMode,
				populationMode,
				temperatureMonth,
				rainfallMonth,
				dtrMonth,
				currentMonth,
				viewMode,
				showElevation,
				undefined,
				undefined,
				selectedNationId,
				null,
				dangerSubMode,
			),
		)
	}, [
		colorMode,
		nationMode,
		populationMode,
		temperatureMonth,
		rainfallMonth,
		dtrMonth,
		viewMode,
		showElevation,
		currentMonth,
		worldForDisplay,
		selectedNationId,
		windVectors,
		dangerSubMode,
		earthHistory.engine,
		earthHistory.query,
		earthHistory.nationReference,
		earthHistory.religionColorById,
		earthHistory.cultureColorById,
		withOrgHighlight,
	])

	// Earth-import political/demographic fills are temporarily rendered only
	// via the base region mesh, not the real-EU4-province overlay, to avoid
	// the heavier first-render vector-overlay setup cost.
	const nationFillColorForRawId = useMemo<null>(() => null, [])

	// Overrides Nation/Government/Culture/Religion hover rows with real
	// history for the currently-scrubbed date -- the procedural builders
	// (buildProvinceDisplayData/buildGovernmentDisplayData/
	// buildDemographicDisplayData) read the generation-time-only
	// world.nations/world.cultures snapshot, which doesn't vary with the
	// earth-history scrubber. Colors reuse hashColorForKey so a hovered
	// swatch always matches its map tile (see earth-history-region-colors.ts,
	// which uses the same helper). Gated on world.isEarthImport, per
	// docs/earth-history-plan.md.
	const earthHistoryHoverOverride = useMemo(() => {
		if (
			!worldForDisplay?.isEarthImport ||
			!earthHistory.engine ||
			!earthHistory.query ||
			hoverProvince === null ||
			hoverProvince < 0
		)
			return undefined
		const rawId = String(
			earthHistory.engine.provinceMap.compactToRealId[hoverProvince],
		)
		// ps (folded owner/culture/religion state) can be missing for
		// provinces with no recorded history at all -- area/region/
		// superregion are static and come from `meta` regardless, so this no
		// longer bails out entirely; it just leaves the history-derived
		// fields null below.
		const ps = earthHistory.query.state.provinces.get(rawId) ?? null

		const meta = earthHistory.provinceMeta?.get(rawId)
		// EU4's own "wasteland" flag describes present-day/in-engine
		// uninhabitability, not history -- a wasteland province can still
		// have real recorded culture/religion data (EU4 itself records this
		// for many of its own wasteland provinces), so it only suppresses
		// nation/government, matching computeEarthHistoryRegionColors'
		// map-coloring behavior.
		const isWasteland = !!meta?.wasteland
		const owner = isWasteland ? null : (ps?.owner ?? null)
		const nationRef = owner ? earthHistory.nationReference?.get(owner) : null
		const nationName = owner
			? (earthHistory.query.state.nations.get(owner)?.currentName ??
				nationRef?.name ??
				owner)
			: null
		const nationColor = owner
			? nationRef
				? rgb01ToCss([
						nationRef.color[0] / 255,
						nationRef.color[1] / 255,
						nationRef.color[2] / 255,
					])
				: rgb01ToCss(hashColorForKey(`nation:${owner}`))
			: null

		const nationState = owner
			? (earthHistory.query.state.nations.get(owner) ?? null)
			: null
		const governmentLabel = nationState
			? formatEarthHistoryGovernmentLabel({
					governmentType: nationState.governmentType,
					governmentReform: nationState.governmentReform,
				})
			: null
		const governmentColorRgb = getEarthHistoryGovernmentColor({
			governmentType: nationState?.governmentType ?? null,
			governmentReform: nationState?.governmentReform,
		})
		const governmentColor = rgb01ToCss(
			governmentColorRgb ?? EARTH_HISTORY_NO_GOVERNMENT_COLOR,
		)

		const cultureId = ps?.cultureId
		const cultureName = cultureId
			? (earthHistory.cultureNameById?.get(cultureId) ?? cultureId)
			: null
		const cultureColorRgb = cultureId
			? earthHistory.cultureColorById?.get(cultureId)
			: null
		const cultureColor = cultureId
			? rgb01ToCss(cultureColorRgb ?? hashColorForKey(`culture:${cultureId}`))
			: null

		const provinceName = meta?.name ?? null
		const area = meta?.area ?? null
		const region = meta?.region ?? null
		const superregion = meta?.superregion ?? null

		const religionId = ps?.religionId
		const religionName = religionId
			? (earthHistory.religionNameById?.get(religionId) ?? religionId)
			: null
		const religionColorRgb = religionId
			? earthHistory.religionColorById?.get(religionId)
			: null
		const religionColor = religionId
			? rgb01ToCss(
					religionColorRgb ?? hashColorForKey(`religion:${religionId}`),
				)
			: null

		return {
			nationName,
			nationColor,
			governmentLabel,
			governmentColor,
			cultureName,
			cultureColor,
			religionName,
			religionColor,
			provinceName,
			area,
			region,
			superregion,
		}
	}, [
		worldForDisplay?.isEarthImport,
		earthHistory.engine,
		earthHistory.query,
		earthHistory.nationReference,
		earthHistory.cultureNameById,
		earthHistory.cultureColorById,
		earthHistory.religionNameById,
		earthHistory.religionColorById,
		earthHistory.provinceMeta,
		hoverProvince,
	])

	const occupationOverlay = useMemo(() => {
		if (
			worldForDisplay?.isEarthImport &&
			earthHistory.engine &&
			earthHistory.query &&
			earthHistory.nationReference &&
			worldForDisplay.provinces
		) {
			// Any org wiki page open: its own striped categories (HRE's
			// foreign-held territory, HSA's Hanseatic kontors/trade posts, ...)
			// take priority over the normal contested-province stripe while
			// browsing that org's territory. Both write into the SAME
			// occColor/occMask attributes already present on terrainMesh/
			// mapMesh (see applyFaceRegionColors) -- no separate overlay mesh
			// is built for this (see computeOrgStripeOverlay's doc comment for
			// why that mattered).
			if (selectedWikiOrganizationId) {
				const orgRef = earthHistory.organizationReference.get(
					selectedWikiOrganizationId,
				)
				const resolvers = orgRef
					? buildOrgCategorizer(earthHistory.query.state, orgRef)
					: null
				if (resolvers) {
					return computeOrgStripeOverlay({
						state: earthHistory.query.state,
						provinceMap: earthHistory.engine.provinceMap,
						regionProvince: worldForDisplay.provinces.regionProvince,
						categorize: resolvers.categorize,
						categoryColor: resolvers.categoryColor,
					})
				}
				// No registered category schema for this org (nothing striped) --
				// the ordinary contested-province stripe is nation-mode furniture
				// unrelated to org membership, so it's suppressed rather than
				// bleeding through org territory coloring.
				return null
			}
			return computeEarthHistoryOccupationOverlay({
				state: earthHistory.query.state,
				provinceMap: earthHistory.engine.provinceMap,
				regionProvince: worldForDisplay.provinces.regionProvince,
				nationReference: earthHistory.nationReference,
			})
		}
		// Procedural worlds no longer have wars, so there is nothing to occupy.
		return null
	}, [
		worldForDisplay,
		earthHistory.query,
		earthHistory.nationReference,
		earthHistory.engine,
		earthHistory.organizationReference,
		selectedWikiOrganizationId,
		buildOrgCategorizer,
	])

	const occupationStripeColorForRawId = useMemo<null>(() => null, [])

	// Culture bleed stripes were driven by the sim's culture-spread event, which
	// no longer exists, so there is no secondary culture to blend toward.
	const cultureBlendOverlay: Float32Array | null = null
	const earthHistorySceneNationOverride = usePlaybackSampledValue(
		worldForDisplay?.isEarthImport && earthHistory.query
			? {
					assignment: earthHistory.query.frame.assignment,
					seeds: earthHistory.query.frame.seeds,
					names:
						colorMode === "nations" && nationMode === "dynasty"
							? (() => {
									const { frame, state } = earthHistory.query!
									const dynastyNames = new Array<string>(
										frame.names.length,
									).fill("")
									for (const [tag, id] of frame.nationIds) {
										const dynasty = state.nations.get(tag)?.ruler?.dynasty
										if (dynasty) dynastyNames[id] = dynasty
									}
									return dynastyNames
								})()
							: earthHistory.query.frame.names,
				}
			: null,
		350,
		labelsPlaybackActive,
	)
	const earthHistorySceneLabelPartitions = usePlaybackSampledValue(
		worldForDisplay?.isEarthImport && earthHistory.query
			? {
					culture: {
						assignment: earthHistory.query.frame.cultureAssignment,
						count: earthHistory.query.frame.cultureCount,
						names: earthHistory.query.frame.cultureNames,
					},
					religion: {
						assignment: earthHistory.query.frame.religionAssignment,
						count: earthHistory.query.frame.religionCount,
						names: earthHistory.query.frame.religionNames,
					},
				}
			: null,
		350,
		labelsPlaybackActive,
	)

	// Map territory highlight (HRE, Hanseatic League, ...) -- recomputed on
	// every timeline scrub tick since membership is derived fresh from
	// FoldedState each time (see fold.ts's collectOrgMemberProvinceRawIds).
	// setOrganizationHighlight rebuilds nation BORDERS and LABELS (border
	// tracing + label-texture regeneration, both far more expensive than a
	// region-color array fill) whenever the spec reference changes, so this
	// is throttled through usePlaybackSampledValue exactly like
	// earthHistorySceneNationOverride/LabelPartitions just above -- without
	// it, an open org wiki page rebuilt borders+labels every single tick
	// instead of at most once per 350ms during playback.
	const organizationHighlightSpecRaw = useMemo<OrgHighlightSpec | null>(() => {
		if (
			!selectedWikiOrganizationId ||
			!world?.isEarthImport ||
			!earthHistory.query ||
			!earthHistory.organizationReference
		)
			return null
		const orgRef = earthHistory.organizationReference.get(
			selectedWikiOrganizationId,
		)
		if (!orgRef) return null
		const { state } = earthHistory.query
		const memberProvinceRawIds = collectOrgMemberProvinceRawIds(
			state,
			orgRef.id,
		)
		if (memberProvinceRawIds.size === 0) return null
		const memberProvinceCompactIndexes = new Set<number>()
		for (const rawId of memberProvinceRawIds) {
			const compact = earthImportRawIdToCompact?.get(rawId)
			if (compact !== undefined) memberProvinceCompactIndexes.add(compact)
		}
		return {
			orgId: orgRef.id,
			name: orgRef.name,
			memberProvinceCompactIndexes,
		}
	}, [
		selectedWikiOrganizationId,
		world,
		earthHistory.query,
		earthHistory.organizationReference,
		earthImportRawIdToCompact,
	])
	const organizationHighlightSpec = usePlaybackSampledValue(
		organizationHighlightSpecRaw,
		350,
		labelsPlaybackActive,
	)

	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (!worldForDisplay) {
			scene.updateWorld(null)
			scene.setOccupationOverlay(null)
			lastWorldRef.current = null
			return
		}
		scene.setDisplayColors(colorMode, regionColors)
		scene.setNationFillColorForRawId(nationFillColorForRawId)
		scene.setNationOccupationStripeColorForRawId(occupationStripeColorForRawId)
		if (lastWorldRef.current !== worldForDisplay) {
			scene.updateWorld(worldForDisplay)
			lastWorldRef.current = worldForDisplay
		}
		scene.setOccupationOverlay(
			selectedWikiOrganizationId === "HRE" ||
				(colorMode === "nations" && nationMode === "borders")
				? occupationOverlay
				: getBaseMapMode(colorMode) === "population" &&
						["culture", "heritage", "religion"].includes(populationMode)
					? cultureBlendOverlay
					: null,
		)
		// Border LINES and nation LABELS are traced/placed from
		// world.nations.assignment/seeds independently of the fill colors
		// above -- swap them the same way for Earth-imported worlds so
		// "Nations > Borders" and nation labels actually follow the scrubbed
		// date and show real EU4 names instead of the static generation-time
		// assignment and procedural names.
		scene.setEarthHistoryNationOverride(earthHistorySceneNationOverride)
		scene.setOrganizationHighlight(organizationHighlightSpec)
		// Culture/religion LABELS are also placed from a different id space
		// than the procedural world.cultures/world.heritages -- see
		// earthHistoryLabelPartitions's doc comment in
		// create-genesis-scene.ts.
		scene.setEarthHistoryLabelPartitions(earthHistorySceneLabelPartitions)
	}, [
		colorMode,
		nationMode,
		populationMode,
		occupationOverlay,
		regionColors,
		nationFillColorForRawId,
		occupationStripeColorForRawId,
		worldForDisplay,
		earthHistorySceneNationOverride,
		earthHistorySceneLabelPartitions,
		organizationHighlightSpec,
		selectedWikiOrganizationId,
	])

	const thermalEquator = useMemo(() => {
		if (!world?.climate) return null
		const N = world.mesh.numRegions
		const temps =
			resolvedClimateMonth === 0
				? world.climate.temperature_avg
				: world.climate.temperature_monthly.subarray(
						(resolvedClimateMonth - 1) * N,
						resolvedClimateMonth * N,
					)
		return computeThermalEquatorLine(world.mesh, temps)
	}, [resolvedClimateMonth, world])

	useEffect(() => {
		sceneRef.current?.setThermalEquator(
			showThermalEquator ? thermalEquator : null,
		)
	}, [thermalEquator, showThermalEquator])

	const windGrid = useMemo(() => {
		if (!windVectors || !world) return null
		return computeWindGrid(
			world.mesh,
			windVectors.windU,
			windVectors.windV,
			windVectors.windSpeed,
		)
	}, [windVectors, world])

	const oceanCurrentGrid = useMemo(() => {
		if (!world?.oceanCurrents || !showOceanCurrents) return null
		const N = world.mesh.numRegions
		const monthlyWarmth = world.oceanCurrents.oceanWarmthMonthly
		const warmth =
			monthlyWarmth && currentMonth > 0
				? monthlyWarmth.subarray((currentMonth - 1) * N, currentMonth * N)
				: world.oceanCurrents.oceanWarmth
		const { latDeg, lonDeg, regionBin } = getClimateGeometry(world.mesh)
		if (world.params.tideLock?.type === "solar") {
			return buildLockedOceanCurrentGrid(
				world.mesh,
				warmth,
				world.isLand,
				latDeg,
				lonDeg,
				world.params,
				currentMonth,
			)
		}
		return buildOceanCurrentGrid(
			world.mesh,
			warmth,
			world.isLand,
			latDeg,
			lonDeg,
			isRetrogradeObliquity(world.params.obliquity),
			undefined,
			regionBin,
			world.params.hoursPerDay,
			world.params.planetRadiusKm,
		)
	}, [world, showOceanCurrents, currentMonth])

	// Particles replace the static arrow overlay — keep arrows cleared
	useEffect(() => {
		sceneRef.current?.setWindArrows(null)
	}, [])

	useEffect(() => {
		sceneRef.current?.setRivers(
			showRivers && world?.rivers ? world.rivers : null,
		)
	}, [world, showRivers])
	useEffect(() => {
		sceneRef.current?.setRiversVisible(showRivers)
	}, [showRivers])

	// --- Sun & lighting ---
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		scene.setFullAmbient(!showDaylight)
		scene.setSolarTerminatorUseMeridiem(clockUseMeridiem)
		scene.setSolarTerminatorVisible(showDaylight)
		if (tidallyLocked) {
			const selectedMonth = clockMonthMode === "annual" ? 5 : clockMonth
			const monthlyLibration = computeMonthlyLibration(eccentricity, perihelion)
			const monthlyDeclination = computeMonthlyLockedDeclination(
				obliquity,
				eccentricity,
				perihelion,
			)
			const [sx, sy, sz] = getSubstellarDirWithOffsetAndDeclination(
				substellarLon,
				monthlyLibration[selectedMonth] ?? 0,
				monthlyDeclination[selectedMonth] ?? 0,
			)
			scene.setSunDirection(sx, sy, sz, hoursPerDay)
		} else {
			const lightingMonth =
				clockMonthMode === "annual"
					? 0
					: clockMonth + 1 + clockDay / (effectiveDaysPerYear / 12)
			scene.setSunPosition(
				lightingMonth,
				obliquity,
				scaledClockHour,
				hoursPerDay,
			)
		}
	}, [
		showDaylight,
		clockUseMeridiem,
		clockMonthMode,
		clockMonth,
		clockDay,
		effectiveDaysPerYear,
		scaledClockHour,
		obliquity,
		eccentricity,
		perihelion,
		hoursPerDay,
		tidallyLocked,
		substellarLon,
	])

	// --- Measure click handler ---
	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setClickHandler((info) => {
			if (
				!canHandlePlanetClick(measureMode, {
					hasWorld: !!worldForDisplay,
					hasProvinces: !!worldForDisplay?.provinces,
					hasNationModel: !!nationModel,
					isEarthImport: !!worldForDisplay?.isEarthImport,
				})
			) {
				return
			}

			// Pathfinding mode
			if (measureMode === "pathfinding") {
				const p = pathfindingRef.current
				if (p.start === null || p.end !== null) {
					p.start = info.region
					p.end = null
					setPathfindingResult(null)
					const r_xyz = worldForDisplay?.mesh?.r_xyz
					const startXYZ: [number, number, number] | null = r_xyz
						? [
								r_xyz[info.region * 3],
								r_xyz[info.region * 3 + 1],
								r_xyz[info.region * 3 + 2],
							]
						: null
					sceneRef.current?.setPathfindingOverlay(null, startXYZ, null)
				} else {
					p.end = info.region
					// Send pathfinding request to worker
					if (workerRef.current) {
						workerRef.current.postMessage({
							type: "pathfind",
							startRegion: p.start,
							endRegion: info.region,
							allowLand: pathfindingLand,
							allowSea: pathfindingSea,
							network: worldForDisplay.network ?? null,
						})
					}
				}
				return
			}

			const province =
				worldForDisplay.provinces.regionProvince[info.region] ?? -1

			if (measureMode === "off") {
				// Earth import routes clicks to the left-panel nation wiki page
				// instead of the procedural right-side drawer -- see
				// selectedWikiNationTag's doc. Falls through to the procedural
				// path below when there's no real EU4 mapping for this province
				// (e.g. still loading) or no owner.
				if (worldForDisplay.isEarthImport) {
					// No procedural nations exist for Earth import (see
					// derive-province-society.ts's isEarthImportRaster check), so
					// nationModel is always null here -- never fall through to the
					// procedural path below, which would crash on it. Just no-op
					// until the real EU4 engine has loaded.
					if (!earthHistory.engine) return
					// The procedural regionProvince[region] mapping is only an
					// approximation for Earth import -- real EU4 province polygons
					// don't align with the underlying mesh cells, so prefer a
					// point-in-polygon lookup against the actual province vector
					// geometry (same approach hoverProvince uses above), falling
					// back to the approximate mapping only when that geometry
					// isn't loaded yet.
					let rawId: string | null = null
					if (worldForDisplay.provinces?.realIds && eu4HoverFillGeometry) {
						const base = info.region * 3
						const r_xyz = worldForDisplay.mesh.r_xyz
						const latDeg =
							Math.asin(Math.max(-1, Math.min(1, r_xyz[base + 2]))) *
							(180 / Math.PI)
						const lonDeg =
							Math.atan2(r_xyz[base + 1], r_xyz[base]) * (180 / Math.PI)
						const rawProvinceId = findEu4ProvinceForLonLat(
							eu4HoverFillGeometry,
							lonDeg,
							latDeg,
						)
						if (rawProvinceId !== null) rawId = String(rawProvinceId)
					}
					if (rawId === null && province >= 0) {
						rawId = String(
							earthHistory.engine.provinceMap.compactToRealId[province],
						)
					}
					const owner = rawId
						? (earthHistory.query?.state.provinces.get(rawId)?.owner ?? null)
						: null
					setSelectedWikiNationTag(owner)
					return
				}
				const nation =
					province >= 0 ? (nationModel.assignment[province] ?? -1) : -1
				setSelectedNationId(nation >= 0 ? nation : null)
				if (nation >= 0) setDetailsDrawerOpen(true)
				return
			}

			const m = measureRef.current
			if (m.start === null || m.end !== null) {
				m.start = info.region
				m.end = null
				setMeasureStart(info.region)
				setMeasureEnd(null)
			} else {
				m.end = info.region
				setMeasureEnd(info.region)
			}
		})
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (measureRef.current.start !== null) {
					measureRef.current = { start: null, end: null }
					setMeasureStart(null)
					setMeasureEnd(null)
					setMeasureLabelPos(null)
					sceneRef.current?.setMeasureLine(null, null)
				} else if (pathfindingRef.current.start !== null) {
					pathfindingRef.current = { start: null, end: null }
					setPathfindingResult(null)
					sceneRef.current?.setPathfindingOverlay(null, null, null)
				} else {
					setMeasureMode("off")
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [
		nationModel,
		measureMode,
		pathfindingLand,
		pathfindingSea,
		worldForDisplay,
		setMeasureMode,
		earthHistory.engine,
		earthHistory.query,
		eu4HoverFillGeometry,
		setSelectedWikiNationTag,
	])

	const selectedNation = useMemo(() => {
		return buildSelectedNationDetails({
			selectedNationId,
			world: worldForDisplay,
			nationModel,
			getNationColor,
			getNationName,
			getCultureName,
			getHeritageName,
		})
	}, [
		nationModel,
		getNationColor,
		getNationName,
		getCultureName,
		getHeritageName,
		selectedNationId,
		worldForDisplay,
	])
	const handleDrawerNationClick = useMemo(
		() =>
			createDrawerNationClickHandler({
				openDetailsDrawer: () => setDetailsDrawerOpen(true),
				focusOnNation: (nationId) => sceneRef.current?.focusOnNation(nationId),
			}),
		[],
	)
	// Real per-nation province counts + government type for Earth import --
	// same rationale as earthSocialCounts above: worldForDisplay.nations is
	// static procedural data there, so build these straight from earthHistory's
	// own real per-date engine instead.
	const earthNationProvinceCounts = useMemo(() => {
		if (!world?.isEarthImport || !earthHistory.query) return null
		const counts = new Map<number, number>()
		for (const nationId of earthHistory.query.frame.assignment) {
			if (nationId < 0) continue
			counts.set(nationId, (counts.get(nationId) ?? 0) + 1)
		}
		return counts
	}, [world?.isEarthImport, earthHistory.query])

	const earthGovernmentDistribution = useMemo(() => {
		if (
			!world?.isEarthImport ||
			!earthHistory.query ||
			!earthNationProvinceCounts
		)
			return null
		const { nationIds } = earthHistory.query.frame
		const { nations } = earthHistory.query.state
		const tagById = new Map<number, string>()
		for (const [tag, id] of nationIds) tagById.set(id, tag)
		const counts = new Map<
			(typeof EARTH_HISTORY_GOVERNMENT_FAMILIES)[number],
			number
		>()
		for (const nationId of earthNationProvinceCounts.keys()) {
			const tag = tagById.get(nationId)
			const governmentType = tag
				? (nations.get(tag)?.governmentType ?? null)
				: null
			const family = getEarthHistoryGovernmentFamily(governmentType)
			if (!family) continue
			counts.set(family, (counts.get(family) ?? 0) + 1)
		}
		return EARTH_HISTORY_GOVERNMENT_FAMILIES.map((family) => ({
			label: EARTH_HISTORY_GOVERNMENT_FAMILY_LABELS[family],
			count: counts.get(family) ?? 0,
			color: rgbToCss(EARTH_HISTORY_GOVERNMENT_FAMILY_COLORS[family]),
		}))
	}, [world?.isEarthImport, earthHistory.query, earthNationProvinceCounts])

	const nationSizeDistribution = useMemo(
		() =>
			buildNationSizeDistribution(
				earthNationProvinceCounts ?? nationProvinceCounts,
			),
		[earthNationProvinceCounts, nationProvinceCounts],
	)

	const governmentDistribution = useMemo(() => {
		if (earthGovernmentDistribution) return earthGovernmentDistribution
		// Indexed by government type (aligns with GOVERNMENT_TYPES / region-colors).
		const GOV_COLORS = [
			"rgb(204, 143, 71)", // 0 chiefdom
			"rgb(140, 89, 36)", // 1 tribal monarchy
			"rgb(237, 194, 128)", // 2 tribal federation
			"rgb(112, 61, 28)", // 3 native council
			"rgb(107, 138, 184)", // 4 feudal monarchy
			"rgb(140, 199, 242)", // 5 elective monarchy
			"rgb(15, 41, 112)", // 6 absolute monarchy
			"rgb(33, 102, 217)", // 7 constitutional monarchy
			"rgb(26, 143, 117)", // 8 merchant republic
			"rgb(28, 92, 46)", // 9 noble republic
			"rgb(163, 204, 61)", // 10 city-state confederation
			"rgb(61, 163, 87)", // 11 presidential republic
			"rgb(122, 214, 117)", // 12 parliamentary republic
			"rgb(133, 61, 179)", // 13 theocracy
			"rgb(71, 28, 117)", // 14 monastic state
			"rgb(194, 143, 230)", // 15 prince-bishopric
			"rgb(209, 46, 148)", // 16 imperial cult
			"rgb(189, 36, 36)", // 17 socialist state
			"rgb(112, 117, 61)", // 18 military junta
			"rgb(230, 84, 61)", // 19 trading company
			"rgb(245, 140, 128)", // 20 settler colony
		]
		const counts = new Array(GOVERNMENT_TYPES.length).fill(0)
		const govType = worldForDisplay?.nations?.governmentType
		if (govType && nationModel) {
			for (const nationId of nationModel.counts.keys()) {
				const t = govType[nationId] ?? 0
				if (t >= 0 && t < counts.length) counts[t]++
			}
		}
		return GOVERNMENT_TYPES.map((key, i) => ({
			label: GOVERNMENT_TYPE_LABELS[key],
			count: counts[i] ?? 0,
			color: GOV_COLORS[i] ?? "rgb(148, 163, 184)",
		}))
	}, [
		earthGovernmentDistribution,
		worldForDisplay?.nations?.governmentType,
		nationModel,
	])

	const religionTypeDistribution = useMemo(() => {
		const world = worldForDisplay
		const nationAssign = world?.nations?.assignment
		const cultureAssign = world?.cultures?.assignment
		const religionAssign = world?.religions?.assignment
		const relTypes = world?.religionTypes
		if (
			!nationAssign ||
			!cultureAssign ||
			!religionAssign ||
			!relTypes ||
			!nationModel
		)
			return []

		// Per-nation accumulator: religion type → province count
		const nationBuckets = new Map<number, number[]>()
		for (const nationId of nationModel.counts.keys()) {
			nationBuckets.set(
				nationId,
				new Array<number>(RELIGION_TYPE_NAMES.length).fill(0),
			)
		}

		for (let p = 0; p < nationAssign.length; p++) {
			const nationId = nationAssign[p]
			if (nationId < 0) continue
			const buckets = nationBuckets.get(nationId)
			if (!buckets) continue

			const cultureId = cultureAssign[p] ?? -1
			if (cultureId < 0) continue
			const religionId = religionAssign[cultureId] ?? -1
			if (religionId < 0) continue
			const type = relTypes[religionId] ?? 0
			if (type >= 0 && type < buckets.length) buckets[type]++
		}

		// Pick the dominant religion type per nation, then count nations by type
		const typeCounts = new Array<number>(RELIGION_TYPE_NAMES.length).fill(0)
		for (const buckets of nationBuckets.values()) {
			let best = -1
			let bestCount = 0
			for (let t = 0; t < buckets.length; t++) {
				if (buckets[t] > bestCount) {
					bestCount = buckets[t]
					best = t
				}
			}
			if (best >= 0) typeCounts[best]++
		}

		return RELIGION_TYPE_NAMES.map((label, i) => {
			const [r, g, b] = RELIGION_TYPE_COLORS[i]!
			return {
				label,
				count: typeCounts[i] ?? 0,
				color: rgbToCss([r, g, b]),
			}
		}).filter((bucket) => bucket.count > 0)
	}, [
		worldForDisplay?.nations?.assignment,
		worldForDisplay?.cultures?.assignment,
		worldForDisplay?.religions?.assignment,
		worldForDisplay?.religionTypes,
		nationModel,
		worldForDisplay,
	])

	// Wars and diplomatic relations were procedural-sim products; Earth import
	// surfaces its own conflict data through earthHistory.
	const conflictDistribution = useMemo<DistributionBucket[]>(() => [], [])
	const relationDistribution = useMemo<DistributionBucket[]>(() => [], [])

	const nationAdjacency = useMemo(
		() =>
			colorMode === "nations" && nationModel && worldForDisplay
				? buildNationAdjacency(nationModel.assignment, worldForDisplay)
				: null,
		[colorMode, nationModel, worldForDisplay],
	)

	// "Observed" reuses the EU5-derived per-cell rasters already loaded for
	// Earth import (world.eu5Climate/eu5Vegetation/eu5Topography, -1 where
	// unmapped) instead of the procedural climateZones/vegetation/topography
	// arrays -- same buildDistribution bucketer, different source, so
	// Environmental's charts track the same model-vs-observed flag the map
	// overlay uses (see OverlayControls' dataVariant).
	const showObservedDistributions =
		dataVariant === "observed" && !!world?.isEarthImport

	const climateDistribution = useMemo(
		() =>
			showObservedDistributions
				? buildDistribution(
						EU5_CLIMATE_CATEGORIES.map((label) => label.replace(/_/g, " ")),
						world?.eu5Climate,
						(index) => rgbToCss(EU5_CLIMATE_COLORS[index]),
					)
				: buildDistribution(
						CLIMATE_LABELS,
						world?.climateZones,
						(index) => rgbToCss(climateZoneColor(index)),
						new Set([0]),
					),
		[showObservedDistributions, world?.eu5Climate, world?.climateZones],
	)

	const vegetationDistribution = useMemo(
		() =>
			showObservedDistributions
				? buildDistribution(
						EU5_VEGETATION_CATEGORIES.map((label) => label.replace(/_/g, " ")),
						world?.eu5Vegetation,
						(index) => rgbToCss(EU5_VEGETATION_COLORS[index]),
					)
				: buildDistribution(
						BIOME_LABELS,
						world?.vegetation,
						(index) => rgbToCss(vegetationColor(index)),
						new Set([0]),
					),
		[showObservedDistributions, world?.eu5Vegetation, world?.vegetation],
	)

	const topographyDistribution = useMemo(
		() =>
			showObservedDistributions
				? buildEu5TopographyDistribution({
						values: world?.eu5Topography,
						rgbToCss,
					})
				: buildDistribution(
						GENESIS_TOPOGRAPHY_LABELS,
						world?.topography,
						(index) => {
							const color = getTopographyColor(index)
							return color ? rgbToCss(color) : "rgb(148, 163, 184)"
						},
						new Set([TOPO_LAKE, TOPO_OCEAN]),
					),
		[showObservedDistributions, world?.eu5Topography, world?.topography],
	)

	const tradeGoodsDistribution = useMemo(() => {
		const material = world?.tradeGoods
		if (!material) return []
		const counts = new Array<number>(TRADE_GOOD_LABELS.length).fill(0)
		for (let i = 0; i < material.length; i++) {
			const idx = material[i]!
			if (idx > 0 && idx < counts.length) counts[idx]++
		}
		return TRADE_GOOD_LABELS.flatMap((label, index) => {
			if (index === 0 || counts[index] === 0) return []
			const [r, g, b] = tradeGoodColor(index)
			return [
				{
					label: tradeGoodDisplayName(label),
					count: counts[index]!,
					color: rgbToCss([r!, g!, b!]),
				},
			]
		}).sort((a, b) => b.count - a.count)
	}, [world?.tradeGoods])

	const measureDistanceKm = useMemo(() => {
		if (measureStart === null || measureEnd === null || !world) return null
		const r = world.mesh.r_xyz
		const s = [
			r[measureStart * 3],
			r[measureStart * 3 + 1],
			r[measureStart * 3 + 2],
		] as [number, number, number]
		const e = [
			r[measureEnd * 3],
			r[measureEnd * 3 + 1],
			r[measureEnd * 3 + 2],
		] as [number, number, number]
		const dot = s[0] * e[0] + s[1] * e[1] + s[2] * e[2]
		return (
			Math.acos(Math.max(-1, Math.min(1, dot))) * world.params.planetRadiusKm
		)
	}, [measureStart, measureEnd, world])

	useEffect(() => {
		if (!sceneRef.current || !world) return
		if (measureStart === null) {
			sceneRef.current.setMeasureLine(null, null)
			setMeasureLabelPos(null)
			return
		}
		const r = world.mesh.r_xyz
		const s = [
			r[measureStart * 3],
			r[measureStart * 3 + 1],
			r[measureStart * 3 + 2],
		] as [number, number, number]
		const e =
			measureEnd === null
				? null
				: ([
						r[measureEnd * 3],
						r[measureEnd * 3 + 1],
						r[measureEnd * 3 + 2],
					] as [number, number, number])
		sceneRef.current.setMeasureLine(s, e)
	}, [measureStart, measureEnd, world])

	useEffect(() => {
		if (
			measureStart === null ||
			measureEnd === null ||
			!world ||
			!sceneRef.current
		) {
			setMeasureLabelPos(null)
			return
		}
		const r = world.mesh.r_xyz
		const s = [
			r[measureStart * 3],
			r[measureStart * 3 + 1],
			r[measureStart * 3 + 2],
		] as [number, number, number]
		const e = [
			r[measureEnd * 3],
			r[measureEnd * 3 + 1],
			r[measureEnd * 3 + 2],
		] as [number, number, number]
		const mid: [number, number, number] = [
			(s[0] + e[0]) / 2,
			(s[1] + e[1]) / 2,
			(s[2] + e[2]) / 2,
		]
		let rafId = 0
		function tick() {
			setMeasureLabelPos(sceneRef.current?.projectToScreen(mid) ?? null)
			rafId = requestAnimationFrame(tick)
		}
		rafId = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(rafId)
	}, [measureStart, measureEnd, world])

	useEffect(() => {
		sceneRef.current?.setHoveredRegion(hoverInfo?.region ?? null)
	}, [hoverInfo])
	useEffect(() => {
		sceneRef.current?.setNationBordersVisible(showNationBorders)
	}, [showNationBorders])
	useEffect(() => {
		sceneRef.current?.setLandNationBordersVisible(showLandBorders)
	}, [showLandBorders])
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (showNationHierarchy && worldForDisplay && selectedNationId !== null) {
			scene.setHierarchyOverlay(worldForDisplay, selectedNationId)
		} else {
			scene.setHierarchyOverlay(null, -1)
		}
	}, [showNationHierarchy, worldForDisplay, selectedNationId])
	useEffect(() => {
		sceneRef.current?.setViewMode(viewMode)
	}, [viewMode])
	useEffect(() => {
		sceneRef.current?.setSolarSystemActive(solarSystemViewActive)
	}, [solarSystemViewActive])
	useEffect(() => {
		sceneRef.current?.setMapProjectionLatitude(mapProjectionLatitude)
	}, [mapProjectionLatitude])
	useEffect(() => {
		sceneRef.current?.setMapCenterLongitude(exportCenterLongitude)
		sceneRef.current?.commitMapCenterLongitude()
	}, [exportCenterLongitude])
	useEffect(() => {
		setDraftMapProjectionLatitude(mapProjectionLatitude)
	}, [mapProjectionLatitude])
	useEffect(() => {
		sceneRef.current?.setWireframeVisible(showWireframe)
	}, [showWireframe])
	useEffect(() => {
		sceneRef.current?.setCoastlineOverlayVisible(showCoastlines)
	}, [showCoastlines])
	useEffect(() => {
		sceneRef.current?.setGridVisible(showGrid)
	}, [showGrid])
	useEffect(() => {
		sceneRef.current?.setGridSpacing(gridSpacing)
	}, [gridSpacing])
	// Real (EU4-import) settlements replace the procedural province settlement
	// dots and trade-route "roads" entirely -- both share the Infrastructure
	// toggle, but only one of the two marker sets is ever shown at once.
	const isEarthImportDisplay = !!worldForDisplay?.isEarthImport
	useEffect(() => {
		sceneRef.current?.setSettlementsVisible(
			showInfrastructure && !isEarthImportDisplay,
		)
	}, [showInfrastructure, isEarthImportDisplay])
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (
			showInfrastructure &&
			!isEarthImportDisplay &&
			worldForDisplay?.urbanPopulation
		) {
			scene.setSettlements(worldForDisplay.urbanPopulation)
		} else {
			scene.setSettlements(null)
		}
	}, [showInfrastructure, isEarthImportDisplay, worldForDisplay])
	useEffect(() => {
		sceneRef.current?.setInfrastructureVisible(
			showInfrastructure && !isEarthImportDisplay,
		)
	}, [showInfrastructure, isEarthImportDisplay])
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (
			showInfrastructure &&
			!isEarthImportDisplay &&
			worldForDisplay?.network
		) {
			scene.setInfrastructure(worldForDisplay.network)
		} else {
			scene.setInfrastructure(null)
		}
	}, [showInfrastructure, isEarthImportDisplay, worldForDisplay])
	useEffect(() => {
		sceneRef.current?.setEu4SettlementsVisible(
			showInfrastructure && isEarthImportDisplay,
		)
	}, [showInfrastructure, isEarthImportDisplay])
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (showInfrastructure && isEarthImportDisplay && eu4GhslSettlements) {
			const population = buildGhslSettlementPopulationSlice(
				eu4GhslSettlements,
				earthHistory.selectedDays,
			)
			const indices = population
				? topSettlementIndices(population, eu4GhslSettlements.provinceIds)
				: []
			// worldForDisplay.nations.seeds is stale procedural-world data --
			// buildDisplayWorld overrides assignment/sovereign/colors/etc for
			// earth-history playback but never seeds (display-model.ts), and
			// the replay-based HistoryView it's built from doesn't compute
			// capitals at all. earthHistory.query.frame comes from the
			// separate fold-based engine (queryEarthHistory ->
			// foldedStateToGenesisFrame) which *does* compute real,
			// capital-preferring seeds per nation for the current date -- see
			// adapter.ts's GenesisFrameFromHistory.seeds.
			const capitalProvinceIds = new Set<number>()
			const frameSeeds = earthHistory.query?.frame.seeds
			const realIds = worldForDisplay?.provinces?.realIds
			if (frameSeeds && realIds) {
				for (const compactIdx of frameSeeds) {
					if (compactIdx >= 0 && compactIdx < realIds.length) {
						capitalProvinceIds.add(realIds[compactIdx])
					}
				}
			}
			scene.setEu4Settlements(
				eu4GhslSettlements.lats,
				eu4GhslSettlements.lons,
				population,
				eu4GhslSettlements.provinceIds,
				capitalProvinceIds,
				indices,
			)
		} else {
			scene.setEu4Settlements(null, null, null, null, new Set(), [])
		}
	}, [
		showInfrastructure,
		isEarthImportDisplay,
		eu4GhslSettlements,
		earthHistory.selectedDays,
		earthHistory.query,
		worldForDisplay,
	])

	// --- Labels ---
	useEffect(() => {
		sceneRef.current?.setLabelMode(labelMode)
	}, [labelMode])
	useEffect(() => {
		sceneRef.current?.setNationNames(sampledNationLabelsArray)
	}, [sampledNationLabelsArray])
	useEffect(() => {
		sceneRef.current?.setDynastyNames(sampledDynastyLabelsArray)
	}, [sampledDynastyLabelsArray])
	useEffect(() => {
		sceneRef.current?.setSettlementNames(sampledSettlementLabelsArray)
	}, [sampledSettlementLabelsArray])
	useEffect(() => {
		sceneRef.current?.setCultureNames(sampledCultureLabelsArray)
	}, [sampledCultureLabelsArray])
	useEffect(() => {
		sceneRef.current?.setHeritageNames(sampledHeritageLabelsArray)
	}, [sampledHeritageLabelsArray])
	// --- Elevation ---
	useEffect(() => {
		sceneRef.current?.setElevationVisible(showElevation)
	}, [showElevation])

	// --- Generation callbacks ---
	const generationCallbacks: GenerationCallbacks = useMemo(
		() => ({
			setGenerating,
			setGenerationProgress,
			setGenerationLabel,
			setSeed,
			setWorld,
			workerRef,
			onPathfindResult: (result) => {
				if (result.reachable) {
					const pathArray = Array.from(result.pathRegions)
					setPathfindingResult({
						distanceKm: result.distanceKm,
						landKm: result.landKm,
						seaKm: result.seaKm,
						travelDays: result.travelDays,
					})
					// Render path overlay
					if (pathArray.length >= 2 && lastWorldRef.current) {
						const r = lastWorldRef.current.mesh.r_xyz
						const startXYZ: [number, number, number] = [
							r[pathArray[0] * 3],
							r[pathArray[0] * 3 + 1],
							r[pathArray[0] * 3 + 2],
						]
						const endXYZ: [number, number, number] = [
							r[pathArray[pathArray.length - 1] * 3],
							r[pathArray[pathArray.length - 1] * 3 + 1],
							r[pathArray[pathArray.length - 1] * 3 + 2],
						]
						sceneRef.current?.setPathfindingOverlay(pathArray, startXYZ, endXYZ)
					}
				} else {
					setPathfindingResult(null)
					sceneRef.current?.setPathfindingOverlay(null, null, null)
				}
			},
		}),
		[],
	)

	const currentParams = useMemo<GenerationParams>(
		() => ({
			seed,
			numPoints,
			numPlates,
			landDistribution,
			continentSizeVariety,
			era,
			landCoverage,
			planetRadiusKm,
			obliquity,
			eccentricity,
			perihelion,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			daysPerYear,
			hoursPerDay,
			tideLock,
			substellarLon,
			jitter,
			roughness,
			terrainWarp,
			smoothing,
			hydraulicErosion,
			thermalErosion,
			ridgeSharpening,
			glacialErosion,
			seaLevel,
			volcanism: 1,
			craters: 0,
			maxElevation,
			pressure,
			albedo: mainWorldSystemBody?.albedo,
			greenhouseFactor: mainWorldSystemBody?.greenhouseFactor,
			seismologyTotalHeatingK: mainWorldSystemBody?.seismology?.totalHeating,
		}),
		[
			seed,
			numPoints,
			numPlates,
			landDistribution,
			continentSizeVariety,
			era,
			landCoverage,
			planetRadiusKm,
			obliquity,
			eccentricity,
			perihelion,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			daysPerYear,
			hoursPerDay,
			tideLock,
			substellarLon,
			jitter,
			roughness,
			terrainWarp,
			smoothing,
			hydraulicErosion,
			thermalErosion,
			ridgeSharpening,
			glacialErosion,
			seaLevel,
			pressure,
			mainWorldSystemBody?.albedo,
			mainWorldSystemBody?.greenhouseFactor,
			mainWorldSystemBody?.seismology?.totalHeating,
		],
	)
	useEffect(() => {
		if (!seedInputDirty) {
			setSeedInput(formatSeedLabel(seed))
			setSeedError(false)
		}
	}, [seed, seedInputDirty])

	const handleGenerateWorld = useCallback(
		(overrideSeed: number, overrides?: Partial<GenerationParams>) => {
			setSelectedTimeMs(simStartTimeMs)
			setShowCoastlines(false)
			generateWorld(overrideSeed, overrides, currentParams, generationCallbacks)
		},
		[currentParams, generationCallbacks, simStartTimeMs],
	)

	const resolveSeedInput = useCallback(() => {
		return resolveSeedLabel(seedInput)
	}, [seedInput])
	const handleReturnToPlanetView = useCallback(() => {
		setSolarSystemViewActive(false)
	}, [])
	const handleGenerate = useCallback(() => {
		if (seedInput.trim()) {
			const nextSeed = resolveSeedInput()
			if (nextSeed === null) {
				setSeedError(true)
				window.setTimeout(() => setSeedError(false), 1500)
				return
			}
			setSeedError(false)
			handleReturnToPlanetView()
			handleGenerateWorld(nextSeed)
			return
		}
		handleReturnToPlanetView()
		handleGenerateWorld(seed)
	}, [
		handleGenerateWorld,
		handleReturnToPlanetView,
		resolveSeedInput,
		seed,
		seedInput,
	])

	const setters = useMemo(
		() => ({
			setLandDistribution,
			setContinentSizeVariety,
			setLandCoverage,
			setPlanetRadiusKm,
			setObliquity,
			setEccentricity,
			setPerihelion,
			setSpectralClass,
			setStarSubtype,
			setOrbitalDistanceAU,
			setHoursPerDay,
			setTideLock,
			setSubstellarLon,
			setPressure,
			setRestSeed,
			setSeaLevel,
			setEra,
		}),
		[
			setEccentricity,
			setHoursPerDay,
			setObliquity,
			setOrbitalDistanceAU,
			setPerihelion,
			setPlanetRadiusKm,
			setPressure,
			setSubstellarLon,
			setTideLock,
			setSpectralClass,
			setStarSubtype,
			setRestSeed,
			setContinentSizeVariety,
			setLandCoverage,
			setLandDistribution,
			setSeaLevel,
		],
	)
	const handleApplySeed = useCallback(() => {
		const trimmed = seedInput.trim()
		if (!trimmed) {
			setSeedInputDirty(false)
			setSeedError(false)
			setSeedInput(formatSeedLabel(seed))
			return
		}
		const parsed = resolveSeedLabel(trimmed)
		if (parsed === null) {
			setSeedError(true)
			return
		}
		setSeedError(false)
		setSeedInputDirty(false)
		setSeed(parsed)
		setSeedInput(formatSeedLabel(parsed))
	}, [seed, seedInput])

	const handleSeedInputChange = useCallback((nextSeed: string) => {
		setSeedInput(nextSeed)
		setSeedInputDirty(true)
		setSeedError(false)
	}, [])

	const handleImportHeightmap = useCallback(
		(
			grayscale: Uint8Array,
			imageWidth: number,
			imageHeight: number,
			coastlineMask?: { mask: Uint8Array; width: number; height: number },
			lakeMask?: { mask: Uint8Array; width: number; height: number },
			riverLines?: {
				points: number[]
				strokeweig: number
				name?: string | null
			}[],
			realProvinces?: {
				name: string
				lon: number
				lat: number
				weight: number
			}[],
			realClimate?: {
				monthly: Int16Array
				width: number
				height: number
				months: number
				scale: number
				nodata: number
			},
			realPrecip?: {
				monthly: Int16Array
				width: number
				height: number
				months: number
				scale: number
				nodata: number
			},
			realDtr?: {
				monthly: Int16Array
				width: number
				height: number
				months: number
				scale: number
				nodata: number
			},
			realVaporPressure?: MonthlyRasterAsset,
			realElevation?: {
				raster: Int16Array
				width: number
				height: number
				scale: number
				nodata: number
			},
			eu5Topography?: {
				raster: Int16Array
				width: number
				height: number
				nodata: number
				categories: string[]
			},
			eu5Vegetation?: {
				raster: Int16Array
				width: number
				height: number
				nodata: number
				categories: string[]
			},
			eu5Climate?: {
				raster: Int16Array
				width: number
				height: number
				nodata: number
				categories: string[]
			},
			eu4Provinces?: {
				raster: Int16Array
				width: number
				height: number
				nodata: number
			},
			eu4ProvinceFallbackSeeds?: { id: number; lon: number; lat: number }[],
			lakeNames?: { name: string; ring: [number, number][] }[],
		) => {
			const importParams = {
				seed,
				numPoints,
				jitter,
				planetRadiusKm,
				obliquity,
				eccentricity,
				perihelion,
				spectralClass,
				starSubtype,
				orbitalDistanceAU,
				daysPerYear,
				hoursPerDay,
				pressure,
				// Real Earth values, not the live sliders -- this path is
				// Earth-only (see callers). Prefer the live mainWorldSystemBody
				// (matches whatever GenerationPanel's own preview is showing,
				// including any live edits) and fall back to the static defaults
				// only if it isn't available yet.
				albedo: mainWorldSystemBody?.albedo ?? SOL_MAIN_WORLD_DEFAULTS.albedo,
				greenhouseFactor:
					mainWorldSystemBody?.greenhouseFactor ??
					SOL_MAIN_WORLD_DEFAULTS.greenhouseFactor,
				seismologyTotalHeatingK: mainWorldSystemBody?.seismology?.totalHeating,
				tideLock,
				substellarLon,
				// Zeroed, not the live sliders -- this path is Earth-only (see
				// callers), and a real heightmap is already realistic terrain.
				// Warping/smoothing/eroding it distorts real elevation instead of
				// preserving it (see earth-real-temperature-compare.smoke.test.ts).
				terrainWarp: 0,
				smoothing: 0,
				hydraulicErosion: 0,
				thermalErosion: 0,
				ridgeSharpening: 0,
				glacialErosion: 0,
				seaLevel,
				maxElevation,
				volcanism: 1,
				craters: 0,
			}
			importHeightmap(
				grayscale,
				imageWidth,
				imageHeight,
				importParams,
				generationCallbacks,
				coastlineMask,
				lakeMask,
				riverLines,
				realProvinces,
				realClimate,
				realPrecip,
				realDtr,
				realVaporPressure,
				realElevation,
				eu5Topography,
				eu5Vegetation,
				eu5Climate,
				eu4Provinces,
				eu4ProvinceFallbackSeeds,
				lakeNames,
			)
		},
		[
			seed,
			numPoints,
			jitter,
			planetRadiusKm,
			obliquity,
			eccentricity,
			perihelion,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			daysPerYear,
			hoursPerDay,
			tideLock,
			substellarLon,
			seaLevel,
			pressure,
			mainWorldSystemBody?.albedo,
			mainWorldSystemBody?.greenhouseFactor,
			mainWorldSystemBody?.seismology?.totalHeating,
			generationCallbacks,
		],
	)

	const handleEarthImport = useCallback(async () => {
		try {
			const [
				{ grayscale, width, height },
				{ grayscale: maskPixels, width: maskWidth, height: maskHeight },
				{ grayscale: lakePixels, width: lakeWidth, height: lakeHeight },
				riverLines,
				realProvinces,
				realClimate,
				realPrecip,
				realDtr,
				realVaporPressure,
				realElevation,
				eu5Topography,
				eu5Vegetation,
				eu5Climate,
				eu4Provinces,
				eu4ProvinceFallbackSeeds,
				lakeNames,
			] = await Promise.all([
				loadImageAsGrayscale("/heightmap/earth.png"),
				loadImageAsGrayscale("/heightmap/coastline-mask.png"),
				loadImageAsGrayscale("/heightmap/lake-mask.png"),
				fetch("/heightmap/river-lines.json").then((res) => {
					if (!res.ok)
						throw new Error(`Failed to load river lines: ${res.status}`)
					return res.json() as Promise<{
						lines: {
							points: number[]
							strokeweig: number
							name?: string | null
						}[]
					}>
				}),
				loadOptionalJson<
					{ name: string; lon: number; lat: number; weight: number }[]
				>("/heightmap/earth-provinces-weighted.json"),
				loadEarthRealClimate(),
				loadEarthRealPrecip(),
				loadEarthRealDtr(),
				loadEarthRealVaporPressure(),
				loadEarthRealElevation(),
				loadEu5Categorical("eu5-topography"),
				loadEu5Categorical("eu5-vegetation"),
				loadEu5Categorical("eu5-climate"),
				loadEu4Provinces(),
				loadOptionalJson<{ id: number; lon: number; lat: number }[]>(
					"/heightmap/eu4-provinces-seeds.json",
				),
				fetch("/heightmap/lake-names.json").then((res) => {
					if (!res.ok)
						throw new Error(`Failed to load lake names: ${res.status}`)
					return res.json() as Promise<{
						lakes: { name: string; ring: [number, number][] }[]
					}>
				}),
			])
			handleReturnToPlanetView()
			handleImportHeightmap(
				grayscale,
				width,
				height,
				{ mask: maskPixels, width: maskWidth, height: maskHeight },
				{ mask: lakePixels, width: lakeWidth, height: lakeHeight },
				riverLines.lines,
				realProvinces,
				realClimate,
				realPrecip,
				realDtr,
				realVaporPressure,
				realElevation,
				eu5Topography,
				eu5Vegetation,
				eu5Climate,
				eu4Provinces,
				eu4ProvinceFallbackSeeds,
				lakeNames.lakes,
			)
			setShowCoastlines(true)
		} catch (err) {
			console.error("Failed to load Earth heightmap:", err)
			setGenerationLabel("Failed to load Earth heightmap")
		}
	}, [handleImportHeightmap, handleReturnToPlanetView])

	const handleResetDefaults = useCallback(
		() => resetWorldDefaults(setters),
		[setters],
	)
	const handleRandomizeCode = useCallback(() => {
		const nextLabel = makeRandomSeedLabel()
		const nextSeed = resolveSeedLabel(nextLabel)
		if (nextSeed === null) return
		setSeed(nextSeed)
		setSeedInput(nextLabel)
		setSeedInputDirty(false)
		setSeedError(false)
	}, [])

	const handleExportMap = useCallback(async () => {
		if (!worldForDisplay || !sceneRef.current || exportProgress) return
		const width = Number(exportWidthPreset)
		setExportError(null)
		setExportProgress({ percent: 0, label: "Preparing export" })
		try {
			const blob = await sceneRef.current.exportMapPng({
				width,
				centerLongitudeDeg: exportCenterLongitude,
				onProgress: (percent, label) => {
					setExportProgress({ percent, label })
				},
			})
			const objectUrl = window.URL.createObjectURL(blob)
			const link = document.createElement("a")
			link.href = objectUrl
			link.download = buildMapExportFilename(seed, width)
			document.body.appendChild(link)
			link.click()
			link.remove()
			window.URL.revokeObjectURL(objectUrl)
			setExportProgress(null)
		} catch (error) {
			console.error("Failed to export map PNG:", error)
			setExportError(error instanceof Error ? error.message : "Export failed")
			setExportProgress(null)
		}
	}, [
		exportCenterLongitude,
		exportProgress,
		exportWidthPreset,
		seed,
		worldForDisplay,
	])

	const handleToggleEarthHistoryPlayback = useCallback(() => {
		if (earthHistory.loading) return
		if (earthHistory.selectedDays >= earthHistory.maxDays) {
			earthHistory.setSelectedDays(earthHistory.minDays)
			setEarthHistoryPlaying(true)
			return
		}
		setEarthHistoryPlaying((playing) => !playing)
	}, [
		earthHistory.loading,
		earthHistory.maxDays,
		earthHistory.minDays,
		earthHistory.selectedDays,
		earthHistory.setSelectedDays,
	])

	const setAxialTiltDirection = useCallback(
		(value: number) => {
			const retrograde = value === 1
			const baseTilt = getEffectiveObliquityDeg(obliquity)
			setObliquity(retrograde ? 180 - baseTilt : baseTilt)
		},
		[obliquity, setObliquity],
	)

	// --- Slider definitions ---
	const planetSliders = buildPlanetSliders({
		planetRadiusKm,
		obliquity,
		eccentricity,
		perihelion,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		daysPerYear,
		hoursPerDay,
		pressure,
		landDistribution,
		landCoverage,
		tideLock,
		substellarLon,
		setPlanetRadiusKm,
		setObliquity,
		setEccentricity,
		setPerihelion,
		setOrbitalDistanceAU,
		setHoursPerDay,
		setPressure,
		setAxialTiltDirection,
		setLandDistribution,
		setLandCoverage,
		setSubstellarLon,
	})
	const terrainSliders = buildTerrainSliders({
		continentSizeVariety,
		seaLevel,
		setContinentSizeVariety,
		setSeaLevel,
		unitSystem,
	})

	// --- Planet identity ---
	// Same name the main world shows everywhere else in GenerationPanel (its
	// stat card title, breadcrumbs, etc.) -- previously this was a separate,
	// unrelated generatePlanetName(seed) call, which could (and did) produce
	// a completely different name than the one shown in the generation panel
	// for the same body.
	const planetName = mainWorldSystemBody?.name || "Main World"

	// --- Nation wiki page (Earth import only for now) ---
	const nationWikiData = useMemo<NationWikiData | null>(() => {
		if (
			!selectedWikiNationTag ||
			!world?.isEarthImport ||
			!earthHistory.engine ||
			!earthHistory.query ||
			!worldForDisplay
		)
			return null
		const tag = selectedWikiNationTag
		const { frame, state } = earthHistory.query
		const nationId = frame.nationIds.get(tag) ?? -1
		if (nationId < 0) return null

		const provinceIndexes: number[] = []
		const provinceCountByNationTag = new Map<string, number>()
		const tagByNationId = new Map<number, string>()
		for (const [nationTag, id] of frame.nationIds) {
			tagByNationId.set(id, nationTag)
		}
		for (let p = 0; p < frame.assignment.length; p++) {
			const assignedNationId = frame.assignment[p]
			if (assignedNationId === nationId) provinceIndexes.push(p)
			const assignedTag = tagByNationId.get(assignedNationId)
			if (assignedTag) {
				provinceCountByNationTag.set(
					assignedTag,
					(provinceCountByNationTag.get(assignedTag) ?? 0) + 1,
				)
			}
		}
		const hasOwnedProvinces = (otherTag: string): boolean =>
			(provinceCountByNationTag.get(otherTag) ?? 0) > 0
		const ownedProvinceIndexes = new Set(provinceIndexes)
		const regionIndexes: number[] = []
		const regionProvince = world.provinces?.regionProvince
		if (regionProvince) {
			for (let region = 0; region < regionProvince.length; region++) {
				if (ownedProvinceIndexes.has(regionProvince[region])) {
					regionIndexes.push(region)
				}
			}
		}

		const areaKm2 = worldForDisplay.provinces?.areaKm2
		const totalAreaKm2 = areaKm2
			? provinceIndexes.reduce((sum, p) => sum + (areaKm2[p] ?? 0), 0)
			: 0
		const realPopulation = worldForDisplay.realPopulation?.population
		const totalPopulation = realPopulation
			? provinceIndexes.reduce((sum, p) => sum + (realPopulation[p] ?? 0), 0)
			: 0
		const realUrbanPopulation = worldForDisplay.realUrbanPopulation?.population
		const totalUrbanPopulation = realUrbanPopulation
			? provinceIndexes.reduce(
					(sum, p) => sum + (realUrbanPopulation[p] ?? 0),
					0,
				)
			: 0

		const nationState = state.nations.get(tag)
		const resolveNationName = (otherTag: string): string =>
			isRebelTag(otherTag)
				? "Rebels"
				: (state.nations.get(otherTag)?.currentName ??
					earthHistory.nationReference?.get(otherTag)?.name ??
					frame.names[frame.nationIds.get(otherTag) ?? -1] ??
					otherTag)
		// Matches the actual "nations" map-mode fill exactly (see
		// earth-history-region-colors.ts's buildNationColorByTag) -- real EU4
		// reference color when known, the same neutral gray fallback
		// otherwise. hashColorForKey is a different, hash-based scheme used
		// only for hover swatches when no reference color exists; using it
		// here would make this swatch not match the map.
		const resolveNationColor = (otherTag: string): string => {
			if (isRebelTag(otherTag)) return "#020617"
			const ref = earthHistory.nationReference?.get(otherTag)
			return ref
				? rgb01ToCss([
						ref.color[0] / 255,
						ref.color[1] / 255,
						ref.color[2] / 255,
					])
				: rgb01ToCss([0.5, 0.5, 0.5])
		}
		const title = resolveNationName(tag)
		const color = resolveNationColor(tag)
		const governmentLabel = formatEarthHistoryGovernmentLabel({
			governmentType: nationState?.governmentType ?? null,
			governmentReform: nationState?.governmentReform ?? null,
		})
		const currentRulerPayload =
			earthHistory.engine.data.nationEvents[tag]?.events
				.filter(
					(event) =>
						event.kind === "rulerChange" &&
						event.date <= earthHistory.selectedDays,
				)
				.at(-1)?.payload ?? null
		const rulerLabel = nationState?.ruler
			? formatRulerStatLabel(
					currentRulerPayload,
					nationState.ruler.name,
					earthHistory.selectedDays,
				)
			: null
		const dynastyName =
			(typeof currentRulerPayload?.dynasty === "string"
				? currentRulerPayload.dynasty
				: nationState?.ruler?.dynasty) ?? null
		const activeConflicts = state.activeWars
			.filter((war) => war.attackers.has(tag) || war.defenders.has(tag))
			.map((war) => ({
				warId: war.warId,
				name: war.name,
				side: war.attackers.has(tag)
					? ("attacker" as const)
					: ("defender" as const),
			}))
			.sort((a, b) => a.name.localeCompare(b.name))

		// "Dependency" here covers every cross-nation political tie the Earth
		// engine tracks (fold.ts's FoldedNationState) -- overlord/vassals is
		// the literal subject hierarchy, union/allies/guarantees/marriages aren't strictly
		// dependencies but share the same "line per relation type, links to
		// other nations" shape so they're folded in here too.
		const subjectDependencyGroups = new Map<string, string[]>()
		for (const subjectTag of nationState?.vassals ?? []) {
			if (!hasOwnedProvinces(subjectTag)) continue
			const subjectType =
				nationState?.vassalSubjectTypes.get(subjectTag) ?? "vassal"
			const label = subjectTypeGroupLabel(subjectType)
			const subjects = subjectDependencyGroups.get(label) ?? []
			subjects.push(subjectTag)
			subjectDependencyGroups.set(label, subjects)
		}
		const dependencyGroups: Array<[string, string[]]> = [
			[
				"Overlord",
				nationState?.overlord && hasOwnedProvinces(nationState.overlord)
					? [nationState.overlord]
					: [],
			],
			...subjectDependencyGroups,
			[
				"Union (Senior)",
				nationState?.unionSeniorOf
					? Array.from(nationState.unionSeniorOf).filter(hasOwnedProvinces)
					: [],
			],
			[
				"Union (Junior)",
				nationState?.unionJuniorPartner &&
				hasOwnedProvinces(nationState.unionJuniorPartner)
					? [nationState.unionJuniorPartner]
					: [],
			],
			[
				"Allies",
				nationState?.allies
					? Array.from(nationState.allies).filter(hasOwnedProvinces)
					: [],
			],
			[
				"Guarantees",
				nationState?.guarantees
					? Array.from(nationState.guarantees).filter(hasOwnedProvinces)
					: [],
			],
			[
				"Royal Marriages",
				nationState?.royalMarriages
					? Array.from(nationState.royalMarriages).filter(hasOwnedProvinces)
					: [],
			],
		]
		const dependencies = dependencyGroups
			.map(([label, tags]) => ({
				label,
				nations: tags.map((otherTag) => ({
					tag: otherTag,
					name: resolveNationName(otherTag),
					color: resolveNationColor(otherTag),
				})),
			}))
			.filter((group) => group.nations.length > 0)

		const resolveOrganizationColor = (orgId: string): string => {
			const ref = earthHistory.organizationReference?.get(orgId)
			return ref
				? rgb01ToCss([
						ref.color[0] / 255,
						ref.color[1] / 255,
						ref.color[2] / 255,
					])
				: rgb01ToCss([0.5, 0.5, 0.5])
		}
		const organizationIds = new Set<string>(nationState?.organizations.keys())
		if (state.hreMemberNations.has(tag)) organizationIds.add("HRE")
		const organizations = Array.from(organizationIds).map((orgId) => {
			// A nation can hold enclave territory of an org without being
			// genuinely "part of" it -- e.g. Venice's Terraferma stayed
			// formally inside the HRE after Venice (never an Imperial Estate)
			// conquered it. Shown as this nation's own color striped with
			// transparent instead of a plain solid swatch, so the wiki
			// doesn't silently overstate membership -- see
			// collectOrgForeignHolderNations.
			const striped = collectOrgForeignHolderNations(state, orgId).has(tag)
			// For orgs whose categories split into rival sides (GG's
			// Guelphs/Ghibellines) rather than just estate/site types, show
			// which side this nation is on instead of the shared org name --
			// see OrgCategory.factionLabel.
			const role = nationState?.organizations.get(orgId)
			const category = role
				? ORG_CATEGORY_SCHEMAS[orgId]?.categories.find((c) => c.id === role)
				: undefined
			return {
				id: orgId,
				name:
					category?.factionLabel ??
					earthHistory.organizationReference?.get(orgId)?.name ??
					orgId,
				color: category?.color
					? rgb01ToCss([
							category.color[0] / 255,
							category.color[1] / 255,
							category.color[2] / 255,
						])
					: resolveOrganizationColor(orgId),
				striped,
			}
		})

		const stats = buildNationWikiStats({
			totalAreaKm2,
			totalPopulation,
			totalUrbanPopulation,
			provinceCount: provinceIndexes.length,
			rulerLabel,
			governmentLabel,
		})
		const rulerStat = stats.find((stat) => stat.label === "Ruler")
		if (rulerStat && nationState?.ruler) {
			const rulerSuffix = rulerLabel ? `· ${rulerLabel}` : ""
			if (dynastyName) {
				rulerStat.value = ""
				rulerStat.valueAction = (
					<span className="inline-flex items-center gap-1">
						<span>{nationState.ruler.name}</span>
						<Swatch color={paletteColorForDynasty(dynastyName)} />
						<span>{dynastyName}</span>
						{rulerSuffix ? <span>{rulerSuffix}</span> : null}
					</span>
				)
			} else {
				rulerStat.valuePrefix = nationState.ruler.name
				rulerStat.value = rulerSuffix
			}
		}
		if (activeConflicts.length > 0) {
			stats.push({
				label: "Conflicts",
				value: "",
				valueAction: (
					<span className="inline-flex flex-wrap items-center gap-x-1.5">
						{activeConflicts.map((conflict) => {
							const SideIcon =
								conflict.side === "attacker"
									? SwordCrossIcon
									: ShieldHalfFullIcon
							return (
								<span
									key={conflict.warId}
									className="inline-flex items-center gap-0.5"
									title={conflict.side === "attacker" ? "Attacker" : "Defender"}
								>
									<SideIcon className="h-2.5 w-2.5 text-slate-400" />
									<InlineTextButton
										onClick={() => setSelectedWikiWarId(conflict.warId)}
									>
										{conflict.name}
									</InlineTextButton>
								</span>
							)
						})}
					</span>
				),
			})
		}
		const focusNation = (targetTag: string) => {
			const targetId = frame.nationIds.get(targetTag)
			const seedProvince =
				targetId !== undefined ? frame.seeds[targetId] : undefined
			if (seedProvince === undefined || seedProvince < 0) return

			let targetProvinceCount = 0
			for (const assigned of frame.assignment) {
				if (assigned === targetId) targetProvinceCount++
			}
			sceneRef.current?.focusOnProvince(seedProvince, {
				distanceScale: nationFocusDistanceScale(targetProvinceCount),
				pulseTarget: "nation",
			})
		}

		const eventNation = (otherTag: string, rebelType?: unknown) =>
			isRebelTag(otherTag)
				? {
						tag: otherTag,
						name: formatRebelName(rebelType),
						color: "#020617",
						link: false,
					}
				: {
						tag: otherTag,
						name: resolveNationName(otherTag),
						color: resolveNationColor(otherTag),
					}
		const addNationMention = (
			nations: NationTimelineEvent["nations"],
			otherTag: string | null,
			rebelType?: unknown,
		) => {
			if (
				!otherTag ||
				nations.some(
					(entry) =>
						entry.tag === otherTag &&
						(!isRebelTag(otherTag) ||
							entry.name === formatRebelName(rebelType)),
				)
			)
				return
			nations.push(eventNation(otherTag, rebelType))
		}
		const provinceMention = (
			rawId: string,
			fallbackColor: string,
		): NationTimelineEvent["provinces"][number] | null => {
			const provinceId = earthImportRawIdToCompact?.get(Number(rawId))
			if (provinceId === undefined) return null
			return {
				id: provinceId,
				name:
					earthHistory.provinceMeta?.get(rawId)?.name ?? `Province ${rawId}`,
				color: getProvinceColor(provinceId) ?? fallbackColor,
			}
		}
		const organizationMention = (
			orgId: string,
			categoryId?: string,
		): NationTimelineEvent["organizations"][number] => {
			const ref = earthHistory.organizationReference?.get(orgId)
			const category = categoryId
				? ORG_CATEGORY_SCHEMAS[orgId]?.categories.find(
						(c) => c.id === categoryId,
					)
				: undefined
			const color = category?.color ?? ref?.color
			return {
				id: orgId,
				name: category?.factionLabel ?? ref?.name ?? orgId,
				color: color
					? rgb01ToCss([color[0] / 255, color[1] / 255, color[2] / 255])
					: rgb01ToCss([0.5, 0.5, 0.5]),
			}
		}
		const warMention = (war: {
			warId: string
			name: string
		}): NationTimelineEvent["wars"][number] => ({
			id: war.warId,
			name: war.name,
			color: "#b91c1c",
		})
		// Index every war's participant span once so territory/control-change
		// events below can guess which war (if any) caused them: a transfer
		// between two nations that were both belligerents in some war whose
		// span covers the transfer date is presumed to be that war's doing --
		// same heuristic WarWikiPage's own territory section uses, just run
		// against every war instead of one already-selected war.
		const warSpans = earthHistory.engine.data.wars.map((war) => {
			const sideByTag = new Map<string, "attacker" | "defender">()
			for (const event of war.events) sideByTag.set(event.nationTag, event.side)
			const dates = war.events.map((event) => event.date)
			return {
				war,
				sideByTag,
				dateRangeStart: dates.length > 0 ? Math.min(...dates) : Infinity,
				dateRangeEnd: dates.length > 0 ? Math.max(...dates) : -Infinity,
			}
		})
		const findWarForTransfer = (
			date: number,
			tagA: string,
			tagB: string,
		): { warId: string; name: string } | null => {
			for (const span of warSpans) {
				if (date < span.dateRangeStart || date > span.dateRangeEnd) continue
				if (!span.sideByTag.has(tagA) || !span.sideByTag.has(tagB)) continue
				return span.war
			}
			return null
		}
		const cultureMention = (
			cultureId: string,
		): NationTimelineEvent["cultures"][number] => ({
			id: cultureId,
			name:
				earthHistory.cultureNameById?.get(cultureId) ??
				cultureId.replace(/_/g, " "),
			color: rgbToCss(
				earthHistory.cultureColorById?.get(cultureId) ??
					hashColorForKey(`culture:${cultureId}`),
			),
		})
		const religionMention = (
			religionId: string,
		): NationTimelineEvent["religions"][number] => ({
			id: religionId,
			name:
				earthHistory.religionNameById?.get(religionId) ??
				religionId.replace(/_/g, " "),
			color: rgbToCss(
				earthHistory.religionColorById?.get(religionId) ??
					hashColorForKey(`religion:${religionId}`),
			),
		})
		const dynastyMention = (
			dynasty: string,
		): NationTimelineEvent["dynasties"][number] => ({
			id: dynasty,
			name: dynasty,
			color: paletteColorForDynasty(dynasty),
		})
		const personDisplay = (payload: Record<string, unknown>) => {
			const name = String(payload.name ?? payload.monarchName ?? "unknown")
			const dynasty =
				typeof payload.dynasty === "string" && payload.dynasty.trim()
					? payload.dynasty
					: null
			return {
				description: dynasty ? `${name} ${dynasty}` : name,
				dynasties: dynasty ? [dynastyMention(dynasty)] : [],
			}
		}
		const mergeById = <T extends { id: string | number }>(items: T[]): T[] => {
			const seen = new Set<string | number>()
			const merged: T[] = []
			for (const item of items) {
				if (seen.has(item.id)) continue
				seen.add(item.id)
				merged.push(item)
			}
			return merged
		}
		const mergeNations = (
			items: NationTimelineEvent["nations"],
		): NationTimelineEvent["nations"] => {
			const seen = new Set<string>()
			const merged: NationTimelineEvent["nations"] = []
			for (const item of items) {
				const key = item.link === false ? `${item.tag}:${item.name}` : item.tag
				if (seen.has(key)) continue
				seen.add(key)
				merged.push(item)
			}
			return merged
		}
		const formatList = (items: string[]): string => {
			if (items.length <= 2) return items.join(" and ")
			return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
		}
		const formatPayloadLabel = (value: unknown): string =>
			typeof value === "string"
				? cleanEu4Identifier(value)
				: value === true
					? "yes"
					: value === false
						? "no"
						: String(value)
		const payloadValue = (
			payload: Record<string, unknown>,
			...keys: string[]
		): unknown => {
			for (const key of keys) {
				if (payload[key] !== undefined) return payload[key]
			}
			return payload.value
		}
		const formatSignedValue = (value: unknown): string =>
			typeof value === "number" && value > 0 ? `+${value}` : String(value)
		const mergeEventComments = (
			events: NationTimelineEvent[],
		): string | undefined => {
			const comments = Array.from(
				new Set(events.map((event) => event.comment).filter(Boolean)),
			)
			return comments.length > 0 ? comments.join(" | ") : undefined
		}
		const escapeRegExp = (value: string): string =>
			value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		const buildMergedTerritoryDescription = (
			events: NationTimelineEvent[],
		): string => {
			const actionEntries = new Map<
				string,
				Map<
					string | null,
					{
						objects: string[]
						objectKeys: string[]
						separator: "to" | "from"
						warName: string | null
					}
				>
			>()
			const fallbackClauses: string[] = []
			for (const event of events) {
				const clause = event.description
					.replace(new RegExp(`^${escapeRegExp(title)} `), "")
					.replace(/\.$/, "")
				const match =
					/^(took control of|lost control of|gained|lost) (.+)$/.exec(clause)
				if (!match) {
					fallbackClauses.push(clause)
					continue
				}
				const [, action] = match
				let object = match[2]
				// Individual events append " (War Name)" (see
				// findWarForTransfer) when a war looks responsible -- pull
				// that off before parsing the to/from clause below.
				const warSuffixMatch = /^(.+) \(([^()]+)\)$/.exec(object)
				const warName = warSuffixMatch?.[2] ?? null
				if (warSuffixMatch) object = warSuffixMatch[1]
				const targetMatch = /^(.+) (to|from) (.+)$/.exec(object)
				const objectName = targetMatch?.[1] ?? object
				const separator =
					(targetMatch?.[2] as "to" | "from" | undefined) ?? "to"
				const targetName = targetMatch?.[3] ?? null
				const targetEntries = actionEntries.get(action) ?? new Map()
				// Dedup key is the bare province name (not the full "X to/from
				// Y" clause) so the ownership/control cross-filtering below
				// (which compares against "gained"/"lost" entries that never
				// carry a target suffix) matches correctly regardless of
				// which nation the control side names.
				const entry = targetEntries.get(targetName) ?? {
					objects: [],
					objectKeys: [],
					separator,
					warName,
				}
				entry.objects.push(objectName)
				entry.objectKeys.push(objectName)
				// Only keep the war name if every province merged into this
				// clause agrees on it -- an ambiguous mix stays unlabeled
				// rather than naming one war for provinces it didn't cause.
				if (entry.warName !== warName) entry.warName = null
				targetEntries.set(targetName, entry)
				actionEntries.set(action, targetEntries)
			}
			for (const [ownershipAction, controlAction] of [
				["gained", "took control of"],
				["lost", "lost control of"],
			] as const) {
				const ownershipObjects = new Set<string>()
				for (const entry of actionEntries.get(ownershipAction)?.values() ??
					[]) {
					for (const objectKey of entry.objectKeys)
						ownershipObjects.add(objectKey)
				}
				if (ownershipObjects.size === 0) continue
				const controlTargets = actionEntries.get(controlAction)
				if (!controlTargets) continue
				for (const [targetName, entry] of controlTargets) {
					const filteredObjects: string[] = []
					const filteredObjectKeys: string[] = []
					for (let index = 0; index < entry.objectKeys.length; index++) {
						if (ownershipObjects.has(entry.objectKeys[index])) continue
						filteredObjects.push(entry.objects[index])
						filteredObjectKeys.push(entry.objectKeys[index])
					}
					if (filteredObjects.length > 0) {
						controlTargets.set(targetName, {
							objects: filteredObjects,
							objectKeys: filteredObjectKeys,
							separator: entry.separator,
							warName: entry.warName,
						})
					} else {
						controlTargets.delete(targetName)
					}
				}
				if (controlTargets.size === 0) {
					actionEntries.delete(controlAction)
				}
			}
			const clauseEntries = Array.from(actionEntries.entries()).flatMap(
				([action, targetEntries]) =>
					Array.from(targetEntries.entries()).map(([targetName, entry]) => ({
						text: targetName
							? `${action} ${formatList(entry.objects)} ${entry.separator} ${targetName}`
							: `${action} ${formatList(entry.objects)}`,
						warName: entry.warName,
					})),
			)
			const clauses = [
				...clauseEntries.map((entry) => entry.text),
				...fallbackClauses,
			]
			// War names sit at the very end of the whole sentence rather than
			// inline after whichever clause happened to carry one -- a
			// parenthetical mid-sentence reads as if it qualifies only that
			// clause, and readers expect the "why" to cap off the sentence.
			const warNames = Array.from(
				new Set(
					clauseEntries
						.map((entry) => entry.warName)
						.filter((warName): warName is string => warName !== null),
				),
			)
			// formatList's "A, B, and C" is for a list of nouns -- these are
			// full verb clauses (one per distinct action, e.g. "gained ..."
			// and "lost control of ..."), and running them together with
			// "and" reads as one run-on sentence. Semicolons keep each action
			// visually separate.
			const warSuffix = warNames.length > 0 ? ` (${warNames.join(", ")})` : ""
			return `${title} ${clauses.join("; ")}${warSuffix}.`
		}
		const buildMergedProvinceAttributeDescription = (
			events: NationTimelineEvent[],
			attribute: "culture" | "religion",
		): string => {
			const valueEntries = new Map<string, string[]>()
			const fallbackClauses: string[] = []
			const pattern = new RegExp(`^(.+) changed ${attribute} to (.+)$`)
			for (const event of events) {
				const clause = event.description.replace(/\.$/, "")
				const match = pattern.exec(clause)
				if (!match) {
					fallbackClauses.push(clause)
					continue
				}
				const [, provinceName, valueName] = match
				const entries = valueEntries.get(valueName) ?? []
				entries.push(provinceName)
				valueEntries.set(valueName, entries)
			}
			const clauses = [
				...Array.from(valueEntries.entries()).map(
					([valueName, provinceNames]) =>
						`${formatList(provinceNames)} changed ${attribute} to ${valueName}`,
				),
				...fallbackClauses,
			]
			return `${formatList(clauses)}.`
		}
		const mergedTerritoryType = (events: NationTimelineEvent[]): string => {
			const signs = new Set(
				events
					.map((event) => /\(([+-])\)$/.exec(event.type)?.[1])
					.filter((sign): sign is string => sign !== undefined),
			)
			if (signs.size === 1) return `Territory (${Array.from(signs)[0]})`
			return "Territory"
		}
		const ownedProvinceCountByDate = new Map<number, number>()
		const territoryDeltasByDate = new Map<number, number>()
		let timelineEvents: NationTimelineEvent[] = []
		const nationEvents = earthHistory.engine.data.nationEvents[tag]
		if (nationEvents) {
			for (const [index, event] of nationEvents.events.entries()) {
				const nations: NationTimelineEvent["nations"] = [eventNation(tag)]
				const provinces: NationTimelineEvent["provinces"] = []
				const dateId = `nation:${tag}:${event.date}:${index}`
				switch (event.kind) {
					case "governmentChange": {
						const governmentType = String(event.payload.governmentType ?? "")
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Government",
							description: `${title} changed government to ${formatEarthHistoryGovernmentLabel({ governmentType, governmentReform: null })}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					}
					case "governmentReformAdd": {
						const reformId = String(event.payload.reformId ?? "")
						if (!/^early_gov_reform_\d+$/.test(reformId)) {
							pushTimelineEvent(timelineEvents, {
								id: dateId,
								date: event.date,
								type: "Government",
								description: `${title} adopted ${reformId.replace(/_/g, " ")}.`,
								comment: eventComment(event.comment),
								nations,
							})
						}
						break
					}
					case "governmentReformRemove": {
						const reformId = String(event.payload.reformId ?? "")
						if (!/^early_gov_reform_\d+$/.test(reformId)) {
							pushTimelineEvent(timelineEvents, {
								id: dateId,
								date: event.date,
								type: "Government",
								description: `${title} abandoned ${reformId.replace(/_/g, " ")}.`,
								comment: eventComment(event.comment),
								nations,
							})
						}
						break
					}
					case "rulerChange": {
						const person = personDisplay(event.payload)
						const isInterregnum = /^interregnum$/i.test(
							String(event.payload.name ?? "").trim(),
						)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Ruler",
							description: isInterregnum
								? `${title} entered an interregnum.`
								: `${title} gained ruler ${person.description}.`,
							comment: eventComment(event.comment),
							nations,
							dynasties: isInterregnum ? [] : person.dynasties,
						})
						break
					}
					case "heirChange": {
						const person = personDisplay(event.payload)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Heir",
							description: `${title} gained heir ${person.description}.`,
							comment: eventComment(event.comment),
							nations,
							dynasties: person.dynasties,
						})
						break
					}
					case "queenChange": {
						const person = personDisplay(event.payload)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Queen",
							description: `${title} gained queen ${person.description}.`,
							comment: eventComment(event.comment),
							nations,
							dynasties: person.dynasties,
						})
						break
					}
					case "leaderAdd": {
						const person = personDisplay(event.payload)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Leader",
							description: `${title} gained leader ${person.description}.`,
							comment: eventComment(event.comment),
							nations,
							dynasties: person.dynasties,
						})
						break
					}
					case "nameChange":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Government",
							description: `${title} changed name to ${String(event.payload.name ?? tag)}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "nameRestore":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Name",
							description: `${title} restored its historical name.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "capitalChange": {
						const rawId = String(event.payload.provinceId ?? "")
						const province = provinceMention(rawId, color)
						if (province) provinces.push(province)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Capital",
							description: province
								? `${title} moved its capital to ${province.name}.`
								: `${title} moved its capital.`,
							comment: eventComment(event.comment),
							nations,
							provinces,
						})
						break
					}
					case "primaryCulture":
					case "acceptedCultureAdd":
					case "acceptedCultureRemove": {
						const cultureId = String(
							payloadValue(event.payload, "cultureId") ?? "",
						)
						const culture = cultureMention(cultureId)
						const verb =
							event.kind === "acceptedCultureAdd"
								? "accepted"
								: event.kind === "acceptedCultureRemove"
									? "stopped accepting"
									: "made its primary culture"
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Culture",
							description: `${title} ${verb} ${culture.name}.`,
							comment: eventComment(event.comment),
							nations,
							cultures: [culture],
						})
						break
					}
					case "religion":
					case "school": {
						const religionId =
							event.kind === "religion"
								? String(payloadValue(event.payload, "religionId") ?? "")
								: ""
						const religion = religionId ? religionMention(religionId) : null
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Religion",
							description:
								event.kind === "school"
									? `${title} adopted ${formatPayloadLabel(payloadValue(event.payload, "schoolId"))} school.`
									: `${title} changed religion to ${religion?.name ?? "unknown"}.`,
							comment: eventComment(event.comment),
							nations,
							religions: religion ? [religion] : [],
						})
						break
					}
					case "elector":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Elector",
							description:
								event.payload.enabled === false ||
								event.payload.elector === false
									? `${title} stopped being an elector.`
									: `${title} became an elector.`,
							comment: eventComment(event.comment),
							nations,
							organizations: [organizationMention("HRE")],
						})
						break
					case "govRank":
					case "legacyGov":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Government",
							description:
								event.kind === "govRank"
									? `${title} changed government rank to ${formatPayloadLabel(payloadValue(event.payload, "rank"))}.`
									: `${title} changed legacy government to ${formatPayloadLabel(payloadValue(event.payload, "legacyGovernmentId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "techGroup":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Tech",
							description: `${title} changed technology group to ${formatPayloadLabel(payloadValue(event.payload, "techGroupId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "decision":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Decision",
							description: `${title} enacted ${formatPayloadLabel(payloadValue(event.payload, "decisionId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "rulerTrait":
					case "heirTrait":
					case "queenTrait":
					case "clearTraits":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Trait",
							description:
								event.kind === "clearTraits"
									? `${title} cleared ruler traits.`
									: `${title} added ${formatPayloadLabel(payloadValue(event.payload, "traitId"))} ${event.kind.replace("Trait", "")} trait.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "countryFlagSet":
					case "countryFlagClear":
					case "globalFlagSet":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Flag",
							description:
								event.kind === "countryFlagClear"
									? `${title} cleared flag ${formatPayloadLabel(payloadValue(event.payload, "flagId"))}.`
									: `${title} set ${event.kind === "globalFlagSet" ? "global " : ""}flag ${formatPayloadLabel(payloadValue(event.payload, "flagId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "piety":
					case "mercantilism":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Economy",
							description:
								event.kind === "piety"
									? `${title} changed piety by ${formatSignedValue(payloadValue(event.payload))}.`
									: `${title} changed mercantilism by ${formatSignedValue(payloadValue(event.payload))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "ambientShow":
					case "ambientHide":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Site",
							description: `${title} ${event.kind === "ambientShow" ? "showed" : "hid"} ambient object ${formatPayloadLabel(payloadValue(event.payload, "ambientObjectId", "objectId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "revolutionTarget":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Revolution",
							description: `${title} became the revolution target.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
				}
			}
		}

		for (const [rawId, entry] of Object.entries(
			earthHistory.engine.data.provinceEvents,
		)) {
			let owner = normalizeTimelineTag(entry.base.owner)
			let controller = normalizeTimelineTag(entry.base.controller)
			let ownerRebelType: unknown
			let controllerRebelType: unknown
			const revoltTypeByDate = new Map<number, unknown>()
			for (const event of entry.events) {
				if (
					event.kind === "revolt" &&
					event.payload.revolt &&
					typeof event.payload.revolt === "object" &&
					"type" in event.payload.revolt
				) {
					revoltTypeByDate.set(
						event.date,
						(event.payload.revolt as Record<string, unknown>).type,
					)
				}
			}
			if (owner === tag) {
				territoryDeltasByDate.set(
					Number.NEGATIVE_INFINITY,
					(territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0) + 1,
				)
			}
			for (const [index, event] of entry.events.entries()) {
				const eventId = `province:${rawId}:${event.date}:${index}`
				const nextTag = normalizeTimelineTag(event.payload.tag)
				const nextRebelType = isRebelTag(nextTag)
					? revoltTypeByDate.get(event.date)
					: undefined
				const provinceColor = nextTag ? resolveNationColor(nextTag) : color
				const province = provinceMention(rawId, provinceColor)
				const provinces = province ? [province] : []
				const nations: NationTimelineEvent["nations"] = [eventNation(tag)]
				if (event.kind === "owner") {
					const previousOwnerRebelType = ownerRebelType
					const otherRebelType =
						nextTag === tag ? previousOwnerRebelType : nextRebelType
					addNationMention(nations, nextTag, nextRebelType)
					if (nextTag === tag || owner === tag) {
						if (nextTag !== owner) {
							const delta = nextTag === tag ? 1 : -1
							territoryDeltasByDate.set(
								event.date,
								(territoryDeltasByDate.get(event.date) ?? 0) + delta,
							)
						}
						const otherTag = nextTag === tag ? owner : nextTag
						const war =
							otherTag && !isRebelTag(otherTag)
								? findWarForTransfer(event.date, tag, otherTag)
								: null
						const description =
							nextTag === tag
								? `${title} gained ${province?.name ?? `province ${rawId}`}${war ? ` (${war.name})` : ""}.`
								: `${title} lost ${province?.name ?? `province ${rawId}`}${nextTag ? ` to ${eventNation(nextTag, otherRebelType).name}` : ""}${war ? ` (${war.name})` : ""}.`
						pushTimelineEvent(timelineEvents, {
							id: eventId,
							date: event.date,
							type: nextTag === tag ? "Territory (+)" : "Territory (-)",
							description,
							comment: eventComment(event.comment),
							nations,
							provinces,
							wars: war ? [warMention(war)] : [],
						})
					}
					owner = nextTag
					ownerRebelType = isRebelTag(nextTag) ? nextRebelType : undefined
				} else if (event.kind === "controller") {
					const previousController = controller
					const previousControllerRebelType = controllerRebelType
					const otherRebelType =
						nextTag === tag ? previousControllerRebelType : nextRebelType
					addNationMention(nations, nextTag, nextRebelType)
					if (nextTag === tag)
						addNationMention(nations, previousController, otherRebelType)
					if (
						nextTag !== previousController &&
						(nextTag === tag || previousController === tag)
					) {
						const otherTag = nextTag === tag ? controller : nextTag
						const war =
							otherTag && !isRebelTag(otherTag)
								? findWarForTransfer(event.date, tag, otherTag)
								: null
						const description =
							nextTag === tag
								? `${title} took control of ${province?.name ?? `province ${rawId}`}${previousController ? ` from ${eventNation(previousController, otherRebelType).name}` : ""}${war ? ` (${war.name})` : ""}.`
								: `${title} lost control of ${province?.name ?? `province ${rawId}`}${nextTag ? ` to ${eventNation(nextTag, otherRebelType).name}` : ""}${war ? ` (${war.name})` : ""}.`
						pushTimelineEvent(timelineEvents, {
							id: eventId,
							date: event.date,
							type: nextTag === tag ? "Territory (+)" : "Territory (-)",
							description,
							comment: eventComment(event.comment),
							nations,
							provinces,
							wars: war ? [warMention(war)] : [],
						})
					}
					controller = nextTag
					controllerRebelType = isRebelTag(nextTag) ? nextRebelType : undefined
				} else if (owner === tag && event.kind === "culture") {
					const cultureId = String(event.payload.cultureId ?? "")
					const culture = cultureMention(cultureId)
					pushTimelineEvent(timelineEvents, {
						id: eventId,
						date: event.date,
						type: "Culture",
						description: `${province?.name ?? `Province ${rawId}`} changed culture to ${culture.name}.`,
						comment: eventComment(event.comment),
						nations,
						provinces,
						cultures: [culture],
					})
				} else if (owner === tag && event.kind === "religion") {
					const religionId = String(event.payload.religionId ?? "")
					const religion = religionMention(religionId)
					pushTimelineEvent(timelineEvents, {
						id: eventId,
						date: event.date,
						type: "Religion",
						description: `${province?.name ?? `Province ${rawId}`} changed religion to ${religion.name}.`,
						comment: eventComment(event.comment),
						nations,
						provinces,
						religions: [religion],
					})
				} else if (owner === tag && event.kind === "hre") {
					const joined = Boolean(event.payload.member)
					pushTimelineEvent(timelineEvents, {
						id: eventId,
						date: event.date,
						type: joined ? "HRE (+)" : "HRE (-)",
						description: joined
							? `${province?.name ?? `Province ${rawId}`} joined the Holy Roman Empire.`
							: `${province?.name ?? `Province ${rawId}`} left the Holy Roman Empire.`,
						comment: eventComment(event.comment),
						nations,
						provinces,
						organizations: [organizationMention("HRE")],
					})
				}
			}
		}

		for (const [index, event] of earthHistory.engine.data.diplomacy.entries()) {
			const firstTag = normalizeTimelineTag(event.payload.firstTag)
			const secondTag = normalizeTimelineTag(event.payload.secondTag)
			if (firstTag !== tag && secondTag !== tag) continue
			const otherTag = firstTag === tag ? secondTag : firstTag
			const nations: NationTimelineEvent["nations"] = [eventNation(tag)]
			addNationMention(nations, otherTag)
			const otherName = otherTag
				? resolveNationName(otherTag)
				: "another nation"
			const starts = event.kind.endsWith("Start")
			if (event.kind === "emperorStart" || event.kind === "emperorEnd") {
				// firstTag is always the emperor tag, secondTag is "HLR" (the
				// empire's own nation entry) -- see convert_emperors in
				// build-eu4-history-events.py. Only the emperor's own wiki page
				// reaches this branch (tag === firstTag), never HLR's.
				pushTimelineEvent(timelineEvents, {
					id: `diplomacy:${event.date}:${index}`,
					date: event.date,
					type: starts ? "Emperor (+)" : "Emperor (-)",
					description: starts
						? `${title} became Emperor of the Holy Roman Empire.`
						: `${title}'s reign as Emperor of the Holy Roman Empire ended.`,
					nations,
					organizations: [organizationMention("HRE")],
				})
				continue
			}
			const relation = event.kind.startsWith("alliance")
				? "alliance"
				: event.kind.startsWith("guarantee")
					? "guarantee"
					: event.kind.startsWith("royalMarriage")
						? "royal marriage"
						: event.kind.startsWith("union")
							? "personal union"
							: "dependency"
			let description: string
			if (
				event.kind === "vassalStart" ||
				event.kind === "vassalEnd" ||
				event.kind === "dependencyStart" ||
				event.kind === "dependencyEnd"
			) {
				description = subjectRelationDescription({
					title,
					otherName,
					isStart: starts,
					isOverlordPage: firstTag === tag,
					subjectType:
						event.kind === "vassalStart" || event.kind === "vassalEnd"
							? "vassal"
							: event.payload.subjectType,
				})
			} else if (event.kind === "guaranteeStart") {
				description =
					firstTag === tag
						? `${title} guaranteed ${otherName}.`
						: `${title} received a guarantee from ${otherName}.`
			} else if (event.kind === "guaranteeEnd") {
				description =
					firstTag === tag
						? `${title} stopped guaranteeing ${otherName}.`
						: `${title} lost ${otherName}'s guarantee.`
			} else if (event.kind === "unionStart") {
				description =
					firstTag === tag
						? `${title} gained ${otherName} as a junior partner in a personal union.`
						: `${title} became junior partner in a personal union under ${otherName}.`
			} else if (event.kind === "unionEnd") {
				description =
					firstTag === tag
						? `${title}'s personal union over ${otherName} ended.`
						: `${title} left the personal union under ${otherName}.`
			} else {
				description = `${title} ${starts ? "formed" : "ended"} a ${relation} with ${otherName}.`
			}
			pushTimelineEvent(timelineEvents, {
				id: `diplomacy:${event.date}:${index}`,
				date: event.date,
				type: starts ? "Diplomacy (+)" : "Diplomacy (-)",
				description,
				nations,
			})
		}

		for (const [
			index,
			event,
		] of earthHistory.engine.data.organizationEvents.entries()) {
			if (
				(event.kind !== "join" && event.kind !== "leave") ||
				event.nationTag !== tag
			)
				continue
			const orgId = event.payload.orgId
			const org = organizationMention(orgId, event.payload.role)
			const joined = event.kind === "join"
			pushTimelineEvent(timelineEvents, {
				id: `organization:${orgId}:${event.date}:${index}`,
				date: event.date,
				type: joined ? "Organization (+)" : "Organization (-)",
				description: joined
					? `${title} joined the ${org.name}.`
					: `${title} left the ${org.name}.`,
				nations: [eventNation(tag)],
				organizations: [org],
			})
		}

		for (const war of earthHistory.engine.data.wars) {
			const participants = new Map<string, "attacker" | "defender">()
			for (const event of war.events)
				participants.set(event.nationTag, event.side)
			// Multiple nations often join/leave on the same date (a shared
			// peace treaty, allies declaring together) -- group by
			// (date, kind) the same way WarWikiPage does, so this nation's
			// entry reads as "X, Y, and Z entered War against A and B"
			// instead of only naming this nation.
			const eventGroups = new Map<string, RawWarParticipantEvent[]>()
			for (const event of war.events) {
				const key = `${event.date}:${event.kind}`
				const group = eventGroups.get(key)
				if (group) group.push(event)
				else eventGroups.set(key, [event])
			}
			for (const [key, group] of eventGroups) {
				if (!group.some((event) => event.nationTag === tag)) continue
				const date = group[0].date
				const kind = group[0].kind
				const comment = group.find((event) => event.comment)?.comment
				const attackerTags = group
					.filter((event) => event.side === "attacker")
					.map((event) => event.nationTag)
				const defenderTags = group
					.filter((event) => event.side === "defender")
					.map((event) => event.nationTag)
				const nations: NationTimelineEvent["nations"] = []
				for (const nationTag of [...attackerTags, ...defenderTags])
					addNationMention(nations, nationTag)
				let description: string
				if (kind === "warStart") {
					const attackerNames = attackerTags.map(resolveNationName)
					const defenderNames = defenderTags.map(resolveNationName)
					if (attackerNames.length > 0 && defenderNames.length > 0) {
						description = `${joinWithAnd(attackerNames)} entered ${war.name} against ${joinWithAnd(defenderNames)}.`
					} else {
						// Only one side declared this day (the other side's
						// members were already in the war) -- find its
						// existing opponents so "against" still shows up.
						const joiningSide =
							attackerNames.length > 0 ? "attacker" : "defender"
						const joiningTags =
							attackerNames.length > 0 ? attackerTags : defenderTags
						const joiningNames =
							attackerNames.length > 0 ? attackerNames : defenderNames
						const opponentTags = Array.from(participants.entries())
							.filter(
								([opponentTag, side]) =>
									side !== joiningSide && !joiningTags.includes(opponentTag),
							)
							.map(([opponentTag]) => opponentTag)
						for (const opponentTag of opponentTags)
							addNationMention(nations, opponentTag)
						const opponentNames = opponentTags.map(resolveNationName)
						description = `${joinWithAnd(joiningNames)} entered ${war.name}${opponentNames.length > 0 ? ` against ${joinWithAnd(opponentNames)}` : ""}.`
					}
				} else {
					const names = [...attackerTags, ...defenderTags].map(
						resolveNationName,
					)
					description = `${joinWithAnd(names)} left ${war.name}.`
				}
				pushTimelineEvent(timelineEvents, {
					id: `war:${war.warId}:${key}`,
					date,
					type: kind === "warStart" ? "War (+)" : "War (-)",
					description,
					comment: eventComment(comment),
					nations,
					wars: [warMention(war)],
				})
			}
			for (const [index, battle] of war.battles.entries()) {
				const isAttacker = battle.attacker.country === tag
				const isDefender = battle.defender.country === tag
				if (!isAttacker && !isDefender) continue
				const opponent = isAttacker ? battle.defender : battle.attacker
				const won = isAttacker ? battle.attackerWon : !battle.attackerWon
				const nations: NationTimelineEvent["nations"] = [eventNation(tag)]
				addNationMention(nations, opponent.country)
				const province = battle.locationProvinceId
					? provinceMention(battle.locationProvinceId, "#94a3b8")
					: null
				const description = `${title} ${won ? "won" : "lost"} the Battle of ${battle.name} against ${resolveNationName(opponent.country)} (${war.name}).`
				pushTimelineEvent(timelineEvents, {
					id: `warBattle:${war.warId}:${battle.date}:${index}`,
					date: battle.date,
					type: won ? "Battle (+)" : "Battle (-)",
					description,
					comment: eventComment(battle.comment),
					nations,
					provinces: province ? [province] : [],
					wars: [warMention(war)],
				})
			}
		}
		let ownedProvinceCount =
			territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0
		for (const date of Array.from(territoryDeltasByDate.keys())
			.filter((date) => Number.isFinite(date))
			.sort((a, b) => a - b)) {
			ownedProvinceCount += territoryDeltasByDate.get(date) ?? 0
			ownedProvinceCountByDate.set(date, ownedProvinceCount)
		}
		// Step-chart series for the wiki page: the base ownership count at the
		// simulation start, then the running count at each ownership change.
		// ownedProvinceCountByDate iterates in ascending date order because it
		// was filled from sorted dates above.
		const provinceHistory: Array<{ date: number; count: number }> = [
			{
				date: earthHistory.minDays,
				count: territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0,
			},
		]
		for (const [date, count] of ownedProvinceCountByDate) {
			if (date <= earthHistory.minDays) {
				provinceHistory[0] = { date: earthHistory.minDays, count }
			} else {
				provinceHistory.push({ date, count })
			}
		}
		const hasOwnedProvinceAtDate = (date: number): boolean => {
			let count = territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0
			for (const [changeDate, changedCount] of ownedProvinceCountByDate) {
				if (changeDate > date) break
				count = changedCount
			}
			return count > 0
		}
		timelineEvents = timelineEvents.filter((event) =>
			hasOwnedProvinceAtDate(event.date),
		)
		const mergedTimelineEvents: NationTimelineEvent[] = []
		const territorialGroups = new Map<number, NationTimelineEvent[]>()
		const cultureGroups = new Map<number, NationTimelineEvent[]>()
		const religionGroups = new Map<number, NationTimelineEvent[]>()
		for (const event of timelineEvents) {
			if (event.type.startsWith("Territory")) {
				const group = territorialGroups.get(event.date) ?? []
				group.push(event)
				territorialGroups.set(event.date, group)
			} else if (event.type === "Culture") {
				const group = cultureGroups.get(event.date) ?? []
				group.push(event)
				cultureGroups.set(event.date, group)
			} else if (event.type === "Religion") {
				const group = religionGroups.get(event.date) ?? []
				group.push(event)
				religionGroups.set(event.date, group)
			} else {
				mergedTimelineEvents.push(event)
			}
		}
		for (const [date, group] of territorialGroups) {
			if (group.length === 1) {
				mergedTimelineEvents.push(group[0])
				continue
			}
			const mergedType = mergedTerritoryType(group)
			mergedTimelineEvents.push({
				id: `territory:${tag}:${date}:merged`,
				date,
				dateLabel: formatEu4Days(date),
				type: mergedType,
				typeColor: timelineTypeColor(mergedType),
				description: buildMergedTerritoryDescription(group),
				comment: mergeEventComments(group),
				nations: mergeNations(group.flatMap((event) => event.nations)),
				provinces: mergeById(group.flatMap((event) => event.provinces)),
				cultures: mergeById(group.flatMap((event) => event.cultures)),
				religions: mergeById(group.flatMap((event) => event.religions)),
				dynasties: mergeById(group.flatMap((event) => event.dynasties)),
				organizations: mergeById(group.flatMap((event) => event.organizations)),
				wars: mergeById(group.flatMap((event) => event.wars)),
			})
		}
		for (const [date, group] of cultureGroups) {
			if (group.length === 1) {
				mergedTimelineEvents.push(group[0])
				continue
			}
			mergedTimelineEvents.push({
				id: `culture:${tag}:${date}:merged`,
				date,
				dateLabel: formatEu4Days(date),
				type: "Culture",
				typeColor: timelineTypeColor("Culture"),
				description: buildMergedProvinceAttributeDescription(group, "culture"),
				comment: mergeEventComments(group),
				nations: mergeNations(group.flatMap((event) => event.nations)),
				provinces: mergeById(group.flatMap((event) => event.provinces)),
				cultures: mergeById(group.flatMap((event) => event.cultures)),
				religions: mergeById(group.flatMap((event) => event.religions)),
				dynasties: mergeById(group.flatMap((event) => event.dynasties)),
				organizations: mergeById(group.flatMap((event) => event.organizations)),
				wars: mergeById(group.flatMap((event) => event.wars)),
			})
		}
		for (const [date, group] of religionGroups) {
			if (group.length === 1) {
				mergedTimelineEvents.push(group[0])
				continue
			}
			mergedTimelineEvents.push({
				id: `religion:${tag}:${date}:merged`,
				date,
				dateLabel: formatEu4Days(date),
				type: "Religion",
				typeColor: timelineTypeColor("Religion"),
				description: buildMergedProvinceAttributeDescription(group, "religion"),
				comment: mergeEventComments(group),
				nations: mergeNations(group.flatMap((event) => event.nations)),
				provinces: mergeById(group.flatMap((event) => event.provinces)),
				cultures: mergeById(group.flatMap((event) => event.cultures)),
				religions: mergeById(group.flatMap((event) => event.religions)),
				dynasties: mergeById(group.flatMap((event) => event.dynasties)),
				organizations: mergeById(group.flatMap((event) => event.organizations)),
				wars: mergeById(group.flatMap((event) => event.wars)),
			})
		}
		timelineEvents = mergedTimelineEvents
		timelineEvents.sort(
			(a, b) => a.date - b.date || a.type.localeCompare(b.type),
		)

		const cultureDistribution = buildStringIdDistributionForProvinces({
			idByProvince: frame.cultureByProvince,
			provinceIndexes,
			nameById: earthHistory.cultureNameById ?? undefined,
			colorById: earthHistory.cultureColorById ?? undefined,
			rgbToCss,
			fallbackColor: "rgb(148, 163, 184)",
		})
		const religionDistribution = buildStringIdDistributionForProvinces({
			idByProvince: frame.religionByProvince,
			provinceIndexes,
			nameById: earthHistory.religionNameById ?? undefined,
			colorById: earthHistory.religionColorById ?? undefined,
			rgbToCss,
			fallbackColor: "rgb(148, 163, 184)",
		})

		const climateDistribution = showObservedDistributions
			? buildDistributionForRegions(
					EU5_CLIMATE_CATEGORIES.map((label) => label.replace(/_/g, " ")),
					world.eu5Climate,
					regionIndexes,
					(index) => rgbToCss(EU5_CLIMATE_COLORS[index]),
				)
			: buildDistributionForRegions(
					CLIMATE_LABELS,
					world.climateZones,
					regionIndexes,
					(index) => rgbToCss(climateZoneColor(index)),
					new Set([0]),
				)
		const vegetationDistribution = showObservedDistributions
			? buildDistributionForRegions(
					EU5_VEGETATION_CATEGORIES.map((label) => label.replace(/_/g, " ")),
					world.eu5Vegetation,
					regionIndexes,
					(index) => rgbToCss(EU5_VEGETATION_COLORS[index]),
				)
			: buildDistributionForRegions(
					BIOME_LABELS,
					world.vegetation,
					regionIndexes,
					(index) => rgbToCss(vegetationColor(index)),
					new Set([0]),
				)
		const topographyDistribution = showObservedDistributions
			? buildEu5TopographyDistribution({
					values: world.eu5Topography,
					regionIndexes,
					rgbToCss,
				})
			: buildDistributionForRegions(
					GENESIS_TOPOGRAPHY_LABELS,
					world.topography,
					regionIndexes,
					(index) => {
						const color = getTopographyColor(index)
						return color ? rgbToCss(color) : "rgb(148, 163, 184)"
					},
					new Set([TOPO_LAKE, TOPO_OCEAN]),
				)

		return {
			title,
			color,
			planetTitle: planetName,
			stats,
			dependencies,
			organizations,
			cultureDistribution,
			religionDistribution,
			climateDistribution,
			vegetationDistribution,
			topographyDistribution,
			showObservedDistributions,
			provinceHistory,
			dateRangeStart: earthHistory.minDays,
			dateRangeEnd: earthHistory.maxDays,
			currentDate: earthHistory.selectedDays,
			currentDateLabel: formatEu4Days(earthHistory.selectedDays),
			timelineEvents,
			onBack: () => setSelectedWikiNationTag(null),
			onFocusNation: () => focusNation(tag),
			onSelectNation: (targetTag: string) => {
				focusNation(targetTag)
				setSelectedWikiNationTag(targetTag)
			},
			onSelectProvince: (provinceId: number) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			onSelectDate: earthHistory.setSelectedDays,
			onSelectOrganization: (orgId: string) => {
				setSelectedWikiOrganizationId(orgId)
			},
			onSelectWar: (warId: string) => {
				setSelectedWikiWarId(warId)
			},
		}
	}, [
		selectedWikiNationTag,
		world,
		earthHistory.query,
		earthHistory.engine,
		earthHistory.selectedDays,
		earthHistory.setSelectedDays,
		earthHistory.minDays,
		earthHistory.maxDays,
		earthHistory.nationReference,
		earthHistory.organizationReference,
		earthHistory.cultureNameById,
		earthHistory.cultureColorById,
		earthHistory.religionNameById,
		earthHistory.religionColorById,
		earthHistory.provinceMeta,
		earthImportRawIdToCompact,
		worldForDisplay,
		showObservedDistributions,
		planetName,
		getProvinceColor,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
	])

	const organizationWikiData = useMemo<OrganizationWikiData | null>(() => {
		if (
			!selectedWikiOrganizationId ||
			!world?.isEarthImport ||
			!earthHistory.engine ||
			!earthHistory.query ||
			!worldForDisplay
		)
			return null
		const orgId = selectedWikiOrganizationId
		const orgRef = earthHistory.organizationReference?.get(orgId)
		if (!orgRef) return null
		const engine = earthHistory.engine
		const { frame, state } = earthHistory.query
		const focusOrgNation = (targetTag: string) => {
			const targetId = frame.nationIds.get(targetTag)
			const seedProvince =
				targetId !== undefined ? frame.seeds[targetId] : undefined
			if (seedProvince === undefined || seedProvince < 0) return
			let targetProvinceCount = 0
			for (const assigned of frame.assignment) {
				if (assigned === targetId) targetProvinceCount++
			}
			sceneRef.current?.focusOnProvince(seedProvince, {
				distanceScale: nationFocusDistanceScale(targetProvinceCount),
				pulseTarget: "nation",
			})
		}
		const resolveNationName = (otherTag: string): string =>
			isRebelTag(otherTag)
				? "Rebels"
				: (state.nations.get(otherTag)?.currentName ??
					earthHistory.nationReference?.get(otherTag)?.name ??
					otherTag)
		const resolveNationColor = (otherTag: string): string => {
			const ref = earthHistory.nationReference?.get(otherTag)
			return ref
				? rgb01ToCss([
						ref.color[0] / 255,
						ref.color[1] / 255,
						ref.color[2] / 255,
					])
				: rgb01ToCss([0.5, 0.5, 0.5])
		}
		const nationMention = (otherTag: string) =>
			isRebelTag(otherTag)
				? {
						tag: otherTag,
						name: "Rebels",
						color: "#020617",
						link: false,
					}
				: {
						tag: otherTag,
						name: resolveNationName(otherTag),
						color: resolveNationColor(otherTag),
					}
		const color = rgb01ToCss([
			orgRef.color[0] / 255,
			orgRef.color[1] / 255,
			orgRef.color[2] / 255,
		])
		const orgMention = { id: orgId, name: orgRef.name, color }
		const mentionForRole = (categoryId?: string): typeof orgMention => {
			const category = categoryId
				? ORG_CATEGORY_SCHEMAS[orgId]?.categories.find(
						(c) => c.id === categoryId,
					)
				: undefined
			if (!category) return orgMention
			const categoryColor = category.color
				? rgb01ToCss([
						category.color[0] / 255,
						category.color[1] / 255,
						category.color[2] / 255,
					])
				: color
			return {
				id: orgId,
				name: category.factionLabel ?? orgRef.name,
				color: categoryColor,
			}
		}
		const provinceMention = (
			rawId: string,
		): NationTimelineEvent["provinces"][number] | null => {
			const provinceId = earthImportRawIdToCompact?.get(Number(rawId))
			if (provinceId === undefined) return null
			return {
				id: provinceId,
				name:
					earthHistory.provinceMeta?.get(rawId)?.name ?? `Province ${rawId}`,
				color: getProvinceColor(provinceId) ?? color,
			}
		}

		const timelineEvents: NationTimelineEvent[] = []
		if (orgId === "HRE") {
			// Leadership tracked via emperorStart/End diplomacy events (secondTag
			// "HLR") rather than organizations.json, which only covers HSA.
			// Every province's own hre join/leave history, not filtered to any
			// single nation -- owner is tracked while walking each province's
			// events chronologically so the mention can name who held it.
			for (const [rawId, entry] of Object.entries(engine.data.provinceEvents)) {
				let owner = normalizeTimelineTag(entry.base.owner)
				for (const [index, event] of entry.events.entries()) {
					if (event.kind === "owner") {
						owner = normalizeTimelineTag(
							event.payload.tag as string | undefined,
						)
						continue
					}
					if (event.kind !== "hre") continue
					const joined = Boolean(event.payload.member)
					const province = provinceMention(rawId)
					pushTimelineEvent(timelineEvents, {
						id: `hre:${rawId}:${event.date}:${index}`,
						date: event.date,
						type: joined ? "HRE (+)" : "HRE (-)",
						description: joined
							? `${province?.name ?? `Province ${rawId}`} joined the Holy Roman Empire.`
							: `${province?.name ?? `Province ${rawId}`} left the Holy Roman Empire.`,
						nations: owner ? [nationMention(owner)] : [],
						provinces: province ? [province] : [],
						organizations: [orgMention],
					})
				}
			}
			for (const [index, e] of engine.data.diplomacy.entries()) {
				if (
					(e.kind !== "emperorStart" && e.kind !== "emperorEnd") ||
					e.payload.secondTag !== "HLR"
				)
					continue
				const starts = e.kind === "emperorStart"
				const emperorName = resolveNationName(e.payload.firstTag)
				pushTimelineEvent(timelineEvents, {
					id: `emperor:${e.date}:${index}`,
					date: e.date,
					type: starts ? "Emperor (+)" : "Emperor (-)",
					description: starts
						? `${emperorName} became Emperor of the Holy Roman Empire.`
						: `${emperorName}'s reign as Emperor of the Holy Roman Empire ended.`,
					nations: [nationMention(e.payload.firstTag)],
					organizations: [orgMention],
				})
			}
			for (const [tag, entry] of Object.entries(engine.data.nationEvents)) {
				for (const [index, event] of entry.events.entries()) {
					if (event.kind !== "elector") continue
					const elected = Boolean(event.payload.elector)
					const nationName = resolveNationName(tag)
					pushTimelineEvent(timelineEvents, {
						id: `elector:${tag}:${event.date}:${index}`,
						date: event.date,
						type: elected ? "Elector (+)" : "Elector (-)",
						description: elected
							? `${nationName} became an Elector in the Holy Roman Empire.`
							: `${nationName} ceased to be an Elector in the Holy Roman Empire.`,
						nations: [nationMention(tag)],
						organizations: [orgMention],
					})
				}
			}
		} else {
			for (const [index, e] of engine.data.organizationEvents.entries()) {
				if (e.payload.orgId !== orgId) continue
				if (e.kind === "siteStart" || e.kind === "siteEnd") {
					const started = e.kind === "siteStart"
					const province = provinceMention(e.provinceId)
					if (e.payload.role === "member_seat") {
						const siteDescription = province
							? `${e.payload.name} ${started ? "became" : "ceased to be"} a member seat of the ${orgRef.name} in ${province.name}.`
							: `${e.payload.name} ${started ? "became" : "ceased to be"} a member seat of the ${orgRef.name}.`
						pushTimelineEvent(timelineEvents, {
							id: `organization-site:${orgId}:${e.provinceId}:${e.date}:${index}`,
							date: e.date,
							type: started ? "Organization (+)" : "Organization (-)",
							description: siteDescription,
							provinces: province ? [province] : [],
							organizations: [orgMention],
						})
						continue
					}
					// "kontor" is the historical/EU4 term for a Hanseatic trading
					// post -- displayed as "trade post" to match the org-categories
					// naming (organization-categories.ts's tradePost category)
					// rather than the raw EU4 role id.
					const roleLabel =
						e.payload.role === "kontor"
							? "trade post"
							: e.payload.role.replace(/_/g, " ")
					const siteDescription = province
						? `${e.payload.name} ${started ? "opened" : "closed"} as a ${roleLabel} of the ${orgRef.name} in ${province.name}.`
						: `${e.payload.name} ${started ? "opened" : "closed"} as a ${roleLabel} of the ${orgRef.name}.`
					pushTimelineEvent(timelineEvents, {
						id: `organization-site:${orgId}:${e.provinceId}:${e.date}:${index}`,
						date: e.date,
						type: started ? "Organization (+)" : "Organization (-)",
						description: siteDescription,
						provinces: province ? [province] : [],
						organizations: [orgMention],
					})
					continue
				}
				if (e.kind === "join" || e.kind === "leave") {
					const joined = e.kind === "join"
					const nationName = resolveNationName(e.nationTag)
					const mention = mentionForRole(e.payload.role)
					pushTimelineEvent(timelineEvents, {
						id: `organization:${orgId}:${e.date}:${index}`,
						date: e.date,
						type: joined ? "Organization (+)" : "Organization (-)",
						description: joined
							? `${nationName} joined the ${mention.name}.`
							: `${nationName} left the ${mention.name}.`,
						nations: [nationMention(e.nationTag)],
						organizations: [mention],
					})
				}
			}
		}
		timelineEvents.sort(
			(a, b) => a.date - b.date || a.type.localeCompare(b.type),
		)
		// Nation-level membership, generic across every org: derived straight
		// from the org's own category schema (organization-categories.ts) via
		// listOrgMembers, rather than bespoke per-org membership/foreign-holder
		// logic -- adding a new org or member type (e.g. HSA's trade posts) is
		// then just a data entry in that schema, not new branches here.
		const orgCategorizers = buildOrgCategorizer(state, orgRef)
		const memberCategories: Map<string, OrgProvinceCategory> = (() => {
			if (!orgCategorizers) {
				return new Map(
					Array.from(state.nations.entries())
						.filter(([, nation]) => nation.organizations.has(orgId))
						.map(([tag]) => [tag, { categoryId: "member", striped: false }]),
				)
			}
			if (orgId !== "HSA") {
				return listOrgMembers(state, orgCategorizers.categorize)
			}
			const categories = new Map<string, OrgProvinceCategory>()
			for (const site of state.organizationSites.values()) {
				if (
					site.orgId !== orgId ||
					(site.role !== "kontor" && site.role !== "trade_branch")
				)
					continue
				const owner = state.provinces.get(site.provinceId)?.owner
				if (owner)
					categories.set(owner, { categoryId: "tradePost", striped: true })
			}
			for (const [tag, nation] of state.nations) {
				if (nation.organizations.has(orgId)) {
					categories.set(tag, { categoryId: "member", striped: false })
				}
			}
			return categories
		})()
		const categoryLabelById = new Map(
			ORG_CATEGORY_SCHEMAS[orgId]?.categories.map((c) => [c.id, c] as const),
		)
		const categoryOrderById = new Map(
			ORG_CATEGORY_SCHEMAS[orgId]?.categories.map((c, i) => [c.id, i] as const),
		)
		const members = Array.from(memberCategories.entries())
			.map(([memberTag, memberCategory]) => {
				const categoryDef = categoryLabelById.get(memberCategory.categoryId)
				return {
					...nationMention(memberTag),
					striped: memberCategory.striped,
					category: categoryDef
						? {
								label: categoryDef.label,
								color: rgb255ToCss(categoryDef.color ?? orgRef.color),
								order: categoryOrderById.get(memberCategory.categoryId) ?? 0,
								striped: memberCategory.striped,
							}
						: undefined,
				}
			})
			.sort((a, b) => a.name.localeCompare(b.name))

		// Member-territory province count over time -- recomputed with a fresh
		// full fold at each transition date (see collectOrgMemberProvinceRawIds)
		// since, unlike a nation's own owned-province count, this can't be
		// tracked incrementally from the timeline events above alone (HSA
		// territory changes with member nations' wars, not just membership).
		const transitionDates = Array.from(
			new Set(timelineEvents.map((event) => event.date)),
		).sort((a, b) => a - b)
		const countHistory: WikiCountHistoryPoint[] = transitionDates.map(
			(date) => {
				const foldedAtDate = fold(engine.data, date, {
					provinceIds: engine.cache.provinceIds,
					nationTags: engine.cache.nationTags,
				})
				return {
					date,
					count: collectOrgMemberProvinceRawIds(foldedAtDate, orgId).size,
				}
			},
		)
		if (
			countHistory.length === 0 ||
			countHistory[0].date > earthHistory.minDays
		) {
			countHistory.unshift({
				date: earthHistory.minDays,
				count: collectOrgMemberProvinceRawIds(
					fold(engine.data, earthHistory.minDays, {
						provinceIds: engine.cache.provinceIds,
						nationTags: engine.cache.nationTags,
					}),
					orgId,
				).size,
			})
		}

		// Current member territory, for the stat block and Environmental/
		// Demographics distributions -- the exact same province set the map's
		// striped border draws, so the numbers always agree with what's shown.
		const memberProvinceRawIds = collectOrgMemberProvinceRawIds(state, orgId)
		const provinceIndexes: number[] = []
		for (const rawId of memberProvinceRawIds) {
			const compact = earthImportRawIdToCompact?.get(rawId)
			if (compact !== undefined) provinceIndexes.push(compact)
		}
		const ownedProvinceIndexes = new Set(provinceIndexes)
		const regionIndexes: number[] = []
		const regionProvince = world.provinces?.regionProvince
		if (regionProvince) {
			for (let region = 0; region < regionProvince.length; region++) {
				if (ownedProvinceIndexes.has(regionProvince[region])) {
					regionIndexes.push(region)
				}
			}
		}
		const areaKm2 = worldForDisplay.provinces?.areaKm2
		const totalAreaKm2 = areaKm2
			? provinceIndexes.reduce((sum, p) => sum + (areaKm2[p] ?? 0), 0)
			: 0
		const realPopulation = worldForDisplay.realPopulation?.population
		const totalPopulation = realPopulation
			? provinceIndexes.reduce((sum, p) => sum + (realPopulation[p] ?? 0), 0)
			: 0
		const stats = buildOrganizationWikiStats({
			totalAreaKm2,
			totalPopulation,
			provinceCount: provinceIndexes.length,
		})

		const cultureDistribution = buildStringIdDistributionForProvinces({
			idByProvince: frame.cultureByProvince,
			provinceIndexes,
			nameById: earthHistory.cultureNameById ?? undefined,
			colorById: earthHistory.cultureColorById ?? undefined,
			rgbToCss,
			fallbackColor: "rgb(148, 163, 184)",
		})
		const religionDistribution = buildStringIdDistributionForProvinces({
			idByProvince: frame.religionByProvince,
			provinceIndexes,
			nameById: earthHistory.religionNameById ?? undefined,
			colorById: earthHistory.religionColorById ?? undefined,
			rgbToCss,
			fallbackColor: "rgb(148, 163, 184)",
		})
		const climateDistribution = showObservedDistributions
			? buildDistributionForRegions(
					EU5_CLIMATE_CATEGORIES.map((label) => label.replace(/_/g, " ")),
					world.eu5Climate,
					regionIndexes,
					(index) => rgbToCss(EU5_CLIMATE_COLORS[index]),
				)
			: buildDistributionForRegions(
					CLIMATE_LABELS,
					world.climateZones,
					regionIndexes,
					(index) => rgbToCss(climateZoneColor(index)),
					new Set([0]),
				)
		const vegetationDistribution = showObservedDistributions
			? buildDistributionForRegions(
					EU5_VEGETATION_CATEGORIES.map((label) => label.replace(/_/g, " ")),
					world.eu5Vegetation,
					regionIndexes,
					(index) => rgbToCss(EU5_VEGETATION_COLORS[index]),
				)
			: buildDistributionForRegions(
					BIOME_LABELS,
					world.vegetation,
					regionIndexes,
					(index) => rgbToCss(vegetationColor(index)),
					new Set([0]),
				)
		const topographyDistribution = showObservedDistributions
			? buildEu5TopographyDistribution({
					values: world.eu5Topography,
					regionIndexes,
					rgbToCss,
				})
			: buildDistributionForRegions(
					GENESIS_TOPOGRAPHY_LABELS,
					world.topography,
					regionIndexes,
					(index) => {
						const topoColor = getTopographyColor(index)
						return topoColor ? rgbToCss(topoColor) : "rgb(148, 163, 184)"
					},
					new Set([TOPO_LAKE, TOPO_OCEAN]),
				)

		return {
			id: orgId,
			name: orgRef.name,
			color,
			planetTitle: planetName,
			stats,
			members,
			cultureDistribution,
			religionDistribution,
			climateDistribution,
			vegetationDistribution,
			topographyDistribution,
			showObservedDistributions,
			countHistory,
			dateRangeStart: earthHistory.minDays,
			dateRangeEnd: earthHistory.maxDays,
			currentDate: earthHistory.selectedDays,
			currentDateLabel: formatEu4Days(earthHistory.selectedDays),
			timelineEvents,
			onBack: () => setSelectedWikiOrganizationId(null),
			onSelectNation: (targetTag: string) => {
				focusOrgNation(targetTag)
				setSelectedWikiNationTag(targetTag)
			},
			onSelectProvince: (provinceId: number) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			onSelectDate: earthHistory.setSelectedDays,
			onSelectWar: (warId: string) => {
				setSelectedWikiWarId(warId)
			},
		}
	}, [
		selectedWikiOrganizationId,
		world,
		earthHistory.query,
		earthHistory.engine,
		earthHistory.selectedDays,
		earthHistory.setSelectedDays,
		earthHistory.minDays,
		earthHistory.maxDays,
		earthHistory.nationReference,
		earthHistory.organizationReference,
		earthHistory.cultureNameById,
		earthHistory.cultureColorById,
		earthHistory.religionNameById,
		earthHistory.religionColorById,
		earthHistory.provinceMeta,
		earthImportRawIdToCompact,
		worldForDisplay,
		showObservedDistributions,
		planetName,
		getProvinceColor,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		buildOrgCategorizer,
	])

	const warWikiData = useMemo<WarWikiData | null>(() => {
		if (
			!selectedWikiWarId ||
			!world?.isEarthImport ||
			!earthHistory.engine ||
			!earthHistory.query
		)
			return null
		const war = earthHistory.engine.data.wars.find(
			(w) => w.warId === selectedWikiWarId,
		)
		if (!war || war.events.length === 0) return null
		const { state } = earthHistory.query
		const resolveNationName = (otherTag: string): string =>
			isRebelTag(otherTag)
				? "Rebels"
				: (state.nations.get(otherTag)?.currentName ??
					earthHistory.nationReference?.get(otherTag)?.name ??
					otherTag)
		const resolveNationColor = (otherTag: string): string => {
			if (isRebelTag(otherTag)) return "#020617"
			const ref = earthHistory.nationReference?.get(otherTag)
			return ref
				? rgb01ToCss([
						ref.color[0] / 255,
						ref.color[1] / 255,
						ref.color[2] / 255,
					])
				: rgb01ToCss([0.5, 0.5, 0.5])
		}
		const nationMention = (otherTag: string) =>
			isRebelTag(otherTag)
				? {
						tag: otherTag,
						name: "Rebels",
						color: "#020617",
						link: false,
					}
				: {
						tag: otherTag,
						name: resolveNationName(otherTag),
						color: resolveNationColor(otherTag),
					}
		const provinceMention = (
			rawId: string,
			fallbackColor: string,
		): NationTimelineEvent["provinces"][number] | null => {
			const provinceId = earthImportRawIdToCompact?.get(Number(rawId))
			if (provinceId === undefined) return null
			return {
				id: provinceId,
				name:
					earthHistory.provinceMeta?.get(rawId)?.name ?? `Province ${rawId}`,
				color: getProvinceColor(provinceId) ?? fallbackColor,
			}
		}
		// Last-known side per nation across the whole war (matches the
		// existing nation-timeline convention) -- a nation that switched
		// sides mid-war ends up bucketed by whichever side it held last.
		const sideByTag = new Map<string, "attacker" | "defender">()
		for (const event of war.events) sideByTag.set(event.nationTag, event.side)

		const dates = war.events.map((event) => event.date)
		const dateRangeStart = Math.min(...dates)
		const dateRangeEnd = Math.max(...dates)
		const dateRangeLabel = `${formatEu4Days(dateRangeStart)} – ${formatEu4Days(dateRangeEnd)}`

		const stats: StatEntry[] = []
		if (war.warGoalType)
			stats.push({
				label: "War Goal",
				value: cleanEu4Identifier(war.warGoalType),
			})
		if (war.casusBelli)
			stats.push({
				label: "Casus Belli",
				value: cleanEu4Identifier(war.casusBelli),
			})
		if (war.warGoalTag) {
			const target = nationMention(war.warGoalTag)
			stats.push({
				label: "War Goal Target",
				value: "",
				valueAction: (
					<InlineTextButton
						onClick={() => setSelectedWikiNationTag(target.tag)}
					>
						{target.name}
					</InlineTextButton>
				),
			})
		} else if (war.warGoalProvince) {
			const province = provinceMention(war.warGoalProvince, "#94a3b8")
			if (province) {
				stats.push({
					label: "War Goal Target",
					value: "",
					valueAction: (
						<InlineTextButton
							onClick={() => sceneRef.current?.focusOnProvince(province.id)}
						>
							{province.name}
						</InlineTextButton>
					),
				})
			}
		}
		if (war.isRebel) stats.push({ label: "Type", value: "Rebellion" })

		// A nation stays listed under whichever side it last held (sideByTag
		// above), but whether it's actually *in* the war right now depends on
		// the selected date -- find each tag's most recent join/leave at or
		// before that date and check whether it was a join. A tag with no
		// qualifying event yet (hasn't joined) is treated as inactive too.
		const currentDate = earthHistory.selectedDays
		const eventsByTag = new Map<string, RawWarParticipantEvent[]>()
		for (const event of war.events) {
			const list = eventsByTag.get(event.nationTag)
			if (list) list.push(event)
			else eventsByTag.set(event.nationTag, [event])
		}
		const isActiveAtCurrentDate = (nationTag: string): boolean => {
			const events = eventsByTag.get(nationTag)
			if (!events) return false
			let active = false
			for (const event of [...events].sort((a, b) => a.date - b.date)) {
				if (event.date > currentDate) break
				active = event.kind === "warStart"
			}
			return active
		}
		// Outside the war's own span entirely (viewing history well before it
		// started or long after it ended), graying out participants who
		// "haven't joined yet" or "already left" reads as broken rather than
		// informative -- only apply the per-nation check while the selected
		// date actually falls within the war.
		const dateWithinWar =
			currentDate >= dateRangeStart && currentDate <= dateRangeEnd
		const participantMention = (
			nationTag: string,
		): WarWikiData["participants"][number]["nations"][number] => ({
			...nationMention(nationTag),
			active: !dateWithinWar || isActiveAtCurrentDate(nationTag),
		})

		const sideOrder: Array<"attacker" | "defender"> = ["attacker", "defender"]
		const participants: WarWikiData["participants"] = sideOrder.map((side) => ({
			side,
			nations: Array.from(sideByTag.entries())
				.filter(([, tagSide]) => tagSide === side)
				.map(([nationTag]) => nationTag)
				.sort((a, b) =>
					resolveNationName(a).localeCompare(resolveNationName(b)),
				)
				.map(participantMention),
		}))

		const timelineEvents: NationTimelineEvent[] = []
		// Multiple nations often join/leave on the same date (a shared peace
		// treaty ending the war for every belligerent at once, or several
		// allies declaring together) -- group by (date, kind) so that shows
		// up as one combined entry instead of one per nation.
		const eventGroups = new Map<string, RawWarParticipantEvent[]>()
		for (const event of war.events) {
			const key = `${event.date}:${event.kind}`
			const group = eventGroups.get(key)
			if (group) group.push(event)
			else eventGroups.set(key, [event])
		}
		for (const [key, group] of eventGroups) {
			const date = group[0].date
			const kind = group[0].kind
			const comment = group.find((event) => event.comment)?.comment
			const attackerTags = group
				.filter((event) => event.side === "attacker")
				.map((event) => event.nationTag)
			const defenderTags = group
				.filter((event) => event.side === "defender")
				.map((event) => event.nationTag)
			const nations: NationTimelineEvent["nations"] = []
			for (const nationTag of [...attackerTags, ...defenderTags]) {
				if (!nations.some((entry) => entry.tag === nationTag))
					nations.push(nationMention(nationTag))
			}
			let description: string
			if (kind === "warStart") {
				const attackerNames = attackerTags.map(resolveNationName)
				const defenderNames = defenderTags.map(resolveNationName)
				if (attackerNames.length > 0 && defenderNames.length > 0) {
					description = `${joinWithAnd(attackerNames)} entered the war against ${joinWithAnd(defenderNames)}.`
				} else {
					const joiningSide = attackerNames.length > 0 ? "attacker" : "defender"
					const joiningTags =
						attackerNames.length > 0 ? attackerTags : defenderTags
					const joiningNames =
						attackerNames.length > 0 ? attackerNames : defenderNames
					const opponentTags = Array.from(sideByTag.entries())
						.filter(
							([opponentTag, side]) =>
								side !== joiningSide && !joiningTags.includes(opponentTag),
						)
						.map(([opponentTag]) => opponentTag)
					for (const opponentTag of opponentTags) {
						if (!nations.some((entry) => entry.tag === opponentTag))
							nations.push(nationMention(opponentTag))
					}
					const opponentNames = opponentTags.map(resolveNationName)
					description = `${joinWithAnd(joiningNames)} entered the war${opponentNames.length > 0 ? ` against ${joinWithAnd(opponentNames)}` : ""}.`
				}
			} else {
				const names = [...attackerTags, ...defenderTags].map(resolveNationName)
				description = `${joinWithAnd(names)} left the war.`
			}
			pushTimelineEvent(timelineEvents, {
				id: `warEvent:${key}`,
				date,
				type: kind === "warStart" ? "War (+)" : "War (-)",
				description,
				comment: eventComment(comment),
				nations,
			})
		}

		for (const [index, battle] of war.battles.entries()) {
			const province = battle.locationProvinceId
				? provinceMention(battle.locationProvinceId, "#94a3b8")
				: null
			const winner = battle.attackerWon ? battle.attacker : battle.defender
			const loser = battle.attackerWon ? battle.defender : battle.attacker
			const description = `${resolveNationName(winner.country)} defeated ${resolveNationName(loser.country)} at the Battle of ${battle.name}.`
			pushTimelineEvent(timelineEvents, {
				id: `warBattle:${battle.date}:${index}`,
				date: battle.date,
				type: "Battle",
				description,
				comment: eventComment(battle.comment),
				nations: [
					nationMention(battle.attacker.country),
					nationMention(battle.defender.country),
				],
				provinces: province ? [province] : [],
			})
		}

		// Territory that changed hands directly between two participants
		// (not just any ownership change anywhere in the world) during the
		// war's span -- walks every province's owner history once, which is
		// only done when a war page is actually opened. A single treaty (e.g.
		// the American Revolution's 1776.7.4 mass transfer) can flip dozens
		// of provinces on one date between the same two nations, so these are
		// grouped by (date, owner, nextOwner) into one combined entry instead
		// of one per province.
		const territoryGroups = new Map<
			string,
			{
				date: number
				owner: string
				nextOwner: string
				provinces: NationTimelineEvent["provinces"]
			}
		>()
		// Occupation (military control changing hands without a change of
		// legal ownership, e.g. the province is still being fought over) is
		// tracked separately from the ownership transfers above -- same
		// grouping shape, but keyed off `controller` events instead of
		// `owner` ones, matching the nation-page timeline's "took control
		// of" vs. "gained"/"lost" distinction (see the `owner`/`controller`
		// branches above).
		const controlGroups = new Map<
			string,
			{
				date: number
				controller: string
				nextController: string
				provinces: NationTimelineEvent["provinces"]
			}
		>()
		for (const [rawId, entry] of Object.entries(
			earthHistory.engine.data.provinceEvents,
		)) {
			let owner = normalizeTimelineTag(entry.base.owner)
			let controller = normalizeTimelineTag(entry.base.controller)
			for (const event of entry.events) {
				if (event.kind === "owner") {
					const nextOwner = normalizeTimelineTag(event.payload.tag)
					if (
						event.date >= dateRangeStart &&
						event.date <= dateRangeEnd &&
						owner &&
						nextOwner &&
						owner !== nextOwner &&
						sideByTag.has(owner) &&
						sideByTag.has(nextOwner)
					) {
						const province = provinceMention(rawId, "#94a3b8")
						if (province) {
							const key = `${event.date}:${owner}:${nextOwner}`
							const group = territoryGroups.get(key)
							if (group) group.provinces.push(province)
							else
								territoryGroups.set(key, {
									date: event.date,
									owner,
									nextOwner,
									provinces: [province],
								})
						}
					}
					owner = nextOwner
				} else if (event.kind === "controller") {
					const nextController = normalizeTimelineTag(event.payload.tag)
					if (
						event.date >= dateRangeStart &&
						event.date <= dateRangeEnd &&
						controller &&
						nextController &&
						controller !== nextController &&
						sideByTag.has(controller) &&
						sideByTag.has(nextController)
					) {
						const province = provinceMention(rawId, "#94a3b8")
						if (province) {
							const key = `${event.date}:${controller}:${nextController}`
							const group = controlGroups.get(key)
							if (group) group.provinces.push(province)
							else
								controlGroups.set(key, {
									date: event.date,
									controller,
									nextController,
									provinces: [province],
								})
						}
					}
					controller = nextController
				}
			}
		}
		for (const [key, group] of territoryGroups) {
			const provinceNames = group.provinces.map((province) => province.name)
			const description =
				group.provinces.length === 1
					? `${provinceNames[0]} was ceded from ${resolveNationName(group.owner)} to ${resolveNationName(group.nextOwner)}.`
					: `${group.provinces.length} provinces (${joinWithAnd(provinceNames)}) were ceded from ${resolveNationName(group.owner)} to ${resolveNationName(group.nextOwner)}.`
			pushTimelineEvent(timelineEvents, {
				id: `warTerritory:${key}`,
				date: group.date,
				type: "Territory",
				description,
				nations: [nationMention(group.owner), nationMention(group.nextOwner)],
				provinces: group.provinces,
			})
		}
		for (const [key, group] of controlGroups) {
			const provinceNames = group.provinces.map((province) => province.name)
			const description =
				group.provinces.length === 1
					? `${resolveNationName(group.nextController)} took control of ${provinceNames[0]} from ${resolveNationName(group.controller)}.`
					: `${resolveNationName(group.nextController)} took control of ${group.provinces.length} provinces (${joinWithAnd(provinceNames)}) from ${resolveNationName(group.controller)}.`
			pushTimelineEvent(timelineEvents, {
				id: `warControl:${key}`,
				date: group.date,
				type: "Territory",
				description,
				nations: [
					nationMention(group.controller),
					nationMention(group.nextController),
				],
				provinces: group.provinces,
			})
		}
		timelineEvents.sort((a, b) => a.date - b.date)

		return {
			id: war.warId,
			name: war.name,
			planetTitle: planetName,
			dateRangeLabel,
			stats,
			participants,
			timelineEvents,
			dateRangeStart,
			dateRangeEnd,
			currentDate: earthHistory.selectedDays,
			currentDateLabel: formatEu4Days(earthHistory.selectedDays),
			onBack: () => setSelectedWikiWarId(null),
			onSelectNation: (targetTag: string) => {
				setSelectedWikiNationTag(targetTag)
			},
			onSelectProvince: (provinceId: number) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			onSelectDate: earthHistory.setSelectedDays,
			onSelectOrganization: (orgId: string) => {
				setSelectedWikiOrganizationId(orgId)
			},
		}
	}, [
		selectedWikiWarId,
		world,
		earthHistory.query,
		earthHistory.engine,
		earthHistory.nationReference,
		earthHistory.provinceMeta,
		earthHistory.selectedDays,
		earthHistory.setSelectedDays,
		earthImportRawIdToCompact,
		getProvinceColor,
		planetName,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
	])

	// --- Planet stats ---
	const planetStats = useMemo(
		() =>
			computePlanetStats(
				world,
				{
					obliquity,
					eccentricity,
					perihelion,
					substellarLon,
					spectralClass,
					starSubtype,
					daysPerYear,
					hoursPerDay,
					planetRadiusKm,
					pressure,
					tideLock,
					seaLevel,
					maxElevation,
					avgWindSpeedMs: windStats?.avg ?? null,
					maxWindSpeedMs: windStats?.max ?? null,
				},
				unitSystem,
			),
		[
			daysPerYear,
			eccentricity,
			substellarLon,
			perihelion,
			hoursPerDay,
			obliquity,
			planetRadiusKm,
			pressure,
			spectralClass,
			starSubtype,
			tideLock,
			seaLevel,
			unitSystem,
			world,
			windStats,
		],
	)
	const updateEditableSystemBody = useCallback(
		(bodyIndex: number, updater: (body: SystemBody) => SystemBody) => {
			setSolarSystem((current) => ({
				...current,
				orbits: applySystemSeismology({
					bodies: current.orbits.map((body, index) =>
						index === bodyIndex ? updater(body) : body,
					),
					...systemSeismologyContext,
				}),
			}))
		},
		[systemSeismologyContext],
	)
	// Rebuilds a body (and everything nested inside it, e.g. its moons) back
	// to its freshly-generated defaults for the current seed, without
	// touching any other body -- e.g. rebuilding Earth also rebuilds Luna
	// (nested in Earth's own `moons`), but leaves Mars/Jupiter/etc alone.
	// Omitting `bodyIndex` rebuilds the whole system (star-level reset).
	//
	// The main world needs no special case here anymore: `resetSourceSystemBodies`
	// is already either the real Sol defaults or `generatedSystemBodies` (the
	// freshly-seed-rolled body list, main world included), so the generic
	// per-index reset below already resets it correctly, live edits and all.
	const rebuildSystemBody = useCallback(
		(bodyIndex?: number) => {
			if (bodyIndex === undefined) {
				setSpectralClass(DEFAULT_WORLD_PARAMS.spectralClass)
				setStarSubtype(DEFAULT_WORLD_PARAMS.starSubtype)
				setRestSeed(SOL_SEED)
			}
			if (bodyIndex === undefined) {
				// Explicit, rather than relying on the generatedSystemBodies
				// memo/sync-effect to pick up the spectralClass/starSubtype/
				// restSeed resets above -- if those were already at their
				// defaults (e.g. resetting an already-default Sol seed after
				// editing individual planets/moons), the memo's dependencies
				// wouldn't actually change, so it would never recompute and
				// every edited child body/moon would silently survive the
				// "reset". Resetting orbits directly here always restores
				// every planet (and, since each planet's own moons array is
				// replaced wholesale, every moon) unconditionally.
				setSolarSystem((current) => ({
					...current,
					// SOL_DEFAULT_SOLAR_SYSTEM.orbits is built without the surface-
					// tides callbacks (see sol-system.ts's SOL_SYSTEM_BODIES), so its
					// seismology is frozen with surfaceTidesHeating: 0 -- re-run
					// applySystemSeismology here with the real callbacks so the reset
					// system's totals/regimes match every other recompute path.
					orbits: applySystemSeismology({
						bodies: structuredClone(SOL_DEFAULT_SOLAR_SYSTEM.orbits),
						...systemSeismologyContext,
					}),
				}))
				return
			}
			setSolarSystem((current) => ({
				...current,
				orbits: applySystemSeismology({
					bodies: current.orbits.map((body, index) =>
						index === bodyIndex
							? structuredClone(resetSourceSystemBodies[index] ?? body)
							: body,
					),
					...systemSeismologyContext,
				}),
			}))
		},
		[
			resetSourceSystemBodies,
			systemSeismologyContext,
			setRestSeed,
			setSpectralClass,
			setStarSubtype,
		],
	)
	const updateEditableSystemMoon = useCallback(
		(
			bodyIndex: number,
			moonIndex: number,
			updater: (moon: MoonBody, parentBody: SystemBody) => MoonBody,
		) => {
			setSolarSystem((current) => ({
				...current,
				orbits: applySystemSeismology({
					bodies: current.orbits.map((body, index) => {
						if (index !== bodyIndex) return body
						return {
							...body,
							moons: body.moons.map((moon, currentMoonIndex) =>
								currentMoonIndex === moonIndex ? updater(moon, body) : moon,
							),
						}
					}),
					...systemSeismologyContext,
				}),
			}))
		},
		[systemSeismologyContext],
	)
	// Resets a single moon back to its freshly-generated defaults for the
	// current seed, leaving its parent body's own fields and every sibling
	// moon untouched -- unlike rebuildSystemBody, which replaces the whole
	// body (and therefore every one of its moons) at once.
	const resetSystemMoon = useCallback(
		(bodyIndex: number, moonIndex: number) => {
			const resetMoon = resetSourceSystemBodies[bodyIndex]?.moons[moonIndex]
			if (!resetMoon) return
			updateEditableSystemMoon(bodyIndex, moonIndex, () =>
				structuredClone(resetMoon),
			)
		},
		[resetSourceSystemBodies, updateEditableSystemMoon],
	)

	// The solar-system view's own clock is deliberately independent of the
	// planet overlay timing. The two knobs are additive: each
	// tracks its own elapsed hours (persisting across focus changes), and
	// their sum is the single elapsed-time value that drives both the spin
	// animation and the orbital day — so maxing both knobs out means "one
	// full rotation's worth of time, plus one full orbit's worth of time,
	// have passed."
	const [solarSystemRotationHours, setSolarSystemRotationHours] = useState(0)
	const [solarSystemOrbitHours, setSolarSystemOrbitHours] = useState(0)
	const solarSystemElapsedHours =
		solarSystemRotationHours + solarSystemOrbitHours
	// The clock knobs drag continuously — reading this via a ref (rather than
	// depending on the state directly) keeps them out of the rebuild effect's
	// dependency list below, so dragging only repositions meshes via the
	// lightweight update effects instead of disposing and rebuilding the
	// whole overlay (and re-fetching every body's texture) on every tick.
	const solarSystemElapsedHoursRef = useRef(solarSystemElapsedHours)
	solarSystemElapsedHoursRef.current = solarSystemElapsedHours

	useEffect(() => {
		sceneRef.current?.setSolarSystemOverlay(
			solarSystemViewActive && systemBodiesRef.current.length > 0
				? {
						bodies: systemBodiesRef.current,
						hoursPerDay,
						tideLock,
						daysPerYear: effectiveDaysPerYear,
						spectralClass: isValidSpectralClass(spectralClass)
							? (spectralClass as MainSequenceClass)
							: DEFAULT_SPECTRAL_CLASS,
						starSubtype,
						initialDay: solarSystemElapsedHoursRef.current / 24,
						showEllipticalOrbits: showSolarSystemEllipticalOrbits,
						showDaylight: showSolarSystemDaylight,
						showInclination: showSolarSystemInclination,
						showAxialTilt: showSolarSystemAxialTilt,
						showRealisticSizes: showSolarSystemRealisticSizes,
						showBodyNames: showSolarSystemBodyNames,
						showRealNames: restSeed === SOL_SEED,
						namesEnabled,
						starName,
					}
				: null,
		)
	}, [
		solarSystemViewActive,
		hoursPerDay,
		tideLock,
		effectiveDaysPerYear,
		spectralClass,
		starSubtype,
		showSolarSystemEllipticalOrbits,
		showSolarSystemInclination,
		showSolarSystemAxialTilt,
		showSolarSystemRealisticSizes,
		showSolarSystemBodyNames,
		restSeed,
		starName,
		showSolarSystemDaylight,
	])
	useEffect(() => {
		if (!solarSystemViewActive) return
		sceneRef.current?.updateSolarSystemOverlay(
			systemBodies.length > 0
				? {
						bodies: systemBodies,
						hoursPerDay,
						tideLock,
						daysPerYear: effectiveDaysPerYear,
						spectralClass: isValidSpectralClass(spectralClass)
							? (spectralClass as MainSequenceClass)
							: DEFAULT_SPECTRAL_CLASS,
						starSubtype,
						initialDay: solarSystemElapsedHoursRef.current / 24,
						showEllipticalOrbits: showSolarSystemEllipticalOrbits,
						showDaylight: showSolarSystemDaylight,
						showInclination: showSolarSystemInclination,
						showAxialTilt: showSolarSystemAxialTilt,
						showRealisticSizes: showSolarSystemRealisticSizes,
						showBodyNames: showSolarSystemBodyNames,
						showRealNames: restSeed === SOL_SEED,
						namesEnabled,
						starName,
					}
				: null,
		)
	}, [
		systemBodies,
		solarSystemViewActive,
		hoursPerDay,
		tideLock,
		effectiveDaysPerYear,
		spectralClass,
		starSubtype,
		showSolarSystemEllipticalOrbits,
		showSolarSystemInclination,
		showSolarSystemAxialTilt,
		showSolarSystemRealisticSizes,
		showSolarSystemBodyNames,
		restSeed,
		starName,
		showSolarSystemDaylight,
	])
	useEffect(() => {
		if (solarSystemViewActive)
			sceneRef.current?.updateSolarSystemDay(solarSystemElapsedHours / 24)
	}, [solarSystemElapsedHours, solarSystemViewActive])
	useEffect(() => {
		if (solarSystemViewActive)
			sceneRef.current?.setSolarSystemSpinHours(solarSystemElapsedHours)
	}, [solarSystemElapsedHours, solarSystemViewActive])

	// Entering the solar-system view and focusing a body both hinge on
	// `solarSystemViewActive` — the overlay-building effect above only
	// populates the renderer's body positions once that flips true, so a
	// focus request has to wait for that same commit before the renderer has
	// anything to focus on.
	const [pendingFocus, setPendingFocus] = useState<{
		bodyIndex: number
		moonIndex?: number
	} | null>(
		initialGenerationSession?.solarSystemViewActive
			? (initialGenerationSession.currentFocus ?? null)
			: null,
	)
	// The last body/moon focused via the GPS buttons — drives the clock
	// knobs' reference periods and is not cleared on use (unlike pendingFocus,
	// which just triggers the one-shot camera animation).
	const [currentFocus, setCurrentFocus] = useState<{
		bodyIndex: number
		moonIndex?: number
	} | null>(initialGenerationSession?.currentFocus ?? null)
	useEffect(() => {
		if (typeof window === "undefined") return
		let cancelled = false
		void loadGenerationSessionSnapshot()
			.then((snapshot) => {
				if (cancelled || !snapshot) return
				skipNextGeneratedSystemBodiesSyncRef.current =
					snapshot.solarSystem.orbits.length > 0
				setSolarSystem(snapshot.solarSystem)
				setSolarSystemViewActive(snapshot.solarSystemViewActive)
				setGenerationPanelOpen(snapshot.generationPanelOpen)
				setGenerationPreviewTab(snapshot.generationPreviewTab)
				setCurrentFocus(snapshot.currentFocus)
				setPendingFocus(
					snapshot.solarSystemViewActive ? snapshot.currentFocus : null,
				)
			})
			.catch((error) => {
				console.warn(
					`Failed to restore generation session from ${GENERATION_SESSION_STORAGE_KEY}:`,
					error,
				)
			})
			.finally(() => {
				if (!cancelled) setGenerationSessionRestored(true)
			})
		return () => {
			cancelled = true
		}
	}, [])
	const handleFocusBody = useCallback(
		(bodyIndex: number, moonIndex?: number) => {
			setSolarSystemViewActive(true)
			setPendingFocus({ bodyIndex, moonIndex })
			setCurrentFocus({ bodyIndex, moonIndex })
		},
		[],
	)
	useEffect(() => {
		if (!solarSystemViewActive || !pendingFocus) return
		sceneRef.current?.focusOnSystemBody(
			pendingFocus.bodyIndex,
			pendingFocus.moonIndex,
		)
		setPendingFocus(null)
	}, [solarSystemViewActive, pendingFocus])

	// Keeps `currentFocus` (and thus the clock knobs) in sync even when the
	// focus change originates from a renderer-internal event — e.g.
	// double-clicking a body in the 3D view — rather than the GPS buttons.
	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setSolarSystemFocusChangeHandler((bodyIndex, moonIndex) =>
			setCurrentFocus({ bodyIndex, moonIndex }),
		)
		return () => sceneRef.current?.setSolarSystemFocusChangeHandler(null)
	}, [])
	useEffect(() => {
		if (typeof window === "undefined" || !generationSessionRestored) return
		const validGenerationPreviewTabs = new Set(
			GENERATION_PREVIEW_TABS.map(([tab]) => tab),
		)
		if (!validGenerationPreviewTabs.has(generationPreviewTab)) return
		void saveGenerationSessionSnapshot({
			solarSystem,
			solarSystemViewActive,
			currentFocus,
			generationPanelOpen,
			generationPreviewTab,
		}).catch((error) => {
			console.warn(
				`Failed to persist generation session to ${GENERATION_SESSION_STORAGE_KEY}:`,
				error,
			)
		})
	}, [
		currentFocus,
		generationPanelOpen,
		generationPreviewTab,
		generationSessionRestored,
		solarSystemViewActive,
		solarSystem,
	])
	const mainWorldIndex = useMemo(
		() => systemBodies.findIndex((body) => body.isMainWorld),
		[systemBodies],
	)
	const handleEnterSolarSystem = useCallback(() => {
		const targetBodyIndex =
			currentFocus && currentFocus.bodyIndex >= 0
				? currentFocus.bodyIndex
				: mainWorldIndex
		if (targetBodyIndex >= 0) {
			handleFocusBody(targetBodyIndex)
			return
		}
		setSolarSystemViewActive(true)
	}, [currentFocus, handleFocusBody, mainWorldIndex])

	// Clock-knob reference periods for whatever is currently focused — the
	// knobs stay hidden for the star (no parent to orbit, and no rotation
	// period worth exposing here) and default to the main world otherwise.
	const solarSystemClock = useMemo(() => {
		const focus = currentFocus ?? { bodyIndex: mainWorldIndex }
		if (focus.bodyIndex === -1) return null
		const body = systemBodies[focus.bodyIndex]
		if (!body) return null
		const moon =
			focus.moonIndex !== undefined ? body.moons[focus.moonIndex] : undefined
		const rotationPeriodHours = moon
			? moon.siderealDayHours
			: body.siderealDayHours
		const orbitalPeriodDays = moon
			? moon.orbitalPeriodDays
			: body.orbitalPeriodDays
		if (rotationPeriodHours <= 0 || orbitalPeriodDays <= 0) return null
		return { rotationPeriodHours, orbitalPeriodDays }
	}, [systemBodies, currentFocus, mainWorldIndex])

	const wrapFraction = (value: number, period: number) =>
		period > 0 ? (((value % period) + period) % period) / period : 0
	const solarSystemRotationFraction = solarSystemClock
		? wrapFraction(
				solarSystemRotationHours,
				solarSystemClock.rotationPeriodHours,
			)
		: 0
	const solarSystemOrbitFraction = solarSystemClock
		? wrapFraction(
				solarSystemOrbitHours,
				solarSystemClock.orbitalPeriodDays * 24,
			)
		: 0
	const setSolarSystemRotationFraction = (fraction: number) => {
		if (!solarSystemClock) return
		setSolarSystemRotationHours(fraction * solarSystemClock.rotationPeriodHours)
	}
	const setSolarSystemOrbitFraction = (fraction: number) => {
		if (!solarSystemClock) return
		setSolarSystemOrbitHours(fraction * solarSystemClock.orbitalPeriodDays * 24)
	}

	const focusedMoon =
		solarSystemViewActive && currentFocus?.moonIndex !== undefined
			? (systemBodies[currentFocus.bodyIndex]?.moons[currentFocus.moonIndex] ??
				null)
			: null
	const focusedMoonParent =
		focusedMoon && solarSystemViewActive
			? systemBodies[currentFocus!.bodyIndex]
			: null

	const tidalSchedulePreview = useMemo(() => {
		if (focusedMoon && focusedMoonParent) {
			return computeMoonTidalSchedule(
				focusedMoon,
				{
					idx: focusedMoonParent.idx,
					massKg: focusedMoonParent.massKg,
					moons: focusedMoonParent.moons,
				},
				{
					daysPerYear,
					hoursPerDay,
					spectralClass,
					starSubtype,
					orbitalDistanceAU: focusedMoonParent.orbitalDistanceAU,
					eccentricity: focusedMoonParent.eccentricity,
					perihelion,
				},
			)
		}
		const scheduleParams = {
			seed,
			daysPerYear,
			hoursPerDay,
			planetRadiusKm,
			tideLock,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			eccentricity,
			perihelion,
		}
		return computeTidalSchedule(displayMoons, scheduleParams)
	}, [
		focusedMoon,
		focusedMoonParent,
		displayMoons,
		seed,
		daysPerYear,
		hoursPerDay,
		planetRadiusKm,
		tideLock,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		perihelion,
	])

	const solStarName = restSeed === SOL_SEED ? "Sol" : undefined
	const surfaceTidesM = useMemo(() => {
		if (focusedMoon && focusedMoonParent) {
			return computeMoonSurfaceTidesM(
				focusedMoon,
				{
					name: restSeed === SOL_SEED ? focusedMoonParent.name : undefined,
					massKg: focusedMoonParent.massKg,
					diameterKm: focusedMoonParent.diameterKm,
					moons: focusedMoonParent.moons,
				},
				{
					hoursPerDay,
					spectralClass,
					starSubtype,
					orbitalDistanceAU: focusedMoonParent.orbitalDistanceAU,
					eccentricity: focusedMoonParent.eccentricity,
					starName: solStarName,
				},
			)
		}
		return computeSurfaceTidesM(
			displayMoons,
			{ diameterKm: planetRadiusKm * 2, tideLock },
			{
				hoursPerDay,
				spectralClass,
				starSubtype,
				orbitalDistanceAU,
				eccentricity,
				starName: solStarName,
			},
		)
	}, [
		focusedMoon,
		focusedMoonParent,
		displayMoons,
		planetRadiusKm,
		tideLock,
		hoursPerDay,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		solStarName,
		restSeed,
	])

	const exportBusy = exportProgress !== null
	const exportDisabled = !worldForDisplay || exportBusy

	// --- Render ---
	return (
		<div className="w-full h-full flex flex-col xl:flex-row bg-slate-100">
			{generationPanelOpen && (
				<GenerationPanel
					worldTab={worldTab}
					setWorldTab={setWorldTab}
					resetWorldDefaults={handleResetDefaults}
					tideLock={tideLock}
					setTideLock={setTideLock}
					setObliquity={setObliquity}
					restSeed={restSeed}
					starName={starName}
					showRealSolNames={restSeed === SOL_SEED}
					setRestSeed={setRestSeed}
					forceMainWorld={forceMainWorld}
					setForceMainWorld={setForceMainWorld}
					tidalSchedulePreview={tidalSchedulePreview}
					surfaceTidesM={surfaceTidesM}
					orbitBodies={systemBodies.filter((b) => !b.isMainWorld)}
					systemBodies={systemBodies}
					onUpdateSystemBody={updateEditableSystemBody}
					onUpdateSystemMoon={updateEditableSystemMoon}
					onRebuildSystemBody={rebuildSystemBody}
					onResetSystemMoon={resetSystemMoon}
					onFocusBody={handleFocusBody}
					currentFocus={currentFocus}
					daysPerYear={daysPerYear}
					hoursPerDay={hoursPerDay}
					setHoursPerDay={setHoursPerDay}
					planetRadiusKm={planetRadiusKm}
					generatedMoons={displayMoons}
					planetSliders={planetSliders}
					terrainSliders={terrainSliders}
					spectralClass={spectralClass}
					setSpectralClass={setSpectralClass}
					starSubtype={starSubtype}
					setStarSubtype={setStarSubtype}
					orbitalDistanceAU={orbitalDistanceAU}
					eccentricity={eccentricity}
					perihelion={perihelion}
					obliquity={obliquity}
					era={era}
					setEra={setEra}
					seedInput={seedInput}
					setSeedInput={handleSeedInputChange}
					onApplySeed={handleApplySeed}
					seedError={seedError}
					onRandomizeSeed={handleRandomizeCode}
					generating={generating}
					generationLabel={generationLabel}
					generationProgress={generationProgress}
					generationTimings={generationTimings}
					landCoverage={landCoverage}
					generationPreviewTab={generationPreviewTab}
					onSelectGenerationPreviewTab={setGenerationPreviewTab}
					unitSystem={unitSystem}
					handleGenerate={handleGenerate}
					handleEarthImport={handleEarthImport}
					onClose={() => setGenerationPanelOpen(false)}
					worldDetails={{
						hasGeneratedWorld: !!world && !generating,
						planetName,
						planetStats,
						worldPopulation: drawerWorldPopulation,
						activeWarCount: earthSocialCounts?.activeWarCount ?? null,
						cultureCount:
							earthSocialCounts?.cultureCount ??
							worldForDisplay?.cultures?.count ??
							null,
						religionCount:
							earthSocialCounts?.religionCount ??
							worldForDisplay?.religions?.count ??
							null,
						nationSizeDistribution,
						governmentDistribution,
						religionDistribution: religionTypeDistribution,
						conflictDistribution,
						relationDistribution,
						climateDistribution,
						vegetationDistribution,
						topographyDistribution,
						showObservedDistributions,
						tradeGoodsDistribution,
					}}
					nationWiki={nationWikiData}
					organizationWiki={organizationWikiData}
					warWiki={warWikiData}
				/>
			)}

			<div
				ref={viewportRef}
				className="flex-1 h-[56vh] xl:h-full relative overflow-hidden bg-[#050510]"
			>
				<canvas
					ref={canvasRef}
					className={`h-full w-full block ${
						measureMode !== "off" ? "cursor-crosshair" : ""
					}`}
				/>
				<WindParticleCanvas
					windGrid={windGrid}
					projectToScreen={projectToScreen}
					getGlobeCameraDir={getGlobeCameraDir}
					visible={showWindArrows && !solarSystemViewActive}
					viewMode={viewMode}
				/>
				<OceanCurrentParticleCanvas
					currentGrid={oceanCurrentGrid}
					projectToScreen={projectToScreen}
					getGlobeCameraDir={getGlobeCameraDir}
					visible={showOceanCurrents && !solarSystemViewActive}
					viewMode={viewMode}
				/>

				<>
					{hoverInfo && hoverElevationKm !== null ? (
						<InfoPanel
							hoverInfo={hoverInfo}
							hoverElevationKm={hoverElevationKm}
							hoverTopography={hoverTopography}
							hoverCoordinates={hoverCoordinates}
							hoverTimezone={hoverTimezone}
							hoverLandmark={hoverLandmark}
							hoverIsLand={hoverIsLand}
							hoverTemperatureDelta={hoverTemperatureDelta}
							hoverRealTemperature={hoverRealTemperature}
							hoverTemperatureDiff={hoverTemperatureDiff}
							hoverRainfall={hoverRainfall}
							hoverRealRainfall={hoverRealRainfall}
							hoverRainfallDiff={hoverRainfallDiff}
							hoverDtr={hoverDtr}
							hoverRealDtr={hoverRealDtr}
							hoverDtrDiff={hoverDtrDiff}
							hoverHumidity={hoverHumidity}
							hoverRealHumidity={hoverRealHumidity}
							hoverHumidityDiff={hoverHumidityDiff}
							hoverMisery={hoverMisery}
							hoverClimateDisplay={hoverClimateDisplay}
							hoverIceSummary={hoverIceSummary}
							hoverBiome={hoverBiome}
							hoverProvince={hoverProvince}
							hoverNationId={hoverNationId}
							hoverOccupation={hoverOccupation}
							hoverOceanDist={hoverOceanDist}
							hoverDistCoast={hoverDistCoast}
							hoverDistCoastKm={hoverDistCoastKm}
							hoverHazards={hoverHazards}
							hoverHotspot={hoverHotspot}
							hoverRiver={hoverRiver}
							hoverTerrainFeature={hoverTerrainFeature}
							hoverOceanCurrents={hoverOceanCurrents}
							hoverWindSpeed={hoverWindSpeed}
							hoverWindDir={hoverWindDir}
							hoverWindMonthly={hoverWindMonthly}
							showWindArrows={showWindArrows}
							showRivers={showRivers}
							showGdd={showGdd}
							showGint={showGint}
							showPet={showPet}
							showAet={showAet}
							showOceanCurrentOverlay={showOceanCurrents}
							colorMode={colorMode}
							dangerSubMode={dangerSubMode}
							populationMode={populationMode}
							dataVariant={dataVariant}
							selectedTimeMs={selectedTimeMs}
							displayMonth={displayMonth}
							clockMonthMode={clockMonthMode}
							clockMonth={clockMonth}
							unitSystem={unitSystem}
							world={worldForDisplay}
							routes={worldForDisplay?.routes ?? null}
							hoverCardRef={hoverCardRef}
							getProvinceName={getProvinceName}
							getNationName={getNationName}
							getLeaderName={getLeaderName}
							getDynastyName={getDynastyName}
							getCultureName={getCultureName}
							getHeritageName={getHeritageName}
							getLandmarkName={getLandmarkName}
							getRiverName={getRiverName}
							hoverNationAdjOffset={
								colorMode === "nations"
									? (nationAdjacency?.adjOffset ?? null)
									: null
							}
							hoverNationAdjList={
								colorMode === "nations"
									? (nationAdjacency?.adjList ?? null)
									: null
							}
							hoverNationCounts={
								colorMode === "nations" ? nationProvinceCounts : null
							}
							relationAt={null}
							earthHistoryHoverOverride={earthHistoryHoverOverride}
						/>
					) : null}

					{solarSystemViewActive ? (
						<SolarSystemControls
							expanded={solarSystemControlsExpanded}
							setExpanded={setSolarSystemControlsExpanded}
							onBack={handleReturnToPlanetView}
							canReturnToPlanetMap={!!worldForDisplay}
							generationPanelOpen={generationPanelOpen}
							onToggleGenerationPanel={() => setGenerationPanelOpen(true)}
							showEllipticalOrbits={showSolarSystemEllipticalOrbits}
							setShowEllipticalOrbits={setShowSolarSystemEllipticalOrbits}
							showDaylight={showSolarSystemDaylight}
							setShowDaylight={setShowSolarSystemDaylight}
							showInclination={showSolarSystemInclination}
							setShowInclination={setShowSolarSystemInclination}
							showAxialTilt={showSolarSystemAxialTilt}
							setShowAxialTilt={setShowSolarSystemAxialTilt}
							showRealisticSizes={showSolarSystemRealisticSizes}
							setShowRealisticSizes={setShowSolarSystemRealisticSizes}
							showBodyNames={showSolarSystemBodyNames}
							setShowBodyNames={setShowSolarSystemBodyNames}
							clock={
								solarSystemClock
									? {
											rotationFraction: solarSystemRotationFraction,
											setRotationFraction: setSolarSystemRotationFraction,
											orbitFraction: solarSystemOrbitFraction,
											setOrbitFraction: setSolarSystemOrbitFraction,
											rotationPeriodHours: solarSystemClock.rotationPeriodHours,
											orbitalPeriodDays: solarSystemClock.orbitalPeriodDays,
										}
									: null
							}
						/>
					) : (
						<OverlayControls
							isEarthImport={worldForDisplay?.isEarthImport ?? false}
							onEnterSolarSystem={handleEnterSolarSystem}
							overlaysExpanded={overlaysExpanded}
							setOverlaysExpanded={setOverlaysExpanded}
							measureMode={measureMode}
							setMeasureMode={setMeasureMode}
							pathfindingLand={pathfindingLand}
							setPathfindingLand={setPathfindingLand}
							pathfindingSea={pathfindingSea}
							setPathfindingSea={setPathfindingSea}
							pathfindingResult={pathfindingResult}
							showWireframe={showWireframe}
							setShowWireframe={handleSetWireframe}
							showRivers={showRivers}
							setShowRivers={setShowRivers}
							showThermalEquator={showThermalEquator}
							setShowThermalEquator={setShowThermalEquator}
							showCoastlines={showCoastlines}
							setShowCoastlines={setShowCoastlines}
							showWindArrows={showWindArrows}
							setShowWindArrows={setShowWindArrows}
							showGdd={showGdd}
							setShowGdd={setShowGdd}
							showGint={showGint}
							setShowGint={setShowGint}
							showPet={showPet}
							setShowPet={setShowPet}
							showAet={showAet}
							setShowAet={setShowAet}
							showOceanCurrents={showOceanCurrents}
							setShowOceanCurrents={setShowOceanCurrents}
							showGrid={showGrid}
							setShowGrid={setShowGrid}
							showNationBorders={showNationBorders}
							setShowNationBorders={setShowNationBorders}
							showLandBorders={showLandBorders}
							setShowLandBorders={setShowLandBorders}
							showNationHierarchy={showNationHierarchy}
							setShowNationHierarchy={setShowNationHierarchy}
							nationMode={nationMode}
							populationMode={populationMode}
							labelMode={labelMode}
							setLabelMode={setLabelMode}
							showElevation={showElevation}
							setShowElevation={handleSetElevation}
							showInfrastructure={showInfrastructure}
							setShowInfrastructure={setShowInfrastructure}
							gridSpacing={gridSpacing}
							setGridSpacing={setGridSpacing}
							viewMode={viewMode}
							setViewMode={setViewMode}
							unitSystem={unitSystem}
							setUnitSystem={setUnitSystem}
							mapProjectionLatitude={mapProjectionLatitude}
							draftMapProjectionLatitude={draftMapProjectionLatitude}
							setDraftMapProjectionLatitude={setDraftMapProjectionLatitude}
							setMapProjectionLatitude={setMapProjectionLatitude}
							debugMapModes={debugMapModes}
							setDebugMapModes={setDebugMapModes}
							colorMode={colorMode}
							setColorMode={setGeographyColorMode}
							dataVariant={dataVariant}
							setDataVariant={handleSetDataVariant}
							clockCurrent={clockCurrent}
							setClockCurrent={setClockCurrent}
							clockMonthMode={clockMonthMode}
							setClockMonthMode={setClockMonthMode}
							clockMonth={clockMonth}
							setClockMonth={setClockMonth}
							clockDay={clockDay}
							setClockDay={setClockDay}
							clockHour={clockHour}
							setClockHour={setClockHour}
							clockUseMeridiem={clockUseMeridiem}
							setClockUseMeridiem={setClockUseMeridiem}
							hoursPerDay={hoursPerDay}
							tidallyLocked={tidallyLocked}
							daysPerYear={effectiveDaysPerYear}
							vegetationSubMode={vegetationSubMode}
							setVegetationSubMode={setVegetationSubMode}
							climateSubMode={climateSubMode}
							setClimateSubMode={setClimateSubMode}
							elevationSubMode={elevationSubMode}
							setElevationSubMode={setElevationSubMode}
							topographySubMode={topographySubMode}
							setTopographySubMode={setTopographySubMode}
							dangerSubMode={dangerSubMode}
							setDangerSubMode={setDangerSubMode}
							hasCycloneRisk={!!world?.cycloneRisk}
							hasTornadoRisk={!!world?.tornadoRisk}
							hasTidalRisk={!!world?.tidalRange}
							exportWidthPreset={exportWidthPreset}
							setExportWidthPreset={setExportWidthPreset}
							exportCenterLongitude={exportCenterLongitude}
							setExportCenterLongitude={setExportCenterLongitude}
							exportDisabled={exportDisabled}
							exportBusy={exportBusy}
							exportProgress={exportProgress}
							exportError={exportError}
							onExport={() => {
								void handleExportMap()
							}}
							onReset={() => {
								setViewMode("globe")
								setUnitSystem("metric")
								setShowGrid(true)
								setGridSpacing(15)
								setShowWireframe(false)
								setShowRivers(false)
								setShowThermalEquator(false)
								setShowNationBorders(false)
								setShowNationHierarchy(false)
								setLabelMode({
									nations: false,
									dynasty: false,
									settlements: false,
									culture: false,
									heritage: false,
									religion: false,
									script: false,
								})
								setShowElevation(false)
								setShowInfrastructure(false)
								setMeasureMode("off")
								setPathfindingLand(true)
								setPathfindingSea(true)
								setDebugMapModes(false)
								setShowDaylight(false)
								setClockHour(12)
								setExportCenterLongitude(0)
								setMapProjectionLatitude(0)
								setDraftMapProjectionLatitude(0)
							}}
							generationPanelOpen={generationPanelOpen}
							onToggleGenerationPanel={() => setGenerationPanelOpen(true)}
							showDaylight={showDaylight}
							setShowDaylight={setShowDaylight}
						/>
					)}

					{measureDistanceKm !== null && measureLabelPos && (
						<FloatingPanel
							interactive={false}
							padding="sm"
							className="pointer-events-none absolute z-20 px-2.5 py-1"
							style={{
								left: measureLabelPos[0],
								top: measureLabelPos[1] - 32,
								transform: "translateX(-50%)",
							}}
						>
							<span className="font-mono text-xs font-semibold">
								{formatDistance(measureDistanceKm, unitSystem, {
									under100Digits: 1,
									over100Digits: 0,
								})}
							</span>
						</FloatingPanel>
					)}

					{worldForDisplay?.isEarthImport ? (
						<div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
							<div className="pointer-events-auto">
								<SimulationControls
									selectedTimeMs={earthHistory.selectedDays}
									minTimeMs={earthHistory.minDays}
									maxTimeMs={earthHistory.maxDays}
									onTimeChange={earthHistory.setSelectedDays}
									floating={false}
									onPlayPause={handleToggleEarthHistoryPlayback}
									simPlaying={earthHistoryPlaying}
									formatLabel={earthHistoryFormatLabel}
									stepValue={365}
									playPauseLabels={{
										play: "Start timeline",
										pause: "Pause timeline",
									}}
									extraControls={
										<EarthHistoryBookmarks
											onSelect={earthHistory.setSelectedDays}
											selectedDate={earthHistory.selectedDays}
											placement="below"
										/>
									}
								/>
							</div>
						</div>
					) : null}
					{!solarSystemViewActive && (
						<div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-1.5 pb-3 pointer-events-none">
							<div className="pointer-events-auto">
								<ModeBar
									colorMode={colorMode}
									setColorMode={setGeographyColorMode}
									geographyMode={geographyMode}
									setGeographyMode={setGeographyMode}
									nationMode={nationMode}
									setNationMode={setNationMode}
									populationMode={populationMode}
									setPopulationMode={setPopulationMode}
									debugMapModes={debugMapModes}
									vegetationSubMode={vegetationSubMode}
									climateSubMode={climateSubMode}
									elevationSubMode={elevationSubMode}
									topographySubMode={topographySubMode}
									isEarthImport={worldForDisplay?.isEarthImport ?? false}
								/>
							</div>
						</div>
					)}
				</>
			</div>

			<DetailsDrawer
				open={detailsDrawerOpen}
				onToggle={() => setDetailsDrawerOpen((value) => !value)}
				nation={selectedNation}
				onNationClick={handleDrawerNationClick}
			/>
		</div>
	)
}
