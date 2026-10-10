import { expect, it } from "vitest"
import { DISTRIBUTION_ENGINE as E } from "@/model/history/distribution/engine"
import { DISTRIBUTION_RECORD as R } from "@/model/history/distribution/record"
import { HISTORY } from "@/model/history/record"
import { RNG } from "@/model/shared/random/rng"
import { DISTRIBUTION_FIXTURE } from "@/test/history-run/fixtures/distribution"

it("folds cloned sparse batches once and invalidates cached future frames", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2]],
		desolate: [],
		seed: 12345,
	})
	const engine = E.create({ world }),
		receiver = structuredClone(engine.history)
	HISTORY.frameAt({ state: receiver, timeMs: 100 * 365 * 86400000 })
	for (let year = 3; year <= 50; year++) {
		E.advanceYear({ engine })
		const batch = structuredClone(engine.pending.pop())
		if (!batch) throw new Error("Missing batch")
		R.consumeBatch({ state: receiver, batch })
		R.consumeBatch({ state: receiver, batch })
	}
	expect(receiver.record).toEqual(engine.history.record)
	const frame = HISTORY.frameAt({
		state: receiver,
		timeMs: receiver.record.maxTimeMs,
	})
	expect(frame.provinceNation).toEqual(engine.territory.owner)
	expect(frame.economy).toBeNull()
	expect(frame.titles).toBeNull()
	expect(receiver.record.people).toBeNull()
})

it("keeps absorbed identities and emits each termination once", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2]],
		desolate: [],
		seed: 42,
	})
	if (!world.nations) throw new Error("Missing fixture")
	world.nations.count = 4
	world.nations.assignment = Int32Array.from([0, 1, 2, 3])
	world.nations.seeds = Int32Array.from([0, 1, 2, 3])
	world.nations.colors = new Float32Array(12)
	const engine = E.create({ world })
	engine.rng = RNG.fromSource({
		random: () => 0,
		nonPositiveWeightBehavior: "undefined",
	})
	E.advanceUntil({ engine, year: 30 })
	const dead = engine.history.record.nations.filter((n) => n.deathTimeMs >= 0)
	expect(dead.length).toBeGreaterThan(0)
	for (const identity of dead) {
		expect(
			engine.history.record.events.nationEvents[identity.id]?.events.filter(
				(e) => e.kind === "destroyed",
			),
		).toHaveLength(1)
		expect(engine.territory.countries.has(identity.id)).toBe(false)
	}
	for (const war of engine.history.record.events.wars) {
		const starts = war.events.filter((e) => e.kind === "warStart"),
			ends = war.events.filter((e) => e.kind === "warEnd")
		expect(starts).toHaveLength(2)
		expect([0, 2]).toContain(ends.length)
	}
})

it("consumes a merged twenty-year transport batch with all annual snapshots", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0]],
		desolate: [],
		seed: 42,
	})
	const engine = E.create({ world }),
		receiver = structuredClone(engine.history)
	E.advanceUntil({ engine, year: 22 })
	const batch = R.mergeBatches({ batches: engine.pending })
	expect(batch.lastSequence - batch.sequence + 1).toBe(20)
	R.consumeBatch({ state: receiver, batch: structuredClone(batch) })
	expect(receiver.record).toEqual(engine.history.record)
	for (let year = 2; year <= 22; year++)
		expect(
			HISTORY.frameAt({ state: receiver, timeMs: (year - 2) * 365 * 86400000 })
				.provinceNation,
		).toEqual(
			HISTORY.frameAt({
				state: engine.history,
				timeMs: (year - 2) * 365 * 86400000,
			}).provinceNation,
		)
})
