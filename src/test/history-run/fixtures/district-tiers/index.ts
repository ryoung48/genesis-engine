import { DERIVE } from "@/model/history/sim/engine/derive"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { FAMILY } from "@/model/history/sim/people/family"
import { DEJURE } from "@/model/society/dejure"
import { HISTORY_RUN } from "@/test/history-run"
import type {
	DistrictFixture,
	DistrictFixtureParams,
	FixturePersonParams,
	FixtureTitlesParams,
} from "@/test/history-run/fixtures/district-tiers/types"

function titles({ fixture, titles }: FixtureTitlesParams): void {
	const { state, root, members } = fixture
	state.titles = {
		count: titles.length,
		tier: new Uint8Array(state.P),
		seat: new Int32Array(state.P).fill(-1),
		holder: new Int32Array(state.P).fill(-1),
		regionOf: new Int32Array(4 * state.P).fill(-1),
	}
	for (const [id, title] of titles.entries()) {
		state.titles.tier[id] = title.tier
		state.titles.seat[id] = title.seat
		state.titles.holder[id] = root
		for (const p of title.provinces)
			state.titles.regionOf[(title.tier - 1) * state.P + p] = id
	}
	state.titleMembers = DEJURE.membersOf({
		titles: state.titles,
		provinceCount: state.P,
	})
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
	})
	STATE_TITLES.applyDerivedParents({ state, nation: root, members })
	DERIVE.ensureHierarchyClean(state)
}

function create({
	count,
	titles: titleList,
	edges,
	root,
}: DistrictFixtureParams): DistrictFixture {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 3000,
	})
	const rng = HISTORY_RNG.createHistoryRng(1729)
	state.parentCurrent.fill(-1)
	state.people.rulerOf.fill(-1)
	for (const seats of state.people.persons.heldSeats) seats.length = 0
	state.desolate.fill(1)
	state.stateless.fill(1)
	const members = Array.from({ length: count }, (_, p) => p)
	for (const p of members) {
		state.parentCurrent[p] = p === root ? -1 : root
		state.desolate[p] = 0
		state.stateless[p] = 0
		state.popRuralCurrent[p] = 100 + p
		state.popUrbanCurrent[p] = 0
		state.governmentType[p] = GOVERNMENT.getGovIdx().tribal_monarchy
		state.cultureGenderSystems[state.culture[p]] = 0
	}
	const neighbors = Array.from({ length: state.P }, () => [] as number[])
	for (const [a, b] of edges) {
		neighbors[a].push(b)
		neighbors[b].push(a)
	}
	state.provinceAdjOffset = new Int32Array(state.P + 1)
	for (let p = 0; p < state.P; p++)
		state.provinceAdjOffset[p + 1] =
			state.provinceAdjOffset[p] + neighbors[p].length
	state.provinceAdjList = Int32Array.from(neighbors.flat())
	state.hierarchyDirty = true
	state.realmCache.clear()
	state.districtSeat.fill(0)
	state.districtRank.fill(0)
	state.topTier.fill(0)
	const fixture = { state, rng, root, members }
	titles({ fixture, titles: titleList })
	return fixture
}

function person({ fixture, seat, father }: FixturePersonParams): number {
	const { state, rng, root } = fixture
	const person = FAMILY.found({
		people: state.people,
		origin: STATE.originOf({ state, realm: root }),
		time: state.time / STATE.yearMs,
		age: father < 0 ? 50 : 25,
		rank: seat < 0 ? 0 : state.seatRank[seat],
		rng,
	})
	state.people.persons.sex[person] = 0
	state.people.persons.death[person] = state.time / STATE.yearMs + 100
	if (father >= 0) {
		state.people.persons.father[person] = father
		state.people.persons.children[father].push(person)
	}
	if (seat >= 0)
		DISTRICTS.install({ state, seat, person, reason: "district grant" })
	return person
}

export const DISTRICT_FIXTURE = { create, titles, person }
