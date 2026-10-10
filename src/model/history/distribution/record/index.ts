import type {
	CapitalOfParams,
	ConsumeBatchParams,
	EventTimeParams,
	MergeBatchesParams,
	RecordBatch,
	WriteYearParams,
} from "@/model/history/distribution/record/types"
import { DISTRIBUTION_RECORD_WAR } from "@/model/history/distribution/record/war"
import { DATE } from "@/model/history/earth/date"
import { PROCEDURAL_RECORD } from "@/model/history/record/procedural"
import type { HistoryState } from "@/model/history/record/types"
import { HASH } from "@/model/shared/random/hash"

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
	previousTimeMs,
	oldOwner,
	oldIds,
}: WriteYearParams): RecordBatch {
	const started = performance.now()
	const throughTimeMs = DATE.eu4DateToTimeMs(`${e.year}.1.1`)
	const dayMs = DATE.eu4DateToTimeMs("2.1.2")
	const days = (throughTimeMs - previousTimeMs) / dayMs
	const eventTime = ({ channel, salt }: EventTimeParams) =>
		previousTimeMs +
		(2 + Math.floor(HASH.unit({ seed: e.year, channel, salt }) * (days - 4))) *
			dayMs
	const firstGain = new Map<number, number>()
	const lastChange = new Map<number, number>()
	const ownershipTimes = new Map<number, number>()
	for (let p = 0; p < oldOwner.length; p++) {
		const owner = e.territory.owner[p]
		if (oldOwner[p] === owner) continue
		const timeMs = eventTime({ channel: oldOwner[p], salt: owner })
		ownershipTimes.set(p, timeMs)
		firstGain.set(owner, Math.min(firstGain.get(owner) ?? timeMs, timeMs))
		for (const id of [oldOwner[p], owner])
			lastChange.set(id, Math.max(lastChange.get(id) ?? timeMs, timeMs))
	}
	const births = new Map<number, number>()
	for (const c of e.territory.countries.values())
		if (!oldIds.has(c.id))
			births.set(
				c.id,
				(firstGain.get(c.id) ??
					eventTime({ channel: c.id, salt: e.sequence })) - dayMs,
			)
	for (const rebellion of e.rebellions) {
		const parentBirth = births.get(rebellion.parent)
		const successorBirth = births.get(rebellion.successor)
		if (parentBirth !== undefined && successorBirth !== undefined)
			births.set(rebellion.parent, Math.min(parentBirth, successorBirth))
	}
	const batch: RecordBatch = {
		sequence: ++e.sequence,
		lastSequence: e.sequence,
		throughTimeMs,
		firstTimeMs: previousTimeMs + dayMs,
		provinces: [],
		nations: [],
		wars: [],
	}
	for (const [province, timeMs] of ownershipTimes)
		batch.provinces.push({
			province,
			events: ["owner", "controller"].map((kind) => ({
				timeMs,
				kind,
				payload: { nationId: e.territory.owner[province] },
				comment: null as null,
			})),
		})
	for (const id of oldIds)
		if (!e.territory.countries.has(id)) {
			const identity = structuredClone(e.history.record.nations[id]),
				log = structuredClone(e.history.record.events.nationEvents[id])
			if (!identity || !log) throw new Error("Missing absorbed identity")
			const timeMs =
				(lastChange.get(id) ?? eventTime({ channel: id, salt: e.sequence })) +
				dayMs
			identity.deathTimeMs = timeMs
			log.events.push({ timeMs, kind: "destroyed", payload: {}, comment: null })
			batch.nations.push({ id, identity, log })
			e.absorptions++
		}
	for (const c of e.territory.countries.values())
		if (!oldIds.has(c.id)) {
			const timeMs = births.get(c.id) ?? previousTimeMs + dayMs
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
		const timeMs =
			(lastChange.get(c.id) ?? eventTime({ channel: c.id, salt: e.sequence })) +
			dayMs
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
	for (const rebellion of e.rebellions) {
		const startTimeMs =
			births.get(rebellion.successor) ?? previousTimeMs + dayMs
		const endTimeMs =
			(lastChange.get(rebellion.successor) ?? startTimeMs) + dayMs
		const parent =
			batch.nations.find((nation) => nation.id === rebellion.parent)
				?.identity ?? e.history.record.nations[rebellion.parent]
		batch.wars.push(
			DISTRIBUTION_RECORD_WAR.create({
				id: rebellion.id,
				name: `${parent?.name ?? "Country"} Civil War`,
				attacker: rebellion.successor,
				defender: rebellion.parent,
				province: rebellion.province,
				rebel: true,
				startTimeMs,
				endTimeMs,
			}),
		)
	}
	const warEndTimes = new Map<number, number>()
	const lastWarEnd = new Map<number, number>()
	for (const a of e.attacks.ended) {
		const fallback = eventTime({ channel: a.id, salt: e.sequence })
		const timeMs =
			Math.max(
				lastChange.get(a.attacker) ?? fallback,
				lastChange.get(a.defender) ?? fallback,
			) + dayMs
		warEndTimes.set(a.id, timeMs)
		for (const id of [a.attacker, a.defender])
			lastWarEnd.set(id, Math.max(lastWarEnd.get(id) ?? timeMs, timeMs))
	}
	for (const a of e.attacks.declared) {
		const timeMs = Math.max(
			eventTime({ channel: a.id, salt: e.sequence }),
			(births.get(a.attacker) ?? previousTimeMs) + dayMs,
			(births.get(a.defender) ?? previousTimeMs) + dayMs,
			(lastWarEnd.get(a.attacker) ?? previousTimeMs) + dayMs,
			(lastWarEnd.get(a.defender) ?? previousTimeMs) + dayMs,
		)
		batch.wars.push(
			DISTRIBUTION_RECORD_WAR.create({
				id: a.id,
				name: `Conquest ${a.id}`,
				attacker: a.attacker,
				defender: a.defender,
				province: e.territory.countries.get(a.defender)?.capital ?? -1,
				rebel: false,
				startTimeMs: timeMs,
				endTimeMs: null,
			}),
		)
	}
	for (const a of e.attacks.ended) {
		const timeMs = warEndTimes.get(a.id) ?? throughTimeMs
		const previous = e.history.record.events.wars.find((w) => w.id === a.id)
		if (!previous) throw new Error("Missing ended war")
		const war = structuredClone(previous)
		DISTRIBUTION_RECORD_WAR.end({
			war,
			attacker: a.attacker,
			defender: a.defender,
			timeMs,
			comment: null,
		})
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
