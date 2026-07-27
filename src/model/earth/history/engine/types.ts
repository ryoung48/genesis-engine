import type { GenesisFrameFromHistory } from "@/model/earth/history/adapter/types"
import type { CheckpointCache } from "@/model/earth/history/checkpoint/types"
import type { RawNationReference } from "@/model/earth/history/data-source/types"
import type {
	EarthHistoryData,
	FoldedState,
} from "@/model/earth/history/fold/types"
import type { Eu4ProvinceMap } from "@/model/earth/history/import/eu4-province-map/types"

export interface EarthHistoryEngine {
	provinceMap: Eu4ProvinceMap
	cache: CheckpointCache
	data: EarthHistoryData
	/** Actual earliest/latest event date found across all loaded data, in the
	 * same day units as date.ts. Used to bound the UI slider to where real
	 * data actually exists instead of the full geo-explorer 2..9999 range,
	 * which is mostly empty and made the slider impractical to scrub. See
	 * docs/earth-history-plan.md "UI wiring plan". */
	minDate: number
	maxDate: number
	/** Raw EU4 province id -> static (time-invariant) name/wasteland flag,
	 * plus area/region/superregion display names from geo-explorer's
	 * area.json/region.json/superregion.json (see build-eu4-geography.py).
	 * Built once at load, not part of the time-varying fold since none of
	 * these fields change with the scrubber. */
	provinceMeta: Map<
		string,
		{
			name: string | null
			wasteland: boolean
			area: string | null
			region: string | null
			superregion: string | null
		}
	>
	/** Raw EU4 province id -> representative point. Used for nation-label
	 * placement when no capital is known -- see adapter.ts. */
	provinceCoords: Map<string, { lon: number; lat: number }>
}

export interface EarthHistoryQuery {
	state: FoldedState
	frame: GenesisFrameFromHistory
}

export interface QueryEarthHistoryParams {
	engine: EarthHistoryEngine
	timeDays: number
	nationReference?: Map<string, RawNationReference>
	cultureNameById?: Map<string, string>
	religionNameById?: Map<string, string>
}

export interface QueryEarthHistoryNationParams {
	engine: EarthHistoryEngine
	timeDays: number
	tag: string
}
