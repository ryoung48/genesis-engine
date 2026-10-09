import { writeFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { STATE } from "@/model/history/sim/engine/state"
import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { FAMILY } from "@/model/history/sim/people/family"
import { MARRIAGE_MARKET } from "@/model/history/sim/people/family/market"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import { HOLDINGS } from "@/model/history/sim/people/holdings"
import { KINSHIP } from "@/model/history/sim/people/kinship"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { MARRIAGE_LAW } from "@/model/history/sim/people/marriage-law"
import type { ConsanguinityBar } from "@/model/history/sim/people/marriage-law/types"
import { ORIENTATION } from "@/model/history/sim/people/orientation"
import { TRAITS } from "@/model/history/sim/people/traits"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RELIGION_DOCTRINE } from "@/model/history/sim/religion/doctrine"
import { HASH } from "@/model/shared/random/hash"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { MARRIAGE_FIXTURE } from "@/test/history-run/fixtures/marriage"
import { NO_RELIGION_SELECTION } from "@/test/history-run/no-religion-selection"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import { usePersonWikiData } from "@/ui/genesis/wiki-bridge/usePersonWikiData"
import { PersonWikiPage } from "@/ui/wiki/person/PersonWikiPage"

it("maps all marriage and consanguinity options and defaults", () => {
	const doctrine = RELIGION_DOCTRINE.assign({
		religionTypes: new Uint8Array([0]),
		religionFamilies: new Int32Array([0]),
		familyCount: 1,
		seed: 3,
	})
	const bars: ConsanguinityBar[] = [
		"restricted",
		"cousins",
		"aunt_nephew_and_uncle_niece",
		"unrestricted",
	]
	for (let marriage = 0; marriage < 3; marriage++)
		for (let bar = 0; bar < 4; bar++) {
			doctrine.options[0] = marriage
			doctrine.options[3] = bar
			expect(RELIGION_DOCTRINE.marriageLaw({ doctrine, religion: 0 })).toEqual({
				consort: ["none", "wife", "concubine"][marriage],
				consortMax: marriage ? 3 : 0,
				bar: bars[bar],
			})
		}
	expect(RELIGION_DOCTRINE.marriageLaw({ doctrine, religion: -1 })).toEqual(
		MARRIAGE_LAW.defaultLaw,
	)
	expect(
		RELIGION_DOCTRINE.marriageLaw({ doctrine: undefined, religion: 0 }),
	).toEqual(MARRIAGE_LAW.defaultLaw)
})

it("classifies pedigrees and computes nearest-common-ancestor relatedness", () => {
	const context = {
		father: [-1, -1, 0, 0, 0, -1, 2, 3, 6, 7],
		mother: [-1, -1, 1, 1, -1, -1, 5, 5, -1, -1],
	}
	expect(KINSHIP.relation({ context, a: 2, b: 3, cache: null })).toEqual({
		kind: "close",
		relatedness: 0.5,
	})
	expect(KINSHIP.relation({ context, a: 2, b: 4, cache: null })).toEqual({
		kind: "close",
		relatedness: 0.25,
	})
	expect(KINSHIP.relation({ context, a: 2, b: 7, cache: null })).toEqual({
		kind: "uncleNiece",
		relatedness: 0.25,
	})
	expect(KINSHIP.relation({ context, a: 0, b: 2, cache: null })).toEqual({
		kind: "close",
		relatedness: 0.5,
	})
	context.mother[7] = -1
	expect(KINSHIP.relation({ context, a: 6, b: 7, cache: null })).toEqual({
		kind: "cousin",
		relatedness: 0.125,
	})
	expect(KINSHIP.relation({ context, a: 8, b: 9, cache: null })).toEqual({
		kind: "distant",
		relatedness: 0.03125,
	})
	expect(KINSHIP.relation({ context, a: 0, b: 1, cache: null })).toEqual({
		kind: "none",
		relatedness: 0,
	})
})

it("applies both faiths' bars and ignores orientation for opposite-sex pairs", () => {
	const fixture = MARRIAGE_FIXTURE.create(),
		people = fixture.people
	const a = MARRIAGE_FIXTURE.add({ fixture, age: 30, sex: 0, realm: 0 })
	const b = MARRIAGE_FIXTURE.add({ fixture, age: 30, sex: 1, realm: 1 })
	let violations = 0
	for (const first of [0, 1, 2, 3] as const)
		for (const second of [0, 1, 2, 3] as const) {
			people.persons.orientation[a] = first
			people.persons.orientation[b] = second
			if (!MARRIAGE_LAW.permits({ people, a, b, cache: null })) violations++
		}
	people.persons.sex[b] = 0
	expect(MARRIAGE_LAW.permits({ people, a, b, cache: null })).toBe(false)
	people.persons.sex[b] = 1
	const ancestor = MARRIAGE_FIXTURE.add({ fixture, age: 60, sex: 0, realm: 0 })
	people.persons.father[a] = ancestor
	people.persons.father[b] = ancestor
	people.household.lawOfRealm = (realm) => ({
		consort: "none",
		consortMax: 0,
		bar: realm === 0 ? "unrestricted" : "restricted",
	})
	expect(MARRIAGE_LAW.permits({ people, a, b, cache: null })).toBe(false)
	people.household.lawOfRealm = () => ({
		consort: "none",
		consortMax: 0,
		bar: "unrestricted",
	})
	expect(MARRIAGE_LAW.permits({ people, a, b, cache: null })).toBe(true)
	expect(violations).toBe(0)
})

it("fixes orientation from the name seed through redraw and hides it before ten", () => {
	let violations = 0
	for (let seed = 0; seed < 1000; seed++) {
		const first = ORIENTATION.of({ seed })
		if (first !== ORIENTATION.of({ seed }) || first < 0 || first > 3)
			violations++
	}
	expect(violations).toBe(0)
	const fixture = MARRIAGE_FIXTURE.create()
	const person = MARRIAGE_FIXTURE.add({ fixture, age: 9, sex: 0, realm: 0 })
	const orientation = fixture.people.persons.orientation[person]
	PEOPLE.redraw({ people: fixture.people, person })
	expect(fixture.people.persons.orientation[person]).toBe(orientation)
	const record = PEOPLE_RECORD.create()
	PEOPLE_RECORD.append({
		record,
		packet: PEOPLE_LOG.seal({ people: fixture.people, sovereign: () => true }),
		timeMs: 100 * STATE.yearMs,
		recordTime: (years) => years * STATE.yearMs,
	})
	expect(
		PERSON_QUERY.view({
			people: record,
			id: person,
			timeMs: 100 * STATE.yearMs,
		})?.orientation,
	).toBeNull()
	expect(
		PERSON_QUERY.view({
			people: record,
			id: person,
			timeMs: 101 * STATE.yearMs,
		})?.orientation,
	).toBe(orientation)
	record.persons.deathTimeMs[person] = 100 * STATE.yearMs
	expect(
		PERSON_QUERY.view({
			people: record,
			id: person,
			timeMs: 101 * STATE.yearMs,
		})?.orientation,
	).toBeNull()
})

it("releases a barred betrothal once", () => {
	const fixture = MARRIAGE_FIXTURE.create(),
		people = fixture.people
	const a = MARRIAGE_FIXTURE.add({ fixture, age: 20, sex: 0, realm: 0 })
	const b = MARRIAGE_FIXTURE.add({ fixture, age: 20, sex: 1, realm: 0 })
	BETROTHAL.betroth({ people, a, b, time: 95 })
	people.persons.father[b] = a
	let releases = 0
	expect(
		BETROTHAL.fulfil({ people, time: 100, onKinship: () => releases++ }),
	).toEqual([])
	BETROTHAL.fulfil({ people, time: 100, onKinship: () => releases++ })
	expect(releases).toBe(1)
})

it("limits consorts by law and standing and records their kind", () => {
	for (const kind of ["none", "wife", "concubine"] as const) {
		const fixture = MARRIAGE_FIXTURE.create(),
			people = fixture.people
		const man = MARRIAGE_FIXTURE.add({ fixture, age: 30, sex: 0, realm: 0 })
		const ranks = [1, 0, 0, 0, 0, 0]
		people.household.ranks = () => ranks
		people.household.lawOfRealm = () => ({
			consort: kind,
			consortMax: kind === "none" ? 0 : 3,
			bar: "restricted",
		})
		HOLDINGS.attach({ people, person: man, seat: 0 })
		for (let i = 0; i < 4; i++)
			MARRIAGE_FIXTURE.add({ fixture, age: 25, sex: 1, realm: 0 })
		for (let i = 0; i < 4; i++)
			MARRIAGE_MARKET.takeConsorts({
				people,
				time: 100,
				chance: 1,
				market: fixture.market,
			})
		expect(people.persons.consorts[man]).toHaveLength(kind === "none" ? 0 : 1)
		if (kind === "none") continue
		const partner = people.persons.consorts[man][0]
		expect(people.persons.patron[partner]).toBe(man)
		expect(people.persons.spouse[man]).toBe(-1)
		const packet = PEOPLE_LOG.seal({ people, sovereign: () => true })
		const record = PEOPLE_RECORD.create()
		PEOPLE_RECORD.append({
			record,
			packet,
			timeMs: 100,
			recordTime: (years) => years,
		})
		expect(record.consorts[0]).toMatchObject({
			patron: man,
			partner,
			consortKind: kind,
		})
		expect(
			PERSON_QUERY.view({ people: record, id: partner, timeMs: 100 })?.patron
				?.person,
		).toBe(man)
	}
})

it("draws inbreeding from fixed hash thresholds and applies trait effects", () => {
	const fixture = MARRIAGE_FIXTURE.create(),
		table = fixture.people.persons
	for (const sex of [0, 1, 0] as const)
		MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
	table.father[2] = 0
	table.mother[2] = 1
	table.father[1] = 0
	let violations = 0
	for (let seed = 0; seed < 1000; seed++) {
		table.nameSeed[2] = seed
		const result = TRAITS.draw({ table, person: 2 })
		const inbred = HASH.unit({ seed, channel: 400, salt: 0 }) < 0.15
		const pure = !inbred && HASH.unit({ seed, channel: 403, salt: 0 }) < 0.015
		if (
			Boolean(result.congenital & (1 << 15)) !== inbred ||
			Boolean(result.congenital & (1 << 16)) !== pure ||
			result.carried & (3 << 15)
		)
			violations++
	}
	expect(violations).toBe(0)
	const character = {
		bases: 0,
		personality: 0,
		grades: 3 | (3 << 7) | (3 << 14),
		congenital: 1 << 15,
		carried: 0,
	}
	expect(TRAITS.modifier({ character, age: 30, modifier: "health" })).toBe(-1.5)
	expect(TRAITS.modifier({ character, age: 30, modifier: "fertility" })).toBe(
		-0.5,
	)
})

it("restricts male-dominated cultures and preserves doctrine-less systems", () => {
	const doctrine = RELIGION_DOCTRINE.assign({
		religionTypes: new Uint8Array([0, 0]),
		religionFamilies: new Int32Array([0, 0]),
		familyCount: 1,
		seed: 3,
	})
	doctrine.options[8] = 0
	doctrine.options[23] = 1
	const params = {
		systems: new Uint8Array([2, 2]),
		cultureToReligion: new Int32Array([0, 1]),
		doctrine,
		seed: 9,
	}
	const systems = GENDER_SYSTEM.restrict(params)
	expect(systems[0]).toBe(0)
	expect(GENDER_SYSTEM.restrict(params)).toEqual(systems)
	expect(GENDER_SYSTEM.restrict({ ...params, doctrine: undefined })).toBe(
		params.systems,
	)
})

it("projects and delivers a consort's child with the patron as father", () => {
	const fixture = MARRIAGE_FIXTURE.create()
	const people = fixture.people
	const father = MARRIAGE_FIXTURE.add({ fixture, age: 30, sex: 0, realm: 0 })
	const mother = MARRIAGE_FIXTURE.add({ fixture, age: 25, sex: 1, realm: 0 })
	people.persons.patron[mother] = father
	people.persons.consorts[father].push(mother)
	const project = vi.spyOn(FERTILITY, "project").mockReturnValue([])
	try {
		FAMILY.project({
			people,
			time: 100,
			rulers: [father],
			originOf: fixture.market.originOf,
			rng: fixture.rng,
		})
		expect(project).toHaveBeenCalledWith(
			expect.objectContaining({ mother, father }),
		)
	} finally {
		project.mockRestore()
	}
	FERTILITY.deliver({
		people,
		time: 101,
		rng: fixture.rng,
		birthDraws: null,
		pregnancy: {
			mother,
			father,
			conception: 100,
			due: 101,
			outcome: "birth",
			twins: false,
			origin: fixture.market.originOf(0),
		},
	})
	const child = people.persons.children[mother][0]
	expect(people.persons.father[child]).toBe(father)
})

it("clears either side of a consort tie on death", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const people = state.people,
		table = people.persons
	const time = state.time / STATE.yearMs
	const father = people.alive.find(
		(person) =>
			table.sex[person] === 0 &&
			table.heldSeats[person].length === 0 &&
			table.death[person] > time,
	)!
	const partners = people.alive
		.filter(
			(person) =>
				table.sex[person] === 1 &&
				table.heldSeats[person].length === 0 &&
				table.death[person] > time,
		)
		.slice(0, 2)
	table.consorts[father] = partners.slice()
	for (const partner of partners) table.patron[partner] = father
	PERSON_DEATH.kill({
		state,
		person: partners[0],
		cause: "natural",
		rng: MARRIAGE_FIXTURE.create().rng,
	})
	expect(table.patron[partners[0]]).toBe(-1)
	expect(table.consorts[father]).toEqual([partners[1]])
	PERSON_DEATH.kill({
		state,
		person: father,
		cause: "natural",
		rng: MARRIAGE_FIXTURE.create().rng,
	})
	expect(table.patron[partners[1]]).toBe(-1)
	expect(table.consorts[father]).toEqual([])
})

it("produces the same weddings and projected pregnancies for any orientation", () => {
	const outcomes = []
	for (const drawn of [false, true]) {
		const fixture = MARRIAGE_FIXTURE.create(),
			people = fixture.people
		for (const sex of [0, 1, 0, 1] as const) {
			const person = MARRIAGE_FIXTURE.add({ fixture, age: 25, sex, realm: 0 })
			if (!drawn) people.persons.orientation[person] = 0
		}
		const marriages = FAMILY.runYear({
			people,
			time: 100,
			rulers: [0, 2],
			sovereigns: [0, 2],
			rng: { ...fixture.rng, random: () => 0 },
			...fixture.market,
		})
		expect(marriages.weddings.length).toBeGreaterThan(0)
		FAMILY.project({
			people,
			time: 100,
			rulers: [0, 2],
			rng: fixture.rng,
			originOf: fixture.market.originOf,
		})
		outcomes.push({
			marriages,
			pregnancies: [...people.deliveries.byId.values()],
		})
	}
	expect(outcomes[0]).toEqual(outcomes[1])
})

it("enforces every relationship bar and inherits the two traits independently", () => {
	const fixture = MARRIAGE_FIXTURE.create(),
		people = fixture.people,
		table = people.persons
	for (let person = 0; person < 10; person++)
		MARRIAGE_FIXTURE.add({
			fixture,
			age: 30,
			sex: person % 2 === 0 ? 0 : 1,
			realm: 0,
		})
	table.father = [-1, -1, 0, 0, -1, -1, 2, 3, 6, 7]
	table.mother = [-1, -1, 1, 1, -1, -1, 4, 5, -1, -1]
	const bars: ConsanguinityBar[] = [
		"restricted",
		"cousins",
		"aunt_nephew_and_uncle_niece",
		"unrestricted",
	]
	const pairs = [
		{ a: 0, b: 3, allowed: 3 },
		{ a: 2, b: 7, allowed: 2 },
		{ a: 6, b: 7, allowed: 1 },
		{ a: 8, b: 9, allowed: 0 },
	]
	let violations = 0
	for (const pair of pairs)
		for (let bar = 0; bar < bars.length; bar++) {
			people.household.lawOfRealm = () => ({
				consort: "none",
				consortMax: 0,
				bar: bars[bar],
			})
			if (
				MARRIAGE_LAW.permits({ people, a: pair.a, b: pair.b, cache: null }) !==
				bar >= pair.allowed
			)
				violations++
		}
	// Person nine is a child of the first-cousin pair, then of unrelated parents.
	table.father[9] = 6
	table.mother[9] = 7
	for (const related of [false, true])
		for (const parentalTrait of [0, 1 << 15, 1 << 16])
			for (let seed = 0; seed < 32; seed++) {
				table.father[9] = related ? 6 : 4
				table.mother[9] = related ? 7 : 5
				for (const parent of [4, 5, 6, 7])
					table.congenital[parent] = parentalTrait
				table.nameSeed[9] = seed
				const roll = (channel: number) => HASH.unit({ seed, channel, salt: 0 })
				const r = related ? 0.125 : 0
				const inbred =
					roll(400) < 0.3 * r * (parentalTrait === 1 << 16 ? 0 : 1) ||
					(parentalTrait === 1 << 15 && (roll(401) < 0.15 || roll(402) < 0.15))
				const pure =
					!inbred &&
					(roll(403) < 0.03 * r ||
						(parentalTrait === 1 << 16 && roll(404) < 0.75))
				const result = TRAITS.draw({ table, person: 9 })
				if (
					Boolean(result.congenital & (1 << 15)) !== inbred ||
					Boolean(result.congenital & (1 << 16)) !== pure
				)
					violations++
			}
	expect(violations).toBe(0)
})

function PersonPreview(input: PersonWikiDataInput) {
	const person = usePersonWikiData(input)
	return person ? createElement(PersonWikiPage, { person }) : null
}

it("renders orientation, consorts, patron and the new congenital traits", () => {
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const state = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	SIM_RECORD.consumeJournal({
		translator: SIM_RECORD.createTranslator({ state, world }),
		transactions: engine.journal,
	})
	const record = state.record.people!
	const child = Array.from(
		{ length: record.persons.count },
		(...entry) => entry[1],
	).find(
		(id) =>
			record.persons.father[id] >= 0 &&
			record.persons.mother[id] >= 0 &&
			engine.time - record.persons.birthTimeMs[id] >= 10 * STATE.yearMs,
	)!
	const father = record.persons.father[child],
		mother = record.persons.mother[child]
	for (const id of [child, father, mother])
		record.persons.deathTimeMs[id] = Infinity
	record.persons.congenital[child] = 1 << 15
	record.consorts.push({
		patron: father,
		partner: mother,
		consortKind: "concubine",
		startTimeMs: engine.time,
	})
	record.consortsOf.set(father, [0])
	record.consortsOf.set(mother, [0])
	const input: PersonWikiDataInput = {
		religionSelection: NO_RELIGION_SELECTION,
		selectedWikiPersonId: child,
		sceneRef: { current: null },
		setSelectedWikiNationId: () => undefined,
		setSelectedWikiOrganizationId: () => undefined,
		setSelectedWikiWarId: () => undefined,
		setSelectedWikiPersonId: () => undefined,
		history: {
			state,
			selectedTimeMs: engine.time,
			setSelectedTimeMs: (): void => undefined,
			minTimeMs: state.record.minTimeMs,
			maxTimeMs: state.record.maxTimeMs,
		} as unknown as PersonWikiDataInput["history"],
	}
	const html = renderToStaticMarkup(createElement(PersonPreview, input))
	expect(html).toContain("Orientation")
	expect(html).toContain("Inbred")
	expect(
		renderToStaticMarkup(
			createElement(PersonPreview, { ...input, selectedWikiPersonId: father }),
		),
	).toContain("Consorts")
	expect(
		renderToStaticMarkup(
			createElement(PersonPreview, { ...input, selectedWikiPersonId: mother }),
		),
	).toContain("Concubine of")
	record.persons.congenital[child] = 1 << 16
	expect(renderToStaticMarkup(createElement(PersonPreview, input))).toContain(
		"Pure-blooded",
	)
	if (process.env.MARRIAGE_UI_PREVIEW)
		writeFileSync(
			process.env.MARRIAGE_UI_PREVIEW,
			`<!doctype html><html><head><meta charset="utf-8"><title>Inbred child fixture</title></head><body>${html}</body></html>`,
		)
})
