import type { GenesisProvinces } from "@/model/types"
import { ADAPTER } from "@/model/earth/history/adapter"
import { CHECKPOINT } from "@/model/earth/history/checkpoint"
import { EU4_PROVINCE_MAP } from "@/model/earth/history/import/eu4-province-map"
import { DATA_SOURCE } from "@/model/earth/history/data-source"
import { DATE } from "@/model/earth/history/date"
import type { NationInfoFromHistory } from "@/model/earth/history/adapter/types"
import type { RawNationReference } from "@/model/earth/history/data-source/types"
import type {
	EarthHistoryEngine,
	EarthHistoryQuery,
	QueryEarthHistoryParams,
	QueryEarthHistoryNationParams,
} from "@/model/earth/history/engine/types"
const SENTINEL_DATE_CUTOFF = DATE.eu4DateToDays("2100.1.1")

function computeDateRange(data: {
	provinceEvents: Record<string, { events: { date: number }[] }>
	nationEvents: Record<string, { events: { date: number }[] }>
	wars: { events: { date: number }[] }[]
	diplomacy: { date: number }[]
	organizationEvents: { date: number }[]
}): { minDate: number; maxDate: number } {
	let min = Infinity
	let max = -Infinity
	const consider = (date: number) => {
		if (date >= SENTINEL_DATE_CUTOFF) return
		if (date < min) min = date
		if (date > max) max = date
	}
	for (const entry of Object.values(data.provinceEvents))
		for (const e of entry.events) consider(e.date)
	for (const entry of Object.values(data.nationEvents))
		for (const e of entry.events) consider(e.date)
	for (const war of data.wars) for (const e of war.events) consider(e.date)
	for (const e of data.diplomacy) consider(e.date)
	for (const e of data.organizationEvents) consider(e.date)
	if (min === Infinity) return { minDate: 0, maxDate: 0 }
	return { minDate: min, maxDate: max }
}

async function createEarthHistoryEngine(
	provinces: GenesisProvinces,
): Promise<EarthHistoryEngine | null> {
	const provinceMap = EU4_PROVINCE_MAP.buildEu4ProvinceMap(provinces)
	if (!provinceMap) return null

	const [
		provinceEvents,
		nationEvents,
		wars,
		diplomacy,
		organizationEvents,
		provinceCoords,
		nationReferenceRows,
		geography,
	] = await Promise.all([
		DATA_SOURCE.loadProvinceEvents(),
		DATA_SOURCE.loadNationEvents(),
		DATA_SOURCE.loadWars(),
		DATA_SOURCE.loadDiplomacyEvents(),
		DATA_SOURCE.loadOrganizationEvents(),
		DATA_SOURCE.loadProvinceCoordinates(),
		DATA_SOURCE.loadNationReference(),
		DATA_SOURCE.loadGeography(),
	])

	const nationReference = new Map<string, RawNationReference>()
	for (const nation of nationReferenceRows) {
		nationReference.set(nation.tag, nation)
	}

	const cache = CHECKPOINT.createCheckpointCache({
		provinceEvents,
		nationEvents,
		nationReference,
		wars,
		diplomacy,
		organizationEvents,
	})
	const { minDate, maxDate } = computeDateRange({
		provinceEvents,
		nationEvents,
		wars,
		diplomacy,
		organizationEvents,
	})
	const provinceMeta = new Map<
		string,
		{
			name: string | null
			wasteland: boolean
			area: string | null
			region: string | null
			superregion: string | null
		}
	>()
	for (const [rawId, entry] of Object.entries(provinceEvents)) {
		const geo = geography[rawId]
		provinceMeta.set(rawId, {
			name: entry.base.name,
			wasteland: entry.base.wasteland,
			area: geo?.area ?? null,
			region: geo?.region ?? null,
			superregion: geo?.superregion ?? null,
		})
	}
	return {
		provinceMap,
		cache,
		data: {
			provinceEvents,
			nationEvents,
			nationReference,
			wars,
			diplomacy,
			organizationEvents,
		},
		minDate,
		maxDate,
		provinceMeta,
		provinceCoords,
	}
}

function queryEarthHistory({
	engine,
	timeDays,
	nationReference,
	cultureNameById,
	religionNameById,
}: QueryEarthHistoryParams): EarthHistoryQuery {
	const state = CHECKPOINT.foldAtCheckpoint({
		cache: engine.cache,
		time: timeDays,
	})
	const frame = ADAPTER.foldedStateToGenesisFrame({
		state,
		provinceMap: engine.provinceMap,
		nationReference,
		cultureNameById,
		religionNameById,
		provinceCoords: engine.provinceCoords,
	})
	return { state, frame }
}

function queryEarthHistoryNation({
	engine,
	timeDays,
	tag,
}: QueryEarthHistoryNationParams): NationInfoFromHistory | null {
	const state = CHECKPOINT.foldAtCheckpoint({
		cache: engine.cache,
		time: timeDays,
	})
	return ADAPTER.foldedStateToNationInfo({ state, tag })
}

export const ENGINE = {
	createEarthHistoryEngine,
	queryEarthHistory,
	queryEarthHistoryNation,
}
