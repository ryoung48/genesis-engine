import { DATE } from "@/model/history/earth/date"
import { RULER_NAMES } from "@/model/history/record/rulers"
import type { RulerKin } from "@/model/history/record/rulers/types"
import type {
	AddResult,
	AddRulerParams,
	AnchorIndex,
	RulerFact,
	RulerReign,
	SettleParams,
} from "@/model/people/anchors/types"

function create(): AnchorIndex {
	return {
		facts: new Map(),
		nationReigns: new Map(),
		lastReign: new Map(),
		ties: [],
		openTies: new Map(),
		dirty: new Set(),
	}
}

function add({
	index,
	nationId,
	timeMs,
	payload,
}: AddRulerParams): AddResult | null {
	const ref = RULER_NAMES.refOf(payload)
	if (!ref) return null
	let fact = index.facts.get(ref.rulerId)
	const created = !fact
	const kin = (payload.kin as RulerKin | null | undefined) ?? null
	if (!fact) {
		fact = {
			rulerId: ref.rulerId,
			ref,
			birthMs: DATE.eu4DateToTimeMs(payload.birthDate as string),
			accessionMs: timeMs,
			fixedDeathMs: null,
			survivesMs: timeMs,
			deathCause: null,
			kin,
			death: null,
			reigns: [],
		}
		index.facts.set(ref.rulerId, fact)
	}
	if (timeMs < fact.accessionMs) {
		fact.accessionMs = timeMs
		fact.kin = kin
	} else if (timeMs === fact.accessionMs && kin) fact.kin = kin
	if (typeof payload.deathDate === "string")
		fact.death = {
			deathMs: DATE.eu4DateToTimeMs(payload.deathDate),
			cause: payload.deathCause as "natural" | "deposed",
		}
	const current = index.lastReign.get(nationId)
	const entered = !current || current.rulerId !== ref.rulerId || current.settled
	if (entered) {
		if (current && !current.settled) {
			current.endMs = timeMs
			current.open = false
			current.settled = true
			index.dirty.add(current.rulerId)
		}
		const reign: RulerReign = {
			rulerId: ref.rulerId,
			nationId,
			startMs: timeMs,
			endMs: timeMs,
			open: false,
			settled: false,
		}
		const reigns = index.nationReigns.get(nationId) ?? []
		reigns.push(reign)
		index.nationReigns.set(nationId, reigns)
		fact.reigns.push(reign)
		index.lastReign.set(nationId, reign)
	}
	index.dirty.add(ref.rulerId)
	return { fact, created, entered, kin }
}

function derive(fact: RulerFact): void {
	const reignEnd = Math.max(
		fact.accessionMs,
		...fact.reigns.map((reign) => reign.endMs),
	)
	fact.survivesMs = reignEnd
	fact.fixedDeathMs = null
	fact.deathCause = null
	const death = fact.death
	if (death?.cause === "natural") {
		fact.fixedDeathMs = Math.max(death.deathMs, fact.birthMs)
		fact.deathCause = "natural"
		fact.survivesMs = Math.min(fact.survivesMs, fact.fixedDeathMs)
	} else if (death) {
		fact.deathCause = "deposed"
		fact.survivesMs = Math.max(reignEnd, death.deathMs)
	} else if (fact.reigns.some((reign) => reign.open)) {
		fact.fixedDeathMs = Infinity
	}
}

function settle({ index, record }: SettleParams): RulerFact[] {
	for (const [nationId, reign] of index.lastReign) {
		const identity = record.nations[nationId]
		if (!identity || reign.settled) continue
		const alive = identity.deathTimeMs < 0
		const endMs = alive ? record.maxTimeMs : identity.deathTimeMs
		if (reign.open !== alive) index.dirty.add(reign.rulerId)
		reign.endMs = endMs
		reign.open = alive
		reign.settled = !alive
	}
	const changed: RulerFact[] = []
	for (const rulerId of index.dirty) {
		const fact = index.facts.get(rulerId)
		if (!fact) continue
		const before = [fact.fixedDeathMs, fact.deathCause, fact.survivesMs]
		derive(fact)
		const lifeChanged =
			before[0] !== fact.fixedDeathMs ||
			before[1] !== fact.deathCause ||
			(fact.fixedDeathMs === null && before[2] !== fact.survivesMs)
		if (lifeChanged) changed.push(fact)
	}
	index.dirty.clear()
	return changed
}

export const RULER_FACTS = { create, add, settle }
