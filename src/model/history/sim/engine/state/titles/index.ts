import { DERIVE } from "@/model/history/sim/engine/derive"
import { FIELDS } from "@/model/history/sim/engine/fields"
import {
	getNationProvinces,
	rebuildAssignment,
} from "@/model/history/sim/engine/state/hierarchy"
import type {
	ApplyDerivedParentsParams,
	DissolveLapsedParams,
	DissolveTitleParams,
	ElectFoundingParams,
	Founding,
	FoundParams,
	OwnedChildCountParams,
	QualifyingParams,
	RelinkNationsParams,
	SeatParams,
	SettleProvincesParams,
	SettleTitleSetParams,
	TopTierParams,
} from "@/model/history/sim/engine/state/titles/types"
import { DEJURE } from "@/model/society/dejure"
import { FOUNDING } from "@/model/society/dejure/founding"
import type { QualifiedFounding } from "@/model/society/dejure/founding/types"
import { HOLDING } from "@/model/society/dejure/holding"
import { TITLES } from "@/model/society/titles"

const TIER_SLOTS = TITLES.tierOrder.length - 1
const FIRST_FOUNDED_TIER = 1
const LAPSE_YEARS = 25
const BASE_FOUNDING_CHANCE = 0.02
const CLAIM_FOUNDING_CHANCE = 0.02
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

function isDistrictSeat({ state, seat }: SeatParams): boolean {
	const parent = state.parentCurrent[seat]
	return (
		parent >= 0 &&
		parent === state.sovereignCurrent[seat] &&
		state.districtSeat[seat] === 1 &&
		!state.desolate[seat]
	)
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
	const top = DEJURE.deriveParents({
		titles: state.titles,
		provinceCount: state.P,
		rank: state.seatRank,
		ownerOf,
		members,
		root: nation,
		parent: next,
		district: state.districtSeat,
		adjOffset: state.provinceAdjOffset,
		adjList: state.provinceAdjList,
	})
	state.topTier[nation] = top
	for (const member of members)
		if (state.districtSeat[member]) state.districtRank[member] = top - 1
	FIELDS.prov.parent.set({ state, p: nation, value: -1 })
	const depthOf = (member: number): number => {
		let depth = 0
		for (let at = next[member]; at >= 0 && depth <= state.P; at = next[at])
			depth++
		return depth
	}
	const depths = new Map(members.map((member) => [member, depthOf(member)]))
	const ordered = members
		.filter((member) => member !== nation)
		.sort(
			(a, b) =>
				(depths.get(a) ?? 0) - (depths.get(b) ?? 0) ||
				state.seatRank[b] - state.seatRank[a] ||
				a - b,
		)
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
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
	})
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

function refreshTitleIndex({ state }: QualifyingParams): void {
	state.titleMembers = DEJURE.membersOf({
		titles: state.titles,
		provinceCount: state.P,
	})
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
	})
}

function found({ state, nation, founding }: FoundParams): boolean {
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
		tier: founding.tier,
		children: founding.children,
	})
	if (!founded) return false
	if (founded.tier === 1)
		for (const province of founded.children) state.duchyGap[province] = 0
	state.titleFounded[founded.title] = 1
	state.titleLapseSince[founded.title] = -1
	refreshTitleIndex({ state })
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
	if (tier === 1) {
		let owned = 0
		for (
			let i = state.titleMembers.offset[title];
			i < state.titleMembers.offset[title + 1];
			i++
		)
			if (state.sovereignCurrent[state.titleMembers.list[i]] === nation) owned++
		return owned
	}
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

// Destroys one title and returns the sovereigns that held it or owned its land.
function dissolve({ state, title }: DissolveTitleParams): number[] {
	const affected = new Set([state.titles.holder[title]])
	for (
		let i = state.titleMembers.offset[title];
		i < state.titleMembers.offset[title + 1];
		i++
	) {
		const province = state.titleMembers.list[i]
		affected.add(state.sovereignCurrent[province])
		if (state.titles.tier[title] === 1) state.duchyGap[province] = 1
	}
	const dissolved = FOUNDING.dissolve({
		titles: state.titles,
		members: state.titleMembers,
		provinceCount: state.P,
		title,
	})
	state.titleFounded[title] = 0
	refreshTitleIndex({ state })
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
	return [...affected].filter((nation) => nation >= 0)
}

function dissolveLapsed({ state, nation }: DissolveLapsedParams): void {
	for (let title = 0; title < state.titles.count; title++) {
		if (!state.titleFounded[title] || state.titles.holder[title] !== nation)
			continue
		if (ownedChildCount({ state, nation, title }) >= FOUNDING.minChildren) {
			state.titleLapseSince[title] = -1
			continue
		}
		if (state.titleLapseSince[title] < 0) {
			state.titleLapseSince[title] = state.time
			continue
		}
		if (state.time - state.titleLapseSince[title] < LAPSE_YEARS * YEAR_MS)
			continue
		dissolve({ state, title })
		relinkNations({ state, nations: [nation] })
	}
}

function duchyGroups({ state }: QualifyingParams): Map<number, number[]> {
	return FOUNDING.duchyGroups({
		titles: state.titles,
		provinceCount: state.P,
		ownerOf: state.sovereignCurrent,
		gap: state.duchyGap,
		adjOffset: state.provinceAdjOffset,
		adjList: state.provinceAdjList,
		habitability: state.habitability,
		urbanPop: state.popUrbanCurrent,
		waterAccess: state.waterAccess,
	})
}

// The tiers the realm qualifies to found at, lowest first, from a scan of its
// own titles.
function qualified({ state, nation }: DissolveLapsedParams): Founding[] {
	const result: Founding[] = []
	const duchy = duchyGroups({ state }).get(nation)
	for (let tier = FIRST_FOUNDED_TIER; tier <= TIER_SLOTS; tier++) {
		const children =
			tier === 1
				? (duchy ?? [])
				: FOUNDING.fullyHeldChildren({
						titles: state.titles,
						members: state.titleMembers,
						provinceCount: state.P,
						ownerOf: state.sovereignCurrent,
						holder: nation,
						tier,
						orphansOnly: true,
					})
		if (FOUNDING.qualifies({ members: state.titleMembers, children, tier }))
			result.push({ tier, children })
	}
	return result
}

// Every realm's qualifying tiers from one sweep of the registry.
function qualifying({ state }: QualifyingParams): QualifiedFounding[] {
	DERIVE.ensureHierarchyClean(state)
	const founding = FOUNDING.qualifying({
		titles: state.titles,
		members: state.titleMembers,
		provinceCount: state.P,
		ownerOf: state.sovereignCurrent,
	})
	for (const [holder, children] of duchyGroups({ state }))
		founding.push({ holder, tier: 1, children })
	return founding.sort((a, b) => a.holder - b.holder || a.tier - b.tier)
}

// The lowest qualifying tier the realm can pay for and rolls well on; a tier
// it cannot pay for takes no roll.
function electFounding({
	state,
	nation,
	rng,
	permits,
	qualified,
}: ElectFoundingParams): Founding | null {
	const chance =
		BASE_FOUNDING_CHANCE +
		CLAIM_FOUNDING_CHANCE * state.leaderClaimCurrent[nation]
	for (const founding of qualified)
		if (permits(founding.tier) && rng.random() < chance) return founding
	return null
}

function topTier({ state, realm }: TopTierParams): number {
	return state.topTier[realm]
}

export const STATE_TITLES = {
	topTier,
	applyDerivedParents,
	lapse: dissolveLapsed,
	qualified,
	qualifying,
	electFounding,
	dissolve,
	relink: relinkNations,
	found,
	isDistrictSeat,
	settleProvinces,
}
