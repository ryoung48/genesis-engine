import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { StageTiming } from "@/model"
import { GENESIS_TOPOGRAPHY_LABELS } from "@/model"
import { computeGravityG } from "@/model/celestial/body-metrics"
import type { MoonBody } from "@/model/celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	generateMoons,
	LUNA_MOON_SEED,
	M_SOL_KG,
	resolveMoonOrbitHoursPerDay,
} from "@/model/celestial/moons/orbital-mechanics"
import { generatePlanetName } from "@/model/celestial/planet-name"
import type { MainSequenceClass } from "@/model/celestial/star/star-types"
import {
	DEFAULT_SPECTRAL_CLASS,
	getHabitableZoneAU,
	getKeplerYearYears,
	getStarLuminositySol,
	getStarMassSol,
	isValidSpectralClass,
} from "@/model/celestial/star/star-types"
import {
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
import { hashColorForKey, rgb01ToCss } from "@/model/earth/history/color"
import { daysToEu4Date, eu4DateToDays } from "@/model/earth/history/date"
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
import type {
	SerializedGenesisWorld,
	SerializedHistoryFrame,
} from "@/model/transport/worker-types"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { scaleClockDialHourToDayLength } from "./clock"
import type { ColorMode } from "./colors"
import {
	climateZoneColor,
	miseryColor,
	OCEAN_LIGHT_BLUE,
	vegetationColor,
	windSpeedColor,
} from "./colors"
import { EarthHistoryBookmarks } from "./controls/EarthHistoryBookmarks"
import {
	buildPressureAtmosphereProfile,
	GenerationPanel,
	resolveBodyTideLockSiderealDayHours,
	updateBodyDiameter,
} from "./controls/GenerationPanel"
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
import { useEarthHistoryTimeline } from "./hooks/useEarthHistoryTimeline"
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
import { buildEarthHistoryDiplomacyDisplayData } from "./hover/info-panel-model"
import { canHandlePlanetClick } from "./measurement-click"
import { OceanCurrentParticleCanvas } from "./OceanCurrentParticleCanvas"
import {
	createGenesisScene,
	type GenesisScene,
	type GenesisViewMode,
} from "./renderer"
import {
	buildDisplayNationModel,
	buildDisplayWorld,
	buildHistoryChildrenIndex,
	buildNationAdjacency,
} from "./screen/display/display-model"
import { createDisplayNames } from "./screen/display/display-names"
import {
	computeEarthHistoryOccupationOverlay,
	computeEarthHistoryRegionColors,
} from "./screen/display/earth-history-region-colors"
import {
	buildCultureLabelNames,
	buildHeritageLabelNames,
	buildNationDynastyLabelNames,
	buildNationLabelNames,
	buildSettlementLabelNames,
} from "./screen/display/label-names"
import {
	buildConflictDistribution,
	buildNationHistory,
	buildNationSizeDistribution,
	buildRelationDistribution,
	buildSelectedNationDetails,
	buildWindowedNationEvents,
} from "./screen/display/nation-details-model"
import { computePlanetStats } from "./screen/display/planet-stats"
import {
	buildCultureBlendOverlay,
	buildPoliticalOccupationOverlay,
	getPoliticalHoverNationId,
	getPoliticalHoverOccupation,
	getRebelDisplayColorNationId,
} from "./screen/display/political-conflict-display"
import {
	computeRegionColors,
	getTopographyColor,
} from "./screen/display/region-colors"
import {
	getReligionColorForCulture,
	getReligionIndexForCulture,
} from "./screen/display/religion-type"
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
	pauseSimulation,
	startSimulation,
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
	createHistoryQuery,
	type TimelineBundle,
} from "./screen/history/history-query"
import {
	historyTimeToMonth,
	historyYearToTime,
} from "./screen/history/history-time"
import { buildLiveHistoryView } from "./screen/history/live-history-view"
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
	normalizeGeographyColorMode,
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
		sourceTimeLabel: daysToEu4Date(selectedDays),
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
	const [showSolarSystemRealNames, setShowSolarSystemRealNames] = useState(
		initialViewPrefs.showSolarSystemRealNames,
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

	// Simulation state
	const [simPlaying, setSimPlaying] = useState(false)
	const simStartTimeMs = historyYearToTime(800)
	const [simTimeMs, setSimTimeMs] = useState(simStartTimeMs)
	const [timelineBundle, setTimelineBundle] = useState<
		TimelineBundle | undefined
	>()
	const [liveFrame, setLiveFrame] = useState<SerializedHistoryFrame | null>(
		null,
	)
	const [selectedTimeMs, setSelectedTimeMs] = useState(simStartTimeMs)
	// Earth-imported worlds get their own real-history timeline instead of
	// the procedural sim's; selectedTimeMs above stays untouched since it
	// also drives climate-month display and other procedural-only derived
	// state. See docs/earth-history-plan.md "Reuse the existing scrubber".
	const earthHistory = useEarthHistoryTimeline(
		world?.provinces,
		!!world?.isEarthImport,
	)
	const [earthRealPopulation, setEarthRealPopulation] =
		useState<Eu4PopulationTimelineAsset | null>(null)
	const [earthRealUrbanPopulation, setEarthRealUrbanPopulation] =
		useState<Eu4PopulationTimelineAsset | null>(null)
	const [eu4GhslSettlements, setEu4GhslSettlements] =
		useState<Eu4GhslSettlementAsset | null>(null)
	useEffect(() => {
		if (!world?.isEarthImport) {
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
	const canSimulate = !!world && !!world.nations && !generating

	// Hover & measurement
	const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
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
	const [moonCount, setMoonCount] = useState<number>(
		DEFAULT_WORLD_PARAMS.moonCount,
	)
	const [moonSeed, setMoonSeed] = useState<number>(
		Math.floor(Math.random() * SEED_MAX),
	)
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
	const setRestSeed = useCallback((value: number) => {
		setSolarSystem((current) => ({
			...current,
			star: {
				...current.star,
				seed: value === SOL_SEED ? "sol" : value.toString(36).padStart(6, "0"),
			},
		}))
	}, [])

	// --- The main world's own physical/orbital state ---
	// Every one of these fields lives ONLY on the main world's SystemBody
	// entry in `solarSystem.orbits`, exactly like every sibling planet --
	// there is no separate slider state to keep in sync. `mainWorldBodyRef`
	// breaks the circular dependency (regenerating the system on a star/moon
	// change needs the main world's CURRENT physical values so it doesn't
	// reset them) without making every physical field a reactive dependency
	// of the generation memo below.
	const mainWorldBodyRef = useRef<SystemBody | null>(null)

	const generatedMoonsPreview = useMemo(() => {
		const cls = isValidSpectralClass(spectralClass)
			? (spectralClass as MainSequenceClass)
			: DEFAULT_SPECTRAL_CLASS
		const starMassKg = getStarMassSol(cls, starSubtype) * M_SOL_KG
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
		const tideLock = prev ? (prev.tideLock ?? null) : null
		const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
			hoursPerDay,
			tideLock,
		)
		return generateMoons(
			moonCount,
			moonSeed,
			planetRadiusKm,
			orbitalDistanceAU,
			moonOrbitHoursPerDay,
			starMassKg,
		)
	}, [moonCount, moonSeed, spectralClass, starSubtype])
	const mainWorldMoonsPreview = useMemo(
		() =>
			restSeed === SOL_SEED
				? [{ ...SOL_LUNA_DEFAULT, idx: 1 }]
				: generatedMoonsPreview,
		[generatedMoonsPreview, restSeed],
	)

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
				...surfaceTidesCallbacks,
			}
		}
		return {
			starAgeGyr: getStarAgeGyr(restSeed, getStarMassSol(cls, starSubtype)),
			starLuminositySol: getStarLuminositySol(cls, starSubtype),
			...surfaceTidesCallbacks,
		}
	}, [restSeed, spectralClass, starSubtype])

	const generatedSystemBodies: SystemBody[] = useMemo(() => {
		const cls = isValidSpectralClass(spectralClass)
			? (spectralClass as MainSequenceClass)
			: DEFAULT_SPECTRAL_CLASS
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
		const mainWorld = {
			name: restSeed === SOL_SEED ? SOL_MAIN_WORLD_DEFAULTS.name : undefined,
			orbitalDistanceAU,
			diameterKm: planetRadiusKm * 2,
			moons: mainWorldMoonsPreview,
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
			// Only the real Sol seed's Earth has known real climate-fit
			// values (see sol-system.ts's SOL_MAIN_WORLD_DEFAULTS) -- a
			// procedurally generated homeworld has no "real" data, so it
			// keeps using the generic roll/estimate every other body gets.
			albedo:
				restSeed === SOL_SEED ? SOL_MAIN_WORLD_DEFAULTS.albedo : undefined,
			greenhouseFactor:
				restSeed === SOL_SEED
					? SOL_MAIN_WORLD_DEFAULTS.greenhouseFactor
					: undefined,
		}
		return generateSystemBodies({
			seed: restSeed,
			spectralClass: cls,
			starSubtype,
			mainWorld,
		})
	}, [restSeed, spectralClass, starSubtype, mainWorldMoonsPreview])
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
	const displayMoons = mainWorldSystemBody?.moons ?? mainWorldMoonsPreview
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

	const currentHz = getHabitableZoneAU(
		getStarLuminositySol(effectiveStarClass, starSubtype),
	)
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

	const setSpectralClassPreservingHz = (cls: string) => {
		const newClass: MainSequenceClass = isValidSpectralClass(cls)
			? cls
			: DEFAULT_SPECTRAL_CLASS
		const newHz = getHabitableZoneAU(
			getStarLuminositySol(newClass, starSubtype),
		)
		const hzcFactor = currentHz > 0 ? orbitalDistanceAU / currentHz : 1
		setOrbitalDistanceAU(hzcFactor * newHz)
		setSolarSystem((current) => ({
			...current,
			star: { ...current.star, class: newClass },
		}))
	}

	const setStarSubtypePreservingHz = (subtype: number) => {
		const newHz = getHabitableZoneAU(
			getStarLuminositySol(effectiveStarClass, subtype),
		)
		const hzcFactor = currentHz > 0 ? orbitalDistanceAU / currentHz : 1
		setOrbitalDistanceAU(hzcFactor * newHz)
		setSolarSystem((current) => ({
			...current,
			star: { ...current.star, subtype },
		}))
	}
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
				showSolarSystemRealNames,
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
		showSolarSystemRealNames,
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

	useEffect(() => {
		if (debugMapModes) return
		if (isDebugGeographyMode(colorMode)) {
			setColorMode(DEFAULT_GEOGRAPHY_MODE)
			setGeographyMode(DEFAULT_GEOGRAPHY_MODE)
		}
	}, [colorMode, debugMapModes])

	useEffect(() => {
		if (!canSimulate) {
			setSimPlaying(false)
		}
	}, [canSimulate])

	const currentHistoryQuery = useMemo(
		() =>
			world && timelineBundle
				? createHistoryQuery(timelineBundle, world)
				: null,
		[world, timelineBundle],
	)

	const selectedHistoryView = useMemo(
		() =>
			currentHistoryQuery
				? currentHistoryQuery.getView(selectedTimeMs)
				: buildLiveHistoryView({
						selectedTimeMs,
						simTimeMs,
						liveFrame,
					}),
		[currentHistoryQuery, selectedTimeMs, simTimeMs, liveFrame],
	)
	const selectedHistoryChildren = useMemo(
		() => buildHistoryChildrenIndex(selectedHistoryView),
		[selectedHistoryView],
	)

	const worldForDisplay = useMemo(() => {
		const displayWorld = buildDisplayWorld({
			world,
			selectedHistoryView,
			selectedHistoryChildren,
		})
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
		selectedHistoryChildren,
		selectedHistoryView,
		earthRealPopulation,
		earthRealUrbanPopulation,
		eu4GhslSettlements,
		earthHistory.selectedDays,
	])
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
	const nationColorById = useMemo(() => {
		const baseColors =
			nationModel?.colorById ?? new Map<number, [number, number, number]>()
		if (!selectedHistoryView?.activeWars?.length) return baseColors
		const displayColors = new Map(baseColors)
		for (const nationId of displayColors.keys()) {
			const displayColorNationId = getRebelDisplayColorNationId(
				selectedHistoryView.activeWars,
				nationId,
			)
			if (displayColorNationId === null) continue
			const displayColor = baseColors.get(displayColorNationId)
			if (displayColor) displayColors.set(nationId, displayColor)
		}
		return displayColors
	}, [nationModel, selectedHistoryView])
	const getNationColor = useCallback(
		(nationId: number): string | null => {
			if (nationId < 0) return null
			const color = nationColorById.get(nationId)
			return color ? rgbToCss(color) : null
		},
		[nationColorById],
	)
	const getNationColorRgb = useCallback(
		(nationId: number): [number, number, number] | null => {
			if (nationId < 0) return null
			return nationColorById.get(nationId) ?? null
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
		return (
			selectedHistoryView?.totalPopulation ??
			world?.population?.totalPopulation ??
			null
		)
	}, [
		colorMode,
		dataVariant,
		worldForDisplay?.realPopulation,
		selectedHistoryView?.totalPopulation,
		world?.population?.totalPopulation,
	])

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
	const hoverTopography = getHoverTopography(hoverInfo, worldForDisplay)
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
	const hoverClimateZone = getHoverClimateZone(hoverInfo, worldForDisplay)
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
	const hoverBiome = getHoverBiome(hoverInfo, worldForDisplay)
	const hoverProvince = getHoverProvince(hoverInfo, worldForDisplay)
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
		return getPoliticalHoverNationId({
			hoverProvince,
			assignment: nationModel?.assignment,
			activeWars: selectedHistoryView?.activeWars,
		})
	}, [nationModel, hoverProvince, selectedHistoryView])
	const worldNames = useMemo(
		() => (world ? createDisplayNames(world, timelineBundle) : null),
		[timelineBundle, world],
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
	const hoverOccupation = useMemo(() => {
		const occupation = getPoliticalHoverOccupation({
			hoverProvince,
			assignment: worldForDisplay?.nations?.assignment,
			activeWars: selectedHistoryView?.activeWars,
		})
		if (!occupation) return null
		return {
			id: occupation.id,
			name: getNationName(occupation.id),
			color: occupation.rebel
				? "rgb(0, 0, 0)"
				: (getNationColor(occupation.displayColorNationId) ?? "rgb(0, 0, 0)"),
			rebel: occupation.rebel,
		}
	}, [
		selectedHistoryView,
		getNationColor,
		getNationName,
		hoverProvince,
		worldForDisplay,
	])
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
			(!showWindArrows && colorMode !== "wind" && colorMode !== "misery")
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
			return rgb
		}
		if (
			colorMode === "misery" &&
			windVectors &&
			worldForDisplay.climate &&
			worldForDisplay.dtr_annual
		) {
			const N = worldForDisplay.mesh.numRegions
			const rgb = new Float32Array(N * 3)
			const isMonthly = dtrMonth > 0
			const offset = isMonthly ? (dtrMonth - 1) * N : 0
			const monthlyTemp = isMonthly
				? worldForDisplay.climate.temperature_monthly
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
				const meanT = monthlyTemp
					? monthlyTemp[offset + r]
					: worldForDisplay.climate.temperature_avg[r]
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
				const rh = relativeHumidityFromTempRange(
					meanT,
					dtr,
					annualAridity,
					worldForDisplay.rainfall?.annual[r],
				)
				const observedRh =
					currentMonth === 0
						? worldForDisplay.observedHumidity?.real_annual?.[r]
						: worldForDisplay.observedHumidity?.real_monthly?.[offset + r]
				const humidity = Number.isFinite(observedRh) ? observedRh : rh
				const [cr, cg, cb] = miseryColor(
					apparentTemperatureC(meanT, humidity, windSpeed[r]),
				)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return rgb
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
				provinceMeta: earthHistory.provinceMeta ?? undefined,
			})
			if (earthColors) return earthColors
		}
		return computeRegionColors(
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
			selectedHistoryView?.activeWars,
			selectedNationId,
			selectedHistoryView?.relationAt ?? null,
			dangerSubMode,
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
		selectedHistoryView,
		worldForDisplay,
		selectedNationId,
		windVectors,
		dangerSubMode,
		earthHistory.engine,
		earthHistory.query,
		earthHistory.nationReference,
		earthHistory.religionColorById,
		earthHistory.cultureColorById,
		earthHistory.provinceMeta,
	])

	const earthHistoryDiplomacyRows = useMemo(() => {
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
		const owner = earthHistory.query.state.provinces.get(rawId)?.owner
		if (!owner) return undefined
		const info = earthHistory.queryNation(owner)
		return buildEarthHistoryDiplomacyDisplayData(info)
		// eslint-disable-next-line react-hooks/exhaustive-deps -- queryNation closes over selectedDays via earthHistory.query, already a dep
	}, [
		worldForDisplay?.isEarthImport,
		earthHistory.engine,
		earthHistory.query,
		hoverProvince,
		earthHistory.queryNation,
	])

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
		const ps = earthHistory.query.state.provinces.get(rawId)
		if (!ps) return undefined

		const meta = earthHistory.provinceMeta?.get(rawId)
		// EU4's own "wasteland" flag describes present-day/in-engine
		// uninhabitability, not history -- a wasteland province can still
		// have real recorded culture/religion data (EU4 itself records this
		// for many of its own wasteland provinces), so it only suppresses
		// nation/government, matching computeEarthHistoryRegionColors'
		// map-coloring behavior.
		const isWasteland = !!meta?.wasteland
		const owner = isWasteland ? null : ps.owner
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

		const govType = owner
			? (earthHistory.query.state.nations.get(owner)?.governmentType ?? null)
			: null
		const governmentLabel = govType
			? govType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
			: null
		const governmentColor = govType
			? rgb01ToCss(hashColorForKey(`gov:${govType}`))
			: null

		const cultureId = ps.cultureId
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

		const religionId = ps.religionId
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
			return computeEarthHistoryOccupationOverlay({
				state: earthHistory.query.state,
				provinceMap: earthHistory.engine.provinceMap,
				regionProvince: worldForDisplay.provinces.regionProvince,
				nationReference: earthHistory.nationReference,
			})
		}
		return buildPoliticalOccupationOverlay({
			regionProvince: worldForDisplay?.provinces?.regionProvince,
			assignment: worldForDisplay?.nations?.assignment,
			activeWars: selectedHistoryView?.activeWars,
			getNationColorRgb,
		})
	}, [
		selectedHistoryView,
		getNationColorRgb,
		worldForDisplay,
		earthHistory.query,
		earthHistory.nationReference,
		earthHistory.engine,
	])

	const cultureBlendOverlay = useMemo(() => {
		if (colorMode !== "population") return null
		const world = worldForDisplay
		if (!world?.cultures) return null

		const blendSecondary = selectedHistoryView?.cultureBlendSecondary
		const blendWeight = selectedHistoryView?.cultureBlendWeight
		const cultureAssignment = world.cultures.assignment

		let getOverlayColor:
			| ((
					sec: number,
					prim: number,
			  ) => readonly [number, number, number] | null)
			| null = null

		if (populationMode === "culture") {
			const colors = world.cultures.colors
			getOverlayColor = (sec) =>
				[colors[3 * sec], colors[3 * sec + 1], colors[3 * sec + 2]] as const
		} else if (populationMode === "heritage" && world.heritages) {
			const { assignment: cultureToHeritage, colors } = world.heritages
			getOverlayColor = (sec, prim) => {
				const secH = cultureToHeritage[sec] ?? -1
				if (secH < 0 || secH === (cultureToHeritage[prim] ?? -1)) return null
				return [
					colors[3 * secH],
					colors[3 * secH + 1],
					colors[3 * secH + 2],
				] as const
			}
		} else if (
			populationMode === "religion" &&
			world.religions &&
			world.religionTypes
		) {
			getOverlayColor = (sec, prim) => {
				const secReligion = getReligionIndexForCulture(world, sec)
				const primReligion =
					prim >= 0 ? getReligionIndexForCulture(world, prim) : -1
				if (secReligion < 0 || secReligion === primReligion) return null
				return getReligionColorForCulture(world, sec)
			}
		}

		if (!getOverlayColor) return null
		return buildCultureBlendOverlay({
			regionProvince: world.provinces?.regionProvince,
			cultureBlendSecondary: blendSecondary,
			cultureBlendWeight: blendWeight,
			cultureAssignment,
			getOverlayColor,
		})
	}, [colorMode, populationMode, worldForDisplay, selectedHistoryView])

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
		if (lastWorldRef.current !== worldForDisplay) {
			scene.updateWorld(worldForDisplay)
			lastWorldRef.current = worldForDisplay
		}
		scene.setOccupationOverlay(
			colorMode === "nations" && nationMode === "borders"
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
		scene.setEarthHistoryNationOverride(
			worldForDisplay.isEarthImport && earthHistory.query
				? {
						assignment: earthHistory.query.frame.assignment,
						seeds: earthHistory.query.frame.seeds,
						names: earthHistory.query.frame.names,
					}
				: null,
		)
		// Culture/religion LABELS are also placed from a different id space
		// than the procedural world.cultures/world.heritages -- see
		// earthHistoryLabelPartitions's doc comment in
		// create-genesis-scene.ts.
		scene.setEarthHistoryLabelPartitions(
			worldForDisplay.isEarthImport && earthHistory.query
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
		)
	}, [
		colorMode,
		nationMode,
		populationMode,
		occupationOverlay,
		cultureBlendOverlay,
		regionColors,
		worldForDisplay,
		earthHistory.query,
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
			const nation =
				province >= 0 ? (nationModel.assignment[province] ?? -1) : -1

			if (measureMode === "off") {
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
	])

	const selectedNation = useMemo(() => {
		return buildSelectedNationDetails({
			selectedNationId,
			selectedTimeMs,
			world: worldForDisplay,
			nationModel,
			selectedHistoryView,
			getNationColor,
			getNationName,
			getLeaderName,
			getDynastyName,
			getCultureName,
			getHeritageName,
		})
	}, [
		selectedHistoryView,
		nationModel,
		getNationColor,
		getNationName,
		getLeaderName,
		getDynastyName,
		getCultureName,
		getHeritageName,
		selectedNationId,
		selectedTimeMs,
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
	const handleProvinceClick = useCallback((provinceId: number) => {
		sceneRef.current?.focusOnProvince(provinceId)
	}, [])

	const nationHistory = useMemo(() => {
		return buildNationHistory({
			selectedNationId,
			historyQuery: currentHistoryQuery,
			selectedTimeMs,
			simStartTimeMs,
			simTimeMs,
			world: worldForDisplay,
		})
	}, [
		selectedNationId,
		currentHistoryQuery,
		selectedTimeMs,
		simStartTimeMs,
		simTimeMs,
		worldForDisplay,
	])

	const windowedEvents = useMemo(() => {
		return buildWindowedNationEvents({
			selectedNationId,
			historyQuery: currentHistoryQuery,
			nationHistory,
		})
	}, [selectedNationId, currentHistoryQuery, nationHistory])

	const allPastEvents = useMemo(() => {
		if (!currentHistoryQuery) return undefined
		return currentHistoryQuery.getEventsUntil(selectedTimeMs)
	}, [currentHistoryQuery, selectedTimeMs])

	const nationSizeDistribution = useMemo(
		() => buildNationSizeDistribution(nationProvinceCounts),
		[nationProvinceCounts],
	)

	const governmentDistribution = useMemo(() => {
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
	}, [worldForDisplay?.nations?.governmentType, nationModel])

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

	const conflictDistribution = useMemo(
		() => buildConflictDistribution(selectedHistoryView),
		[selectedHistoryView],
	)

	const nationAdjacency = useMemo(
		() =>
			colorMode === "nations" && nationModel && worldForDisplay
				? buildNationAdjacency(nationModel.assignment, worldForDisplay)
				: null,
		[colorMode, nationModel, worldForDisplay],
	)

	const relationDistribution = useMemo(
		() =>
			buildRelationDistribution(
				selectedHistoryView,
				nationModel,
				nationAdjacency,
			),
		[selectedHistoryView, nationModel, nationAdjacency],
	)

	const climateDistribution = useMemo(
		() =>
			buildDistribution(
				CLIMATE_LABELS,
				world?.climateZones,
				(index) => rgbToCss(climateZoneColor(index)),
				new Set([0]),
			),
		[world?.climateZones],
	)

	const vegetationDistribution = useMemo(
		() =>
			buildDistribution(
				BIOME_LABELS,
				world?.vegetation,
				(index) => rgbToCss(vegetationColor(index)),
				new Set([0]),
			),
		[world?.vegetation],
	)

	const topographyDistribution = useMemo(
		() =>
			buildDistribution(
				GENESIS_TOPOGRAPHY_LABELS,
				world?.topography,
				(index) => {
					const color = getTopographyColor(index)
					return color ? rgbToCss(color) : "rgb(148, 163, 184)"
				},
				new Set([TOPO_LAKE, TOPO_OCEAN]),
			),
		[world?.topography],
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
		sceneRef.current?.setNationNames(nationLabelsArray)
	}, [nationLabelsArray])
	useEffect(() => {
		sceneRef.current?.setDynastyNames(dynastyLabelsArray)
	}, [dynastyLabelsArray])
	useEffect(() => {
		sceneRef.current?.setSettlementNames(settlementLabelsArray)
	}, [settlementLabelsArray])
	useEffect(() => {
		sceneRef.current?.setCultureNames(cultureLabelsArray)
	}, [cultureLabelsArray])
	useEffect(() => {
		sceneRef.current?.setHeritageNames(heritageLabelsArray)
	}, [heritageLabelsArray])
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
			onGenerationFrame: (frame) => {
				setSimTimeMs(frame.timeMs)
				setSelectedTimeMs(frame.timeMs)
				setLiveFrame(frame)
			},
			onSimProgress: (timeMs, frame) => {
				setSimTimeMs(timeMs)
				setSelectedTimeMs(timeMs)
				setLiveFrame(frame)
			},
			onSimComplete: (timeMs, timelines, events) => {
				setSimPlaying(false)
				setSimTimeMs(timeMs)
				setSelectedTimeMs(timeMs)
				setTimelineBundle({ timelines, events })
				setLiveFrame(null)
			},
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
			moonCount,
			moonSeed,
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
			moonCount,
			moonSeed,
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
			// Reset simulation state
			setSimPlaying(false)
			setSimTimeMs(simStartTimeMs)
			setSelectedTimeMs(simStartTimeMs)
			setTimelineBundle(undefined)
			setLiveFrame(null)
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
			setMoonCount,
			setMoonSeed,
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
				moonCount,
				moonSeed,
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
			moonCount,
			moonSeed,
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

	const handleStartSimulation = useCallback(() => {
		setSimPlaying(true)
		setTimelineBundle(null)
		startSimulation(workerRef)
	}, [])

	const handlePauseSimulation = useCallback(() => {
		setSimPlaying(false)
		pauseSimulation(workerRef)
	}, [])

	const handleToggleSimulationPlayback = useCallback(() => {
		if (simPlaying) {
			handlePauseSimulation()
			return
		}
		if (selectedTimeMs !== simTimeMs) {
			setSelectedTimeMs(simTimeMs)
		}
		handleStartSimulation()
	}, [
		handlePauseSimulation,
		handleStartSimulation,
		selectedTimeMs,
		simPlaying,
		simTimeMs,
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
	const planetName = useMemo(() => generatePlanetName(seed), [seed])

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
					moonCount,
					moonSeed,
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
			moonCount,
			moonSeed,
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
	// The main world is a special case: unlike every other body, its own
	// physical params (radius/obliquity/day length/orbital distance/
	// eccentricity/perihelion/pressure) are owned by top-level React state
	// (the 3D scene and terrain pipeline read them directly there), not
	// derived purely from the seed -- so `generatedSystemBodies` always
	// reflects whatever that state currently holds, edited or not. Just
	// replacing the array entry would regenerate the SAME edited values.
	// Resetting the main world means resetting that top-level state back to
	// its defaults too.
	const rebuildSystemBody = useCallback(
		(bodyIndex?: number) => {
			const isMainWorldReset =
				bodyIndex !== undefined &&
				resetSourceSystemBodies[bodyIndex]?.isMainWorld
			if (bodyIndex === undefined) {
				setSpectralClass(DEFAULT_WORLD_PARAMS.spectralClass)
				setStarSubtype(DEFAULT_WORLD_PARAMS.starSubtype)
				setRestSeed(SOL_SEED)
				setMoonCount(DEFAULT_WORLD_PARAMS.moonCount)
				setMoonSeed(LUNA_MOON_SEED)
			}
			if (bodyIndex === undefined || isMainWorldReset) {
				setPlanetRadiusKm(DEFAULT_WORLD_PARAMS.planetRadiusKm)
				setObliquity(DEFAULT_WORLD_PARAMS.obliquity)
				setEccentricity(DEFAULT_WORLD_PARAMS.eccentricity)
				setOrbitalDistanceAU(DEFAULT_WORLD_PARAMS.orbitalDistanceAU)
				setHoursPerDay(DEFAULT_WORLD_PARAMS.hoursPerDay)
				setPerihelion(DEFAULT_WORLD_PARAMS.perihelion)
				setPressure(DEFAULT_WORLD_PARAMS.pressure)
				setSubstellarLon(DEFAULT_WORLD_PARAMS.substellarLon)
				setTideLock(null)
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
			setEccentricity,
			setHoursPerDay,
			setObliquity,
			setOrbitalDistanceAU,
			setPerihelion,
			setPlanetRadiusKm,
			setPressure,
			setSubstellarLon,
			setTideLock,
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
						showRealNames: restSeed === SOL_SEED && showSolarSystemRealNames,
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
		showSolarSystemRealNames,
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
						showRealNames: restSeed === SOL_SEED && showSolarSystemRealNames,
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
		showSolarSystemRealNames,
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

	const solStarName =
		restSeed === SOL_SEED && showSolarSystemRealNames ? "Sol" : undefined
	const surfaceTidesM = useMemo(() => {
		if (focusedMoon && focusedMoonParent) {
			return computeMoonSurfaceTidesM(
				focusedMoon,
				{
					name: showSolarSystemRealNames ? focusedMoonParent.name : undefined,
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
		showSolarSystemRealNames,
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
					showRealSolNames={showSolarSystemRealNames}
					setRestSeed={setRestSeed}
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
					setSpectralClass={setSpectralClassPreservingHz}
					starSubtype={starSubtype}
					setStarSubtype={setStarSubtypePreservingHz}
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
							relationAt={
								colorMode === "nations"
									? (selectedHistoryView?.relationAt ?? null)
									: null
							}
							detailsDrawerOpen={detailsDrawerOpen}
							earthHistoryDiplomacyRows={earthHistoryDiplomacyRows}
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
							showRealNames={
								restSeed === SOL_SEED ? showSolarSystemRealNames : undefined
							}
							setShowRealNames={
								restSeed === SOL_SEED ? setShowSolarSystemRealNames : undefined
							}
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
									formatLabel={earthHistoryFormatLabel}
									stepValue={365}
									extraControls={
										<EarthHistoryBookmarks
											onSelect={earthHistory.setSelectedDays}
											placement="below"
										/>
									}
								/>
							</div>
						</div>
					) : (
						canSimulate && (
							<div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
								<div className="pointer-events-auto">
									<SimulationControls
										selectedTimeMs={selectedTimeMs}
										minTimeMs={simStartTimeMs}
										maxTimeMs={simTimeMs}
										onTimeChange={setSelectedTimeMs}
										floating={false}
										onPlayPause={handleToggleSimulationPlayback}
										simPlaying={simPlaying}
									/>
								</div>
							</div>
						)
					)}
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
				planetName={planetName}
				planetStats={planetStats}
				worldPopulation={drawerWorldPopulation}
				activeWarCount={selectedHistoryView?.activeWars.length ?? null}
				cultureCount={worldForDisplay?.cultures?.count ?? null}
				heritageCount={worldForDisplay?.heritages?.count ?? null}
				religionCount={worldForDisplay?.religions?.count ?? null}
				nationSizeDistribution={nationSizeDistribution}
				governmentDistribution={governmentDistribution}
				religionDistribution={religionTypeDistribution}
				conflictDistribution={conflictDistribution}
				relationDistribution={relationDistribution}
				climateDistribution={climateDistribution}
				vegetationDistribution={vegetationDistribution}
				topographyDistribution={topographyDistribution}
				tradeGoodsDistribution={tradeGoodsDistribution}
				nationHistory={nationHistory}
				windowedEvents={windowedEvents}
				allPastEvents={allPastEvents}
				selectedTimeMs={selectedTimeMs}
				currentTimeMs={simTimeMs}
				onTimeSelect={setSelectedTimeMs}
				onNationClick={handleDrawerNationClick}
				onProvinceClick={handleProvinceClick}
				getNationName={getNationName}
				getNationColor={getNationColor}
				getProvinceName={getProvinceName}
				getProvinceColor={getProvinceColor}
				getDynastyName={getDynastyName}
			/>
		</div>
	)
}
