import { DATE } from "@/model/history/earth/date"
import { RULER_NAMES } from "@/model/history/record/rulers"
import type { RulerKin } from "@/model/history/record/rulers/types"
import type { HistoryRecord } from "@/model/history/record/types"
import type {
	FactsResult,
	RulerFact,
	RulerReign,
} from "@/model/people/anchors/types"
import { PERSON_KEY } from "@/model/people/keys"

interface DeathNote {
	deathMs: number
	cause: "natural" | "deposed"
}

function collect(record: HistoryRecord): FactsResult {
	const facts = new Map<number, RulerFact>()
	const deaths = new Map<number, DeathNote>()
	const nationReigns = new Map<number, RulerReign[]>()
	for (const identity of record.nations) {
		const log = record.events.nationEvents[identity.id]
		if (!log) continue
		const reigns: RulerReign[] = []
		let current: RulerReign | null = null
		for (const event of log.events) {
			if (event.kind !== "rulerChange") continue
			const ref = RULER_NAMES.refOf(event.payload)
			if (!ref) continue
			let fact = facts.get(ref.rulerId)
			if (!fact) {
				fact = {
					key: PERSON_KEY.ruler(ref.rulerId),
					rulerId: ref.rulerId,
					ref,
					birthMs: DATE.eu4DateToTimeMs(event.payload.birthDate as string),
					accessionMs: event.timeMs,
					fixedDeathMs: null,
					survivesMs: event.timeMs,
					deathCause: null,
					kin: (event.payload.kin as RulerKin | null | undefined) ?? null,
					reigns: [],
				}
				facts.set(ref.rulerId, fact)
			}
			const kin = (event.payload.kin as RulerKin | null | undefined) ?? null
			if (event.timeMs < fact.accessionMs) {
				fact.accessionMs = event.timeMs
				fact.kin = kin
			} else if (event.timeMs === fact.accessionMs && kin) fact.kin = kin
			if (typeof event.payload.deathDate === "string") {
				const cause = event.payload.deathCause as "natural" | "deposed"
				deaths.set(ref.rulerId, {
					deathMs: DATE.eu4DateToTimeMs(event.payload.deathDate),
					cause,
				})
			}
			if (!current || current.rulerId !== ref.rulerId) {
				if (current) current.endMs = event.timeMs
				current = {
					rulerId: ref.rulerId,
					nationId: identity.id,
					startMs: event.timeMs,
					endMs: event.timeMs,
					open: false,
				}
				reigns.push(current)
				fact.reigns.push(current)
			}
		}
		if (current) {
			const alive = identity.deathTimeMs < 0
			current.endMs = alive ? record.maxTimeMs : identity.deathTimeMs
			current.open = alive
		}
		nationReigns.set(identity.id, reigns)
	}
	for (const fact of facts.values()) {
		const death = deaths.get(fact.rulerId)
		const reignEnd = Math.max(
			fact.accessionMs,
			...fact.reigns.map((reign) => reign.endMs),
		)
		fact.survivesMs = reignEnd
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
	return { facts, nationReigns }
}

export const RULER_FACTS = { collect }
