import type {
	CapitalOfParams,
	ConsumeBatchParams,
	MergeBatchesParams,
	RecordBatch,
	WriteYearParams,
} from "@/model/history/distribution/record/types"
import { DATE } from "@/model/history/earth/date"
import { PROCEDURAL_RECORD } from "@/model/history/record/procedural"
import type { HistoryState, WarRecord } from "@/model/history/record/types"

const consumed = new WeakMap<HistoryState, number>()
function consumeBatch({ state, batch }: ConsumeBatchParams): void {
	const previous = consumed.get(state) ?? 0
	if (batch.lastSequence <= previous) return
	if (batch.sequence !== previous + 1)
		throw new Error("Missing distribution record batch")
	for (const patch of batch.provinces) {
		const log = state.record.events.provinceEvents.get(patch.province)
		if (!log) throw new Error("Unknown province")
		log.events.push(...patch.events)
	}
	for (const patch of batch.nations) {
		state.record.nations[patch.id] = structuredClone(patch.identity)
		state.record.events.nationEvents[patch.id] = structuredClone(patch.log)
	}
	for (const war of batch.wars) {
		const index = state.record.events.wars.findIndex((w) => w.id === war.id)
		if (index < 0) state.record.events.wars.push(structuredClone(war))
		else state.record.events.wars[index] = structuredClone(war)
	}
	state.record.maxTimeMs = batch.throughTimeMs
	for (const time of state.frameCache.keys())
		if (time >= batch.firstTimeMs) state.frameCache.delete(time)
	consumed.set(state, batch.lastSequence)
}
function capitalOf({ log }: CapitalOfParams): number {
	const change = log.events.findLast((event) => event.kind === "capitalChange")
	return (
		(change?.payload.provinceId as number | undefined) ??
		log.base.capitalProvinceId
	)
}
function mergeBatches({ batches }: MergeBatchesParams): RecordBatch {
	const first = batches[0],
		last = batches.at(-1)
	if (!first || !last)
		throw new Error("Cannot publish an empty transport batch")
	return {
		sequence: first.sequence,
		lastSequence: last.lastSequence,
		firstTimeMs: first.firstTimeMs,
		throughTimeMs: last.throughTimeMs,
		provinces: batches.flatMap((b) => b.provinces),
		nations: batches.flatMap((b) => b.nations),
		wars: batches.flatMap((b) => b.wars),
	}
}
function writeYear({
	engine: e,
	oldOwner,
	oldIds,
}: WriteYearParams): RecordBatch {
	const started = performance.now()
	const timeMs = DATE.eu4DateToTimeMs(`${e.year}.1.1`)
	const batch: RecordBatch = {
		sequence: ++e.sequence,
		lastSequence: e.sequence,
		throughTimeMs: timeMs,
		firstTimeMs: timeMs,
		provinces: [],
		nations: [],
		wars: [],
	}
	for (let p = 0; p < oldOwner.length; p++)
		if (oldOwner[p] !== e.territory.owner[p])
			batch.provinces.push({
				province: p,
				events: ["owner", "controller"].map((kind) => ({
					timeMs,
					kind,
					payload: { nationId: e.territory.owner[p] },
					comment: null as null,
				})),
			})
	for (const id of oldIds)
		if (!e.territory.countries.has(id)) {
			const identity = structuredClone(e.history.record.nations[id]),
				log = structuredClone(e.history.record.events.nationEvents[id])
			if (!identity || !log) throw new Error("Missing absorbed identity")
			identity.deathTimeMs = timeMs
			log.events.push({ timeMs, kind: "destroyed", payload: {}, comment: null })
			batch.nations.push({ id, identity, log })
			e.absorptions++
		}
	for (const c of e.territory.countries.values())
		if (!oldIds.has(c.id)) {
			batch.nations.push({
				id: c.id,
				identity: {
					id: c.id,
					name: e.history.provinceMeta[c.capital]?.name ?? "Country",
					color: PROCEDURAL_RECORD.successorNationColor({ id: c.id }),
					birthTimeMs: timeMs,
					deathTimeMs: -1,
					isRebel: false,
					tag: null,
				},
				log: {
					base: {
						capitalProvinceId: c.capital,
						initialGovernment: "",
						reforms: [],
					},
					events: [
						{
							timeMs,
							kind: "created",
							payload: { provinceId: c.capital },
							comment: null,
						},
					],
				},
			})
		}
	for (const c of e.territory.countries.values()) {
		const identity = e.history.record.nations[c.id],
			log = e.history.record.events.nationEvents[c.id]
		if (
			!oldIds.has(c.id) ||
			!identity ||
			!log ||
			capitalOf({ log }) === c.capital
		)
			continue
		const moved = structuredClone(log)
		moved.events.push({
			timeMs,
			kind: "capitalChange",
			payload: { provinceId: c.capital },
			comment: null,
		})
		batch.nations.push({
			id: c.id,
			identity: structuredClone(identity),
			log: moved,
		})
	}
	for (const a of e.attacks.declared) {
		const war: WarRecord = {
			id: a.id,
			name: `Conquest ${a.id}`,
			casusBelli: "conquest",
			warGoalType: "conquest",
			warGoalId: a.defender,
			warGoalProvinceId: e.territory.countries.get(a.defender)?.capital ?? -1,
			rebel: false,
			events: [
				{
					timeMs,
					nationId: a.attacker,
					kind: "warStart",
					side: "attacker",
					comment: null,
				},
				{
					timeMs,
					nationId: a.defender,
					kind: "warStart",
					side: "defender",
					comment: null,
				},
			],
			battles: [],
			sieges: [],
			mobilization: [],
			warScore: null,
		}
		batch.wars.push(war)
	}
	for (const a of e.attacks.ended) {
		const previous = e.history.record.events.wars.find((w) => w.id === a.id)
		if (!previous) throw new Error("Missing ended war")
		const war = structuredClone(previous)
		war.events.push(
			{
				timeMs,
				nationId: a.attacker,
				kind: "warEnd",
				side: "attacker",
				comment: null,
			},
			{
				timeMs,
				nationId: a.defender,
				kind: "warEnd",
				side: "defender",
				comment: null,
			},
		)
		batch.wars.push(war)
	}
	e.recordWritingMs += performance.now() - started
	const ingestionStarted = performance.now()
	consumeBatch({ state: e.history, batch })
	e.recordIngestionMs += performance.now() - ingestionStarted
	return batch
}

export const DISTRIBUTION_RECORD = {
	capitalOf,
	consumeBatch,
	mergeBatches,
	writeYear,
}
