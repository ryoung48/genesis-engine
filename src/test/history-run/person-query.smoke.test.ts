import { expect, it } from "vitest"
import { HISTORY } from "@/model/history/record"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { NAMES } from "@/model/society/language/names"
import { HISTORY_RUN } from "@/test/history-run"

const SEED = 14963991
const YEARS = 60

it("answers person pages consistently with the record", () => {
	const { world, state } = HISTORY_RUN.build({
		seed: SEED,
		era: "highMedieval",
		numPoints: 20000,
		years: YEARS,
	})
	const names = NAMES.createWorldNames(world)
	const record = state.record.people
	const timeMs = state.record.maxTimeMs
	const frame = HISTORY.frameAt({ state, timeMs })
	const pageOf = (person: number, at = timeMs) => {
		const page = PERSON_QUERY.page({
			state,
			frame: HISTORY.frameAt({ state, timeMs: at }),
			names,
			person,
			timeMs: at,
		})
		if (!page) throw new Error(`No page for ${person}`)
		return page
	}
	expect(
		PERSON_QUERY.page({
			state,
			frame,
			names,
			person: record.count + 5,
			timeMs,
		}),
	).toBeNull()

	const step = Math.max(1, Math.floor(record.count / 400))
	for (let person = 0; person < record.count; person += step) {
		const page = pageOf(person)
		for (const parent of page.parents) {
			const parentPage = pageOf(parent.id)
			expect(parentPage.children.map((child) => child.id)).toContain(person)
		}
		for (const child of page.children) {
			const childPage = pageOf(child.id)
			expect(childPage.parents.map((parent) => parent.id)).toContain(person)
		}
		for (const sibling of page.siblings)
			expect(pageOf(sibling.id).siblings.map((s) => s.id)).toContain(person)
		for (const spouse of page.spouses)
			expect(pageOf(spouse.id).spouses.map((s) => s.id)).toContain(person)

		const marriages = PEOPLE_RECORD.marriages({ record, person })
		expect(page.spouses.length).toBe(marriages.length)
		const active = marriages.filter(
			(marriage) =>
				marriage.startMs <= timeMs &&
				(marriage.endMs === null || marriage.endMs > timeMs),
		)
		expect(
			page.spouses.filter((s) => s.marriage.state === "active").length,
		).toBe(active.length)
		expect(active.length).toBeLessThanOrEqual(1)

		const points = PEOPLE_RECORD.health({ record, person })
		if (page.status === "alive" && points.length > 0)
			expect(page.healthBand).toBe(
				LIFESPAN.healthBand(points[points.length - 1].health),
			)
		if (page.status === "dead")
			expect(page.healthBand).toBe(
				LIFESPAN.healthBand(record.deathHealth[person]),
			)
	}

	const midMs = state.record.minTimeMs + (timeMs - state.record.minTimeMs) / 2
	for (const at of [midMs, timeMs]) {
		const atFrame = HISTORY.frameAt({ state, timeMs: at })
		const titles = atFrame.titles
		if (!titles) throw new Error("Frame has no titles")
		const perPerson = new Map<number, number[]>()
		let held = 0
		let vacant = 0
		for (let title = 0; title < titles.count; title++) {
			const seat = titles.holder[title]
			if (seat < 0) continue
			const tenure = PEOPLE_RECORD.tenuresOfSeat({ record, seat }).find(
				(view) =>
					view.startMs <= at && (view.endMs === null || view.endMs > at),
			)
			if (!tenure) {
				vacant++
				continue
			}
			held++
			perPerson.set(tenure.person, [
				...(perPerson.get(tenure.person) ?? []),
				title,
			])
		}
		expect(held).toBeGreaterThan(0)
		let counted = 0
		for (const [person, expected] of perPerson) {
			const page = pageOf(person, at)
			expect(page.titles.map((ref) => ref.title).sort((a, b) => a - b)).toEqual(
				[...expected].sort((a, b) => a - b),
			)
			counted += page.titles.length
		}
		expect(counted).toBe(held)
		expect(vacant).toBeGreaterThanOrEqual(0)
	}
}, 3_600_000)
