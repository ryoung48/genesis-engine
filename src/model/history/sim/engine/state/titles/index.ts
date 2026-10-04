import { DERIVE } from "@/model/history/sim/engine/derive"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { FIELDS } from "@/model/history/sim/engine/fields"
import {
	getNationProvinces,
	rebuildAssignment,
} from "@/model/history/sim/engine/state/hierarchy"
import type {
	ApplyDerivedParentsParams,
	ConsiderTitlesParams,
	DissolveLapsedParams,
	FoundTitleForParams,
	OwnedChildCountParams,
	RefreshHouseholdsParams,
	RelinkNationsParams,
	SettleProvincesParams,
	SettleTitleSetParams,
} from "@/model/history/sim/engine/state/titles/types"
import { PEOPLE } from "@/model/history/sim/people"
import { HOLDINGS } from "@/model/history/sim/people/holdings"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { DEJURE } from "@/model/society/dejure"
import { FOUNDING } from "@/model/society/dejure/founding"
import { HOLDING } from "@/model/society/dejure/holding"
import { TITLES } from "@/model/society/titles"

const TIER_SLOTS = TITLES.tierOrder.length - 1
const FIRST_FOUNDED_TIER = 2
const MIN_FOUNDING_CHILDREN = 2
const LAPSE_YEARS = 25
const BASE_FOUNDING_CHANCE = 0.02
const CLAIM_FOUNDING_CHANCE = 0.02
const TITLE_CREATION_COST_DUCATS: Readonly<Record<number, number>> = {
	2: 625 / 36,
	3: 625 / 18,
	4: 625 / 9,
}
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

function refreshHouseholds({
	state,
	previousRanks,
}: RefreshHouseholdsParams): void {
	const holders = new Set<number>()
	for (let seat = 0; seat < state.P; seat++) {
		if (
			previousRanks[seat] === state.seatRank[seat] ||
			state.people.rulerOf[seat] < 0
		)
			continue
		holders.add(state.people.rulerOf[seat])
		if (state.seatRank[seat] === 0 && state.parentCurrent[seat] >= 0)
			PEOPLE.vacate({
				people: state.people,
				seat,
				reason: "territorial change",
			})
	}

	for (const person of holders) {
		HOUSEHOLD.seatChanged({ people: state.people, person })
		PEOPLE.raise({
			people: state.people,
			person,
			rank:
				HOLDINGS.standing({
					people: state.people,
					person,
					ranks: state.seatRank,
				}) - 1,
		})
	}
}

function applyDerivedParents({
	state,
	nation,
	members,
}: ApplyDerivedParentsParams): void {
	DERIVE.ensureHierarchyClean(state)
	const ownerOf = state.sovereignCurrent.slice()
	for (const member of members) ownerOf[member] = nation
	const next = new Int32Array(state.P).fill(-1)
	DEJURE.deriveParents({
		titles: state.titles,
		provinceCount: state.P,
		rank: state.seatRank,
		ownerOf,
		members,
		root: nation,
		parent: next,
	})
	FIELDS.prov.parent.set({ state, p: nation, value: -1 })
	const ordered = members
		.filter((member) => member !== nation)
		.sort((a, b) => state.seatRank[b] - state.seatRank[a] || a - b)
	for (const member of ordered)
		FIELDS.prov.parent.set({ state, p: member, value: next[member] })
}

function relinkNations({ state, nations }: RelinkNationsParams): void {
	for (const nation of nations) {
		if (nation < 0 || state.sovereignCurrent[nation] !== nation) continue
		applyDerivedParents({
			state,
			nation,
			members: getNationProvinces({ state, root: nation }).filter(
				(p) => !state.desolate[p],
			),
		})
	}
	rebuildAssignment({ state })
}

function settleTitleSet({ state, touched }: SettleTitleSetParams): void {
	DERIVE.ensureHierarchyClean(state)
	const changes = HOLDING.settleTitles({
		titles: state.titles,
		members: state.titleMembers,
		provinceCount: state.P,
		ownerOf: state.sovereignCurrent,
		rank: state.seatRank,
		habitability: state.habitability,
		urbanPop: state.popUrbanCurrent,
		waterAccess: state.waterAccess,
		touched,
	})
	if (changes.length === 0) return
	const previousRanks = state.seatRank
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
	})
	refreshHouseholds({ state, previousRanks })
	const affected = new Set<number>()
	for (const change of changes) {
		if (change.kind === "passed") {
			state.events.push({
				tag: "title passed",
				time: state.time,
				data: { title: change.title, from: change.from, to: change.to },
			})
			affected.add(change.from)
			affected.add(change.to)
			affected.add(state.sovereignCurrent[state.titles.seat[change.title]])
		} else {
			state.events.push({
				tag: "capital moved",
				time: state.time,
				data: {
					title: change.title,
					from: change.from,
					to: change.to,
					cause: change.cause,
				},
			})
			affected.add(state.sovereignCurrent[change.from])
			affected.add(state.sovereignCurrent[change.to])
		}
	}
	relinkNations({ state, nations: affected })
}

function settleProvinces({ state, provinces }: SettleProvincesParams): void {
	const touched = new Set<number>()
	for (const province of provinces)
		for (let tier = 1; tier <= TIER_SLOTS; tier++) {
			const title = DEJURE.titleAt({
				titles: state.titles,
				provinceCount: state.P,
				tier,
				province,
			})
			if (title >= 0) touched.add(title)
		}
	settleTitleSet({ state, touched })
}

function refreshTitleIndex({ state }: DissolveLapsedParams): void {
	state.titleMembers = DEJURE.membersOf({
		titles: state.titles,
		provinceCount: state.P,
	})
	const previousRanks = state.seatRank
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
	})
	refreshHouseholds({ state, previousRanks })
}

function foundTitleFor({
	state,
	nation,
	tier,
	rng,
}: FoundTitleForParams): boolean {
	const children = FOUNDING.fullyHeldChildren({
		titles: state.titles,
		members: state.titleMembers,
		provinceCount: state.P,
		ownerOf: state.sovereignCurrent,
		holder: nation,
		tier,
		orphansOnly: true,
	})
	if (children.length < MIN_FOUNDING_CHILDREN) return false
	const cost = TITLE_CREATION_COST_DUCATS[tier]
	const treasury = FIELDS.prov.treasury.get({ state, p: nation })
	if (treasury < cost) return false
	const claim = state.leaderClaimCurrent[nation]
	if (rng.random() >= BASE_FOUNDING_CHANCE + CLAIM_FOUNDING_CHANCE * claim)
		return false
	const founded = FOUNDING.found({
		titles: state.titles,
		members: state.titleMembers,
		provinceCount: state.P,
		ownerOf: state.sovereignCurrent,
		rank: state.seatRank,
		habitability: state.habitability,
		urbanPop: state.popUrbanCurrent,
		waterAccess: state.waterAccess,
		holder: nation,
		tier,
		children,
	})
	if (!founded) return false
	FIELDS.prov.treasury.set({ state, p: nation, value: treasury - cost })
	const budget = TREASURY_BUDGET.get({ state, p: nation })
	budget.titleCreationExpenses -= cost
	budget.otherChangesTotal -= cost
	state.titleFounded[founded.title] = 1
	state.titleLapseSince[founded.title] = -1
	refreshTitleIndex({ state, nation })
	state.events.push({
		tag: "title created",
		time: state.time,
		data: {
			title: founded.title,
			tier: founded.tier,
			seat: founded.seat,
			holder: founded.holder,
			children: founded.children,
			ancestors: founded.ancestors,
		},
	})
	settleTitleSet({ state, touched: new Set(founded.sources) })
	relinkNations({ state, nations: [nation] })
	return true
}

function ownedChildCount({
	state,
	nation,
	title,
}: OwnedChildCountParams): number {
	const tier = state.titles.tier[title]
	return FOUNDING.fullyHeldChildren({
		titles: state.titles,
		members: state.titleMembers,
		provinceCount: state.P,
		ownerOf: state.sovereignCurrent,
		holder: nation,
		tier,
		orphansOnly: false,
	}).filter(
		(child) =>
			DEJURE.titleAt({
				titles: state.titles,
				provinceCount: state.P,
				tier,
				province: state.titles.seat[child],
			}) === title,
	).length
}

function dissolveLapsed({ state, nation }: DissolveLapsedParams): void {
	for (let title = 0; title < state.titles.count; title++) {
		if (!state.titleFounded[title] || state.titles.holder[title] !== nation)
			continue
		if (ownedChildCount({ state, nation, title }) >= MIN_FOUNDING_CHILDREN) {
			state.titleLapseSince[title] = -1
			continue
		}
		if (state.titleLapseSince[title] < 0) {
			state.titleLapseSince[title] = state.time
			continue
		}
		if (state.time - state.titleLapseSince[title] < LAPSE_YEARS * YEAR_MS)
			continue
		const dissolved = FOUNDING.dissolve({
			titles: state.titles,
			members: state.titleMembers,
			provinceCount: state.P,
			title,
		})
		state.titleFounded[title] = 0
		refreshTitleIndex({ state, nation })
		state.events.push({
			tag: "title destroyed",
			time: state.time,
			data: {
				title,
				tier: dissolved.tier,
				children: dissolved.children,
				ancestors: dissolved.ancestors,
			},
		})
		relinkNations({ state, nations: [nation] })
	}
}

function considerTitles({ state, nation, rng }: ConsiderTitlesParams): void {
	dissolveLapsed({ state, nation })
	for (let tier = FIRST_FOUNDED_TIER; tier <= TIER_SLOTS; tier++)
		if (foundTitleFor({ state, nation, tier, rng })) break
}

export const STATE_TITLES = {
	applyDerivedParents,
	considerTitles,
	settleProvinces,
}
