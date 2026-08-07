import type {
	ActiveWar,
	ApplyDiplomacyDeltaParams,
	ApplyOrganizationDeltaParams,
	ComputeActiveWarsParams,
	FoldedNationState,
	FoldedProvinceState,
	FoldedState,
	FoldNationParams,
	FoldParams,
	FoldProvinceParams,
	OrgParams,
} from "@/model/history/earth/fold/types"

function normalizeNationTag(tag: string | null | undefined): string | null {
	if (!tag || tag === "---" || tag === "XXX") return null
	return tag
}

function isGenericEarlyGovernmentReform(reformId: string | null | undefined) {
	return !!reformId && /^early_gov_reform_\d+$/.test(reformId)
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
				baseTax: 0,
				baseProduction: 0,
				baseManpower: 0,
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
			case "baseTax":
				state.baseTax = e.payload.value as number
				break
			case "baseProduction":
				state.baseProduction = e.payload.value as number
				break
			case "baseManpower":
				state.baseManpower = e.payload.value as number
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

function computeHreMemberNations(
	provinces: Map<string, FoldedProvinceState>,
): Set<string> {
	const members = new Set<string>()
	for (const province of provinces.values()) {
		if (province.isHre && province.owner) members.add(province.owner)
	}
	return members
}

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

function collectOrgMemberProvinceRawIds({
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

function collectOrgForeignHolderNations({
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

function fold({ data, time, options }: FoldParams): FoldedState {
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

export const FOLD = {
	collectOrgMemberProvinceRawIds,
	collectOrgForeignHolderNations,
	fold,
}
