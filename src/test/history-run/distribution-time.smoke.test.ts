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
	const engine = DISTRIBUTION_FIXTURE.engine({
		world,
		groups: [Array.from({ length: 40 }, (_, i) => i)],
		year: 2,
	})
	engine.rng = RNG.fromSource({
		random: () => 0,
		nonPositiveWeightBehavior: "undefined",
	})
	E.advance({ engine })
	expect(engine.territory.countries.size).toBe(2)
	expect(
		[...engine.territory.countries.values()].map((c) => c.cooldown),
	).toEqual([13, 13])
	expect(engine.attacks.declared).toHaveLength(0)
	const rebellion = engine.history.record.events.wars[0]
	expect(rebellion).toMatchObject({
		id: 0,
		rebel: true,
		casusBelli: "rebellion",
		warGoalType: "rebellion",
		warGoalId: 0,
	})
	expect(rebellion.name).toContain("Civil War")
	expect(
		rebellion.events
			.filter((event) => event.kind === "warStart")
			.map((event) => [event.nationId, event.side]),
	).toEqual([
		[1, "attacker"],
		[0, "defender"],
	])
	expect(
		rebellion.events.filter((event) => event.kind === "warEnd"),
	).toHaveLength(2)
	expect(engine.history.record.nations[1].isRebel).toBe(false)
	E.advance({ engine })
	expect(engine.territory.countries.size).toBe(2)
	expect(engine.history.record.events.wars).toHaveLength(1)
})

it("advances 207 coarse steps then annual transitions and stops at 2025", () => {
	for (const desolate of [[], [0]]) {
		const world = DISTRIBUTION_FIXTURE.world({
			neighbors: desolate.length ? [[]] : [],
			desolate,
			seed: 42,
		})
		const engine = E.create({ world })
		expect(engine.history.record.minTimeMs).toBe(
			DATE.eu4DateToTimeMs("-79999.1.1"),
		)
		E.advanceUntil({ engine, year: 2025 })
		E.advance({ engine })
		expect(engine.sequence).toBe(207 + 5325)
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
	expect(engine.year).toBe(-79499)
	expect(paused).toBe(DATE.eu4DateToTimeMs("-79499.1.1"))
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
	expect(cancelled.year).toBe(-79499)
	expect(published).toBe(0)
	expect(cancelled.pending).toHaveLength(0)
})

it("preserves the arithmetic DATE calendar at 80000 BCE and year zero", () => {
	const ms = DATE.eu4DateToTimeMs("-79999.1.1")
	expect(ms).toBe(-2522911536000000)
	expect(DATE.timeMsToEu4Date(ms)).toBe("-79999.1.1")
	expect(DATE.formatHistoryTimeMs(ms)).toBe("80000 BC.1.1")
	expect(DATE.timeMsToEu4Date(ms + 86400000)).toBe("-79999.1.2")
	expect(DATE.historyTimeMsToYear(ms)).toBe(-79999)
	for (const year of [-79999, -9999, -3300, 0, 2025])
		for (const date of [`${year}.1.1`, `${year}.12.31`]) {
			const value = DATE.eu4DateToTimeMs(date)
			expect(Number.isSafeInteger(value)).toBe(true)
			expect(Number.isFinite(new Date(value).getTime())).toBe(true)
			expect(DATE.timeMsToEu4Date(value)).toBe(date)
		}
})
it("clamps requested prehistoric endpoints without overshooting", () => {
	const engine = E.create({
		world: DISTRIBUTION_FIXTURE.world({
			neighbors: [],
			desolate: [],
			seed: 42,
		}),
	})
	E.advanceUntil({ engine, year: -79998 })
	expect(engine.year).toBe(-79998)
	expect(engine.endpointClampExtraSteps).toBe(1)
	E.advanceUntil({ engine, year: -9999 })
	expect(engine.year).toBe(-9999)
	E.advanceUntil({ engine, year: -3300 })
	expect(engine.year).toBe(-3300)
	E.advanceUntil({ engine, year: 2025 })
	expect(engine.executionStepCount).toBe(5533)
})
