import type {
	RawDiplomacyEvent,
	RawNationEvents,
	RawNationReference,
	RawOrganizationEvent,
	RawProvinceEvents,
	RawWar,
} from "@/model/history/earth/data-source/types"

export interface FoldedProvinceState {
	owner: string | null
	controller: string | null
	cultureId: string | null
	religionId: string | null
	cores: Set<string>
	/** Whether the province is currently part of the Holy Roman Empire, from
	 * EU4 province history's `hre` field (base/dated changes tracked the same
	 * way as owner/culture/religion). */
	isHre: boolean
}

export interface FoldedNationState {
	currentName: string | null
	governmentType: string | null
	/** Current government reform. Earth-history data here only supports one
	 * active reform at a time for a nation. */
	governmentReform: string | null
	ruler: { name: string; dynasty?: string } | null
	/** Raw EU4 province id (string) of the nation's current capital, from
	 * history/countries/*.txt's `capital` field (dated changes tracked as
	 * `capitalChange` events). Used to anchor the nation label at the real
	 * capital instead of an arbitrary owned province -- see adapter.ts. */
	capitalProvinceId: string | null
	overlord: string | null
	overlordSubjectType: string | null
	vassals: Set<string>
	vassalSubjectTypes: Map<string, string>
	/** Junior partners of a personal union this nation is the senior/ruling
	 * side of -- same "who's subordinate to us" role vassals plays for
	 * dependencyStart/End. */
	unionSeniorOf: Set<string>
	/** The senior partner of a personal union this nation is the junior/
	 * subordinate side of, or null -- same role overlord plays for
	 * dependencyStart/End. Diplomacy events' unionStart nationTag/firstTag is
	 * always the senior partner (see docs/earth-history-plan.md / raw
	 * diplomacy.json), so this direction is recoverable straight from the
	 * event rather than guessed. */
	unionJuniorPartner: string | null
	allies: Set<string>
	guarantees: Set<string>
	royalMarriages: Set<string>
	/** Whether this nation currently holds the Holy Roman Emperor title, from
	 * diplomacy.json's emperorStart/emperorEnd events (sourced from
	 * geo-explorer's hand-curated hre.json, not EU4's own country history --
	 * see convert_emperors in build-eu4-history-events.py). */
	isEmperor: boolean
	/** Whether this nation currently holds Imperial Elector status, from
	 * geo-explorer's countries.json (a dated `elector` boolean per country --
	 * see _load_elector_transitions in build-eu4-history-events.py). Combined
	 * with governmentType/governmentReform to classify HRE membership into
	 * Prince-Elector vs. Archbishop-Elector (see resolveHreEstateCategory in
	 * organization-categories.ts). */
	isElector: boolean
	/** International organizations (by id, e.g. "HSA") this nation currently
	 * holds discrete join/leave membership in, mapped to its role within that
	 * org -- see organizations.json / convert_organizations. Most orgs only
	 * ever use the plain "member" role (matching organization-categories.ts'
	 * HSA-style single-category schema); orgs with sub-categories (e.g. the
	 * Guelphs and Ghibellines org's "guelphLeader"/"guelphMember"/
	 * "ghibellineLeader"/"ghibellineMember") use role to pick which one
	 * applies. Does NOT include HRE membership, which is territorial rather
	 * than a discrete relation -- see FoldedState's hreMemberNations, computed
	 * separately from province ownership. */
	organizations: Map<string, string>
}

export interface ActiveWar {
	warId: string
	name: string
	isRebel: boolean
	attackers: Set<string>
	defenders: Set<string>
}

interface ActiveOrganizationSite {
	orgId: string
	provinceId: string
	name: string
	role: string
}

export interface EarthHistoryData {
	provinceEvents: RawProvinceEvents
	nationEvents: RawNationEvents
	nationReference?: Map<string, RawNationReference>
	wars: RawWar[]
	diplomacy: RawDiplomacyEvent[]
	organizationEvents: RawOrganizationEvent[]
}

export interface FoldedState {
	time: number
	provinces: Map<string, FoldedProvinceState>
	nations: Map<string, FoldedNationState>
	activeWars: ActiveWar[]
	/** Active province-level organization sites (e.g. Hanseatic kontors).
	 * These are not member states and do not affect member-territory
	 * highlighting; they are separate places associated with an organization. */
	organizationSites: Map<string, ActiveOrganizationSite>
	/** Nation tags that currently own at least one HRE-flagged province --
	 * HRE membership is territorial (see FoldedProvinceState.isHre), not a
	 * discrete per-nation relation, so unlike organizations.json's
	 * join/leave events (folded onto FoldedNationState.organizations) this
	 * is recomputed fresh from province state on every fold. */
	hreMemberNations: Set<string>
}

export interface FoldProvinceParams {
	rawId: string
	data: EarthHistoryData
	fromTime: number
	toTime: number
	base: FoldedProvinceState | undefined
}

export interface FoldNationParams {
	tag: string
	data: EarthHistoryData
	fromTime: number
	toTime: number
	base: FoldedNationState | undefined
}

export interface ApplyDiplomacyDeltaParams {
	data: EarthHistoryData
	fromTime: number
	toTime: number
	nations: Map<string, FoldedNationState>
}

export interface ApplyOrganizationDeltaParams {
	data: EarthHistoryData
	fromTime: number
	toTime: number
	nations: Map<string, FoldedNationState>
	organizationSites: Map<string, ActiveOrganizationSite>
}

export interface ComputeActiveWarsParams {
	wars: RawWar[]
	time: number
}

export interface FoldParams {
	data: EarthHistoryData
	time: number
	options: {
		base?: FoldedState
		provinceIds: Iterable<string>
		nationTags: Iterable<string>
	}
}

export interface OrgParams {
	state: FoldedState
	orgId: string
}
