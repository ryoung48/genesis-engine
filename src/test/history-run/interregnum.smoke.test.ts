import { expect, it, vi } from "vitest"
import { RULER_NAMES } from "@/model/history/record/rulers"
import { TITLE_RECORD } from "@/model/history/record/titles"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import type { InterregnumNoteData } from "@/model/history/sim/engine/events/succession/interregnum/types"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import type { SuccessionChoice } from "@/model/history/sim/engine/events/succession/systems/types"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RNG, type SharedRng } from "@/model/shared/random/rng"
import { FOUNDING } from "@/model/society/dejure/founding"
import type { DuchyGroupsParams } from "@/model/society/dejure/founding/types"
import type { DejureTitles } from "@/model/society/dejure/types"
import type { GovernmentType } from "@/model/society/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

interface Fixture {
	state: HistoryState
	world: SerializedGenesisWorld
	rng: SharedRng
	realm: number
	seats: number[]
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

// A quiet realm with at least the wanted number of district seats, ruled by a
// man of the given government.
function fixture({
	districts,
	government,
}: {
	districts: number
	government: GovernmentType
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
		if (SUCCESSION_SYSTEMS.districts({ state, realm: p }).length >= districts)
			realm = p
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
		seats: SUCCESSION_SYSTEMS.districts({ state, realm }),
	}
}

function sequence(values: number[]): SharedRng {
	return RNG.fromSource({
		random: () => values.shift() ?? 0.5,
		nonPositiveWeightBehavior: "undefined",
	})
}

function die(fx: Fixture): void {
	const { state, realm, rng } = fx
	const forced: SuccessionChoice = {
		system: "single_heir",
		house: "new",
		claim: 0,
		age: "fresh",
		juniors: 0,
		interregnum: true,
		daughterLine: false,
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
}

function interregnumNote(fx: Fixture): InterregnumNoteData | null {
	const found = fx.state.events.findLast(
		(note) => note.tag === "interregnum" && note.data.nation === fx.realm,
	)
	return found ? (found.data as InterregnumNoteData) : null
}

function topTierTitles({
	state,
	realm,
}: {
	state: HistoryState
	realm: number
}): number[] {
	const top = STATE_TITLES.topTier({ state, realm })
	const titles: number[] = []
	if (top > 0)
		for (let title = 0; title < state.titles.count; title++)
			if (
				state.titles.holder[title] === realm &&
				state.titles.tier[title] === top
			)
				titles.push(title)
	return titles
}

it("fires only for a heirless hereditary realm with a district", () => {
	const fx = fixture({ districts: 2, government: "feudal_monarchy" })
	const { state, realm } = fx
	const roll = (values: number[]) =>
		SUCCESSION_SYSTEMS.choose({ state, realm, rng: sequence(values) })
	expect(roll([0.995, 0.1])).toMatchObject({
		house: "new",
		claim: 0,
		interregnum: true,
	})
	expect(roll([0.995, 0.9]).interregnum).toBe(false)
	expect(roll([0.5, 0.1])).toMatchObject({
		house: "same",
		claim: 3,
		interregnum: false,
	})
	for (const government of ["elective_monarchy", "theocracy"] as const) {
		const original = state.governmentType[realm]
		state.governmentType[realm] = GOVERNMENT.getGovIdx()[government]
		expect(roll([0.995, 0.1, 0.1]).interregnum).toBe(false)
		state.governmentType[realm] = original
	}
	const children = STATE.getChildren({ state, p: realm })
	const flags = children.map((seat) => state.districtSeat[seat])
	for (const seat of children) state.districtSeat[seat] = 0
	expect(roll([0.995, 0.1]).interregnum).toBe(false)
	children.forEach((seat, index) => {
		state.districtSeat[seat] = flags[index]
	})
}, 120000)

it("frees every district at the moment of death and keeps the crown land", () => {
	const fx = fixture({ districts: 3, government: "feudal_monarchy" })
	const { state, realm } = fx
	const dying = state.leaderRuntime.rulerId[realm]
	const house = state.leaderDynCurrent[realm]
	const snapshot = SUCCESSION_SYSTEMS.districts({ state, realm }).map(
		(seat) => ({
			seat,
			provinces: new Set(STATE.getNationProvinces({ state, root: seat })),
		}),
	)
	const titles = topTierTitles({ state, realm })
	const before = state.events.length
	state.time += STATE.yearMs
	die(fx)

	const note = interregnumNote(fx)
	expect(note).not.toBeNull()
	expect(note?.freed).toEqual(snapshot.map((entry) => entry.seat))
	expect(note?.skipped).toEqual([])
	const dynasties = new Set([house])
	for (const entry of snapshot) {
		expect(STATE.isSovereign({ state, p: entry.seat })).toBe(true)
		expect(
			new Set(STATE.getNationProvinces({ state, root: entry.seat })),
		).toEqual(entry.provinces)
		expect(state.governmentType[entry.seat]).toBe(state.governmentType[realm])
		expect(state.leaderClaimCurrent[entry.seat]).toBe(3)
		expect(dynasties.has(state.leaderDynCurrent[entry.seat])).toBe(false)
		dynasties.add(state.leaderDynCurrent[entry.seat])
	}

	expect(STATE.isSovereign({ state, p: realm })).toBe(true)
	expect(state.leaderRuntime.rulerId[realm]).not.toBe(dying)
	expect(state.leaderDynCurrent[realm]).not.toBe(house)
	expect(state.leaderClaimCurrent[realm]).toBe(0)
	const years = STATE_RULERS.ageYears({ state, p: realm })
	expect(years).toBeGreaterThanOrEqual(19.9)
	expect(years).toBeLessThanOrEqual(50.1)

	for (const title of titles) expect(state.titles.holder[title]).toBe(-1)
	expect(
		state.events
			.slice(before)
			.filter((entry) => entry.tag === "title destroyed")
			.map((entry) => entry.data.title),
	).toEqual(expect.arrayContaining(titles))
	expect(note?.titlesLost).toEqual(titles)

	const freed = new Set(note?.freed)
	expect(note?.warAttackers.length).toBeLessThanOrEqual(snapshot.length - 1)
	for (const [index, attacker] of (note?.warAttackers ?? []).entries()) {
		expect(freed.has(attacker)).toBe(true)
		expect(freed.has(note?.warDefenders[index] as number)).toBe(true)
		expect(attacker).not.toBe(note?.warDefenders[index])
	}
	STATE.validateLiveHierarchy({ state, context: "interregnum test" })
}, 120000)

it("records the break-up with the rulers of the crown and the freed realms", () => {
	const fx = fixture({ districts: 2, government: "feudal_monarchy" })
	const { state, world, realm } = fx
	const record = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: state.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: record, world })
	const seat = fx.seats[0]
	const late = STATE_RULERS.ref({
		state,
		ruler: STATE_RULERS.read({ state, p: realm }),
	})
	const noteCursor = state.events.length
	state.time += STATE.yearMs
	die(fx)
	expect(interregnumNote(fx)).not.toBeNull()
	JOURNAL.flush({ state, noteCursor, census: false, initial: false })
	SIM_RECORD.appendJournal({ translator, transactions: state.journal })

	const crownId = translator.identityByRoot.get(realm) as number
	const freedId = translator.identityByRoot.get(seat) as number
	for (const id of [crownId, freedId])
		expect(
			record.record.events.nationEvents[id].events.findLast(
				(event) => event.kind === "interregnum",
			)?.payload,
		).toMatchObject({ crown: crownId, late })
	const freedRuler = STATE_RULERS.ref({
		state,
		ruler: STATE_RULERS.read({ state, p: seat }),
	})
	const owner = record.record.events.provinceEvents
		.get(seat)
		?.events.findLast((event) => event.kind === "owner")
	expect(
		RULER_NAMES.comment({
			record: record.record,
			comment: owner?.comment ?? null,
		}),
	).toBe(
		`Broke away from ${record.record.nations[crownId].name} in the interregnum after ${RULER_NAMES.names({ record: record.record, ref: late }).name}'s death, under ${RULER_NAMES.names({ record: record.record, ref: freedRuler }).name}`,
	)
}, 120000)

function line(count: number): Pick<DuchyGroupsParams, "adjOffset" | "adjList"> {
	const adjOffset = new Int32Array(count + 1)
	const adjList: number[] = []
	for (let p = 0; p < count; p++) {
		if (p > 0) adjList.push(p - 1)
		if (p < count - 1) adjList.push(p + 1)
		adjOffset[p + 1] = adjList.length
	}
	return { adjOffset, adjList: Int32Array.from(adjList) }
}

function groups({
	owners,
	gap,
	above,
	scores,
}: {
	owners: number[]
	gap: number[]
	// [JUSTIFICATION] Most cases have no higher regions.
	above?: Record<number, number>
	// [JUSTIFICATION] Most cases need no seat preference.
	scores?: number[]
}): Record<number, number[]> {
	const count = owners.length
	const titles: DejureTitles = {
		count: 0,
		tier: new Uint8Array(4),
		seat: new Int32Array(4).fill(-1),
		holder: new Int32Array(4).fill(-1),
		regionOf: new Int32Array(4 * count).fill(-1),
	}
	for (const [province, region] of Object.entries(above ?? {}))
		titles.regionOf[count + Number(province)] = region
	const marked = new Uint8Array(count)
	for (const province of gap) marked[province] = 1
	const result = FOUNDING.duchyGroups({
		titles,
		provinceCount: count,
		ownerOf: Int32Array.from(owners),
		gap: marked,
		...line(count),
		habitability: Float32Array.from(scores ?? owners.map(() => 0)),
		urbanPop: new Float32Array(count),
		waterAccess: new Uint8Array(count),
	})
	return Object.fromEntries(result)
}

it("groups only provinces whose duchy was destroyed", () => {
	const same = [5, 5, 5, 5, 5, 5, 5, 5]
	expect(groups({ owners: same, gap: [] })).toEqual({})
	expect(groups({ owners: same, gap: [0] })).toEqual({})
	expect(groups({ owners: same, gap: [0, 1] })).toEqual({ 5: [0, 1] })
	expect(groups({ owners: same, gap: [0, 2] })).toEqual({})
	expect(groups({ owners: same, gap: [0, 1, 3, 4] })).toEqual({ 5: [0, 1] })
	expect(groups({ owners: same, gap: [0, 1, 2, 5, 6] })).toEqual({
		5: [0, 1, 2],
	})
	expect(
		groups({ owners: [5, 5, 6, 6, 6, 5, 5, 5], gap: [0, 1, 2, 3, 4] }),
	).toEqual({ 5: [0, 1], 6: [2, 3, 4] })
	expect(groups({ owners: [5, 5, 6, 5, 5, 5, 5, 5], gap: [0, 1, 2] })).toEqual({
		5: [0, 1],
	})
})

it("trims a large group from the best seat outward and never crosses a higher region", () => {
	const same = [5, 5, 5, 5, 5, 5, 5, 5]
	expect(
		groups({
			owners: same,
			gap: [0, 1, 2, 3, 4, 5],
			scores: [0, 0, 5, 1, 0, 0, 0, 0],
		}),
	).toEqual({ 5: [0, 1, 2, 3] })
	expect(
		groups({
			owners: same,
			gap: [0, 1, 2, 3, 4, 5],
			scores: [0, 0, 0, 0, 0, 5, 0, 0],
		}),
	).toEqual({ 5: [2, 3, 4, 5] })
	expect(
		groups({
			owners: same,
			gap: [0, 1, 2, 3],
			above: { 0: 0, 1: 0, 2: 1, 3: 1 },
		}),
	).toEqual({ 5: [0, 1] })
})

it("refounds a destroyed duchy over its provinces and replays it", () => {
	const fx = fixture({ districts: 0, government: "feudal_monarchy" })
	const { state, world } = fx
	let title = -1
	let owner = -1
	for (let t = 0; t < state.titles.count && title < 0; t++) {
		if (state.titles.tier[t] !== 1 || state.titles.holder[t] < 0) continue
		const holder = state.titles.holder[t]
		const members = state.titleMembers.list.subarray(
			state.titleMembers.offset[t],
			state.titleMembers.offset[t + 1],
		)
		if (members.every((p) => state.sovereignCurrent[p] === holder)) {
			title = t
			owner = holder
		}
	}
	expect(title).toBeGreaterThanOrEqual(0)
	const members = [
		...state.titleMembers.list.subarray(
			state.titleMembers.offset[title],
			state.titleMembers.offset[title + 1],
		),
	]
	const record = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: state.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: record, world })
	const noteCursor = state.events.length
	expect(STATE_TITLES.qualified({ state, nation: owner })[0]?.tier).not.toBe(1)
	expect(state.duchyGap.some((marked) => marked === 1)).toBe(false)

	const affected = STATE_TITLES.dissolve({ state, title })
	STATE_TITLES.relink({ state, nations: affected })
	for (const province of members) expect(state.duchyGap[province]).toBe(1)
	const duchy = STATE_TITLES.qualified({ state, nation: owner }).find(
		(entry) => entry.tier === 1,
	)
	expect(duchy?.children.length).toBe(Math.min(4, members.length))
	expect(
		STATE_TITLES.qualifying({ state }).some(
			(entry) => entry.holder === owner && entry.tier === 1,
		),
	).toBe(true)

	state.time += STATE.yearMs
	expect(
		STATE_TITLES.found({
			state,
			nation: owner,
			founding: duchy as NonNullable<typeof duchy>,
		}),
	).toBe(true)
	for (const province of duchy?.children ?? []) {
		expect(state.duchyGap[province]).toBe(0)
		expect(state.titles.regionOf[province]).toBe(state.titles.count - 1)
	}
	JOURNAL.flush({ state, noteCursor, census: false, initial: false })
	SIM_RECORD.appendJournal({ translator, transactions: state.journal })
	const frame = TITLE_RECORD.fold({
		base: record.record.titles as NonNullable<typeof record.record.titles>,
		events: record.record.events.titleEvents,
		provinceCount: state.P,
		timeMs: record.record.maxTimeMs,
	})
	expect(frame.regionOf.subarray(0, state.P)).toEqual(
		state.titles.regionOf.subarray(0, state.P),
	)
	for (let t = 0; t < state.titles.count; t++) {
		expect(frame.tier[t]).toBe(state.titles.tier[t])
		expect(frame.seat[t]).toBe(state.titles.seat[t])
	}
}, 120000)
