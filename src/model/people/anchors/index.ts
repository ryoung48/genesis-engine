import { RULER_FACTS } from "@/model/people/anchors/facts"
import type {
	AddTieParams,
	EndTieParams,
	ReignAtParams,
	RulerAtParams,
	RulerFact,
	TieRecord,
} from "@/model/people/anchors/types"

function pairOf(first: number, second: number): string {
	return `${Math.min(first, second)}:${Math.max(first, second)}`
}

function addTie({ index, timeMs, first, second }: AddTieParams): TieRecord {
	const tie: TieRecord = {
		timeMs,
		first: Math.min(first, second),
		second: Math.max(first, second),
		endMs: Infinity,
		status: "pending",
		rule: 0,
	}
	index.ties.push(tie)
	index.openTies.set(pairOf(first, second), tie)
	return tie
}

function endTie({ index, timeMs, first, second }: EndTieParams): void {
	const pair = pairOf(first, second)
	const tie = index.openTies.get(pair)
	if (tie) tie.endMs = timeMs
	index.openTies.delete(pair)
}

function rulerAt({ index, nationId, timeMs }: RulerAtParams): RulerFact | null {
	const reigns = index.nationReigns.get(nationId) ?? []
	for (let at = reigns.length - 1; at >= 0; at--)
		if (reigns[at].startMs <= timeMs)
			return index.facts.get(reigns[at].rulerId) ?? null
	return null
}

function nationAt({ fact, timeMs }: ReignAtParams): number | null {
	let found = fact.reigns[0]
	for (const reign of fact.reigns) if (reign.startMs <= timeMs) found = reign
	return found ? found.nationId : null
}

export const ANCHORS = {
	create: RULER_FACTS.create,
	add: RULER_FACTS.add,
	settle: RULER_FACTS.settle,
	addTie,
	endTie,
	rulerAt,
	nationAt,
}
