import { COUPLES } from "@/model/people/anchors/couples"
import { RULER_FACTS } from "@/model/people/anchors/facts"
import { PLACEMENT } from "@/model/people/anchors/placement"
import type {
	AnchorIndex,
	BuildIndexParams,
	TieEvent,
} from "@/model/people/anchors/types"

interface PlanItem {
	timeMs: number
	order: number
	rulerId: number
	tie: TieEvent | null
}

function collectTies(params: BuildIndexParams): TieEvent[] {
	const ties: TieEvent[] = []
	const open = new Map<string, TieEvent>()
	const sorted = params.record.events.diplomacy
		.filter(
			(event) =>
				event.kind === "royalMarriageStart" ||
				event.kind === "royalMarriageEnd",
		)
		.sort((a, b) => a.timeMs - b.timeMs)
	for (const event of sorted) {
		const pair = `${Math.min(event.firstId, event.secondId)}:${Math.max(event.firstId, event.secondId)}`
		if (event.kind === "royalMarriageStart") {
			const tie = {
				timeMs: event.timeMs,
				first: event.firstId,
				second: event.secondId,
				endMs: Infinity,
			}
			ties.push(tie)
			open.set(pair, tie)
		} else {
			const tie = open.get(pair)
			if (tie) tie.endMs = event.timeMs
			open.delete(pair)
		}
	}
	return ties
}

function build(params: BuildIndexParams): AnchorIndex {
	const started = performance.now()
	const { facts, nationReigns } = RULER_FACTS.collect(params.record)
	const index: AnchorIndex = {
		worldSeed: params.worldSeed,
		horizonMs: params.record.maxTimeMs,
		facts,
		nationReigns,
		injected: new Map(),
		couples: new Map(),
		parentCouple: new Map(),
		spouseCouples: new Map(),
		placements: [],
		ties: [],
		indexMs: 0,
	}
	const ties = collectTies(params)
	const plan: PlanItem[] = []
	for (const fact of facts.values())
		if (fact.kin)
			plan.push({
				timeMs: fact.accessionMs,
				order: 0,
				rulerId: fact.rulerId,
				tie: null,
			})
	for (const [ordinal, tie] of ties.entries())
		plan.push({ timeMs: tie.timeMs, order: 1, rulerId: ordinal, tie })
	plan.sort(
		(a, b) => a.timeMs - b.timeMs || a.order - b.order || a.rulerId - b.rulerId,
	)
	for (const item of plan) {
		if (item.tie) {
			PLACEMENT.placeTie({ index, tie: item.tie, ordinal: item.rulerId })
			continue
		}
		const fact = facts.get(item.rulerId)
		if (fact) PLACEMENT.place({ index, fact })
	}
	index.indexMs = performance.now() - started
	return index
}

export const ANCHORS = {
	build,
	birthOf: COUPLES.birthOf,
	sexOf: COUPLES.sexOf,
	lineage: COUPLES.lineage,
	childLineage: COUPLES.childLineage,
	parentCouple: COUPLES.parentCoupleFor,
	spouseCouples: COUPLES.spouseCouples,
	coupleStart: COUPLES.start,
	unit: COUPLES.unit,
}
