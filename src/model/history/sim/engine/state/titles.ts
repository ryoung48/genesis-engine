import { DERIVE } from "@/model/history/sim/engine/derive"
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
	RelinkNationsParams,
	SettleProvincesParams,
	SettleTitleSetParams,
	TitleWealthBarParams,
} from "@/model/history/sim/engine/state/types"
import { wealthCurrent } from "@/model/history/sim/engine/state/wealth"
import { RULER } from "@/model/history/sim/ruler"
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
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

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
		ownerOf,
		members,
		root: nation,
		parent: next,
	})
	FIELDS.prov.parent.set({ state, p: nation, value: -1 })
	for (const member of members)
		if (member !== nation && state.parentCurrent[member] >= 0)
			FIELDS.prov.parent.set({ state, p: member, value: -1 })
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
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
		ownerOf: state.sovereignCurrent,
	})
	const affected = new Set<number>()
	const affectedRulers = new Set<number>()
	for (const change of changes) {
		if (change.kind === "passed") {
			affectedRulers.add(change.from)
			affectedRulers.add(change.to)
			state.events.push({
				tag: "title passed",
				time: state.time,
				data: {
					title: change.title,
					from: change.from,
					to: change.to,
					cause: "holding",
				},
			})
			affected.add(change.from)
			affected.add(change.to)
			affected.add(state.sovereignCurrent[state.titles.seat[change.title]])
		} else {
			affectedRulers.add(state.titles.holder[change.title])
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
	RULER.reseat({ state, rulers: affectedRulers })
	relinkNations({ state, nations: affected })
}

function settleProvinces({
	state,
	provinces,
	titles,
}: SettleProvincesParams): void {
	const touched = new Set<number>(titles)
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
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
		ownerOf: state.sovereignCurrent,
	})
}

function titleWealthBar({ state, tier }: TitleWealthBarParams): number {
	const holders = new Set<number>()
	for (let title = 0; title < state.titles.count; title++)
		if (state.titles.tier[title] >= tier && state.titles.holder[title] >= 0)
			holders.add(state.sovereignCurrent[state.titles.holder[title]])
	if (holders.size === 0) return Number.NEGATIVE_INFINITY
	const wealth = [...holders]
		.map((p) => wealthCurrent({ state, p }))
		.sort((a, b) => a - b)
	return wealth[Math.floor(wealth.length / 4)]
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
	if (wealthCurrent({ state, p: nation }) < titleWealthBar({ state, tier }))
		return false
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
}: DissolveLapsedParams & { title: number }): number {
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

export { applyDerivedParents, considerTitles, settleProvinces }
