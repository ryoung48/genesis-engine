import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"
import { expect, it } from "vitest"
import { HISTORY } from "@/model/history/record"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { SIM_RECORD } from "@/model/history/sim/record"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

function valueJson(value: unknown): string {
	return JSON.stringify(value, (...entry) => {
		const nested = entry[1]
		if (nested instanceof Map) return Array.from(nested.entries())
		if (typeof nested === "number") {
			if (Object.is(nested, -0)) return { number: "-0" }
			if (!Number.isFinite(nested)) return { number: String(nested) }
		}
		return nested
	})
}

it.skipIf(!process.env.HISTORY_MEMORY_OUT)(
	"measures retained live-history data and hashes scrub results",
	async () => {
		setFlagsFromString("--expose_gc")
		const collect = runInNewContext("gc")
		expect(typeof collect).toBe("function")
		const retain = process.env.HISTORY_MEMORY_RETAIN === "1"
		const seed = 14963991
		const era = "lateMedieval"
		const numPoints = 20000
		const years = 300
		const { generated, engine } = HISTORY_RUN.createEngine({
			seed,
			era,
			numPoints,
		})
		const world = generated as unknown as SerializedGenesisWorld
		const startTimeMs = engine.time
		const state = SIM_RECORD.buildProceduralState({ world, startTimeMs })
		const translator = SIM_RECORD.createTranslator({ state, world })
		const transactions: JournalTransaction[] = []
		const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
		let cursor = 0
		let transactionCount = 0
		let ticksMs = 0
		let cloningMs = 0
		let translationMs = 0
		const started = performance.now()
		for (let year = 0; year <= years; year++) {
			const tickStarted = performance.now()
			if (year > 0)
				SIM_ENGINE.simulateUntil({
					state: engine,
					targetTimeMs: startTimeMs + STATE.deltaYear(year),
					rng,
					validate: false,
				})
			ticksMs += performance.now() - tickStarted
			const batch = engine.journal.slice(cursor)
			cursor = retain ? engine.journal.length : 0
			transactionCount += batch.length
			const cloningStarted = performance.now()
			const received = structuredClone(batch, {
				transfer: JOURNAL.transferList(batch),
			})
			cloningMs += performance.now() - cloningStarted
			if (!retain) JOURNAL.releaseSent(engine)
			transactions.push(...received)
			const translationStarted = performance.now()
			if (retain)
				SIM_RECORD.appendJournal({ translator, transactions: received })
			else SIM_RECORD.consumeJournal({ translator, transactions })
			translationMs += performance.now() - translationStarted
		}
		const simulationMs = performance.now() - started
		const recordHash = createHash("sha256")
			.update(valueJson(state.record))
			.digest("hex")
		const scrubHash = createHash("sha256")
		let scrubMs = 0
		for (let step = 47; step >= 0; step--) {
			const timeMs =
				state.record.minTimeMs +
				((state.record.maxTimeMs - state.record.minTimeMs) * step) / 47
			const scrubStarted = performance.now()
			let frame = HISTORY.frameAt({ state, timeMs })
			if (retain) {
				frame = {
					...frame,
					provincePopulation: frame.provincePopulation.slice(),
					provincePopulationUrban: frame.provincePopulationUrban.slice(),
					provinceDevelopment: frame.provinceDevelopment.slice(),
				}
				state.frameCache.set(timeMs, frame)
			}
			scrubMs += performance.now() - scrubStarted
			scrubHash.update(valueJson(frame))
		}
		await new Promise<void>((resolve) => setImmediate(resolve))
		collect()
		const memory = process.memoryUsage()
		const censusBuffers = new Set(
			state.record.events.censuses.flatMap((census) => [
				census.rural.buffer,
				census.urban.buffer,
				census.development.buffer,
			]),
		)
		const extraFrameBuffers = new Set(
			Array.from(state.frameCache.values()).flatMap((frame) =>
				[
					frame.provincePopulation.buffer,
					frame.provincePopulationUrban.buffer,
					frame.provinceDevelopment.buffer,
				].filter((buffer) => !censusBuffers.has(buffer)),
			),
		)
		// Each structure's size is what a retained copy of it adds after a
		// collection: heap for objects, array buffers for typed columns.
		const copies: unknown[] = []
		const retainedBytes = (value: unknown) => {
			collect()
			const before = process.memoryUsage()
			copies.push(structuredClone(value))
			collect()
			const after = process.memoryUsage()
			return (
				after.heapUsed -
				before.heapUsed +
				after.arrayBuffers -
				before.arrayBuffers
			)
		}
		const people = state.record.people
		const peopleRecord = people && {
			people: PEOPLE_RECORD.count(people),
			personCapacity: people.persons.sex.length,
			marriages: people.marriages.length,
			betrothals: people.betrothals.length,
			tenures: people.tenures.length,
			healthRows: people.health.count,
			retainedBytes: {
				persons: retainedBytes(people.persons),
				initialResidence: retainedBytes(people.persons.initialResidence),
				residencesOf: retainedBytes(people.residencesOf),
				childrenOf: retainedBytes(people.childrenOf),
				marriages: retainedBytes([people.marriages, people.marriagesOf]),
				betrothals: retainedBytes([people.betrothals, people.betrothalsOf]),
				tenures: retainedBytes([
					people.tenures,
					people.tenuresOf,
					people.tenuresOfSeat,
					people.regentsOfSeat,
					people.regentsOfWard,
				]),
				pregnanciesOf: retainedBytes(people.pregnanciesOf),
				stressOf: retainedBytes(people.stressOf),
				health: retainedBytes(people.health),
				dynastyHome: retainedBytes(people.dynastyHome),
			},
		}
		const measurement = {
			hashFormat: "value-json-v1",
			gcAfterYield: true,
			retain,
			seed,
			era,
			numPoints,
			years,
			provinces: engine.P,
			transactionCount,
			censuses: state.record.events.censuses.length,
			workerTransactions: engine.journal.length,
			workerNotes: engine.events.length,
			mainTransactions: transactions.length,
			cachedFrames: state.frameCache.size,
			extraFrameCensusBytes: Array.from(extraFrameBuffers).reduce(
				(sum, buffer) => sum + buffer.byteLength,
				0,
			),
			memory,
			peopleRecord,
			marriage: {
				heritageEntries: state.record.heritageOfCulture.length,
				engineHeritageBytes: engine.heritageOfCulture.byteLength,
				recordHeritageBytes: state.record.heritageOfCulture.byteLength,
				createdAtBytes: retainedBytes(engine.people.persons.createdAt),
				marketBytes: retainedBytes(engine.marriageMarket),
				landlessUnmarried: engine.people.alive.filter(
					(person) =>
						engine.people.persons.death[person] > engine.time / STATE.yearMs &&
						engine.people.persons.heldSeats[person].length === 0 &&
						engine.people.persons.spouse[person] < 0,
				).length,
			},
			residenceHistory: {
				people: engine.people.residenceHistory.size,
				logicalBytes: [...engine.people.residenceHistory.values()].reduce(
					(sum, history) => sum + 12 * history.length,
					0,
				),
				allocatedBytes: [...engine.people.residenceHistory.values()].reduce(
					(sum, history) =>
						sum + history.times.byteLength + history.provinces.byteLength,
					0,
				),
				retainedBytes: retainedBytes(engine.people.residenceHistory),
				entryObjectsBytes: retainedBytes(
					[...engine.people.residenceHistory.values()].map((history) => ({
						length: history.length,
						times: new Float64Array(0),
						provinces: new Int32Array(0),
					})),
				),
				pendingLogBytes: retainedBytes(engine.people.log),
				initialResidenceBytes: retainedBytes(
					engine.people.persons.initialResidence,
				),
			},
			health: {
				columnsBytes: retainedBytes([
					engine.people.persons.baseHealth,
					engine.people.persons.infirmXp,
					engine.people.persons.cloudedEyesXp,
					engine.people.persons.fragileBonesXp,
					engine.people.persons.witheringMindXp,
					engine.people.persons.falteringHeartXp,
					engine.people.persons.healthFlags,
					engine.people.persons.healthAgeYear,
					engine.people.persons.healthIntervalEnd,
					engine.people.persons.ledYear,
				]),
				pendingDeaths: engine.deathSchedule.pending.size,
				deathScheduleBytes: retainedBytes(engine.deathSchedule),
				pendingDeliveries: engine.people.deliveries.byId.size,
				deliveriesBytes: retainedBytes(engine.people.deliveries),
				heapEvents: engine.heap.size,
				heapBytes: retainedBytes(engine.heap),
			},
			holdings: {
				people: engine.people.persons.heldSeats.length,
				seats: engine.people.persons.heldSeats.reduce(
					(sum, seats) => sum + seats.length,
					0,
				),
				retainedBytes: retainedBytes(engine.people.persons.heldSeats),
			},
			simulationMs,
			ticksMs,
			cloningMs,
			translationMs,
			scrubMs,
			recordHash,
			scrubHash: scrubHash.digest("hex"),
		}
		const out = process.env.HISTORY_MEMORY_OUT
		mkdirSync(dirname(out), { recursive: true })
		writeFileSync(out, JSON.stringify(measurement, null, 2))
		console.log(JSON.stringify(measurement))
	},
)
