import type { GenesisProvinces } from "../../types/society"
import {
	foldedStateToGenesisFrame,
	foldedStateToNationInfo,
	type GenesisFrameFromHistory,
	type NationInfoFromHistory,
} from "./adapter"
import {
	type CheckpointCache,
	createCheckpointCache,
	foldAtCheckpoint,
} from "./checkpoint"
import type { RawNationReference } from "./data-source"
import {
	loadDiplomacyEvents,
	loadNationEvents,
	loadNationReference,
	loadProvinceCoordinates,
	loadProvinceEvents,
	loadWars,
} from "./data-source"
import { eu4DateToDays } from "./date"
import type { FoldedState } from "./fold"
import {
	buildEu4ProvinceMap,
	type Eu4ProvinceMap,
} from "./import/eu4-province-map"

export interface EarthHistoryEngine {
	provinceMap: Eu4ProvinceMap
	cache: CheckpointCache
	/** Actual earliest/latest event date found across all loaded data, in the
	 * same day units as date.ts. Used to bound the UI slider to where real
	 * data actually exists instead of the full geo-explorer 2..9999 range,
	 * which is mostly empty and made the slider impractical to scrub. See
	 * docs/earth-history-plan.md "UI wiring plan". */
	minDate: number
	maxDate: number
	/** Raw EU4 province id -> static (time-invariant) name/wasteland flag,
	 * from provinces.json's `base` fields. Built once at load, not part of
	 * the time-varying fold since neither field changes with the scrubber. */
	provinceMeta: Map<string, { name: string | null; wasteland: boolean }>
	/** Raw EU4 province id -> representative point. Used for nation-label
	 * placement when no capital is known -- see adapter.ts. */
	provinceCoords: Map<string, { lon: number; lat: number }>
}

// EU4 encodes "this relation never ends" with a sentinel end_date far in the
// future (commonly 9999.1.1, sometimes 5000.1.1) rather than omitting the
// field -- e.g. history/diplomacy/modern_alliances.txt's GBR-FR2 alliance
// has `end_date = 9999.1.1`. Converted as-is, that single sentinel date
// dominated computeDateRange's max and defeated the point of bounding the
// slider to real data coverage. No converted data is genuinely dated past
// the present, so anything past this cutoff is a sentinel, not real history.
const SENTINEL_DATE_CUTOFF = eu4DateToDays("2100.1.1")

function computeDateRange(data: {
	provinceEvents: Record<string, { events: { date: number }[] }>
	nationEvents: Record<string, { events: { date: number }[] }>
	wars: { events: { date: number }[] }[]
	diplomacy: { date: number }[]
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
	if (min === Infinity) return { minDate: 0, maxDate: 0 }
	return { minDate: min, maxDate: max }
}

/** Entry point for the UI: builds the engine for an Earth-imported world.
 * Returns null when `world.provinces` has no EU4 raw-id mapping (i.e. not a
 * raster-based Earth import), so callers can no-op cleanly. Only fetches the
 * (multi-MB) event JSON once actually invoked -- gate calls on
 * `world.isEarthImport` per docs/earth-history-plan.md. */
export async function createEarthHistoryEngine(
	provinces: GenesisProvinces,
): Promise<EarthHistoryEngine | null> {
	const provinceMap = buildEu4ProvinceMap(provinces)
	if (!provinceMap) return null

	const [
		provinceEvents,
		nationEvents,
		wars,
		diplomacy,
		provinceCoords,
		nationReferenceRows,
	] = await Promise.all([
		loadProvinceEvents(),
		loadNationEvents(),
		loadWars(),
		loadDiplomacyEvents(),
		loadProvinceCoordinates(),
		loadNationReference(),
	])

	const nationReference = new Map<string, RawNationReference>()
	for (const nation of nationReferenceRows) {
		nationReference.set(nation.tag, nation)
	}

	const cache = createCheckpointCache({
		provinceEvents,
		nationEvents,
		nationReference,
		wars,
		diplomacy,
	})
	const { minDate, maxDate } = computeDateRange({
		provinceEvents,
		nationEvents,
		wars,
		diplomacy,
	})
	const provinceMeta = new Map<
		string,
		{ name: string | null; wasteland: boolean }
	>()
	for (const [rawId, entry] of Object.entries(provinceEvents)) {
		provinceMeta.set(rawId, {
			name: entry.base.name,
			wasteland: entry.base.wasteland,
		})
	}
	return { provinceMap, cache, minDate, maxDate, provinceMeta, provinceCoords }
}

interface EarthHistoryQuery {
	state: FoldedState
	frame: GenesisFrameFromHistory
}

export function queryEarthHistory(
	engine: EarthHistoryEngine,
	timeDays: number,
	nationReference?: Map<string, RawNationReference>,
	cultureNameById?: Map<string, string>,
	religionNameById?: Map<string, string>,
): EarthHistoryQuery {
	const state = foldAtCheckpoint(engine.cache, timeDays)
	const frame = foldedStateToGenesisFrame(
		state,
		engine.provinceMap,
		nationReference,
		cultureNameById,
		religionNameById,
		engine.provinceCoords,
	)
	return { state, frame }
}

export function queryEarthHistoryNation(
	engine: EarthHistoryEngine,
	timeDays: number,
	tag: string,
): NationInfoFromHistory | null {
	const state = foldAtCheckpoint(engine.cache, timeDays)
	return foldedStateToNationInfo(state, tag)
}
