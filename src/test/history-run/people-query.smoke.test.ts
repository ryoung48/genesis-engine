import { beforeAll, describe, expect, it } from "vitest"
import { RULER_NAMES } from "@/model/history/record/rulers"
import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import { FERTILITY } from "@/model/people/fertility"
import { LIFESPAN } from "@/model/people/health/lifespan"
import { PERSON_KEY } from "@/model/people/keys"
import { PERSON_QUERY } from "@/model/people/query"
import { PEOPLE_STORE } from "@/model/people/store"
import { PEOPLE_FIXTURE } from "@/test/history-run/fixtures/people"
import type { PeopleFixture } from "@/test/history-run/fixtures/people/types"

const YEAR = 365 * 86_400_000
const SAMPLE = 60

let fixture: PeopleFixture

beforeAll(() => {
	fixture = PEOPLE_FIXTURE.create({ years: 150, points: 20000 })
}, 600000)

describe("person pages", () => {
	it("show the recorded name, sex, house and birth of every ruler", () => {
		const store = PEOPLE_STORE.reset({ record: fixture.state.record })
		const index = PEOPLE_STORE.index(store)
		const facts = [...index.facts.values()].slice(0, SAMPLE)
		let violations = 0
		for (const fact of facts) {
			const page = PERSON_QUERY.page({
				store,
				key: fact.key,
				timeMs: fixture.state.record.maxTimeMs,
				frameAt: fixture.frameAt,
				doctrine: fixture.doctrine,
				geography: fixture.geography,
			})
			if (!page) continue
			const named = RULER_NAMES.names({
				record: fixture.state.record,
				ref: fact.ref,
			})
			if (
				page.name !== named.name ||
				page.house !== named.house ||
				page.female !== (fact.ref.sex === 1) ||
				page.birthMs !== fact.birthMs
			)
				violations++
		}
		expect(violations).toBe(0)
	}, 600000)

	it("list every family entry with its facts and an opinion that sums", () => {
		const store = PEOPLE_STORE.reset({ record: fixture.state.record })
		const index = PEOPLE_STORE.index(store)
		const facts = [...index.facts.values()].slice(0, SAMPLE)
		let entries = 0
		let violations = 0
		for (const fact of facts) {
			const page = PERSON_QUERY.page({
				store,
				key: fact.key,
				timeMs: fixture.state.record.maxTimeMs,
				frameAt: fixture.frameAt,
				doctrine: fixture.doctrine,
				geography: fixture.geography,
			})
			if (!page) continue
			for (const group of page.groups)
				for (const member of group.members) {
					entries++
					if (
						!member.name ||
						member.ageYears < 0 ||
						!member.status ||
						(member.status === "Dead") !== (member.opinion === null)
					)
						violations++
					const opinion = member.opinion
					if (opinion) {
						const sum =
							opinion.personality +
							opinion.culture +
							opinion.religion +
							opinion.reputation +
							opinion.kin +
							opinion.spouse
						if (
							sum !== opinion.unclamped ||
							opinion.total !== Math.max(-100, Math.min(100, sum))
						)
							violations++
					}
				}
		}
		expect(entries).toBeGreaterThan(0)
		expect(violations).toBe(0)
	}, 600000)

	it("place every recorded kin link on its own ladder and keep births possible", () => {
		const store = PEOPLE_STORE.reset({ record: fixture.state.record })
		const index = PEOPLE_STORE.index(store)
		const ladders: Record<string, string[]> = {
			son: ["son", "brother", "nephew", "unknown"],
			daughterLine: ["grandson", "sisterSon", "unknown"],
			nearKin: ["brother", "nephew", "uncle", "unknown"],
			kinsman: ["cousin", "uncle", "unknown"],
		}
		let violations = 0
		for (const placement of index.placements)
			if (!ladders[placement.requested].includes(placement.step)) violations++
		let impossible = 0
		for (const couple of index.couples.values()) {
			if (couple.tie) continue
			const mother = index.injected.get(couple.mother)?.birthMs
			const father = index.injected.get(couple.father)?.birthMs
			const motherBirth =
				mother ??
				index.facts.get(
					PERSON_KEY.parse(couple.mother).tag === "R"
						? Number(couple.mother.slice(2, -1))
						: -1,
				)?.birthMs
			const fatherBirth =
				father ??
				index.facts.get(
					PERSON_KEY.parse(couple.father).tag === "R"
						? Number(couple.father.slice(2, -1))
						: -1,
				)?.birthMs
			if (motherBirth === undefined || fatherBirth === undefined) continue
			for (const child of couple.children) {
				const motherAge = (child.birthMs - motherBirth) / YEAR
				const fatherAge =
					(child.birthMs - 280 * 86_400_000 - fatherBirth) / YEAR
				if (motherAge < 16 || motherAge > 45 || fatherAge < 16) impossible++
			}
		}
		expect(violations).toBe(0)
		expect(impossible).toBe(0)
	}, 600000)
})

describe("religion, orientation and plurality", () => {
	it("keeps every timeline row at or before the person's death", () => {
		const store = PEOPLE_STORE.reset({ record: fixture.state.record })
		const index = PEOPLE_STORE.index(store)
		let violations = 0
		for (const fact of [...index.facts.values()].slice(0, SAMPLE)) {
			const page = PERSON_QUERY.page({
				store,
				key: fact.key,
				timeMs: fixture.state.record.maxTimeMs,
				frameAt: fixture.frameAt,
				doctrine: fixture.doctrine,
				geography: fixture.geography,
			})
			for (const row of page?.timeline ?? [])
				if (row.timeMs > page!.deathMs) violations++
		}
		expect(violations).toBe(0)
	}, 600000)

	it("shows orientation from eighteen and generates plural wives and concubines", () => {
		const store = PEOPLE_STORE.reset({ record: fixture.state.record })
		const index = PEOPLE_STORE.index(store)
		let violations = 0
		for (const fact of index.facts.values()) {
			const page = PERSON_QUERY.page({
				store,
				key: fact.key,
				timeMs: fixture.state.record.maxTimeMs,
				frameAt: fixture.frameAt,
				doctrine: fixture.doctrine,
				geography: fixture.geography,
			})
			if (page && (page.orientation !== null) !== page.ageYears >= 18)
				violations++
		}
		expect(violations).toBe(0)
		const kinds = new Set(
			[...store.marriages.values()].map((entry) => entry.kind),
		)
		expect(kinds.has("plural") || kinds.has("concubine")).toBe(true)
	}, 600000)

	it("draws a marriage type for every religion", () => {
		expect(fixture.doctrine).not.toBeNull()
		const options = fixture.doctrine?.options ?? new Uint8Array()
		const width = RELIGION_DOCTRINE.groups.length
		expect(options.length % width).toBe(0)
		for (let religion = 0; religion < options.length / width; religion++)
			expect(["monogamy", "polygamy", "concubines"]).toContain(
				RELIGION_DOCTRINE.marriageType({
					doctrine: fixture.doctrine!,
					religion,
				}),
			)
	})
})

describe("single rules", () => {
	it("split background mortality at the first, fifth and sixteenth birthdays", () => {
		const survival = (from: number, to: number) =>
			LIFESPAN.survival({ birth: 0, health: 5, from, to })
		expect(survival(0, 1)).toBeCloseTo(0.9, 6)
		expect(survival(1, 5)).toBeCloseTo(0.97 ** 4, 6)
		expect(survival(5, 16)).toBeCloseTo(0.995 ** 11, 6)
		expect(survival(16, 17)).toBeCloseTo(1 - 0.012, 6)
		expect(survival(0, 17)).toBeCloseTo(
			survival(0, 1) * survival(1, 5) * survival(5, 16) * survival(16, 17),
			9,
		)
	})

	it("weights a smooth birth by the mother's health and earlier children", () => {
		expect(FERTILITY.smoothWeight({ health: 6, earlier: 0 })).toBe(215)
		expect(FERTILITY.smoothWeight({ health: 5, earlier: 0 })).toBe(205)
		expect(FERTILITY.smoothWeight({ health: 3, earlier: 0 })).toBe(190)
		expect(FERTILITY.smoothWeight({ health: 3, earlier: 4 })).toBe(200)
	})
})
