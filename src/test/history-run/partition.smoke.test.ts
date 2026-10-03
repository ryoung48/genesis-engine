import { expect, it, vi } from "vitest"
import { PERSON_NAMES } from "@/model/history/record/people/names"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import type { PartitionNoteData } from "@/model/history/sim/engine/events/succession/partition/types"
import { RESTORATION } from "@/model/history/sim/engine/events/succession/restoration"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import type { Sex } from "@/model/history/sim/people/types"
import { SIM_RECORD } from "@/model/history/sim/record"
import type { SharedRng } from "@/model/shared/random/rng"
import type { GovernmentType } from "@/model/society/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { PARTITION_REPORT } from "@/test/history-run/report/partition"

interface Fixture {
	state: HistoryState
	world: SerializedGenesisWorld
	rng: SharedRng
	realm: number
	// District seats, best first: higher tier, then larger population.
	seats: number[]
	provinces: number[]
	dying: number
}

function now(state: HistoryState): number {
	return state.time / STATE.yearMs
}

function districtSeats({
	state,
	realm,
}: {
	state: HistoryState
	realm: number
}): number[] {
	return STATE.getChildren({ state, p: realm })
		.filter((seat) => DISTRICTS.isDistrictSeat({ state, seat }))
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

function person({
	state,
	realm,
	age,
	father,
	sex,
}: {
	state: HistoryState
	realm: number
	age: number
	father: number
	sex: Sex
}): number {
	const people = state.people
	const id = PEOPLE.spawn({
		people,
		sex,
		birth: now(state) - age,
		father,
		mother: -1,
		dynasty:
			father >= 0 ? people.persons.dynasty[father] : people.nextDynasty++,
		origin: STATE.originOf({ state, realm }),
		rng: HISTORY_RNG.createHistoryRng(age + 7),
	})
	people.persons.death[id] = now(state) + 40
	return id
}

function son({ fx, age }: { fx: Fixture; age: number }): number {
	return person({
		state: fx.state,
		realm: fx.realm,
		age,
		father: fx.dying,
		sex: 0,
	})
}

function kill({ state, who }: { state: HistoryState; who: number }): void {
	state.people.persons.death[who] = now(state) - 0.01
}

// A quiet realm with the wanted number of district seats, given a new ruler
// with no family, a patrilineal culture and the given government.
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
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const rng = HISTORY_RNG.createHistoryRng(1729)
	let realm = -1
	for (let p = 0; p < state.P && realm < 0; p++) {
		if (!quiet({ state, realm: p })) continue
		const seats = districtSeats({ state, realm: p })
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
	const dying = person({ state, realm, age: 60, father: -1, sex: 0 })
	STATE.installRuler({
		state,
		p: realm,
		person: dying,
		claim: 3,
		reason: "succession",
	})
	return {
		state,
		world: generated as unknown as SerializedGenesisWorld,
		rng,
		realm,
		seats: districtSeats({ state, realm }),
		provinces: STATE.getNationProvinces({ state, root: realm }),
		dying,
	}
}

function succeed(fx: Fixture): void {
	const { state, realm, rng, dying } = fx
	kill({ state, who: dying })
	SUCCESSION.runSuccession({
		state,
		province: realm,
		leaderIdx: state.leaderRuntime.idx[realm],
		rng,
	})
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
	const people = state.people
	const table = people.persons
	const held = new Map<number, number>()
	for (const seat of provinces) {
		const holder = people.rulerOf[seat]
		if (holder < 0) continue
		if (!PEOPLE.aliveAt({ people, person: holder, time: now(state) })) continue
		held.set(holder, (held.get(holder) ?? 0) + 1)
		if (STATE.isSovereign({ state, p: seat })) {
			const throne = table.throne[holder]
			expect(
				throne === seat ||
					(people.rulerOf[throne] === holder &&
						STATE.getRelation({ state, a: seat, b: throne }) ===
							STATE.rel.PU_JUNIOR),
			).toBe(true)
		} else {
			expect(DISTRICTS.isDistrictSeat({ state, seat })).toBe(true)
			expect(table.throne[holder]).toBe(seat)
			expect(table.realm[holder]).toBe(state.sovereignCurrent[seat])
		}
	}
	for (const count of held.values()) expect(count).toBe(1)
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
	const elder = son({ fx, age: 30 })
	son({ fx, age: 25 })
	succeed(fx)
	expect(fx.state.people.rulerOf[fx.realm]).toBe(elder)
	expect(
		fx.state.events.some(
			(note) => note.tag === "partition" || note.tag === "partition skipped",
		),
	).toBe(false)
}, 120000)

it("does not divide a realm inherited by a brother", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, dying } = fx
	const parent = person({ state, realm, age: 90, father: -1, sex: 0 })
	state.people.persons.father[dying] = parent
	state.people.persons.children[parent].push(dying)
	const brother = person({ state, realm, age: 50, father: parent, sex: 0 })
	person({ state, realm, age: 45, father: parent, sex: 0 })
	kill({ state, who: parent })
	succeed(fx)
	expect(state.people.rulerOf[realm]).toBe(brother)
	expect(skipReason(fx)).toBe("not child line")
}, 120000)

it("gives the best district to the younger son and keeps the rest", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, seats } = fx
	FIELDS.prov.treasury.set({ state, p: realm, value: 1000 })
	state.governmentType[seats[0]] = GOVERNMENT.getGovIdx().feudal_monarchy
	const admin = state.people.rulerOf[seats[0]]
	const elder = son({ fx, age: 30 })
	const younger = son({ fx, age: 25 })
	succeed(fx)
	expect(state.people.rulerOf[realm]).toBe(elder)
	expect(STATE.isSovereign({ state, p: seats[0] })).toBe(true)
	expect(state.people.rulerOf[seats[0]]).toBe(younger)
	expect(state.sovereignCurrent[seats[1]]).toBe(realm)
	expect(state.governmentType[seats[0]]).toBe(
		GOVERNMENT.getGovIdx().tribal_monarchy,
	)
	expect(
		FIELDS.prov.treasury.get({ state, p: realm }) +
			FIELDS.prov.treasury.get({ state, p: seats[0] }),
	).toBeCloseTo(1000)
	expect(STATE.getRelation({ state, a: realm, b: seats[0] })).toBe(
		STATE.rel.NONE,
	)
	expect(STATE.getDisposition({ state, a: realm, b: seats[0] })).toBe(
		STATE.disp.NEUTRAL,
	)
	const note = partitionNote(fx)
	expect(note.heirs).toEqual([younger])
	expect(note.seats).toEqual([seats[0]])
	expect(note.realmKind.slice(0, 2)).toEqual(["primary", "heir"])
	if (admin >= 0) {
		const move = note.adminPersons.indexOf(admin)
		expect(move).toBeGreaterThanOrEqual(0)
		const to = note.adminTo[move]
		expect(state.people.persons.throne[admin]).toBe(to)
		if (to >= 0) {
			expect(state.people.rulerOf[to]).toBe(admin)
			expect(state.sovereignCurrent[to]).toBe(seats[0])
		}
	}
	const shares = PARTITION_REPORT.shares(note)
	expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1)
	expect(PARTITION_REPORT.effectiveRealms(note)).toBeGreaterThan(1)
}, 120000)

it("passes a dead son's share to his child and skips a lone heir", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, seats } = fx
	const elder = son({ fx, age: 35 })
	const dead = son({ fx, age: 30 })
	const grandson = person({ state, realm, age: 8, father: dead, sex: 0 })
	kill({ state, who: dead })
	succeed(fx)
	expect(state.people.rulerOf[realm]).toBe(elder)
	expect(state.people.rulerOf[seats[0]]).toBe(grandson)
	expect(STATE.isSovereign({ state, p: seats[0] })).toBe(true)
	expect(state.people.regencies.get(seats[0])?.ward).toBe(grandson)

	const lone = fixture({ districts: 2, government: "tribal_monarchy" })
	son({ fx: lone, age: 30 })
	succeed(lone)
	expect(skipReason(lone)).toBe("no junior heir")
}, 240000)

it("seats juniors when the primary already rules another realm", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, seats } = fx
	const elder = son({ fx, age: 35 })
	const younger = son({ fx, age: 30 })
	const other = Array.from({ length: state.P }, (_, p) => p).find(
		(p) =>
			p !== realm &&
			quiet({ state, realm: p }) &&
			STATE.canUnite({ state, a: realm, b: p }),
	)
	if (other === undefined) throw new Error("no realm to rule")
	STATE.installRuler({
		state,
		p: other,
		person: elder,
		claim: 3,
		reason: "succession",
	})
	succeed(fx)
	expect(state.people.rulerOf[realm]).toBe(elder)
	expect(state.people.rulerOf[other]).toBe(elder)
	expect([realm, other]).toContain(state.people.persons.throne[elder])
	expect(state.people.rulerOf[seats[0]]).toBe(younger)
	expect(partitionNote(fx).heirs).toEqual([younger])
}, 120000)

it("lets an eligible branch inherit past a son who rules elsewhere", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, seats } = fx
	son({ fx, age: 35 })
	const abroad = son({ fx, age: 30 })
	const youngest = son({ fx, age: 25 })
	const other = Array.from({ length: state.P }, (_, p) => p).find(
		(p) => p !== realm && quiet({ state, realm: p }),
	)
	if (other === undefined) throw new Error("no realm to rule")
	STATE.installRuler({
		state,
		p: other,
		person: abroad,
		claim: 3,
		reason: "succession",
	})
	succeed(fx)
	expect(partitionNote(fx).heirs).toEqual([youngest])
	expect(state.people.rulerOf[seats[0]]).toBe(youngest)
	expect(state.people.persons.throne[abroad]).toBe(other)
}, 120000)

it("keeps an heir in the district he holds and seats the others around him", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, seats } = fx
	const elder = son({ fx, age: 35 })
	const middle = son({ fx, age: 30 })
	const youngest = son({ fx, age: 25 })
	DISTRICTS.install({
		state,
		seat: seats[0],
		person: youngest,
		reason: "district grant",
	})
	succeed(fx)
	expect(state.people.rulerOf[realm]).toBe(elder)
	expect(state.people.rulerOf[seats[0]]).toBe(youngest)
	expect(state.people.rulerOf[seats[1]]).toBe(middle)
	expect(STATE.isSovereign({ state, p: seats[0] })).toBe(true)
	expect(STATE.isSovereign({ state, p: seats[1] })).toBe(true)
	expect(partitionNote(fx).adminPersons).not.toContain(youngest)
}, 120000)

it("has nothing to hand out without a free district", () => {
	const small = fixture({
		districts: 0,
		government: "tribal_monarchy",
		accept: ({ state, realm }) =>
			districtSeats({ state, realm }).length === 0 &&
			STATE.getNationProvinces({ state, root: realm }).length <= 4,
	})
	son({ fx: small, age: 30 })
	son({ fx: small, age: 25 })
	succeed(small)
	expect(skipReason(small)).toBe("no free seat")

	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, seats } = fx
	state.occupationCurrent[seats[0]] = 0
	son({ fx, age: 30 })
	const younger = son({ fx, age: 25 })
	succeed(fx)
	expect(state.sovereignCurrent[seats[0]]).toBe(fx.realm)
	expect(state.people.rulerOf[seats[1]]).toBe(younger)
	expect(STATE.isSovereign({ state, p: seats[1] })).toBe(true)
}, 240000)

it("clears the seats the heirs held before", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, seats } = fx
	const elder = son({ fx, age: 35 })
	const younger = son({ fx, age: 30 })
	const occupiedHolder = son({ fx, age: 25 })
	DISTRICTS.install({
		state,
		seat: seats[0],
		person: elder,
		reason: "district grant",
	})
	let abroad = -1
	for (let p = 0; p < state.P && abroad < 0; p++)
		if (p !== realm && quiet({ state, realm: p }))
			abroad = districtSeats({ state, realm: p })[0] ?? -1
	if (abroad < 0) throw new Error("no district abroad")
	DISTRICTS.install({
		state,
		seat: abroad,
		person: younger,
		reason: "district grant",
	})
	DISTRICTS.install({
		state,
		seat: seats[1],
		person: occupiedHolder,
		reason: "district grant",
	})
	state.occupationCurrent[seats[1]] = 0
	succeed(fx)
	expect(state.people.rulerOf[realm]).toBe(elder)
	expect(state.people.persons.throne[elder]).toBe(realm)
	expect(state.people.rulerOf[seats[0]]).toBe(younger)
	expect(STATE.isSovereign({ state, p: seats[0] })).toBe(true)
	expect(state.people.rulerOf[abroad]).toBe(-1)
	expect(state.people.rulerOf[seats[1]]).toBe(occupiedHolder)
	expect(state.sovereignCurrent[seats[1]]).toBe(realm)
	const note = partitionNote(fx)
	expect(note.unseatedReasons[note.unseatedHeirs.indexOf(occupiedHolder)]).toBe(
		"reserved seat unavailable",
	)
}, 120000)

it("joins an heir's realm to the realm of the spouse who rules abroad", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, seats } = fx
	son({ fx, age: 35 })
	const younger = son({ fx, age: 30 })
	const other = Array.from({ length: state.P }, (_, p) => p).find(
		(p) =>
			p !== realm &&
			quiet({ state, realm: p }) &&
			GOVERNMENT.successionOfIndex(state.governmentType[p]) === "single_heir",
	)
	if (other === undefined) throw new Error("no realm to marry into")
	const spouse = state.people.rulerOf[other]
	const table = state.people.persons
	if (table.spouse[spouse] >= 0) table.spouse[table.spouse[spouse]] = -1
	table.spouse[spouse] = younger
	table.spouse[younger] = spouse
	succeed(fx)
	expect(state.people.rulerOf[seats[0]]).toBe(younger)
	expect(state.people.rulerOf[other]).toBe(spouse)
	expect([STATE.rel.PU_JUNIOR, STATE.rel.PU_SENIOR]).toContain(
		STATE.getRelation({ state, a: seats[0], b: other }),
	)
}, 120000)

it("never reseats an admin who died before the succession", () => {
	const fx = fixture({
		districts: 2,
		government: "tribal_monarchy",
		accept: ({ state, realm }) => {
			const seats = districtSeats({ state, realm })
			return (
				seats.length >= 2 &&
				state.people.rulerOf[seats[0]] >= 0 &&
				cutOff({ state, realm, removed: [seats[0]] }).length === 0
			)
		},
	})
	const { state, seats } = fx
	const admin = state.people.rulerOf[seats[0]]
	kill({ state, who: admin })
	son({ fx, age: 30 })
	const younger = son({ fx, age: 25 })
	succeed(fx)
	expect(state.people.rulerOf[seats[0]]).toBe(younger)
	expect(partitionNote(fx).adminPersons).not.toContain(admin)
	for (const seat of fx.provinces)
		expect(state.people.rulerOf[seat]).not.toBe(admin)
}, 120000)

it("chooses regents once every heir is seated", () => {
	const fx = fixture({ districts: 2, government: "tribal_monarchy" })
	const { state, realm, seats } = fx
	const elder = son({ fx, age: 35 })
	const adult = son({ fx, age: 30 })
	const minor = son({ fx, age: 10 })
	DISTRICTS.install({
		state,
		seat: seats[1],
		person: adult,
		reason: "district grant",
	})
	const ward = Array.from({ length: state.P }, (_, p) => p).find(
		(p) =>
			p !== realm &&
			STATE.isSovereign({ state, p }) &&
			state.people.rulerOf[p] >= 0 &&
			!state.people.regencies.has(p),
	)
	if (ward === undefined) throw new Error("no realm for a regency")
	state.people.regencies.set(ward, {
		ward: state.people.rulerOf[ward],
		regent: adult,
		kind: "relative",
	})
	succeed(fx)
	expect(state.people.rulerOf[seats[0]]).toBe(minor)
	expect(state.people.rulerOf[seats[1]]).toBe(adult)
	const regency = state.people.regencies.get(seats[0])
	expect(regency?.ward).toBe(minor)
	expect([adult, elder]).not.toContain(regency?.regent)
	expect(state.people.regencies.get(ward)?.regent).not.toBe(adult)
}, 120000)

it("starts no succession revolt in a divided realm", () => {
	const build = (juniors: boolean) => {
		const fx = fixture({ districts: 2, government: "tribal_monarchy" })
		const { state, realm } = fx
		const elder = son({ fx, age: 40 })
		person({ state, realm, age: 8, father: elder, sex: 0 })
		kill({ state, who: elder })
		if (juniors) son({ fx, age: 30 })
		const claimant = person({ state, realm, age: 30, father: -1, sex: 0 })
		state.people.deposed.set(realm, { claimant, generation: 0, tried: false })
		return { fx, claimant }
	}
	const attempt = vi.spyOn(RESTORATION, "attempt")
	try {
		const divided = build(true)
		const wars = divided.fx.state.wars.length
		const rebellions = () =>
			divided.fx.state.events.filter((note) => note.tag === "rebellion").length
		const before = rebellions()
		succeed(divided.fx)
		expect(partitionNote(divided.fx).heirs).toHaveLength(1)
		expect(attempt).not.toHaveBeenCalled()
		expect(rebellions()).toBe(before)
		expect(divided.fx.state.wars).toHaveLength(wars)
		expect(
			divided.fx.state.people.deposed.get(divided.fx.realm)?.claimant,
		).toBe(divided.claimant)

		const whole = build(false)
		succeed(whole.fx)
		expect(skipReason(whole.fx)).toBe("no junior heir")
		expect(attempt).toHaveBeenCalledTimes(1)
	} finally {
		attempt.mockRestore()
	}
}, 240000)

function rankedChildren({
	state,
	seat,
}: {
	state: HistoryState
	seat: number
}): number[] {
	return STATE.getChildren({ state, p: seat }).filter(
		(child) => state.seatRank[child] > 0 && !state.desolate[child],
	)
}

// A realm whose best district has a living admin and lower seats of its own.
function nested({ state, realm }: { state: HistoryState; realm: number }) {
	const seats = districtSeats({ state, realm })
	const best = seats[0]
	if (seats.length < 2 || state.people.rulerOf[best] < 0) return false
	return (
		rankedChildren({ state, seat: best }).length >= 2 &&
		rankedChildren({ state, seat: best }).every(
			(child) => state.seatRank[child] < state.seatRank[best],
		) &&
		cutOff({ state, realm, removed: [best] }).length === 0
	)
}

it("moves a displaced admin to the new realm's best vacant lower seat", () => {
	const fx = fixture({
		districts: 2,
		government: "tribal_monarchy",
		accept: nested,
	})
	const { state, seats } = fx
	const admin = state.people.rulerOf[seats[0]]
	const rank = state.seatRank[seats[0]]
	son({ fx, age: 30 })
	const younger = son({ fx, age: 25 })
	succeed(fx)
	expect(state.people.rulerOf[seats[0]]).toBe(younger)
	const note = partitionNote(fx)
	const move = note.adminPersons.indexOf(admin)
	const to = note.adminTo[move]
	expect(note.adminFrom[move]).toBe(seats[0])
	expect(note.adminBumped[move]).toBe(0)
	expect(state.people.rulerOf[to]).toBe(admin)
	expect(state.parentCurrent[to]).toBe(seats[0])
	expect(state.seatRank[to]).toBeLessThan(rank)
	expect(districtSeats({ state, realm: seats[0] })[0]).toBe(to)
}, 120000)

it("bumps a lower admin, and ends the chain at a dead one", () => {
	const build = (dead: boolean) => {
		const fx = fixture({
			districts: 2,
			government: "tribal_monarchy",
			accept: nested,
		})
		const { state, realm, seats } = fx
		const lower = rankedChildren({ state, seat: seats[0] })
		const holders = lower.map((seat, index) => {
			const holder = person({
				state,
				realm,
				age: 30 + index,
				father: -1,
				sex: 0,
			})
			DISTRICTS.install({
				state,
				seat,
				person: holder,
				reason: "district grant",
			})
			return holder
		})
		if (dead) for (const holder of holders) kill({ state, who: holder })
		const admin = state.people.rulerOf[seats[0]]
		son({ fx, age: 30 })
		son({ fx, age: 25 })
		succeed(fx)
		return { fx, admin, holders, note: partitionNote(fx) }
	}
	const living = build(false)
	const table = living.fx.state.people.persons
	expect(living.note.adminPersons[0]).toBe(living.admin)
	expect(living.note.adminBumped[0]).toBe(1)
	const bumped = living.note.adminPersons[1]
	expect(living.holders).toContain(bumped)
	expect(living.note.adminTo[1]).toBe(-1)
	expect(table.throne[bumped]).toBe(-1)
	expect(living.fx.state.people.rulerOf[living.note.adminTo[0]]).toBe(
		living.admin,
	)

	const dead = build(true)
	expect(dead.note.adminPersons).toEqual([dead.admin])
	expect(dead.note.adminBumped).toEqual([1])
	expect(dead.fx.state.people.rulerOf[dead.note.adminTo[0]]).toBe(dead.admin)
	for (const holder of dead.holders)
		expect(dead.note.adminPersons).not.toContain(holder)
}, 240000)

// A district whose release cuts off both a piece of lower tier that borders
// it and a piece of its own tier or higher.
function mixedCut({ state, realm }: { state: HistoryState; realm: number }) {
	return districtSeats({ state, realm }).find((seat) => {
		const pieces = cutOff({ state, realm, removed: [seat] })
		const subtree = new Set(STATE.getNationProvinces({ state, root: seat }))
		const borders = (piece: number) =>
			STATE.getNationProvinces({ state, root: piece }).some((p) =>
				STATE.getProvinceNeighbors({ state, p }).some((neighbor) =>
					subtree.has(neighbor),
				),
			)
		return (
			pieces.some(
				(piece) =>
					state.seatRank[piece] < state.seatRank[seat] && borders(piece),
			) && pieces.some((piece) => state.seatRank[piece] >= state.seatRank[seat])
		)
	})
}

it("joins cut-off land to a higher heir realm and frees the rest", () => {
	const fx = fixture({
		districts: 2,
		government: "tribal_monarchy",
		accept: (candidate) => mixedCut(candidate) !== undefined,
	})
	const { state, realm } = fx
	const share = mixedCut({ state, realm }) as number
	son({ fx, age: 30 })
	const younger = son({ fx, age: 25 })
	DISTRICTS.install({
		state,
		seat: share,
		person: younger,
		reason: "district grant",
	})
	succeed(fx)
	const note = partitionNote(fx)
	expect(note.seats).toEqual([share])
	expect(note.joinedDistricts.length).toBeGreaterThan(0)
	for (const district of note.joinedDistricts)
		expect(state.sovereignCurrent[district]).toBe(share)
	expect(note.joinedRealms.every((joined) => joined === share)).toBe(true)
	expect(note.realmKind).toContain("released")
	for (const child of STATE.getChildren({ state, p: realm }))
		expect(STATE.isConnectedToParent({ state, province: child })).toBe(true)
	const released = note.realmKind.flatMap((kind, index) =>
		kind === "released" ? [note.realms[index]] : [],
	)
	for (const root of released)
		expect(STATE.isSovereign({ state, p: root })).toBe(true)
	expect(
		PARTITION_REPORT.shares(note).reduce((sum, part) => sum + part, 0),
	).toBeCloseTo(1)
	expect(note.realms.length).toBeGreaterThanOrEqual(3)
	expect(PARTITION_REPORT.effectiveRealms(note)).toBeCloseTo(
		1 /
			note.realmPopulation.reduce(
				(sum, population) => sum + (population / note.populationBefore) ** 2,
				0,
			),
	)
}, 120000)

it("drops a share that an earlier release made invalid", () => {
	const fx = fixture({
		districts: 3,
		government: "tribal_monarchy",
		accept: ({ state, realm }) => {
			const seats = districtSeats({ state, realm })
			return (
				seats.length >= 3 &&
				state.people.rulerOf[seats[1]] >= 0 &&
				cutOff({ state, realm, removed: seats.slice(0, 2) }).length === 0
			)
		},
	})
	const { state, realm, seats } = fx
	const admin = state.people.rulerOf[seats[1]]
	son({ fx, age: 35 })
	const second = son({ fx, age: 30 })
	const third = son({ fx, age: 25 })
	const release = STATE.releaseFaction
	const spy = vi.spyOn(STATE, "releaseFaction").mockImplementation((params) => {
		release(params)
		FIELDS.prov.parent.set({ state, p: seats[1], value: seats[2] })
	})
	try {
		succeed(fx)
	} finally {
		spy.mockRestore()
	}
	const note = partitionNote(fx)
	expect(note.heirs).toEqual([second])
	expect(note.unseatedReasons[note.unseatedHeirs.indexOf(third)]).toBe(
		"share dropped",
	)
	expect(state.people.persons.throne[third]).toBe(-1)
	expect(state.sovereignCurrent[seats[1]]).toBe(realm)
	expect(state.people.rulerOf[seats[1]]).toBe(-1)
	expect(note.adminPersons).toContain(admin)
}, 120000)

it("records a partition as a split, a timeline row and seat reasons", () => {
	const fx = fixture({
		districts: 2,
		government: "tribal_monarchy",
		accept: ({ state, realm }) => {
			const seats = districtSeats({ state, realm })
			return (
				seats.length >= 2 &&
				state.people.rulerOf[seats[0]] >= 0 &&
				cutOff({ state, realm, removed: [seats[0]] }).length === 0
			)
		},
	})
	const { state, world, realm, seats, dying } = fx
	const record = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: state.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: record, world })
	const admin = state.people.rulerOf[seats[0]]
	const elder = son({ fx, age: 30 })
	const younger = son({ fx, age: 25 })
	const noteCursor = state.events.length
	state.time += STATE.yearMs
	succeed(fx)
	JOURNAL.flush({ state, noteCursor, census: false, initial: false })
	SIM_RECORD.appendJournal({ translator, transactions: state.journal })

	const people = record.record.people
	if (!people) throw new Error("no people record")
	const parentId = translator.identityByRoot.get(realm) as number
	const heirId = translator.identityByRoot.get(seats[0]) as number
	const row = record.record.events.nationEvents[parentId].events.findLast(
		(event) => event.kind === "partition",
	)
	expect(row?.payload).toMatchObject({
		late: dying,
		primary: elder,
		heirs: [younger],
		realms: [heirId],
	})
	expect(record.record.nations[heirId].name.length).toBeGreaterThan(0)
	const owner = record.record.events.provinceEvents
		.get(seats[0])
		?.events.findLast((event) => event.kind === "owner")
	expect(owner?.payload.nationId).toBe(heirId)
	expect(
		PERSON_NAMES.comment({ people, comment: owner?.comment ?? null }),
	).toBe(
		`Split from ${record.record.nations[parentId].name} in the partition of ${PERSON_NAMES.person({ people, person: dying })?.name}'s realm, under ${PERSON_NAMES.person({ people, person: younger })?.name}`,
	)
	const events = (id: number) =>
		PERSON_QUERY.timeline({ people, id, timeMs: record.record.maxTimeMs })
	const took = events(younger).filter((event) => event.kind === "took seat")
	expect(took).toHaveLength(1)
	expect(took[0]).toMatchObject({ other: seats[0], reason: "partition" })
	expect(events(younger).some((event) => event.kind === "left seat")).toBe(
		false,
	)
	expect(
		events(admin).findLast((event) => event.kind === "left seat"),
	).toMatchObject({ other: seats[0], reason: "partition" })
}, 120000)
