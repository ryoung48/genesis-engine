import { MessageChannel } from "node:worker_threads"
import { expect, it } from "vitest"
import { DISTRIBUTION_ENGINE as E } from "@/model/history/distribution/engine"
import { DATE } from "@/model/history/earth/date"
import { HISTORY } from "@/model/history/record"
import { RNG } from "@/model/shared/random/rng"
import { DISTRIBUTION_FIXTURE } from "@/test/history-run/fixtures/distribution"

it("gives both split successors the planned ten-year cooldown", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: Array.from({ length: 40 }, (_, i) =>
			[i - 1, i + 1].filter((id) => id >= 0 && id < 40),
		),
		desolate: [],
		seed: 42,
	})
	if (!world.nations) throw new Error("Missing fixture")
	world.nations.assignment = new Int32Array(40)
	world.nations.seeds = Int32Array.from([0])
	world.nations.count = 1
	const engine = E.create({ world })
	engine.rng = RNG.fromSource({
		random: () => 0,
		nonPositiveWeightBehavior: "undefined",
	})
	E.advanceYear({ engine })
	expect(engine.territory.countries.size).toBe(2)
	expect(
		[...engine.territory.countries.values()].map((c) => c.cooldown),
	).toEqual([13, 13])
	expect(engine.attacks.declared).toHaveLength(0)
	E.advanceYear({ engine })
	expect(engine.territory.countries.size).toBe(2)
})

it("advances exactly 2023 empty annual transitions and stops at 2025", () => {
	for (const desolate of [[], [0]]) {
		const world = DISTRIBUTION_FIXTURE.world({
			neighbors: desolate.length ? [[]] : [],
			desolate,
			seed: 42,
		})
		const engine = E.create({ world })
		expect(engine.history.record.minTimeMs).toBe(0)
		E.advanceUntil({ engine, year: 2025 })
		E.advanceYear({ engine })
		expect(engine.sequence).toBe(2023)
		expect(engine.history.record.maxTimeMs).toBe(
			DATE.eu4DateToTimeMs("2025.1.1"),
		)
		expect(
			HISTORY.frameAt({
				state: engine.history,
				timeMs: engine.history.record.maxTimeMs,
			}).nationCount,
		).toBe(0)
	}
})
it("processes a pause message during an active batch and resumes identically", async () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2]],
		desolate: [],
		seed: 42,
	})
	const engine = E.create({ world }),
		control = E.create({ world }),
		channel = new MessageChannel()
	let running = true,
		first = true,
		paused = -1
	channel.port1.on("message", () => {
		running = false
	})
	await E.play({
		engine,
		isCurrent: () => true,
		isRunning: () => running,
		onBatch: () => undefined,
		onPaused: (time) => {
			paused = time
		},
		batchYears: 20,
		yieldYear: () =>
			new Promise((resolve) => {
				if (first) {
					first = false
					channel.port2.postMessage("pause")
				}
				setTimeout(resolve, 10)
			}),
	})
	expect(engine.year).toBe(3)
	expect(paused).toBe(DATE.eu4DateToTimeMs("3.1.1"))
	channel.port1.close()
	channel.port2.close()
	E.advanceUntil({ engine, year: 40 })
	E.advanceUntil({ engine: control, year: 40 })
	expect(engine.territory.owner).toEqual(control.territory.owner)
	expect(engine.history.record.events).toEqual(control.history.record.events)
})

it("preserves replay across transport sizes and discards a cancelled active batch", async () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2]],
		desolate: [],
		seed: 12345,
	})
	const one = E.create({ world }),
		twenty = E.create({ world }),
		cancelled = E.create({ world })
	for (const engine of [one, twenty])
		await E.play({
			engine,
			isCurrent: () => true,
			isRunning: () => engine.year < 40,
			onBatch: () => undefined,
			onPaused: () => undefined,
			batchYears: engine === one ? 1 : 20,
			yieldYear: async () => undefined,
		})
	expect(one.history.record.events).toEqual(twenty.history.record.events)
	let current = true,
		published = 0
	await E.play({
		engine: cancelled,
		isCurrent: () => current,
		isRunning: () => true,
		onBatch: () => {
			published++
		},
		onPaused: () => undefined,
		batchYears: 20,
		yieldYear: () =>
			new Promise((resolve) =>
				setTimeout(() => {
					current = false
					resolve()
				}, 0),
			),
	})
	expect(cancelled.year).toBe(3)
	expect(published).toBe(0)
	expect(cancelled.pending).toHaveLength(0)
})
