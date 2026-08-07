import { DATE } from "@/model/history/earth/date"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import {
	findSortedTimeBracket,
	hydeTimeToEu4Days,
} from "@/ui/genesis/shared/export/eu4-date"

// "coming from" convention: negate u/v to get the source direction
// Nation focus is anchored on a representative seed province, so province
// count is only a rough proxy for framing. Use a slow logarithmic curve:
// single-province minors need a much tighter view than the default point
// focus, while large nations should pull back only moderately instead of
// hitting the far-out cap early.
// Focusing on a single province (as opposed to a whole nation) should use
// the same tight framing as a single-province nation -- the unscaled
// default (distanceScale 1) is tuned for the far-out nation case and looks
// much too zoomed-out for one province.

export interface MonthlyRasterAsset {
	monthly: Int16Array
	width: number
	height: number
	months: number
	scale: number
	nodata: number
}

export interface Eu4PopulationTimelineAsset {
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

export interface RealPopulationSlice {
	population: Float32Array
	difference: Float32Array
	totalPopulation: number
	sourceTimeDays: number
	sourceTimeLabel: string
}

export interface RealUrbanPopulationSlice {
	population: Float32Array
	totalPopulation: number
	sourceTimeDays: number
	sourceTimeLabel: string
}

/** A server may already transparently decode a *.gz file via the standard
 * Content-Encoding response header (e.g. Vite's dev static middleware does
 * this) -- decompressing again here would double-decode garbage. Only run
 * DecompressionStream when the bytes are still actually gzipped. */
async function fetchMaybeGzippedBinary(
	url: string,
	compression: "gzip" | undefined,
	label: string,
): Promise<ArrayBuffer> {
	const res = await fetch(url)
	if (!res.ok) {
		throw new Error(`Failed to load ${label}: ${res.status}`)
	}
	const alreadyDecoded = res.headers.get("content-encoding") === "gzip"
	return compression === "gzip" && !alreadyDecoded
		? await new Response(
				res.body?.pipeThrough(new DecompressionStream("gzip")),
			).arrayBuffer()
		: await res.arrayBuffer()
}

async function loadEarthMonthlyRaster(
	prefix: string,
	label: string,
): Promise<MonthlyRasterAsset> {
	const metaRes = await fetch(`/earth-data/${prefix}.json`)
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
		compression?: "gzip"
	}
	const buffer = await fetchMaybeGzippedBinary(
		`/earth-data/${meta.bin}`,
		meta.compression,
		`${label} raster`,
	)
	return {
		monthly: new Int16Array(buffer),
		width: meta.width,
		height: meta.height,
		months: meta.months,
		scale: meta.scale,
		nodata: meta.nodata,
	}
}

export async function loadEarthRealClimate(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster("earth-real-temperature", "observed climate")
}

export async function loadEarthRealPrecip(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster(
		"earth-real-precipitation",
		"observed precipitation",
	)
}

export async function loadEarthRealCloudCover(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster(
		"earth-real-cloud-cover",
		"observed cloud cover",
	)
}

export async function loadEarthRealDtr(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster("earth-real-dtr", "observed DTR")
}

export async function loadEarthRealVaporPressure(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster(
		"earth-real-vapor-pressure",
		"observed vapor pressure",
	)
}

export async function loadEarthRealWindU(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster("earth-real-wind-u", "observed wind (u)")
}

export async function loadEarthRealWindV(): Promise<MonthlyRasterAsset> {
	return loadEarthMonthlyRaster("earth-real-wind-v", "observed wind (v)")
}

/** Optional: unlike the other observed-Earth rasters, ocean-current/SST-anomaly
 * assets aren't shipped by default (see scripts/build-earth-real-current.py) --
 * missing files degrade to "Observed" ocean currents being unavailable rather
 * than failing the whole Earth import. */
async function loadEarthMonthlyRasterOptional(
	prefix: string,
	label: string,
): Promise<MonthlyRasterAsset | undefined> {
	try {
		return await loadEarthMonthlyRaster(prefix, label)
	} catch {
		return undefined
	}
}

export async function loadEarthRealCurrentU(): Promise<
	MonthlyRasterAsset | undefined
> {
	return loadEarthMonthlyRasterOptional(
		"earth-real-current-u",
		"observed ocean current (u)",
	)
}

export async function loadEarthRealCurrentV(): Promise<
	MonthlyRasterAsset | undefined
> {
	return loadEarthMonthlyRasterOptional(
		"earth-real-current-v",
		"observed ocean current (v)",
	)
}

export async function loadEarthRealSstAnomaly(): Promise<
	MonthlyRasterAsset | undefined
> {
	return loadEarthMonthlyRasterOptional(
		"earth-real-sst-anomaly",
		"observed SST anomaly",
	)
}

export async function loadEarthRealElevation(): Promise<{
	raster: Int16Array
	width: number
	height: number
	scale: number
	nodata: number
}> {
	const metaRes = await fetch("/earth-data/earth-real-elevation.json")
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
		compression?: "gzip"
	}
	const buffer = await fetchMaybeGzippedBinary(
		`/earth-data/${meta.bin}`,
		meta.compression,
		"observed elevation raster",
	)
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
	const metaRes = await fetch(`/earth-data/${prefix}.json`)
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
		compression?: "gzip"
	}
	const buffer = await fetchMaybeGzippedBinary(
		`/earth-data/${meta.bin}`,
		meta.compression,
		`${label} asset`,
	)
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

export function attachEarthProvinceAreas(params: {
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

export async function loadEarthRealPopulationEu4(): Promise<Eu4PopulationTimelineAsset> {
	return loadEarthProvinceTimeline(
		"earth-real-population-eu4",
		"observed population",
	)
}

export async function loadEarthRealUrbanPopulationEu4(): Promise<Eu4PopulationTimelineAsset> {
	return loadEarthProvinceTimeline(
		"earth-real-urban-population-eu4",
		"observed urban population",
	)
}

export function buildInterpolatedProvinceTimelineSlice(params: {
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
		sourceTimeLabel: DATE.formatHistoryDays(selectedDays),
	}
}

export function buildRealPopulationSlice(params: {
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

export function buildRealUrbanPopulationSlice(params: {
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
export interface Eu4GhslSettlementAsset {
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

export interface Eu4ProvinceSettlementAsset {
	settlements: Record<string, Eu4ProvinceSettlement>
}

export interface Eu4ProvinceSettlement {
	ghslSettlementIndex: number | null
	ghslPopulationCarrierIndices: number[]
	longitude: number
	latitude: number
	events: Eu4ProvinceSettlementEvent[]
	preEu4NameHistory: Eu4ProvinceSettlementNameHistory[]
}

export interface Eu4ProvinceSettlementNameHistory {
	name: string
	foundedYear: number
	endYear: number | null
	importance: number
	ghslSettlementIndex: number
	ghslPopulationCarrierIndices: number[]
}

export type Eu4ProvinceSettlementEvent =
	| {
			date: number
			kind: "capitalName"
			payload: { name: string }
	  }
	| {
			date: number
			kind: string
			payload: Record<string, unknown>
	  }

export interface Eu4ProvinceSettlementNameParams {
	settlement: Eu4ProvinceSettlement
	selectedDays: number
}

export interface Eu4ProvinceSettlementPopulationCarrierParams {
	settlement: Eu4ProvinceSettlement
	selectedDays: number
	population: Float32Array
}

export async function loadEu4GhslSettlements(): Promise<Eu4GhslSettlementAsset> {
	const metaRes = await fetch("/earth-data/eu4-ghsl-settlements.json")
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
		compression?: "gzip"
	}
	const buffer = await fetchMaybeGzippedBinary(
		`/earth-data/${meta.bin}`,
		meta.compression,
		"GHSL settlements asset",
	)
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

export async function loadEu4ProvinceSettlements(): Promise<Eu4ProvinceSettlementAsset> {
	const response = await fetch("/earth-data/eu4-province-settlements.json")
	if (!response.ok) {
		throw new Error(
			`Failed to load EU4 province settlements: ${response.status}`,
		)
	}
	return response.json() as Promise<Eu4ProvinceSettlementAsset>
}

/** Return the EU4 city flag active on the selected date. */
export function resolveEu4ProvinceSettlementIsCity({
	settlement,
	selectedDays,
}: Eu4ProvinceSettlementNameParams): boolean {
	let isCity = false
	for (const event of settlement.events) {
		if (event.kind !== "isCity" || event.date > selectedDays) continue
		const value = event.payload.value
		if (typeof value === "boolean") isCity = value
	}
	return isCity
}

function findActivePreEu4SettlementName({
	settlement,
	selectedDays,
}: Eu4ProvinceSettlementNameParams): Eu4ProvinceSettlementNameHistory | null {
	if (DATE.historyDaysToYear(selectedDays) >= 2) return null
	const year = DATE.historyDaysToYear(selectedDays)
	let active: Eu4ProvinceSettlementNameHistory | null = null
	for (const entry of settlement.preEu4NameHistory) {
		if (entry.foundedYear > year) continue
		if (entry.endYear !== null && year >= entry.endYear) continue
		if (
			!active ||
			entry.importance > active.importance ||
			(entry.importance === active.importance &&
				entry.foundedYear > active.foundedYear)
		) {
			active = entry
		}
	}
	return active
}

/** The latest EU4 capital-name event at the selected date is the province's
 * authoritative settlement label. GHSL names only enrich coordinates and
 * population; they never choose the displayed identity. */
export function resolveEu4ProvinceSettlementName({
	settlement,
	selectedDays,
}: Eu4ProvinceSettlementNameParams): string | null {
	const historicalName = findActivePreEu4SettlementName({
		settlement,
		selectedDays,
	})
	if (historicalName) return historicalName.name
	let name: string | null = null
	for (const event of settlement.events) {
		if (event.kind !== "capitalName" || event.date > selectedDays) continue
		const candidateName = event.payload.name
		if (typeof candidateName === "string") name = candidateName
	}
	return name
}

export function resolveEu4ProvinceSettlementCarrier({
	settlement,
	selectedDays,
}: Eu4ProvinceSettlementNameParams): number | null {
	return (
		findActivePreEu4SettlementName({ settlement, selectedDays })
			?.ghslSettlementIndex ?? settlement.ghslSettlementIndex
	)
}

/** Select the best available GHSL population carrier without moving the
 * settlement's historical name/location anchor. Multiple source points can
 * cover different periods; they are alternatives, never summed. */
export function resolveEu4ProvinceSettlementPopulationCarrier({
	settlement,
	selectedDays,
	population,
}: Eu4ProvinceSettlementPopulationCarrierParams): number | null {
	const historicalName = findActivePreEu4SettlementName({
		settlement,
		selectedDays,
	})
	const anchor =
		historicalName?.ghslSettlementIndex ?? settlement.ghslSettlementIndex
	const populationCarriers =
		historicalName?.ghslPopulationCarrierIndices ??
		settlement.ghslPopulationCarrierIndices
	let carrier = anchor
	let largestPopulation = anchor === null ? 0 : population[anchor]
	for (const candidate of populationCarriers) {
		const candidatePopulation = population[candidate]
		if (candidatePopulation > largestPopulation) {
			carrier = candidate
			largestPopulation = candidatePopulation
		}
	}
	return carrier
}

/** Interpolated population per settlement at selectedDays, same time-bracket
 * linear-interpolation convention as buildInterpolatedProvinceTimelineSlice. */
export function buildGhslSettlementPopulationSlice(
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
export function buildBestSettlementByProvince(
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

export function topSettlementIndices(
	population: Float32Array,
	provinceIds: Int32Array,
): number[] {
	return Array.from(
		buildBestSettlementByProvince(population, provinceIds).values(),
	)
}

export async function loadEu5Categorical(prefix: string): Promise<{
	raster: Int16Array
	width: number
	height: number
	nodata: number
	categories: string[]
}> {
	const metaRes = await fetch(`/earth-data/${prefix}.json`)
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
	const binRes = await fetch(`/earth-data/${meta.bin}`)
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

export async function loadEu4Provinces(): Promise<{
	raster: Int16Array
	width: number
	height: number
	nodata: number
}> {
	const metaRes = await fetch("/earth-data/eu4-provinces.json")
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
	const buffer = await fetchMaybeGzippedBinary(
		`/earth-data/${meta.bin}`,
		meta.compression,
		"EU4 provinces raster",
	)
	return {
		raster: new Int16Array(buffer),
		width: meta.width,
		height: meta.height,
		nodata: meta.nodata,
	}
}

export async function loadOptionalJson<T>(url: string): Promise<T | undefined> {
	const res = await fetch(url)
	if (!res.ok) return undefined
	const contentType = res.headers.get("content-type") ?? ""
	if (!contentType.includes("application/json")) return undefined
	return (await res.json()) as T
}
