import type { RawNationReference } from "@/model/history/earth/data-source/types"
import type { FoldedState } from "@/model/history/earth/fold/types"
import type { Eu4ProvinceMap } from "@/model/history/earth/import/eu4-province-map/types"
import type { LonLat } from "@/model/history/earth/types"
import type { PoliticalMapWar } from "@/ui/genesis/political/political-conflict-display"

export interface GenesisFrameFromHistory {
	/** Per compact province index: internal nation id, or -1 if unowned. */
	assignment: Int32Array
	/** Per compact province index: culture id, or null. */
	cultureByProvince: (string | null)[]
	/** Per compact province index: religion id, or null. */
	religionByProvince: (string | null)[]
	nationIds: Map<string, number>
	/** Per nation id: the compact province index to anchor the nation label
	 * at. Prefers the real capital (history/countries/*.txt's `capital`
	 * field, tracked over time as `capitalChange` events) when that
	 * province is currently owned by the same nation; otherwise falls back
	 * to the owned province geographically closest to the centroid of all
	 * its owned provinces (see provinceCoords param) -- important for
	 * tags with no capital data at all (e.g. Cliopatria-sourced pre-2AD
	 * polities), where the naive "first scanned" index could land on the
	 * edge of a nation's territory instead of somewhere central. Falls
	 * back further to whatever was scanned first if coordinates are
	 * missing for every owned province. Matches the shape of the
	 * procedural world.nations.seeds array so nation-label placement
	 * (nation-label-overlay.ts's nationCapitalRegion) works unmodified
	 * against a shadow world built from this frame. -1 for an id with no
	 * owned provinces (shouldn't normally happen). */
	seeds: Int32Array
	/** Per nation id: display name, from reference/nations.json when
	 * available, falling back to the raw EU4 tag. */
	names: string[]
	/** `occupied` follows EU4 convention: a province is occupied whenever its
	 * controller differs from its owner. We track both fields per province
	 * (see FoldedProvinceState), so this needs no extra siege/occupation
	 * data beyond what's already converted from owner/controller events. */
	activeWars: PoliticalMapWar[]
	/** Per compact province index: culture partition id, or -1. Paired with
	 * cultureNames for the culture map-mode label overlay (see
	 * buildGlobePartitionLabels in nation-label-overlay.ts) -- a different id
	 * space from the procedural world.cultures.assignment, so it can't reuse
	 * that field/the buildGlobeCultureLabels wrapper. */
	cultureAssignment: Int32Array
	cultureCount: number
	cultureNames: string[]
	/** Same shape as culture, for religion -- which has no procedural
	 * label-overlay equivalent at all (world.religions is culture-indexed,
	 * not province-indexed, and there is no buildGlobeReligionLabels in the
	 * procedural system). */
	religionAssignment: Int32Array
	religionCount: number
	religionNames: string[]
}

export interface NationInfoFromHistory {
	tag: string
	name: string | null
	governmentType: string | null
	governmentReform: string | null
	ruler: { name: string; dynasty?: string } | null
	overlord: string | null
	overlordSubjectType: string | null
	vassals: string[]
	vassalSubjectTypes: Array<{ tag: string; subjectType: string }>
	unionSeniorOf: string[]
	unionJuniorPartner: string | null
	allies: string[]
	guarantees: string[]
	royalMarriages: string[]
	atWar: {
		warId: string
		name: string
		isRebel: boolean
		asAttacker: boolean
	}[]
}

export interface FoldedStateToGenesisFrameParams {
	state: FoldedState
	provinceMap: Eu4ProvinceMap
	nationReference?: Map<string, RawNationReference>
	cultureNameById?: Map<string, string>
	religionNameById?: Map<string, string>
	provinceCoords?: Map<string, LonLat>
}

export interface FindCentroidNearestProvinceParams {
	owned: number[]
	provinceMap: Eu4ProvinceMap
	provinceCoords: Map<string, LonLat>
}

export interface FoldedStateToNationInfoParams {
	state: FoldedState
	tag: string
}
