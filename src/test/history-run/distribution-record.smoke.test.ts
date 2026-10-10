import { expect, it } from "vitest"
import { DISTRIBUTION_ATTACKS as A } from "@/model/history/distribution/attacks"
import { DISTRIBUTION_ENGINE as E } from "@/model/history/distribution/engine"
import { DISTRIBUTION_RECORD as R } from "@/model/history/distribution/record"
import { DISTRIBUTION_TERRITORY as T } from "@/model/history/distribution/territory"
import { DATE } from "@/model/history/earth/date"
import { HISTORY } from "@/model/history/record"
import { RNG } from "@/model/shared/random/rng"
import { DISTRIBUTION_FIXTURE } from "@/test/history-run/fixtures/distribution"

it("folds cloned sparse batches once and invalidates cached future frames", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2]],
		desolate: [],
		seed: 12345,
	})
	const engine = DISTRIBUTION_FIXTURE.engine({
			world,
			groups: [[0], [1], [2], [3]],
			year: 2,
		}),
		receiver = structuredClone(engine.history)
	HISTORY.frameAt({ state: receiver, timeMs: 100 * 365 * 86400000 })
	for (let year = 3; year <= 50; year++) {
		E.advance({ engine })
		const batch = structuredClone(engine.pending.pop())
		if (!batch) throw new Error("Missing batch")
		R.consumeBatch({ state: receiver, batch })
		R.consumeBatch({ state: receiver, batch })
	}
	expect(receiver.record).toEqual(engine.history.record)
	expect(receiver.record.events.wars.map((war) => war.id)).toEqual(
		Array.from(receiver.record.events.wars.keys()),
	)
	const frame = HISTORY.frameAt({
		state: receiver,
		timeMs: receiver.record.maxTimeMs,
	})
	expect(frame.provinceNation).toEqual(engine.territory.owner)
	expect(frame.economy).toBeNull()
	expect(frame.titles).toBeNull()
})

it("keeps absorbed identities and emits each termination once", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2]],
		desolate: [],
		seed: 42,
	})
	const engine = DISTRIBUTION_FIXTURE.engine({
		world,
		groups: [[0], [1], [2], [3]],
		year: 2,
	})
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
	const engine = DISTRIBUTION_FIXTURE.engine({
			world,
			groups: [[0], [1]],
			year: 2,
		}),
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

it("dates final captures before war endings and replays borders on the capture day", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2]],
		desolate: [],
		seed: 42,
	})
	const engine = DISTRIBUTION_FIXTURE.engine({
		world,
		groups: [[0], [1, 2, 3]],
		year: 2,
	})
	const receiver = structuredClone(engine.history)
	const attack = { id: 0, attacker: 1, defender: 0, start: 3 }
	engine.attacks.active.set(0, attack)
	engine.attacks.declared = [attack]
	engine.year = 3
	const declaration = R.writeYear({
		engine,
		previousTimeMs: DATE.eu4DateToTimeMs("2.1.1"),
		oldOwner: engine.territory.owner.slice(),
		oldIds: new Set(engine.territory.countries.keys()),
	})
	R.consumeBatch({ state: receiver, batch: declaration })
	const oldOwner = engine.territory.owner.slice()
	const oldIds = new Set(engine.territory.countries.keys())
	engine.attacks.declared = []
	engine.year = 4
	expect(
		T.transfer({
			territory: engine.territory,
			attacker: 1,
			defender: 0,
			province: 0,
			ceiling: 10,
		}),
	).toBe(true)
	A.end({
		attacks: engine.attacks,
		territory: engine.territory,
		attack,
		year: 4,
		reason: "absorbed",
	})
	HISTORY.frameAt({ state: receiver, timeMs: DATE.eu4DateToTimeMs("4.1.1") })
	const batch = R.writeYear({
		engine,
		previousTimeMs: DATE.eu4DateToTimeMs("3.1.1"),
		oldOwner,
		oldIds,
	})
	R.consumeBatch({ state: receiver, batch })
	const capture = batch.provinces[0].events[0].timeMs
	const end = batch.wars[0].events.find(
		(event) => event.kind === "warEnd",
	)?.timeMs
	expect(capture).toBeGreaterThan(DATE.eu4DateToTimeMs("3.1.1"))
	expect(capture).toBeLessThan(DATE.eu4DateToTimeMs("4.1.1"))
	expect(end).toBeGreaterThan(capture)
	expect(
		HISTORY.frameAt({ state: receiver, timeMs: capture - 1 }).provinceNation[0],
	).toBe(0)
	const captured = HISTORY.frameAt({ state: receiver, timeMs: capture })
	expect(captured.provinceNation[0]).toBe(1)
	expect(captured.wars.map((war) => war.id)).toContain(0)
	if (end === undefined) throw new Error("Missing war end")
	expect(HISTORY.frameAt({ state: receiver, timeMs: end }).wars).toHaveLength(0)
	expect(
		HISTORY.frameAt({ state: receiver, timeMs: batch.throughTimeMs })
			.provinceNation,
	).toEqual(engine.territory.owner)
})

it("dates a new country before its grouped territorial gains", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2]],
		desolate: [],
		seed: 42,
	})
	const engine = DISTRIBUTION_FIXTURE.engine({
		world,
		groups: [[0, 1, 2, 3]],
		year: 2,
	})
	const oldOwner = engine.territory.owner.slice()
	const oldIds = new Set(engine.territory.countries.keys())
	const country = engine.territory.countries.get(0)
	if (!country) throw new Error("Missing country")
	const successor = T.split({
		territory: engine.territory,
		country,
		provinces: [2, 3],
	})
	engine.rebellions.push({
		id: engine.attacks.nextId++,
		parent: country.id,
		successor: successor.id,
		province: successor.capital,
	})
	engine.year = 3
	const batch = R.writeYear({
		engine,
		previousTimeMs: DATE.eu4DateToTimeMs("2.1.1"),
		oldOwner,
		oldIds,
	})
	const birth = batch.nations.find((nation) => nation.id === successor.id)
		?.identity.birthTimeMs
	const gains = batch.provinces.map((patch) => patch.events[0].timeMs)
	expect(new Set(gains).size).toBe(1)
	expect(birth).toBeLessThan(gains[0])
	expect(batch.firstTimeMs).toBeLessThanOrEqual(birth ?? 0)
	expect(gains[0]).toBeLessThan(batch.throughTimeMs)
	const rebellion = batch.wars[0]
	expect(rebellion.rebel).toBe(true)
	expect(rebellion.events[0].timeMs).toBe(birth)
	expect(rebellion.events[2].timeMs).toBeGreaterThan(gains[0])
	const during = HISTORY.frameAt({ state: engine.history, timeMs: gains[0] })
	expect(during.wars).toMatchObject([
		{
			id: rebellion.id,
			rebel: true,
			attackers: [successor.id],
			defenders: [country.id],
		},
	])
	expect(
		HISTORY.frameAt({
			state: engine.history,
			timeMs: rebellion.events[2].timeMs,
		}).wars,
	).toHaveLength(0)
})

it("does not label founding on stateless land as a civil war", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0]],
		desolate: [],
		seed: 42,
	})
	const engine = DISTRIBUTION_FIXTURE.engine({ world, groups: [[0]], year: 2 })
	const oldOwner = engine.territory.owner.slice()
	const oldIds = new Set(engine.territory.countries.keys())
	T.found({ territory: engine.territory, province: 1 })
	engine.year = 3
	const batch = R.writeYear({
		engine,
		previousTimeMs: DATE.eu4DateToTimeMs("2.1.1"),
		oldOwner,
		oldIds,
	})
	expect(batch.wars).toHaveLength(0)
	expect(batch.nations[0].identity.isRebel).toBe(false)
})
