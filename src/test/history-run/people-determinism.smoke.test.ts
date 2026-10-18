import { beforeAll, describe, expect, it } from "vitest"
import { PERSON_KEY } from "@/model/people/keys"
import { MARRIAGE } from "@/model/people/marriage"
import { PERSON_QUERY } from "@/model/people/query"
import type { PersonPage } from "@/model/people/query/types"
import { PEOPLE_STORE } from "@/model/people/store"
import { PERSON_STUB } from "@/model/people/stub"
import { PEOPLE_FIXTURE } from "@/test/history-run/fixtures/people"
import type { PeopleFixture } from "@/test/history-run/fixtures/people/types"

const SAMPLE = 50

function plain(text: string): string {
	return text.replace(/ \([^)]*\)/g, "")
}

let fixture: PeopleFixture
let keys: string[] = []

function pageOf(store: PeopleFixture["store"], key: string, timeMs: number) {
	return PERSON_QUERY.page({
		store,
		key,
		timeMs,
		frameAt: fixture.frameAt,
		doctrine: fixture.doctrine,
		geography: fixture.geography,
	})
}

function memberFields(page: PersonPage) {
	return page.groups.flatMap((group) =>
		group.members.map((member) => ({
			key: member.key,
			name: member.name,
			house: member.house,
			female: member.female,
			ageYears: member.ageYears,
			status: member.status,
		})),
	)
}

beforeAll(() => {
	fixture = PEOPLE_FIXTURE.create({ years: 150, points: 20000 })
	const index = PEOPLE_STORE.index(fixture.store)
	const rulers = [...index.facts.values()]
		.filter((fact) => fact.reigns.length > 0)
		.map((fact) => fact.key)
	const step = Math.max(1, Math.floor(rulers.length / SAMPLE))
	keys = rulers.filter((_, at) => at % step === 0).slice(0, SAMPLE)
}, 600000)

describe("lazy people", () => {
	it("keeps every page the same when it is opened again in the same session", () => {
		const record = fixture.state.record
		const time = record.maxTimeMs
		const store = PEOPLE_STORE.reset({ record })
		const first = keys.map((key) => pageOf(store, key, time))
		const second = [...keys]
			.reverse()
			.map((key) => pageOf(store, key, time))
			.reverse()
		let violations = 0
		for (const [at, page] of first.entries())
			if (JSON.stringify(page) !== JSON.stringify(second[at])) violations++
		expect(violations).toBe(0)
	}, 600000)

	it("extends a page when the date moves later", () => {
		const record = fixture.state.record
		const store = PEOPLE_STORE.reset({ record })
		const early = record.minTimeMs + (record.maxTimeMs - record.minTimeMs) / 2
		let violations = 0
		let checked = 0
		for (const key of keys) {
			const before = pageOf(store, key, early)
			const after = pageOf(store, key, record.maxTimeMs)
			if (!before || !after) continue
			checked++
			const later = JSON.stringify(
				after.timeline
					.filter((row) => row.timeMs <= early)
					.map((row) => [row.timeMs, row.type, plain(row.text)]),
			)
			const earlier = JSON.stringify(
				before.timeline.map((row) => [row.timeMs, row.type, plain(row.text)]),
			)
			if (later !== earlier) violations++
		}
		expect(checked).toBeGreaterThan(0)
		expect(violations).toBe(0)
	}, 600000)

	it("shows the same facts about a relative before and after a click", () => {
		const record = fixture.state.record
		const time = record.maxTimeMs
		const warm = PEOPLE_STORE.reset({ record })
		let violations = 0
		let checked = 0
		for (const key of keys) {
			const page = pageOf(warm, key, time)
			if (!page) continue
			for (const member of memberFields(page)) {
				const own = pageOf(warm, member.key, time)
				if (!own) continue
				checked++
				if (
					own.name !== member.name ||
					own.house !== member.house ||
					own.female !== member.female ||
					own.status !== member.status ||
					Math.abs(own.ageYears - member.ageYears) > 1e-9
				)
					violations++
			}
			if (checked > 300) break
		}
		expect(checked).toBeGreaterThan(0)
		expect(violations).toBe(0)
	}, 600000)

	it("repeats each shared event on both pages with the same date and text", () => {
		const record = fixture.state.record
		const store = PEOPLE_STORE.reset({ record })
		let violations = 0
		let checked = 0
		for (const key of keys) {
			const page = pageOf(store, key, record.maxTimeMs)
			if (!page) continue
			const spouses = page.groups
				.filter(
					(group) =>
						group.label.endsWith("spouses") || group.label === "Spouses",
				)
				.flatMap((group) => group.members)
			for (const spouse of spouses) {
				const other = pageOf(store, spouse.key, record.maxTimeMs)
				if (!other) continue
				const weddings = page.timeline.filter((row) => row.type === "Marriage")
				for (const row of weddings.filter((entry) =>
					entry.text.includes("married"),
				)) {
					if (!row.text.includes(spouse.name)) continue
					checked++
					if (
						!other.timeline.some(
							(entry) =>
								entry.timeMs === row.timeMs &&
								plain(entry.text) === plain(row.text),
						)
					)
						violations++
				}
			}
		}
		expect(checked).toBeGreaterThan(0)
		expect(violations).toBe(0)
	}, 600000)

	it("builds one page and the parents' chains for one click", () => {
		const record = fixture.state.record
		const store = PEOPLE_STORE.reset({ record })
		PEOPLE_STORE.index(store)
		PEOPLE_STORE.resetBuilds(store)
		const key = keys[Math.floor(keys.length / 2)]
		const page = pageOf(store, key, record.maxTimeMs)
		expect(page).not.toBeNull()
		expect([...store.builds.l3]).toEqual([key])
		const parents = (
			page?.groups.find((group) => group.label === "Parents")?.members ?? []
		).map((member) => member.key)
		for (const built of store.builds.l2)
			expect([key, ...parents]).toContain(built)
	}, 600000)

	it("rebuilds the store only when the record grows", () => {
		const record = fixture.state.record
		const store = PEOPLE_STORE.of({ record })
		expect(PEOPLE_STORE.of({ record })).toBe(store)
		const horizon = record.maxTimeMs
		record.maxTimeMs = horizon + 1
		try {
			expect(PEOPLE_STORE.of({ record })).not.toBe(store)
		} finally {
			record.maxTimeMs = horizon
		}
	})

	it("keeps recorded facts for every sampled ruler", () => {
		const store = PEOPLE_STORE.reset({ record: fixture.state.record })
		let violations = 0
		for (const key of keys) {
			const parsed = PERSON_KEY.parse(key)
			if (parsed.tag !== "R") continue
			const fact = PEOPLE_STORE.index(store).facts.get(parsed.rulerId)
			const page = pageOf(store, key, fixture.state.record.maxTimeMs)
			if (!fact || !page) continue
			if (page.birthMs !== fact.birthMs || page.female !== (fact.ref.sex === 1))
				violations++
			if (
				fact.fixedDeathMs !== null &&
				fact.fixedDeathMs !== Infinity &&
				page.deathMs !== fact.fixedDeathMs
			)
				violations++
		}
		expect(violations).toBe(0)
	}, 600000)

	it("fills royal-marriage ties as weddings on both pages", () => {
		const record = fixture.state.record
		const store = PEOPLE_STORE.reset({ record })
		const index = PEOPLE_STORE.index(store)
		const ties = [...index.couples.values()].filter((couple) => couple.tie)
		expect(ties.length).toBeGreaterThan(0)
		let violations = 0
		for (const couple of ties.slice(0, 30)) {
			const time = Math.min(record.maxTimeMs, couple.tie?.startMs ?? 0 + 1)
			const husband = pageOf(store, couple.father, record.maxTimeMs)
			const wife = pageOf(store, couple.mother, record.maxTimeMs)
			if (!husband || !wife || time < 0) continue
			const has = (page: PersonPage) =>
				page.timeline.some(
					(row) =>
						row.timeMs === couple.tie?.startMs && row.type === "Marriage",
				)
			if (!has(husband) || !has(wife)) violations++
		}
		expect(violations).toBe(0)
	}, 600000)

	it("lists a betrothal on both pages before a wedding at sixteen", () => {
		const record = fixture.state.record
		const store = PEOPLE_STORE.reset({ record })
		let betrothals = 0
		let violations = 0
		for (const key of keys) {
			for (const marriage of MARRIAGE.chain({ store, key }).marriages) {
				if (marriage.betrothedMs === null) continue
				betrothals++
				const husband = PERSON_STUB.of({ store, key: marriage.husband })
				const wife = PERSON_STUB.of({ store, key: marriage.wife })
				const sixteen =
					Math.max(husband.birthMs, wife.birthMs) + 16 * 365 * 86_400_000
				if (
					marriage.startMs < sixteen - 1 ||
					marriage.betrothedMs > marriage.startMs
				)
					violations++
				const page = pageOf(store, key, marriage.betrothedMs)
				if (!page?.timeline.some((row) => row.text.endsWith("were betrothed")))
					violations++
			}
		}
		expect(betrothals).toBeGreaterThan(0)
		expect(violations).toBe(0)
	}, 600000)
})
