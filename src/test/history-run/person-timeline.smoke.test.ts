import { expect, it } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { HISTORY_RUN } from "@/test/history-run"

const SEED = 14963991

it("keeps every timeline row inside the person's life", () => {
	const { state } = HISTORY_RUN.build({
		seed: SEED,
		era: "highMedieval",
		numPoints: 20000,
		years: 60,
	})
	const record = state.record.people
	const maxMs = state.record.maxTimeMs
	const step = Math.max(1, Math.floor(record.count / 500))
	const sampled = new Set<number>()
	for (let person = 0; person < record.count; person += step)
		sampled.add(person)
	for (let tenure = 0; tenure < record.tenureCount; tenure++)
		sampled.add(record.tenurePerson[tenure])
	const kinds = new Set<string>()
	for (const person of sampled) {
		const birth = record.birth[person]
		const end = Number.isFinite(record.death[person])
			? record.death[person]
			: maxMs
		const rows = PERSON_QUERY.timeline({ state, person })
		expect(rows.length).toBeGreaterThan(0)
		const tenures = PEOPLE_RECORD.tenuresOfPerson({ record, person })
		let previous = Number.NEGATIVE_INFINITY
		for (const row of rows) {
			kinds.add(row.kind)
			expect(row.timeMs, `${row.id} start`).toBeGreaterThanOrEqual(birth)
			expect(row.timeMs, `${row.id} end`).toBeLessThanOrEqual(end)
			expect(row.timeMs).toBeGreaterThanOrEqual(previous)
			previous = row.timeMs
			if (row.kind === "tenure-start") {
				const tenure = tenures.find(
					(view) => view.seat === row.seat && view.startMs === row.timeMs,
				)
				expect(tenure, row.id).toBeDefined()
				const holders = PEOPLE_RECORD.tenuresOfSeat({ record, seat: row.seat })
				const index = holders.findIndex(
					(view) => view.person === person && view.startMs === row.timeMs,
				)
				const expected = index > 0 ? holders[index - 1].person : null
				expect(row.previousHolder, row.id).toBe(
					expected === person ? null : expected,
				)
				expect(row.sinceRecordStart).toBe(row.timeMs <= state.record.minTimeMs)
			}
			if (row.kind === "titles-gained" || row.kind === "title-founded") {
				const seat = row.kind === "titles-gained" ? row.toSeat : row.seat
				expect(
					tenures.some(
						(view) =>
							view.startMs <= row.timeMs &&
							(view.endMs === null || view.endMs >= row.timeMs),
					),
					`${row.id} inside a tenure of seat ${seat}`,
				).toBe(true)
			}
			if (row.kind === "died") expect(row.timeMs).toBe(record.death[person])
		}
		const series = PERSON_QUERY.healthSeries({ state, person })
		const points = PEOPLE_RECORD.health({ record, person })
		expect(series.length).toBe(points.length === 0 ? 0 : points.length + 1)
		points.forEach((point, index) => {
			expect(series[index].timeMs).toBe(point.timeMs)
			expect(series[index].band).toBe(LIFESPAN.healthBand(point.health))
		})
		if (series.length > 0) expect(series[series.length - 1].timeMs).toBe(end)
	}
	for (const kind of [
		"born",
		"died",
		"married",
		"child-born",
		"kin-died",
		"tenure-start",
	])
		expect(kinds.has(kind), kind).toBe(true)
}, 3_600_000)
