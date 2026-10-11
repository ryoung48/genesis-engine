import { expect, it, vi } from "vitest"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_GOVERNMENT } from "@/model/history/sim/engine/state/government"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { SIM_RECORD } from "@/model/history/sim/record"
import { ERAS } from "@/model/society/eras"
import { URBANIZATION } from "@/model/society/urbanization"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { DISTRICT_FIXTURE } from "@/test/history-run/fixtures/district-tiers"
import { GOVERNMENT_REPORT } from "@/test/history-run/report/government"

function fixture(size: number) {
	const fixture = DISTRICT_FIXTURE.create({
		count: size,
		root: 0,
		titles: [],
		edges: Array.from({ length: size - 1 }, (_, p): [number, number] => [
			p,
			p + 1,
		]),
	})
	const { state, rng } = fixture
	state.events.length = 0
	state.journal.length = 0
	state.militaryReady = false
	state.governmentType[0] = GOVERNMENT.getGovIdx().feudal_monarchy
	const ruler = DISTRICT_FIXTURE.person({ fixture, seat: -1, father: -1 })
	STATE.installRuler({
		state,
		p: 0,
		person: ruler,
		claim: 3,
		reason: "succession",
	})
	state.events.length = 0
	return {
		...fixture,
		ruler,
		review: { state, realm: 0, provinces: fixture.members, rng },
	}
}

it("separates the converted crown and continues its former juniors under their shared ruler", () => {
	const { state, rng, ruler } = fixture(3)
	for (const seat of [1, 2]) {
		FIELDS.prov.parent.set({ state, p: seat, value: -1 })
		PEOPLE.setRuler({
			people: state.people,
			seat,
			person: ruler,
			rank: 1,
			reason: "unknown",
		})
		STATE.setRelation({ state, a: seat, b: 0, rel: "PU_JUNIOR" })
		state.people.unionGenerations.set(seat, 2)
	}
	state.governmentType[0] = GOVERNMENT.getGovIdx().oligarchic_republic
	state.people.regencies.set(0, {
		ward: ruler,
		cause: "minority",
		regent: -1,
		kind: "council",
	})
	state.coronationOwed[0] = ruler
	STATE.reconcileGovernment({ state, realm: 0, transition: null, rng })
	expect(state.people.rulerOf[0]).not.toBe(ruler)
	expect(state.people.persons.heldSeats[ruler]).not.toContain(0)
	expect(STATE.unionSenior({ state, p: 1 })).toBe(
		STATE.unionSenior({ state, p: 2 }),
	)
	expect(STATE.unionSenior({ state, p: 0 })).not.toBe(
		STATE.unionSenior({ state, p: 1 }),
	)
	expect(state.people.patricians.get(0)?.length).toBeGreaterThanOrEqual(3)
	expect(state.people.regencies.has(0)).toBe(false)
	expect(state.coronationOwed[0]).toBe(-1)
})

it("resolves every surviving catalog index", () => {
	for (const [index, type] of ERAS.governmentTypes.entries()) {
		expect(GOVERNMENT.getGovIdx()[type]).toBe(index)
		expect(ERAS.governmentTypeLabels[type]).toBeTruthy()
		expect(GOVERNMENT.govFamilyOfIndex(index)).toBe(
			ERAS.governmentTypeFamily[type],
		)
		expect(["single_heir", "election", "appointment"]).toContain(
			GOVERNMENT.successionOfIndex(index),
		)
		expect(
			URBANIZATION.rankSizesForNation({
				governmentTypeIndex: index,
				totalPopulation: 1_000_000,
				provinceCount: 10,
				urbanFactor: 1,
			})[0],
		).toBeGreaterThan(0)
	}
	expect(ERAS.governmentTypes).toHaveLength(24)
})

it("assigns an arid large tribal candidate through the ordinary federation branch", () => {
	expect(
		GOVERNMENT.assignGovernmentType({
			nationIndex: 0,
			capitalProvince: 0,
			nationSize: 20,
			eraMix: { tribal: 1, monarchy: 0, republic: 0, theocracy: 0 },
			sizeWeight: 0,
			habitability: new Float32Array([0.1]),
			waterAccess: new Uint8Array(1),
			migrationWave: new Float32Array([1]),
			statehoodFraction: 0,
			seed: 0,
		}),
	).toBe(GOVERNMENT.getGovIdx().tribal_federation)
})

it.each([
	{ from: "chiefdom", size: 5, to: "tribal_monarchy" },
	{ from: "tribal_monarchy", size: 4, to: "chiefdom" },
	{ from: "native_council", size: 10, to: "tribal_federation" },
	{ from: "tribal_federation", size: 9, to: "native_council" },
] as const)("reviews $from at $size provinces", ({ from, size, to }) => {
	const { state, review } = fixture(size)
	state.governmentType[0] = GOVERNMENT.getGovIdx()[from]
	expect(STATE_GOVERNMENT.found(review)).toEqual({ from, to, cause: "size" })
	expect(ERAS.governmentTypes[state.governmentType[0]]).toBe(to)
})

it.each([
	{ type: "feudal_monarchy", size: 20, knowledge: 1.9, changes: true },
	{ type: "elective_monarchy", size: 20, knowledge: 1.9, changes: true },
	{ type: "feudal_monarchy", size: 19, knowledge: 1.9, changes: false },
	{ type: "feudal_monarchy", size: 20, knowledge: 1.89, changes: false },
	{ type: "tribal_monarchy", size: 20, knowledge: 100, changes: false },
	{ type: "tribal_federation", size: 20, knowledge: 100, changes: false },
] as const)("absolute gate $type/$size/$knowledge", ({
	type,
	size,
	knowledge,
	changes,
}) => {
	const { state, review } = fixture(size)
	state.governmentType[0] = GOVERNMENT.getGovIdx()[type]
	const transition = STATE_GOVERNMENT.accede({
		...review,
		knowledge,
		elected: false,
		previousHouse: -1,
	})
	expect(transition?.to ?? null).toBe(changes ? "absolute_monarchy" : null)
})

it("founding waits for an accession before centralising", () => {
	const { review } = fixture(20)
	expect(STATE_GOVERNMENT.found(review)).toBeNull()
})

it.each([
	{ size: 4, r: 0, type: "feudal_monarchy" },
	{ size: 5, r: 0.749999, type: "elective_monarchy" },
	{ size: 19, r: 0.75, type: "feudal_monarchy" },
] as const)("shares monarchy size odds $size/$r", ({ size, r, type }) => {
	expect(GOVERNMENT.monarchySubtype({ size, r, sizeWeight: 0.55 })).toBe(
		GOVERNMENT.getGovIdx()[type],
	)
})

it("makes at most one transition per review", () => {
	const { state, review } = fixture(3)
	state.governmentType[0] = GOVERNMENT.getGovIdx().absolute_monarchy
	state.popUrbanCurrent[0] = 30_000
	state.popRuralCurrent[0] = 70_000
	state.popRuralCurrent[1] = 0
	state.popRuralCurrent[2] = 0
	expect(STATE_GOVERNMENT.found(review)?.to).toBe("feudal_monarchy")
	expect(STATE_GOVERNMENT.yearly(review)?.to).toBe("oligarchic_republic")
	expect(
		state.events.filter((note) => note.tag === "government change"),
	).toHaveLength(2)
})

it.each([
	{
		size: 3,
		city: 30_000,
		rural: 70_000,
		type: "feudal_monarchy",
		converts: true,
	},
	{
		size: 3,
		city: 4_000,
		rural: 6_000,
		type: "feudal_monarchy",
		converts: false,
	},
	{
		size: 3,
		city: 10_000,
		rural: 90_000,
		type: "feudal_monarchy",
		converts: false,
	},
	{
		size: 5,
		city: 30_000,
		rural: 70_000,
		type: "feudal_monarchy",
		converts: false,
	},
	{ size: 3, city: 30_000, rural: 70_000, type: "chiefdom", converts: false },
] as const)("city gate $size/$city/$rural/$type", ({
	size,
	city,
	rural,
	type,
	converts,
}) => {
	const { state, review } = fixture(size)
	state.governmentType[0] = GOVERNMENT.getGovIdx()[type]
	for (const province of review.provinces) state.popRuralCurrent[province] = 0
	state.popRuralCurrent[0] = rural
	state.popUrbanCurrent[0] = city
	expect(STATE_GOVERNMENT.found(review)?.to ?? null).toBe(
		converts ? "oligarchic_republic" : null,
	)
})

it("updates election streaks, resets on another house, and retires electors at conversion", () => {
	const { state, review, rng, ruler } = fixture(3)
	state.governmentType[0] = GOVERNMENT.getGovIdx().oligarchic_republic
	STATE.reconcileGovernment({ state, realm: 0, transition: null, rng })
	expect(state.people.patricians.get(0)?.length).toBeGreaterThanOrEqual(3)
	const house = state.people.persons.dynasty[ruler]
	const accession = {
		...review,
		knowledge: 0,
		elected: true,
		previousHouse: house,
	}
	expect(STATE_GOVERNMENT.accede(accession)).toBeNull()
	expect(STATE_GOVERNMENT.accede(accession)).toBeNull()
	state.people.persons.dynasty[ruler] = house + 100
	expect(STATE_GOVERNMENT.accede(accession)).toBeNull()
	expect(state.electionStreaks.get(0)?.wins).toBe(1)
	expect(STATE_GOVERNMENT.accede(accession)).toBeNull()
	const transition = STATE_GOVERNMENT.accede(accession)
	expect(transition?.to).toBe("dynastic_signoria")
	STATE.reconcileGovernment({ state, realm: 0, transition, rng })
	expect(state.people.patricians.has(0)).toBe(false)
	expect(state.electionStreaks.has(0)).toBe(false)
	const restoration = STATE_GOVERNMENT.accede({
		...accession,
		elected: false,
		previousHouse: house,
	})
	expect(restoration?.cause).toBe("house lost")
	STATE.reconcileGovernment({ state, realm: 0, transition: restoration, rng })
	expect(state.people.patricians.get(0)?.length).toBeGreaterThanOrEqual(3)
	expect(
		SUCCESSION_SYSTEMS.choose({ state, realm: 0, dying: ruler, rng }).heir,
	).toBeGreaterThanOrEqual(0)
})

it("a release inherits the parent rather than its province stamp", () => {
	const { state, rng } = fixture(3)
	state.governmentType[1] = GOVERNMENT.getGovIdx().chiefdom
	STATE.releaseProvince({ state, p: 1, rng, reason: "rebellion" })
	expect(state.governmentType[1]).toBe(GOVERNMENT.getGovIdx().feudal_monarchy)
	expect(
		state.events.find((note) => note.tag === "government change")?.data.cause,
	).toBe("inherited")
})

it("reviews the final released hierarchy including supporters", () => {
	const { state, rng } = fixture(6)
	state.governmentType[0] = GOVERNMENT.getGovIdx().chiefdom
	STATE.releaseFaction({
		state,
		p: 1,
		supporters: [2, 3, 4, 5],
		rng,
		reason: "rebellion",
	})
	expect(STATE.getNationProvinces({ state, root: 1 })).toHaveLength(5)
	expect(state.governmentType[1]).toBe(GOVERNMENT.getGovIdx().tribal_monarchy)
})

it("a disconnected release runs founding once before the city review", () => {
	const { state, rng } = fixture(2)
	state.governmentType[0] = GOVERNMENT.getGovIdx().absolute_monarchy
	state.provinceAdjOffset.fill(0)
	state.popUrbanCurrent[1] = 30_000
	state.popRuralCurrent[1] = 70_000
	STATE.fixConnections({ state, nation: 0, rng })
	expect(state.governmentType[1]).toBe(GOVERNMENT.getGovIdx().feudal_monarchy)
	expect(
		state.events.filter(
			(note) =>
				note.tag === "government change" && note.data.cause !== "inherited",
		),
	).toHaveLength(1)
})

it("an unchanged inherited republic immediately receives electors", () => {
	const { state, rng } = fixture(2)
	state.governmentType[0] = GOVERNMENT.getGovIdx().oligarchic_republic
	state.governmentType[1] = GOVERNMENT.getGovIdx().oligarchic_republic
	STATE.releaseProvince({ state, p: 1, rng, reason: "rebellion" })
	expect(state.people.patricians.get(1)?.length).toBeGreaterThanOrEqual(3)
	expect(
		SUCCESSION_SYSTEMS.choose({
			state,
			realm: 1,
			dying: state.people.rulerOf[1],
			rng,
		}).heir,
	).toBeGreaterThanOrEqual(0)
})

it.each([
	"PU_SENIOR",
	"PU_JUNIOR",
] as const)("ends %s links and their generation entries", (relation) => {
	const { state, rng } = fixture(2)
	FIELDS.prov.parent.set({ state, p: 1, value: -1 })
	STATE.setRelation({ state, a: 0, b: 1, rel: relation })
	const junior = relation === "PU_JUNIOR" ? 0 : 1
	state.people.unionGenerations.set(junior, 2)
	state.governmentType[0] = GOVERNMENT.getGovIdx().oligarchic_republic
	STATE.reconcileGovernment({ state, realm: 0, transition: null, rng })
	expect(STATE.getRelation({ state, a: 0, b: 1 })).toBe("NONE")
	expect(state.people.unionGenerations.has(junior)).toBe(false)
})

it("yearly conversion reconciles marriage bindings and preserves the alliance", () => {
	const { state, rng } = fixture(2)
	FIELDS.prov.parent.set({ state, p: 1, value: -1 })
	STATE.setRelation({ state, a: 0, b: 1, rel: "ALLY" })
	state.people.marriageAlliances.set(7, { first: 0, second: 1 })
	state.popUrbanCurrent[0] = 30_000
	state.popRuralCurrent[0] = 70_000
	SUCCESSION.runYear({ state, rng })
	expect(state.governmentType[0]).toBe(
		GOVERNMENT.getGovIdx().oligarchic_republic,
	)
	expect(state.people.marriageAlliances.size).toBe(0)
	expect(STATE.getRelation({ state, a: 0, b: 1 })).toBe("ALLY")
	expect(
		state.events.some((note) => note.tag === "marriage alliance ended"),
	).toBe(true)
	expect(state.people.patricians.get(0)?.length).toBeGreaterThanOrEqual(3)
	const report = GOVERNMENT_REPORT.summarize({
		engine: state,
		from: 867,
		to: 868,
	})
	expect(report.transitions).toBe(1)
	expect(report.types.oligarchic_republic.realms).toBe(1)
})

it("settles the elective succession before the absolute accession", () => {
	const { state, rng, ruler } = fixture(20)
	state.governmentType[0] = GOVERNMENT.getGovIdx().elective_monarchy
	state.knowledgeCurrent.fill(2)
	state.realmCache.clear()
	const chosen = DISTRICT_FIXTURE.person({
		fixture: {
			state,
			rng,
			root: 0,
			members: Array.from({ length: 20 }, (_, p) => p),
		},
		seat: -1,
		father: -1,
	})
	const choose = vi.spyOn(SUCCESSION_SYSTEMS, "choose")
	choose.mockImplementationOnce(() => {
		expect(state.governmentType[0]).toBe(
			GOVERNMENT.getGovIdx().elective_monarchy,
		)
		return {
			heir: chosen,
			claim: 3,
			interregnum: false,
			supportingSeats: [],
			pretenderSeat: -1,
			pretender: -1,
			foreignClaimant: -1,
		}
	})
	SUCCESSION.succeedPerson({
		state,
		person: ruler,
		context: { accountedEdges: new Set(), cause: "natural" },
		rng,
	})
	choose.mockRestore()
	expect(state.people.rulerOf[0]).toBe(chosen)
	expect(state.governmentType[0]).toBe(GOVERNMENT.getGovIdx().absolute_monarchy)
})

it("translates inheritance before a founding transition without duplicate events", () => {
	const { engine: state, generated: world } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 3000,
	})
	const realm = Array.from({ length: state.P }, (_, p) => p).find(
		(p) =>
			!state.stateless[p] &&
			!state.desolate[p] &&
			STATE.isSovereign({ state, p }),
	) as number
	const serialized = world as unknown as SerializedGenesisWorld
	const record = SIM_RECORD.buildProceduralState({
		world: serialized,
		startTimeMs: state.time,
	})
	const translator = SIM_RECORD.createTranslator({
		state: record,
		world: serialized,
	})
	const id = translator.identityByRoot.get(realm) as number
	const log = record.record.events.nationEvents[id]
	log.events.length = 0
	log.base.initialGovernment = "chiefdom"
	state.journal.length = 0
	state.events.length = 0
	state.events.push(
		{
			tag: "government change",
			time: state.time,
			data: {
				nation: realm,
				from: "chiefdom",
				to: "absolute_monarchy",
				cause: "inherited",
			},
		},
		{
			tag: "government change",
			time: state.time,
			data: {
				nation: realm,
				from: "absolute_monarchy",
				to: "feudal_monarchy",
				cause: "size",
			},
		},
	)
	JOURNAL.flush({ state, noteCursor: 0, census: false, initial: false })
	SIM_RECORD.appendJournal({ translator, transactions: state.journal })
	expect(log.base.initialGovernment).toBe("absolute_monarchy")
	expect(
		log.events
			.filter((event) => event.kind === "governmentChange")
			.map((event) => event.comment),
	).toEqual(["size"])
	const noteCursor = state.events.length
	state.time += STATE.yearMs
	for (const [from, to, cause] of [
		["feudal_monarchy", "feudal_monarchy", "inherited"],
		["feudal_monarchy", "absolute_monarchy", "inherited"],
		["absolute_monarchy", "feudal_monarchy", "size"],
		["feudal_monarchy", "oligarchic_republic", "city"],
		["oligarchic_republic", "dynastic_signoria", "election streak"],
		["dynastic_signoria", "oligarchic_republic", "house lost"],
		["oligarchic_republic", "feudal_monarchy", "inherited"],
		["feudal_monarchy", "absolute_monarchy", "knowledge"],
	] as const)
		state.events.push({
			tag: "government change",
			time: state.time,
			data: { nation: realm, from, to, cause },
		})
	JOURNAL.flush({ state, noteCursor, census: false, initial: false })
	SIM_RECORD.appendJournal({
		translator,
		transactions: state.journal.slice(-1),
	})
	const changes = log.events.filter(
		(event) => event.kind === "governmentChange",
	)
	expect(changes.map((event) => event.comment)).toEqual([
		"size",
		"inherited",
		"size",
		"city",
		"election streak",
		"house lost",
		"inherited",
		"knowledge",
	])
	expect(
		changes.slice(1).every((event) => event.timeMs > changes[0].timeMs),
	).toBe(true)
	expect(log.base.initialGovernment).toBe("absolute_monarchy")
})
