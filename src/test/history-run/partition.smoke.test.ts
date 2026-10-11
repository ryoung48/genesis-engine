import { expect, it, vi } from "vitest"
import { RULER_NAMES } from "@/model/history/record/rulers"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { PARTITION } from "@/model/history/sim/engine/events/succession/partition"
import type { PartitionNoteData } from "@/model/history/sim/engine/events/succession/partition/types"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import type { SuccessionChoice } from "@/model/history/sim/engine/events/succession/systems/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { SIM_RECORD } from "@/model/history/sim/record"
import type { SharedRng } from "@/model/shared/random/rng"
import { DEJURE } from "@/model/society/dejure"
import { HOLDING } from "@/model/society/dejure/holding"
import type { GovernmentType } from "@/model/society/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { DISTRICT_FIXTURE } from "@/test/history-run/fixtures/district-tiers"
import { PARTITION_REPORT } from "@/test/history-run/report/partition"

interface Fixture {
	state: HistoryState
	world: SerializedGenesisWorld
	rng: SharedRng
	realm: number
	// District seats, best first: higher tier, then larger population.
	seats: number[]
	provinces: number[]
}

function districtSeats({
	state,
	realm,
}: {
	state: HistoryState
	realm: number
}): number[] {
	return STATE.getChildren({ state, p: realm })
		.filter(
			(seat) =>
				STATE_TITLES.isDistrictSeat({ state, seat }) &&
				state.seatRank[seat] > 0,
		)
		.sort(
			(a, b) =>
				state.seatRank[b] - state.seatRank[a] ||
				STATE.getNationPopulation({ state, root: b }) -
					STATE.getNationPopulation({ state, root: a }) ||
				a - b,
		)
}

// Direct children of the realm that lose their link to the root once the
// given seats' subtrees leave it.
function cutOff({
	state,
	realm,
	removed,
}: {
	state: HistoryState
	realm: number
	removed: number[]
}): number[] {
	const gone = new Set(
		removed.flatMap((seat) => STATE.getNationProvinces({ state, root: seat })),
	)
	const reached = new Set([realm])
	const queue = [realm]
	while (queue.length > 0) {
		const current = queue.pop() as number
		for (const neighbor of STATE.getProvinceNeighbors({ state, p: current })) {
			if (
				reached.has(neighbor) ||
				gone.has(neighbor) ||
				state.sovereignCurrent[neighbor] !== realm
			)
				continue
			reached.add(neighbor)
			queue.push(neighbor)
		}
	}
	return STATE.getChildren({ state, p: realm }).filter(
		(child) => !gone.has(child) && !reached.has(child),
	)
}

function quiet({ state, realm }: { state: HistoryState; realm: number }) {
	return (
		!state.desolate[realm] &&
		STATE.isSovereign({ state, p: realm }) &&
		state.provinceWars[realm].length === 0 &&
		!STATE.getRulerRelation({ state, nation: realm }) &&
		STATE.getNationProvinces({ state, root: realm }).every(
			(p) => state.occupationCurrent[p] < 0,
		)
	)
}

function refOf({ state, p }: { state: HistoryState; p: number }) {
	return STATE_RULERS.ref({ state, ruler: STATE_RULERS.read({ state, p }) })
}

// A quiet realm with the wanted number of district seats, a patrilineal
// culture and the given government.
function fixture({
	districts,
	government,
	accept,
}: {
	districts: number
	government: GovernmentType
	// [JUSTIFICATION] Most cases take the first realm that has enough seats.
	accept?: (candidate: { state: HistoryState; realm: number }) => boolean
}): Fixture {
	const { engine: state, generated } = HISTORY_RUN.createEngine({
		seed: 14963993,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const rng = HISTORY_RNG.createHistoryRng(1729)
	let realm = -1
	for (let p = 0; p < state.P && realm < 0; p++) {
		if (!quiet({ state, realm: p })) continue
		const top = STATE_TITLES.topTier({ state, realm: p })
		if (
			Array.from(state.titles.holder).filter(
				(holder, title) => holder === p && state.titles.tier[title] === top,
			).length > 1
		)
			continue
		const seats = districtSeats({ state, realm: p })
		if (!accept && districts > 0 && top > 0) {
			const title = DEJURE.titleAt({
				titles: state.titles,
				provinceCount: state.P,
				tier: top,
				province: p,
			})
			if (title < 0) continue
			const removed = new Set(
				seats
					.slice(0, districts)
					.flatMap((seat) => STATE.getNationProvinces({ state, root: seat })),
			)
			const members = state.titleMembers.list.subarray(
				state.titleMembers.offset[title],
				state.titleMembers.offset[title + 1],
			)
			const retained = members.filter(
				(province) =>
					state.sovereignCurrent[province] === p && !removed.has(province),
			).length
			if (
				HOLDING.nextHolder({
					counts: { total: members.length, byOwner: new Map([[p, retained]]) },
					tier: top,
				}) !== p
			)
				continue
		}
		const fits = accept
			? accept({ state, realm: p })
			: seats.length >= districts &&
				cutOff({ state, realm: p, removed: seats.slice(0, districts) })
					.length === 0
		if (fits) realm = p
	}
	if (realm < 0) throw new Error("no realm fits the case")
	state.governmentType[realm] = GOVERNMENT.getGovIdx()[government]
	state.cultureGenderSystems[state.culture[realm]] =
		GENDER_SYSTEM.cultureGenderSystem.PATRIARCHAL
	STATE.foundRuler({
		state,
		p: realm,
		ruler: { dynasty: -1, age: "fresh", claim: 3 },
		rng,
	})
	return {
		state,
		world: generated as unknown as SerializedGenesisWorld,
		rng,
		realm,
		seats: districtSeats({ state, realm }),
		provinces: STATE.getNationProvinces({ state, root: realm }),
	}
}

// The late ruler dies and the succession system rolls the given choice.
function succeed({
	fx,
	choice,
}: {
	fx: Fixture
	choice: Partial<SuccessionChoice>
}): void {
	const { state, realm, rng } = fx
	const forced: SuccessionChoice = {
		system: "single_heir",
		house: "same",
		claim: 3,
		age: "inherited",
		juniors: 0,
		interregnum: false,
		daughterLine: false,
		...choice,
	}
	const spy = vi.spyOn(SUCCESSION_SYSTEMS, "choose").mockReturnValue(forced)
	try {
		SUCCESSION.runSuccession({
			state,
			realm,
			leaderIdx: state.leaderRuntime.idx[realm],
			rng,
		})
	} finally {
		spy.mockRestore()
	}
	invariants(fx)
}

function partitionNote(fx: Fixture): PartitionNoteData {
	const found = fx.state.events.findLast(
		(note) => note.tag === "partition" && note.data.nation === fx.realm,
	)
	if (!found) throw new Error("the realm was not divided")
	return found.data as PartitionNoteData
}

function skipReason(fx: Fixture): unknown {
	return fx.state.events.findLast(
		(note) => note.tag === "partition skipped" && note.data.nation === fx.realm,
	)?.data.reason
}

function invariants({ state, provinces }: Fixture): void {
	for (const p of provinces) {
		if (!STATE.isSovereign({ state, p })) continue
		expect(state.leaderRuntime.rulerId[p]).toBeGreaterThanOrEqual(0)
		expect(state.leaderRuntime.death[p]).toBeGreaterThan(
			state.leaderRuntime.birth[p],
		)
	}
	STATE.validateLiveHierarchy({ state, context: "partition test" })
	const note = state.events.findLast((entry) => entry.tag === "partition")
	if (!note) return
	const data = note.data as PartitionNoteData
	expect(data.realmProvinces.reduce((sum, count) => sum + count, 0)).toBe(
		data.provincesBefore,
	)
	expect(
		data.realmPopulation.reduce((sum, count) => sum + count, 0),
	).toBeCloseTo(data.populationBefore, 3)
}

it("leaves a monarchy whole", () => {
	const fx = fixture({ districts: 2, government: "feudal_monarchy" })
	succeed({ fx: fx, choice: { juniors: 2 } })
	expect(
		fx.state.events.some(
			(note) => note.tag === "partition" || note.tag === "partition skipped",
		),
	).toBe(false)
}, 120000)

it("skips a partitioning realm whose heir has no brothers", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	succeed({ fx: fx, choice: { juniors: 0 } })
	expect(skipReason(fx)).toBe("no junior heir")
}, 120000)

it("gives the best district to the younger son and keeps the rest", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, seats } = fx
	FIELDS.prov.treasury.set({ state, p: realm, value: 1000 })
	state.governmentType[seats[0]] = GOVERNMENT.getGovIdx().feudal_monarchy
	const house = state.leaderDynCurrent[realm]
	succeed({ fx: fx, choice: { juniors: 1 } })
	expect(STATE.isSovereign({ state, p: seats[0] })).toBe(true)
	expect(state.leaderDynCurrent[seats[0]]).toBe(house)
	expect(state.leaderClaimCurrent[seats[0]]).toBe(3)
	expect(state.leaderRuntime.rulerId[seats[0]]).not.toBe(
		state.leaderRuntime.rulerId[realm],
	)
	expect(state.sovereignCurrent[seats[1]]).toBe(realm)
	expect(state.governmentType[seats[0]]).toBe(
		GOVERNMENT.getGovIdx().tribal_monarchy,
	)
	expect(
		FIELDS.prov.treasury.get({ state, p: realm }) +
			FIELDS.prov.treasury.get({ state, p: seats[0] }) -
			TREASURY_BUDGET.get({ state, p: realm }).coronationExpenses,
	).toBeCloseTo(1000)
	expect(STATE.getRelation({ state, a: realm, b: seats[0] })).toBe(
		STATE.rel.NONE,
	)
	expect(STATE.getDisposition({ state, a: realm, b: seats[0] })).toBe(
		STATE.disp.NEUTRAL,
	)
	const note = partitionNote(fx)
	expect(note.seats).toEqual([seats[0]])
	expect(note.realmKind.slice(0, 2)).toEqual(["primary", "heir"])
	const shares = PARTITION_REPORT.shares(note)
	expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1)
	expect(PARTITION_REPORT.effectiveRealms(note)).toBeGreaterThan(1)
}, 120000)

it("seats a junior who is still a child under a regency", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, seats } = fx
	succeed({ fx: fx, choice: { juniors: 1 } })
	expect(STATE.isSovereign({ state, p: seats[0] })).toBe(true)
	expect(state.regency[seats[0]] === 1).toBe(
		STATE_RULERS.ageYears({ state, p: seats[0] }) < STATE_RULERS.adultAge,
	)
}, 120000)

it("has nothing to hand out without a free district", () => {
	const small = fixture({
		districts: 0,
		government: "tribal_monarchy",
		accept: ({ state, realm }) =>
			districtSeats({ state, realm }).length === 0 &&
			STATE.getNationProvinces({ state, root: realm }).length <= 4,
	})
	succeed({ fx: small, choice: { juniors: 2 } })
	expect(skipReason(small)).toBe("no free seat")

	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, seats } = fx
	state.occupationCurrent[seats[0]] = 0
	succeed({ fx: fx, choice: { juniors: 1 } })
	expect(state.sovereignCurrent[seats[0]]).toBe(fx.realm)
	expect(STATE.isSovereign({ state, p: seats[1] })).toBe(true)
}, 240000)

it("starts no succession revolt in a divided realm", () => {
	const divided = fixture({ districts: 2, government: "tribal_monarchy" })
	const wars = divided.state.wars.length
	const rebellions = () =>
		divided.state.events.filter((note) => note.tag === "rebellion").length
	const before = rebellions()
	succeed({ fx: divided, choice: { juniors: 1, daughterLine: true } })
	expect(partitionNote(divided).seats).toHaveLength(1)
	expect(rebellions()).toBe(before)
	expect(divided.state.wars).toHaveLength(wars)
}, 240000)

it("drops a share that an earlier release made invalid", () => {
	const fx = fixture({
		districts: 3,
		government: "tribal_monarchy",
		accept: ({ state, realm }) => {
			const seats = districtSeats({ state, realm })
			return (
				seats.length >= 3 &&
				cutOff({ state, realm, removed: seats.slice(0, 2) }).length === 0
			)
		},
	})
	const { state, realm, seats } = fx
	const release = STATE.releaseFaction
	const spy = vi.spyOn(STATE, "releaseFaction").mockImplementation((params) => {
		release(params)
		FIELDS.prov.parent.set({ state, p: seats[1], value: seats[2] })
	})
	try {
		succeed({ fx: fx, choice: { juniors: 2 } })
	} finally {
		spy.mockRestore()
	}
	const note = partitionNote(fx)
	expect(note.seats).toEqual([seats[0]])
	expect(note.unseatedReasons).toContain("share dropped")
	expect(state.sovereignCurrent[seats[1]]).toBe(realm)
}, 120000)

it("records a partition as a split and a timeline row naming its rulers", () => {
	const fx = fixture({
		districts: 2,
		government: "tribal_monarchy",
		accept: ({ state, realm }) => {
			const seats = districtSeats({ state, realm })
			return (
				seats.length >= 2 &&
				cutOff({ state, realm, removed: [seats[0]] }).length === 0
			)
		},
	})
	const { state, world, realm, seats } = fx
	const record = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: state.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: record, world })
	const late = refOf({ state, p: realm })
	const noteCursor = state.events.length
	state.time += STATE.yearMs
	succeed({ fx: fx, choice: { juniors: 1 } })
	JOURNAL.flush({ state, noteCursor, census: false, initial: false })
	SIM_RECORD.appendJournal({ translator, transactions: state.journal })

	const parentId = translator.identityByRoot.get(realm) as number
	const heirId = translator.identityByRoot.get(seats[0]) as number
	const row = record.record.events.nationEvents[parentId].events.findLast(
		(event) => event.kind === "partition",
	)
	const heir = refOf({ state, p: seats[0] })
	expect(row?.payload).toMatchObject({
		late,
		primary: refOf({ state, p: realm }),
		heirs: [heir],
		realms: [heirId],
	})
	expect(record.record.nations[heirId].name.length).toBeGreaterThan(0)
	const owner = record.record.events.provinceEvents
		.get(seats[0])
		?.events.findLast((event) => event.kind === "owner")
	expect(owner?.payload.nationId).toBe(heirId)
	expect(
		RULER_NAMES.comment({
			record: record.record,
			comment: owner?.comment ?? null,
		}),
	).toBe(
		`Split from ${record.record.nations[parentId].name} in the partition of ${RULER_NAMES.names({ record: record.record, ref: late }).name}'s realm, under ${RULER_NAMES.names({ record: record.record, ref: heir }).name}`,
	)
	expect(RULER_NAMES.names({ record: record.record, ref: heir })).toMatchObject(
		{
			name: expect.any(String),
			house: RULER_NAMES.names({ record: record.record, ref: late }).house,
		},
	)
}, 120000)

function divide({
	fx,
	juniors,
}: {
	fx: ReturnType<typeof DISTRICT_FIXTURE.create>
	juniors: number
}): number {
	const { state } = fx
	DISTRICT_FIXTURE.ruler({
		fixture: fx,
		p: 0,
		dynasty: -1,
		age: "fresh",
		claim: 3,
	})
	const late = refOf({ state, p: 0 })
	STATE.foundRuler({
		state,
		p: 0,
		ruler: { dynasty: late.dynasty, age: "inherited", claim: 3 },
		rng: fx.rng,
	})
	return PARTITION.divide({
		state,
		realm: 0,
		juniors,
		late,
		primary: refOf({ state, p: 0 }),
		rng: fx.rng,
	})
}

it("joins equal-tier cut-off land to an heir whose root is not its highest seat", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 8,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
			[5, 6],
			[6, 7],
		],
		titles: [
			{ tier: 2, seat: 0, provinces: [0, 1, 2, 3, 4, 5, 6, 7] },
			{ tier: 1, seat: 0, provinces: [0, 1] },
			{ tier: 1, seat: 2, provinces: [2, 3] },
			{ tier: 1, seat: 4, provinces: [4, 5] },
			{ tier: 1, seat: 6, provinces: [6, 7] },
		],
	})
	fx.state.popRuralCurrent[2] = 10000
	divide({ fx, juniors: 1 })
	const note = fx.state.events.findLast((note) => note.tag === "partition")
		?.data as PartitionNoteData
	expect(note.seats).toEqual([2])
	expect(note.joinedDistricts).toContain(4)
	expect(note.joinedRealms.every((realm) => realm === 2)).toBe(true)
	expect(note.primaryRankBefore).toBe(2)
	expect(note.realmRank[note.realms.indexOf(2)]).toBe(1)
})

it.each([
	false,
	true,
])("allocates surplus titles before districts without splitting attached land (crown attachment: %s)", (crown) => {
	const fx = DISTRICT_FIXTURE.create({
		count: 20,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
			[5, 6],
			[6, 7],
			[7, 8],
			[crown ? 0 : 3, 9],
			...Array.from({ length: 5 }, (_, i) => [1, i + 10] as [number, number]),
			...Array.from({ length: 5 }, (_, i) => [5, i + 15] as [number, number]),
		],
		titles: [
			{ tier: 2, seat: 1, provinces: [0, 1, 2, 3, 8, 10, 11, 12, 13, 14] },
			{ tier: 2, seat: 5, provinces: [4, 5, 6, 7, 9, 15, 16, 17, 18, 19] },
			{ tier: 1, seat: 1, provinces: [0, 1, 10, 11, 12, 13, 14] },
			{ tier: 1, seat: 3, provinces: [2, 3] },
			{ tier: 1, seat: 5, provinces: [4, 5, 15, 16, 17, 18, 19] },
			{ tier: 1, seat: 7, provinces: [6, 7] },
		],
	})
	const { state } = fx
	expect(state.parentCurrent[8]).toBe(7)
	expect(state.parentCurrent[9]).toBe(crown ? 0 : 3)
	expect(divide({ fx, juniors: 1 })).toBe(1)
	const note = state.events.findLast((note) => note.tag === "partition")
		?.data as PartitionNoteData
	expect(note.seats).toEqual([5])
	expect(note.shareKind).toEqual(["title"])
	expect(state.sovereignCurrent[8]).toBe(5)
	expect(state.sovereignCurrent[9]).toBe(crown ? 5 : 0)
	expect(note.primaryRankBefore).toBe(2)
})

it("does not offer districts carried by a title share to a later heir", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 8,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
			[5, 6],
			[6, 7],
		],
		titles: [
			{ tier: 2, seat: 0, provinces: [0, 1, 2, 3] },
			{ tier: 2, seat: 4, provinces: [4, 5, 6, 7] },
			{ tier: 1, seat: 0, provinces: [0, 1] },
			{ tier: 1, seat: 2, provinces: [2, 3] },
			{ tier: 1, seat: 4, provinces: [4, 5] },
			{ tier: 1, seat: 6, provinces: [6, 7] },
		],
	})
	fx.state.popRuralCurrent[6] = 10000
	expect(divide({ fx, juniors: 2 })).toBe(2)
	const note = fx.state.events.findLast((note) => note.tag === "partition")
		?.data as PartitionNoteData
	expect(note.shareKind).toEqual(["title", "district"])
	const provinces = note.seats.flatMap((seat) =>
		STATE.getNationProvinces({ state: fx.state, root: seat }),
	)
	expect(new Set(provinces).size).toBe(provinces.length)
	for (const seat of note.seats) {
		expect(STATE.isSovereign({ state: fx.state, p: seat })).toBe(true)
		expect(fx.state.leaderClaimCurrent[seat]).toBe(3)
	}
})

it("does not divide a single duchy into county shares", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 4,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
		],
		titles: [{ tier: 1, seat: 1, provinces: [0, 1, 2, 3] }],
	})
	expect(divide({ fx, juniors: 1 })).toBe(0)
	expect(
		fx.state.events.findLast((note) => note.tag === "partition skipped")?.data
			.reason,
	).toBe("no free seat")
})
