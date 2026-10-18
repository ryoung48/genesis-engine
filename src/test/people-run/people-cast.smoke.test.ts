import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { RULER_NAMES } from "@/model/history/record/rulers"
import { ANCHORS } from "@/model/people/anchors"
import { CAST } from "@/model/people/cast"
import { FERTILITY } from "@/model/people/fertility"
import { HEALTH } from "@/model/people/health"
import { MARRIAGE } from "@/model/people/marriage"
import { KINSHIP } from "@/model/people/marriage/kinship"
import { TIME } from "@/model/shared/time"
import { HISTORY_OUTPUT } from "@/test/history-run/output"
import { CAST_SCENARIO } from "@/test/people-run/cast"
import type { Scenario } from "@/test/people-run/cast/types"

const YEAR = TIME.constants.yearMS
const FRAME = 16

let scenario: Scenario

beforeAll(() => {
	scenario = CAST_SCENARIO.run()
}, 1_200_000)

describe("persistence", () => {
	it("keeps every shown fact when the record grows and other pages open", () => {
		expect(scenario.changed).toEqual([])
	})

	it("only appends to marriages, pregnancies and children", () => {
		expect(scenario.structural).toBe(0)
	})

	it("extends lives without changing earlier rows or deaths", () => {
		expect(scenario.lifeDrift).toBe(0)
	})
})

describe("record fidelity", () => {
	it("gives every generated ruler the recorded identity, birth and death", () => {
		const { cast } = scenario
		let violations = 0
		for (const [rulerId, id] of cast.rulerPerson) {
			const fact = cast.anchors.facts.get(rulerId)
			if (!fact) continue
			const person = cast.persons[id]
			const named = RULER_NAMES.names({ record: cast.record, ref: fact.ref })
			const names = CAST.names({ cast, person })
			const life = CAST.lifeOf({ cast, person })
			const recordedDeath =
				fact.fixedDeathMs !== null &&
				fact.fixedDeathMs !== Infinity &&
				life.deathMs !== Math.max(fact.fixedDeathMs, fact.birthMs)
			if (
				names.name !== named.name ||
				names.house !== named.house ||
				person.sex !== fact.ref.sex ||
				person.birthMs !== fact.birthMs ||
				person.dynasty !== fact.ref.dynasty ||
				recordedDeath ||
				(fact.fixedDeathMs === Infinity && life.deathMs < scenario.secondTimeMs)
			)
				violations++
		}
		expect(violations).toBe(0)
	})

	it("places every kin ruler at a step of its ladder", () => {
		const { cast } = scenario
		let missing = 0
		let son = 0
		let wrong = 0
		for (const [rulerId, id] of cast.rulerPerson) {
			const fact = cast.anchors.facts.get(rulerId)
			if (!fact?.kin) continue
			const placement = cast.placements.find(
				(entry) => entry.rulerId === rulerId,
			)
			if (!placement) {
				missing++
				continue
			}
			if (placement.step !== "son") continue
			son++
			const couple = CAST.parentsOf({ cast, person: cast.persons[id] })
			const late = fact.kin.late.rulerId
			if (
				!couple?.some(
					(parent) =>
						parent.ruler.kind === "ruler" && parent.ruler.ref.rulerId === late,
				)
			)
				wrong++
		}
		expect(son).toBeGreaterThan(0)
		expect(missing).toBe(0)
		expect(wrong).toBe(0)
	})

	it("makes every placed plan child the owner's child with the planned birth", () => {
		const { cast } = scenario
		let violations = 0
		let placed = 0
		for (const [owner, reservations] of cast.reservations)
			for (const reservation of reservations) {
				if (reservation.source !== "plan" || reservation.placed === null)
					continue
				placed++
				const child = cast.persons[reservation.placed]
				const couple = CAST.parentsOf({ cast, person: child })
				if (
					child.birthMs !== reservation.birthMs ||
					!couple?.some((parent) => CAST.ownerKey(parent) === owner)
				)
					violations++
			}
		expect(placed).toBeGreaterThan(0)
		expect(violations).toBe(0)
	})

	it("blocks free births of a plan owner inside the plan's interval", () => {
		const { cast } = scenario
		let violations = 0
		for (const [rulerId, block] of cast.blocks) {
			const id = cast.rulerPerson.get(rulerId)
			if (id === undefined) continue
			for (const marriageId of cast.persons[id].marriages)
				for (const child of cast.marriages[marriageId].children)
					if (
						!child.planned &&
						child.birthMs > block.fromMs &&
						child.birthMs < block.untilMs
					)
						violations++
		}
		expect(violations).toBe(0)
	})

	it("turns every filled tie into a marriage that lasts until a death", () => {
		const { cast } = scenario
		let filled = 0
		let violations = 0
		for (const tie of cast.anchors.ties) {
			if (tie.status !== "filled") continue
			filled++
			const marriage = cast.marriages.find(
				(entry) => entry.kind === "tie" && entry.startMs === tie.timeMs,
			)
			if (!marriage) {
				violations++
				continue
			}
			const deaths = Math.min(
				CAST.lifeOf({ cast, person: cast.persons[marriage.husband] }).deathMs,
				CAST.lifeOf({ cast, person: cast.persons[marriage.wife] }).deathMs,
			)
			if (CAST.endOf({ cast, marriage }) !== deaths) violations++
		}
		expect(filled).toBeGreaterThan(0)
		expect(violations).toBe(0)
	})

	it("resolves every tie whose rulers are both in the cast", () => {
		const { cast } = scenario
		let pending = 0
		for (const tie of cast.anchors.ties) {
			if (tie.status !== "pending") continue
			const rulers = [tie.first, tie.second].map((nationId) =>
				ANCHORS.rulerAt({ index: cast.anchors, nationId, timeMs: tie.timeMs }),
			)
			if (rulers.every((fact) => fact && cast.rulerPerson.has(fact.rulerId)))
				pending++
		}
		expect(pending).toBe(0)
	})

	it("writes a passed-over row for each outranking living child", () => {
		const counted = CAST_SCENARIO.passedOverCount({
			cast: scenario.cast,
			timeMs: scenario.secondTimeMs,
		})
		expect(counted.rows).toBe(counted.expected)
	})
})

describe("intermarriage", () => {
	it("takes a cast spouse whenever one qualifies", () => {
		expect(scenario.spouseSearches).toBeGreaterThan(0)
		expect(scenario.spouseViolations).toBe(0)
	})

	it("never marries relatives beyond their religion's bars", () => {
		const { cast } = scenario
		let violations = 0
		for (const marriage of cast.marriages) {
			if (marriage.kind === "origin" || marriage.kind === "gap") continue
			if (
				!KINSHIP.allowed({
					cast,
					first: cast.persons[marriage.husband],
					second: cast.persons[marriage.wife],
				})
			)
				violations++
		}
		expect(violations).toBe(0)
	})
})

describe("single rules", () => {
	it("fits a birth beside a marriage's pregnancy only outside its rest window", () => {
		const { cast } = scenario
		let accepted = 0
		let rejected = 0
		let violations = 0
		for (const marriage of cast.marriages) {
			const pregnancy = marriage.pregnancies.find(
				(entry) => entry.outcome === "birth" && entry.children.length === 1,
			)
			if (!pregnancy) continue
			const inside = pregnancy.dueMs + FERTILITY.restMs / 2
			if (FERTILITY.canBear({ cast, marriage, birthMs: inside })) violations++
			else rejected++
			const outside =
				pregnancy.dueMs + FERTILITY.restMs + FERTILITY.gestationMs + 1
			if (FERTILITY.canBear({ cast, marriage, birthMs: outside })) accepted++
		}
		expect(violations).toBe(0)
		expect(rejected).toBeGreaterThan(0)
		expect(accepted).toBeGreaterThan(0)
	})

	it("ends a gap marriage before the next exclusive marriage of either spouse", () => {
		const { cast } = scenario
		let gaps = 0
		let violations = 0
		for (const marriage of cast.marriages) {
			if (marriage.kind !== "gap") continue
			gaps++
			const end = CAST.endOf({ cast, marriage })
			for (const id of [marriage.husband, marriage.wife]) {
				const person = cast.persons[id]
				for (const otherId of person.marriages) {
					const other = cast.marriages[otherId]
					if (
						other.id !== marriage.id &&
						MARRIAGE.exclusive({ person, marriage: other }) &&
						other.startMs > marriage.startMs &&
						other.startMs < end
					)
						violations++
				}
			}
		}
		expect(gaps).toBeGreaterThan(0)
		expect(violations).toBe(0)
	})

	it("keeps a ruler's life rows when the reign continues", () => {
		const { cast, secondTimeMs } = scenario
		const living = [...cast.rulerPerson.values()]
			.map((id) => cast.persons[id])
			.filter((person) =>
				HEALTH.alive({
					life: CAST.lifeOf({ cast, person }),
					timeMs: secondTimeMs,
				}),
			)
		expect(living.length).toBeGreaterThan(0)
		let violations = 0
		for (const person of living) {
			const before = JSON.stringify(
				CAST.lifeOf({ cast, person }).rows.filter(
					(row) => row.timeMs <= secondTimeMs,
				),
			)
			const redrawn = HEALTH.life({
				seed: CAST.seedOf({ cast, id: person.id }),
				character: person.character,
				birthMs: person.birthMs,
				sex: person.sex,
				survivesMs: person.inputs.survivesMs,
				fixedDeathMs: person.inputs.fixedDeathMs,
				horizonMs: person.lifeUntilMs + 20 * YEAR,
			})
			const after = JSON.stringify(
				redrawn.rows.filter((row) => row.timeMs <= secondTimeMs),
			)
			if (after !== before) violations++
		}
		expect(violations).toBe(0)
	})
})

describe("latency", () => {
	it("ingests one yearly batch within a frame", () => {
		const sorted = scenario.ingestMs.toSorted((a, b) => a - b)
		expect(sorted[Math.floor(0.95 * sorted.length)]).toBeLessThan(FRAME)
	})
})

describe("figures", () => {
	it("saves the grown-record figures", () => {
		const figures = CAST_SCENARIO.figures({ scenario })
		const path = HISTORY_OUTPUT.path({
			env: process.env,
			years: 300,
			kind: "people",
		})
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, JSON.stringify(figures, null, 1))
		process.stdout.write(`Grown-record figures: ${path}
${JSON.stringify(figures)}
`)
		expect(figures.pages).toBeGreaterThan(0)
	})
})
