import { CORONATION_COUNTERS } from "@/model/history/sim/engine/events/succession/coronation/counters"
import type {
	CoronationGridParams,
	CoronationGrids,
	CoronationReport,
	CoronationSampleParams,
	CoronationTracker,
	CoronationWindowParams,
	CoronationWindowReport,
} from "@/test/history-run/report/coronation/types"

function tracker(): CoronationTracker {
	return { coronations: CORONATION_COUNTERS.create() }
}

function grids({
	engine,
	tracker,
	kind,
}: CoronationGridParams): CoronationGrids {
	const grid = (key: keyof CoronationGrids) =>
		Array.from({ length: CORONATION_COUNTERS.ranks }, (_, rank) =>
			CORONATION_COUNTERS.qualities.map((quality) => {
				const cell = CORONATION_COUNTERS.cell({ kind, rank, quality })
				return engine.coronations[key][cell] - tracker.coronations[key][cell]
			}),
		)
	return {
		held: grid("held"),
		ducats: grid("ducats"),
		founded: grid("founded"),
		raised: grid("raised"),
	}
}

function coronations({
	engine,
	tracker,
}: CoronationSampleParams): CoronationReport {
	const since = (
		key:
			| "deferred"
			| "majority"
			| "compositeRealmYears"
			| "compositeEvaluations"
			| "compositeRebellions",
	) => engine.coronations[key] - tracker.coronations[key]
	return {
		accession: grids({ engine, tracker, kind: "accession" }),
		elevation: grids({ engine, tracker, kind: "elevation" }),
		deferred: since("deferred"),
		majority: since("majority"),
		compositeRealmYears: since("compositeRealmYears"),
		compositeEvaluations: since("compositeEvaluations"),
		compositeRebellions: since("compositeRebellions"),
	}
}

// Reports the window since the last call, then starts the next one.
function of({
	engine,
	tracker,
	from,
	to,
}: CoronationWindowParams): CoronationWindowReport {
	const years = Math.max(1, to - from)
	const report = {
		coronations: coronations({ engine, tracker }),
		elevateMsPerYear:
			(engine.coronations.elevateMs - tracker.coronations.elevateMs) / years,
	}
	tracker.coronations = structuredClone(engine.coronations)
	return report
}

export const CORONATION_REPORT = { tracker, of }
