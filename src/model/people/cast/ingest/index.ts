import { DATE } from "@/model/history/earth/date"
import type { HeirPlanChange } from "@/model/history/record/rulers/types"
import { ANCHORS } from "@/model/people/anchors"
import { ALLIANCE } from "@/model/people/anchors/alliance"
import { FIT } from "@/model/people/anchors/fit"
import { LADDER } from "@/model/people/anchors/fit/ladder"
import { CAST } from "@/model/people/cast"
import type {
	ApplyParams,
	Batch,
	KinSonParams,
	OpenParams,
	PlanParams,
	ResolveParams,
	RulerParams,
} from "@/model/people/cast/ingest/types"
import type { Cast, Person } from "@/model/people/cast/types"
import { FERTILITY } from "@/model/people/fertility"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const GESTATION = FERTILITY.gestationMs
const ADULT = FERTILITY.adult * YEAR

function collect({ cast, record }: ApplyParams): Batch {
	const batch: Batch = { rulers: [], plans: [] }
	const logs = record.events.nationEvents
	for (let nationId = 0; nationId < logs.length; nationId++) {
		const log = logs[nationId]
		if (!log) continue
		const start = cast.ingested.nations.get(nationId) ?? 0
		for (let at = start; at < log.events.length; at++) {
			const event = log.events[at]
			if (event.kind === "rulerChange")
				batch.rulers.push({
					nationId,
					timeMs: event.timeMs,
					payload: event.payload as Record<string, unknown>,
				})
			else if (event.kind === "heirPlanChange")
				batch.plans.push({
					timeMs: event.timeMs,
					payload: event.payload as unknown as HeirPlanChange,
				})
		}
		cast.ingested.nations.set(nationId, log.events.length)
	}
	batch.rulers.sort((a, b) => a.timeMs - b.timeMs)
	batch.plans.sort((a, b) => a.payload.transactionId - b.payload.transactionId)
	return batch
}

function kinSon({ cast, fact, kin }: KinSonParams): void {
	if (kin.relation !== "son" || cast.reserved.has(fact.rulerId)) return
	const late = cast.anchors.facts.get(kin.late.rulerId)
	if (!late) return
	const female = late.ref.sex === 1
	const lo = female ? late.birthMs + ADULT : late.birthMs + ADULT + GESTATION
	const hi = female
		? Math.min(
				late.birthMs + FERTILITY.lastBirth * YEAR,
				late.fixedDeathMs ?? Infinity,
			)
		: (late.fixedDeathMs ?? Infinity) + GESTATION
	if (fact.birthMs < lo || fact.birthMs > hi) return
	const reservation = FIT.reserve({
		cast,
		owner: `r${late.rulerId}`,
		spec: FIT.specOf({ ref: fact.ref, survivesMs: fact.survivesMs }),
		birthMs: fact.birthMs,
		source: "kin",
	})
	const owner = cast.rulerPerson.get(late.rulerId)
	if (owner !== undefined)
		FIT.settleNow({ cast, parent: cast.persons[owner], reservation })
}

function resolve({ cast, ownerId, timeMs }: ResolveParams): void {
	for (const reservation of cast.reservations.get(`r${ownerId}`) ?? []) {
		if (reservation.source !== "plan" || reservation.placed === null) continue
		const child = cast.persons[reservation.placed]
		if (child.ruler.kind !== "ruler") continue
		if (cast.anchors.facts.has(child.ruler.ref.rulerId)) continue
		if (child.inputs.fixedDeathMs === Infinity)
			CAST.mortal({ cast, person: child, fromMs: timeMs })
	}
}

function plan({ cast, timeMs, change }: PlanParams): void {
	for (const created of change.created) {
		const ownerId = created.owner.rulerId
		cast.plans.set(ownerId, "open")
		const heirBirthMs = created.heir
			? DATE.eu4DateToTimeMs(created.heir.birthDate)
			: Infinity
		cast.blocks.set(ownerId, {
			fromMs: timeMs,
			untilMs: created.relation === "son" ? heirBirthMs : Infinity,
		})
		const children = created.heir
			? [created.heir, ...created.juniors]
			: created.juniors
		for (const child of children) {
			const known = cast.reserved.get(child.ref.rulerId)
			if (known && known.state !== "unfit") continue
			const birthMs = DATE.eu4DateToTimeMs(child.birthDate)
			const reservation = FIT.reserve({
				cast,
				owner: `r${ownerId}`,
				spec: FIT.specOf({ ref: child.ref, survivesMs: birthMs }),
				birthMs,
				source: "plan",
			})
			const owner = cast.rulerPerson.get(ownerId)
			if (owner !== undefined)
				FIT.settleNow({ cast, parent: cast.persons[owner], reservation })
		}
	}
	for (const fulfilled of change.fulfilled) {
		cast.plans.set(fulfilled.rulerId, "fulfilled")
		resolve({ cast, ownerId: fulfilled.rulerId, timeMs })
	}
	for (const cancelled of change.cancelled) {
		cast.plans.set(cancelled.rulerId, "cancelled")
		resolve({ cast, ownerId: cancelled.rulerId, timeMs })
	}
}

function ties({ cast, record }: ApplyParams): void {
	const diplomacy = record.events.diplomacy
	for (let at = cast.ingested.diplomacy; at < diplomacy.length; at++) {
		const event = diplomacy[at]
		if (event.kind === "royalMarriageEnd") {
			ANCHORS.endTie({
				index: cast.anchors,
				timeMs: event.timeMs,
				first: event.firstId,
				second: event.secondId,
			})
			continue
		}
		if (event.kind !== "royalMarriageStart") continue
		const tie = ANCHORS.addTie({
			index: cast.anchors,
			timeMs: event.timeMs,
			first: event.firstId,
			second: event.secondId,
		})
		ALLIANCE.defer({ cast, tie })
	}
	cast.ingested.diplomacy = diplomacy.length
}

function drain(cast: Cast): void {
	while (cast.arrivals.length > 0) {
		const rulerId = cast.arrivals.shift() as number
		LADDER.noteExisting(cast, rulerId)
		ALLIANCE.arrive(cast, rulerId)
	}
}

function settle(cast: Cast): void {
	for (const rulerId of [...cast.pendingTies.keys()])
		if (cast.rulerPerson.has(rulerId)) ALLIANCE.arrive(cast, rulerId)
	drain(cast)
}

function apply({ cast, record }: ApplyParams): void {
	cast.horizonMs = Math.max(cast.horizonMs, record.maxTimeMs)
	const batch = collect({ cast, record })
	const created: RulerParams[] = []
	for (const event of batch.rulers) {
		const added = ANCHORS.add({
			index: cast.anchors,
			nationId: event.nationId,
			timeMs: event.timeMs,
			payload: event.payload,
		})
		if (!added) continue
		if (added.created) created.push({ cast, rulerId: added.fact.rulerId })
		else if (added.entered && added.kin?.relation === "daughterLine")
			cast.unions.push({
				successor: added.fact.rulerId,
				late: added.kin.late.rulerId,
				timeMs: event.timeMs,
			})
	}
	for (const fact of ANCHORS.settle({ index: cast.anchors, record }))
		CAST.refresh({ cast, fact })
	for (const event of batch.plans)
		plan({ cast, timeMs: event.timeMs, change: event.payload })
	for (const { rulerId } of created) {
		const fact = cast.anchors.facts.get(rulerId)
		if (!fact?.kin) continue
		kinSon({ cast, fact, kin: fact.kin })
		LADDER.noteExisting(cast, rulerId)
	}
	ties({ cast, record })
	drain(cast)
}

function open({ record, context }: OpenParams): Cast {
	const cast = CAST.of({ record, context })
	apply({ cast, record })
	return cast
}

function ruler({ cast, rulerId }: RulerParams): Person | null {
	const person = LADDER.ruler({ cast, rulerId })
	drain(cast)
	return person
}

export const INGEST = { open, apply, ruler, drain, settle }
