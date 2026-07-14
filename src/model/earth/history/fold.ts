import type {
	RawDiplomacyEvent,
	RawNationEvents,
	RawProvinceEvents,
	RawWar,
} from "./data-source"

interface FoldedProvinceState {
	owner: string | null
	controller: string | null
	cultureId: string | null
	religionId: string | null
	cores: Set<string>
}

interface FoldedNationState {
	governmentType: string | null
	/** Additive reforms (add_government_reform), stacked onto governmentType
	 * rather than replacing it -- see docs/earth-history-plan.md. */
	reforms: Set<string>
	ruler: { name: string; dynasty?: string } | null
	/** Raw EU4 province id (string) of the nation's current capital, from
	 * history/countries/*.txt's `capital` field (dated changes tracked as
	 * `capitalChange` events). Used to anchor the nation label at the real
	 * capital instead of an arbitrary owned province -- see adapter.ts. */
	capitalProvinceId: string | null
	overlord: string | null
	vassals: Set<string>
	unionWith: Set<string>
	allies: Set<string>
}

interface ActiveWar {
	warId: string
	name: string
	isRebel: boolean
	attackers: Set<string>
	defenders: Set<string>
}

export interface EarthHistoryData {
	provinceEvents: RawProvinceEvents
	nationEvents: RawNationEvents
	wars: RawWar[]
	diplomacy: RawDiplomacyEvent[]
}

export interface FoldedState {
	time: number
	provinces: Map<string, FoldedProvinceState>
	nations: Map<string, FoldedNationState>
	activeWars: ActiveWar[]
}

function emptyNationState(): FoldedNationState {
	return {
		governmentType: null,
		reforms: new Set(),
		ruler: null,
		capitalProvinceId: null,
		overlord: null,
		vassals: new Set(),
		unionWith: new Set(),
		allies: new Set(),
	}
}

function foldProvince(
	rawId: string,
	data: EarthHistoryData,
	fromTime: number,
	toTime: number,
	base: FoldedProvinceState | undefined,
): FoldedProvinceState | undefined {
	const entry = data.provinceEvents[rawId]
	if (!entry) return base
	const state: FoldedProvinceState = base
		? { ...base, cores: new Set(base.cores) }
		: {
				owner: entry.base.owner ?? null,
				controller: entry.base.controller ?? null,
				cultureId: entry.base.culture ?? null,
				religionId: entry.base.religion ?? null,
				cores: new Set(entry.base.cores),
			}
	for (const e of entry.events) {
		if (e.date <= fromTime || e.date > toTime) continue
		switch (e.kind) {
			case "owner":
				state.owner = e.payload.tag as string
				break
			case "controller":
				state.controller = e.payload.tag as string
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
		}
	}
	return state
}

function foldNation(
	tag: string,
	data: EarthHistoryData,
	fromTime: number,
	toTime: number,
	base: FoldedNationState | undefined,
): FoldedNationState {
	const entry = data.nationEvents[tag]
	const state: FoldedNationState = base
		? {
				...base,
				reforms: new Set(base.reforms),
				vassals: new Set(base.vassals),
				unionWith: new Set(base.unionWith),
				allies: new Set(base.allies),
			}
		: emptyNationState()
	if (!base && entry) {
		for (const r of entry.base.reforms) state.reforms.add(r)
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
					state.reforms.add(e.payload.reformId as string)
					break
				case "governmentReformRemove":
					state.reforms.delete(e.payload.reformId as string)
					break
				case "rulerChange":
					state.ruler = {
						name: e.payload.name as string,
						dynasty: e.payload.dynasty as string | undefined,
					}
					break
				case "capitalChange":
					state.capitalProvinceId = e.payload.provinceId as string
					break
			}
		}
	}
	return state
}

function applyDiplomacyDelta(
	data: EarthHistoryData,
	fromTime: number,
	toTime: number,
	nations: Map<string, FoldedNationState>,
): void {
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
				second.overlord = firstTag
				break
			case "vassalEnd":
				first.vassals.delete(secondTag)
				if (second.overlord === firstTag) second.overlord = null
				break
			case "dependencyStart":
				first.vassals.add(secondTag)
				second.overlord = firstTag
				break
			case "dependencyEnd":
				first.vassals.delete(secondTag)
				if (second.overlord === firstTag) second.overlord = null
				break
			case "allianceStart":
				first.allies.add(secondTag)
				second.allies.add(firstTag)
				break
			case "allianceEnd":
				first.allies.delete(secondTag)
				second.allies.delete(firstTag)
				break
			case "unionStart":
				first.unionWith.add(secondTag)
				second.unionWith.add(firstTag)
				break
			case "unionEnd":
				first.unionWith.delete(secondTag)
				second.unionWith.delete(firstTag)
				break
		}
	}
}

/** Reports which nations are actively fighting in each war as of `time`, by
 * replaying add/rem attacker/defender events. Per-province occupation for
 * territory striping is derived separately in adapter.ts from the standard
 * EU4 convention (owner !== controller), not from this war data. */
function computeActiveWars(wars: RawWar[], time: number): ActiveWar[] {
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

/** Folds all events in `(base?.time ?? -Infinity, time]` onto `base` (or a
 * from-scratch state if no base is given). Only touches provinces/nations
 * present in `provinceIds`/`nationTags` -- callers pass the full known set
 * for a from-scratch fold, or just the entities that changed for a delta
 * fold from a checkpoint. */
export function fold(
	data: EarthHistoryData,
	time: number,
	options: {
		base?: FoldedState
		provinceIds: Iterable<string>
		nationTags: Iterable<string>
	},
): FoldedState {
	const fromTime = options.base?.time ?? -Infinity
	const provinces = new Map(options.base?.provinces)
	const nations = new Map(options.base?.nations)

	for (const rawId of options.provinceIds) {
		const next = foldProvince(rawId, data, fromTime, time, provinces.get(rawId))
		if (next) provinces.set(rawId, next)
	}
	for (const tag of options.nationTags) {
		nations.set(tag, foldNation(tag, data, fromTime, time, nations.get(tag)))
	}
	applyDiplomacyDelta(data, fromTime, time, nations)

	return {
		time,
		provinces,
		nations,
		activeWars: computeActiveWars(data.wars, time),
	}
}
