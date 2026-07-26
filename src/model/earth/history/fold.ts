import type {
	RawDiplomacyEvent,
	RawNationEvents,
	RawNationReference,
	RawOrganizationEvent,
	RawProvinceEvents,
	RawWar,
} from "./data-source"
import type {
	ApplyDiplomacyDeltaParams,
	ApplyOrganizationDeltaParams,
	ComputeActiveWarsParams,
	FoldNationParams,
	FoldParams,
	FoldProvinceParams,
	OrgParams,
} from "./types"

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

interface ActiveWar {
	warId: string
	name: string
	isRebel: boolean
	attackers: Set<string>
	defenders: Set<string>
}

export interface ActiveOrganizationSite {
	orgId: string
	provinceId: string
	name: string
	role: string
}

function normalizeNationTag(tag: string | null | undefined): string | null {
	if (!tag || tag === "---" || tag === "XXX") return null
	return tag
}

function isGenericEarlyGovernmentReform(reformId: string | null | undefined) {
	return !!reformId && /^early_gov_reform_\d+$/.test(reformId)
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

function emptyNationState(): FoldedNationState {
	return {
		currentName: null,
		governmentType: null,
		governmentReform: null,
		ruler: null,
		capitalProvinceId: null,
		overlord: null,
		overlordSubjectType: null,
		vassals: new Set(),
		vassalSubjectTypes: new Map(),
		unionSeniorOf: new Set(),
		unionJuniorPartner: null,
		allies: new Set(),
		guarantees: new Set(),
		royalMarriages: new Set(),
		isEmperor: false,
		isElector: false,
		organizations: new Map(),
	}
}

function foldProvince({
	rawId,
	data,
	fromTime,
	toTime,
	base,
}: FoldProvinceParams): FoldedProvinceState | undefined {
	const entry = data.provinceEvents[rawId]
	if (!entry) return base
	const state: FoldedProvinceState = base
		? { ...base, cores: new Set(base.cores) }
		: {
				owner: normalizeNationTag(entry.base.owner),
				controller: normalizeNationTag(entry.base.controller),
				cultureId: entry.base.culture ?? null,
				religionId: entry.base.religion ?? null,
				cores: new Set(entry.base.cores),
				isHre: false,
			}
	for (const e of entry.events) {
		if (e.date <= fromTime || e.date > toTime) continue
		switch (e.kind) {
			case "owner":
				state.owner = normalizeNationTag(e.payload.tag as string | undefined)
				break
			case "controller":
				state.controller = normalizeNationTag(
					e.payload.tag as string | undefined,
				)
				break
			case "coreAdd":
				state.cores.add(e.payload.tag as string)
				break
			case "coreRemove":
				state.cores.delete(e.payload.tag as string)
				break
			case "culture":
				state.cultureId = e.payload.cultureId as string
				break
			case "religion":
				state.religionId = e.payload.religionId as string
				break
			case "hre":
				state.isHre = e.payload.member as boolean
				break
		}
	}
	return state
}

function foldNation({
	tag,
	data,
	fromTime,
	toTime,
	base,
}: FoldNationParams): FoldedNationState {
	const entry = data.nationEvents[tag]
	const state: FoldedNationState = base
		? {
				...base,
				vassals: new Set(base.vassals),
				vassalSubjectTypes: new Map(base.vassalSubjectTypes),
				unionSeniorOf: new Set(base.unionSeniorOf),
				allies: new Set(base.allies),
				guarantees: new Set(base.guarantees),
				royalMarriages: new Set(base.royalMarriages),
				organizations: new Map(base.organizations),
			}
		: emptyNationState()
	if (!base && entry) {
		state.governmentType =
			data.nationReference?.get(tag)?.initialGovernmentType ?? null
		state.governmentReform =
			entry.base.reforms.findLast(
				(reformId) => !isGenericEarlyGovernmentReform(reformId),
			) ?? null
		state.capitalProvinceId = entry.base.capital
	}
	if (entry) {
		for (const e of entry.events) {
			if (e.date <= fromTime || e.date > toTime) continue
			switch (e.kind) {
				case "governmentChange":
					state.governmentType = e.payload.governmentType as string
					break
				case "governmentReformAdd":
					if (!isGenericEarlyGovernmentReform(e.payload.reformId as string)) {
						state.governmentReform = e.payload.reformId as string
					}
					break
				case "governmentReformRemove":
					if (state.governmentReform === (e.payload.reformId as string)) {
						state.governmentReform = null
					}
					break
				case "rulerChange":
					state.ruler = {
						name: e.payload.name as string,
						dynasty: e.payload.dynasty as string | undefined,
					}
					break
				case "nameChange":
					state.currentName = e.payload.name as string
					break
				case "capitalChange":
					state.capitalProvinceId = e.payload.provinceId as string
					break
				case "elector":
					state.isElector = e.payload.elector as boolean
					break
			}
		}
	}
	return state
}

function applyDiplomacyDelta({
	data,
	fromTime,
	toTime,
	nations,
}: ApplyDiplomacyDeltaParams): void {
	const touched = (tag: string) => {
		let n = nations.get(tag)
		if (!n) {
			n = emptyNationState()
			nations.set(tag, n)
		}
		return n
	}
	for (const e of data.diplomacy) {
		if (e.date <= fromTime || e.date > toTime) continue
		const { firstTag, secondTag } = e.payload
		const first = touched(firstTag)
		const second = touched(secondTag)
		switch (e.kind) {
			case "vassalStart":
				first.vassals.add(secondTag)
				first.vassalSubjectTypes.set(secondTag, "vassal")
				second.overlord = firstTag
				second.overlordSubjectType = "vassal"
				break
			case "vassalEnd":
				first.vassals.delete(secondTag)
				first.vassalSubjectTypes.delete(secondTag)
				if (second.overlord === firstTag) {
					second.overlord = null
					second.overlordSubjectType = null
				}
				break
			case "dependencyStart":
				first.vassals.add(secondTag)
				first.vassalSubjectTypes.set(
					secondTag,
					e.payload.subjectType ?? "subject",
				)
				second.overlord = firstTag
				second.overlordSubjectType = e.payload.subjectType ?? "subject"
				break
			case "dependencyEnd":
				first.vassals.delete(secondTag)
				first.vassalSubjectTypes.delete(secondTag)
				if (second.overlord === firstTag) {
					second.overlord = null
					second.overlordSubjectType = null
				}
				break
			case "allianceStart":
				first.allies.add(secondTag)
				second.allies.add(firstTag)
				break
			case "allianceEnd":
				first.allies.delete(secondTag)
				second.allies.delete(firstTag)
				break
			case "guaranteeStart":
				first.guarantees.add(secondTag)
				break
			case "guaranteeEnd":
				first.guarantees.delete(secondTag)
				break
			case "royalMarriageStart":
				first.royalMarriages.add(secondTag)
				second.royalMarriages.add(firstTag)
				break
			case "royalMarriageEnd":
				first.royalMarriages.delete(secondTag)
				second.royalMarriages.delete(firstTag)
				break
			case "unionStart":
				// firstTag is always the senior/ruling partner (same convention
				// as dependencyStart's firstTag=overlord) -- see the raw
				// diplomacy.json this is sourced from.
				first.unionSeniorOf.add(secondTag)
				second.unionJuniorPartner = firstTag
				break
			case "unionEnd":
				first.unionSeniorOf.delete(secondTag)
				if (second.unionJuniorPartner === firstTag) {
					second.unionJuniorPartner = null
				}
				break
			case "emperorStart":
				first.isEmperor = true
				break
			case "emperorEnd":
				first.isEmperor = false
				break
		}
	}
}

function applyOrganizationDelta({
	data,
	fromTime,
	toTime,
	nations,
	organizationSites,
}: ApplyOrganizationDeltaParams): void {
	for (const e of data.organizationEvents) {
		if (e.date <= fromTime || e.date > toTime) continue
		if (e.kind === "join" || e.kind === "leave") {
			let n = nations.get(e.nationTag)
			if (!n) {
				n = emptyNationState()
				nations.set(e.nationTag, n)
			}
			if (e.kind === "join")
				n.organizations.set(e.payload.orgId, e.payload.role ?? "member")
			else n.organizations.delete(e.payload.orgId)
			continue
		}
		if (e.kind !== "siteStart" && e.kind !== "siteEnd") continue
		const key = `${e.payload.orgId}:${e.provinceId}:${e.payload.role}:${e.payload.name}`
		if (e.kind === "siteStart") {
			organizationSites.set(key, {
				orgId: e.payload.orgId,
				provinceId: e.provinceId,
				name: e.payload.name,
				role: e.payload.role,
			})
		} else {
			organizationSites.delete(key)
		}
	}
}

/** Nation tags currently owning at least one HRE-flagged province, i.e.
 * territorial HRE membership (see FoldedState.hreMemberNations' doc). Full
 * scan of `provinces` every call -- provinces carries every province ever
 * touched cumulatively (via foldProvince's base-chaining), so this is the
 * only way to get a complete current membership set, not just the delta
 * since the last checkpoint. */
function computeHreMemberNations(
	provinces: Map<string, FoldedProvinceState>,
): Set<string> {
	const members = new Set<string>()
	for (const province of provinces.values()) {
		if (province.isHre && province.owner) members.add(province.owner)
	}
	return members
}

/** Reports which nations are actively fighting in each war as of `time`, by
 * replaying add/rem attacker/defender events. Per-province occupation for
 * territory striping is derived separately in adapter.ts from the standard
 * EU4 convention (owner !== controller), not from this war data. */
function computeActiveWars({
	wars,
	time,
}: ComputeActiveWarsParams): ActiveWar[] {
	const active: ActiveWar[] = []
	for (const war of wars) {
		const attackers = new Set<string>()
		const defenders = new Set<string>()
		for (const e of war.events) {
			if (e.date > time) break
			if (e.kind === "warStart") {
				;(e.side === "attacker" ? attackers : defenders).add(e.nationTag)
			} else {
				;(e.side === "attacker" ? attackers : defenders).delete(e.nationTag)
			}
		}
		if (attackers.size > 0 && defenders.size > 0) {
			active.push({
				warId: war.warId,
				name: war.name,
				isRebel: war.isRebel,
				attackers,
				defenders,
			})
		}
	}
	return active
}

/** Raw EU4 province ids currently belonging to an organization's territory
 * at `state`'s time, for the map's territory highlight
 * (eu4-nation-fill-overlay.ts's buildOrgFillGlobe/Map). HRE is territorial --
 * a province counts iff its own `isHre` flag is set, regardless of which
 * nation owns it, so a nation only partially inside the empire highlights
 * just its HRE provinces. Every other organization (e.g. Hanseatic League) is
 * membership-based -- a province counts iff its current owner's nation holds
 * discrete membership (FoldedNationState.organizations), so the highlight
 * follows that nation's full territory, with optional `member_seat` province
 * pins for city-league seats that should remain visible through conquest
 * (e.g. Danzig in HSA). */
export function collectOrgMemberProvinceRawIds({
	state,
	orgId,
}: OrgParams): Set<number> {
	const memberProvinceRawIds = new Set<number>()
	if (orgId === "HRE") {
		for (const [rawId, province] of state.provinces) {
			if (province.isHre) memberProvinceRawIds.add(Number(rawId))
		}
		return memberProvinceRawIds
	}
	const memberTags = new Set<string>()
	for (const [tag, nation] of state.nations) {
		if (nation.organizations.has(orgId)) memberTags.add(tag)
	}
	for (const [rawId, province] of state.provinces) {
		if (province.owner && memberTags.has(province.owner)) {
			memberProvinceRawIds.add(Number(rawId))
		}
	}
	for (const site of state.organizationSites.values()) {
		if (site.orgId === orgId && site.role === "member_seat") {
			memberProvinceRawIds.add(Number(site.provinceId))
		}
	}
	return memberProvinceRawIds
}

/** Nations that currently own at least one of an organization's member
 * provinces but aren't themselves "seated" in it -- i.e. they hold enclave
 * territory without genuinely being part of the organization. Only
 * meaningful for territorial orgs (HRE): a real historical nuance is that
 * Venice's Terraferma mainland (Padua, Verona, ...) stayed formally inside
 * the Empire even after Venice -- never an Imperial Estate, never seated in
 * the Reichstag -- conquered it. The proxy used here is a nation's own
 * capital: a genuine Imperial polity's capital is itself HRE territory,
 * while a foreign conqueror's capital (Venice's own lagoon city, never HRE)
 * isn't. Membership-based orgs (HSA) have no such distinction -- membership
 * there is a discrete relation, not inferred from ownership -- so this
 * always returns empty for them. */
export function collectOrgForeignHolderNations({
	state,
	orgId,
}: OrgParams): Set<string> {
	const foreignHolders = new Set<string>()
	if (orgId !== "HRE") return foreignHolders
	const owners = new Set<string>()
	for (const province of state.provinces.values()) {
		if (province.isHre && province.owner) owners.add(province.owner)
	}
	for (const tag of owners) {
		const capitalRawId = state.nations.get(tag)?.capitalProvinceId
		const capitalIsHre = capitalRawId
			? (state.provinces.get(capitalRawId)?.isHre ?? false)
			: false
		if (!capitalIsHre) foreignHolders.add(tag)
	}
	return foreignHolders
}

/** Folds all events in `(base?.time ?? -Infinity, time]` onto `base` (or a
 * from-scratch state if no base is given). Only touches provinces/nations
 * present in `provinceIds`/`nationTags` -- callers pass the full known set
 * for a from-scratch fold, or just the entities that changed for a delta
 * fold from a checkpoint. */
export function fold({ data, time, options }: FoldParams): FoldedState {
	const fromTime = options.base?.time ?? -Infinity
	const provinces = new Map(options.base?.provinces)
	const nations = new Map(options.base?.nations)
	const organizationSites = new Map(options.base?.organizationSites)

	for (const rawId of options.provinceIds) {
		const next = foldProvince({
			rawId,
			data,
			fromTime,
			toTime: time,
			base: provinces.get(rawId),
		})
		if (next) provinces.set(rawId, next)
	}
	for (const tag of options.nationTags) {
		nations.set(
			tag,
			foldNation({ tag, data, fromTime, toTime: time, base: nations.get(tag) }),
		)
	}
	applyDiplomacyDelta({ data, fromTime, toTime: time, nations })
	applyOrganizationDelta({
		data,
		fromTime,
		toTime: time,
		nations,
		organizationSites,
	})

	return {
		time,
		provinces,
		nations,
		activeWars: computeActiveWars({ wars: data.wars, time }),
		organizationSites,
		hreMemberNations: computeHreMemberNations(provinces),
	}
}
