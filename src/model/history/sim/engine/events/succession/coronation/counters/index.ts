import type {
	CoronationCellParams,
	CoronationCounters,
	CoronationKind,
	CoronationQuality,
} from "@/model/history/sim/engine/events/succession/coronation/counters/types"

const KINDS: readonly CoronationKind[] = ["accession", "elevation"]
const QUALITIES: readonly CoronationQuality[] = [
	"uncrowned",
	"humble",
	"customary",
	"lavish",
	"magnificent",
]
const RANKS = 5

function create(): CoronationCounters {
	const grid = () => new Float64Array(KINDS.length * RANKS * QUALITIES.length)
	return {
		held: grid(),
		ducats: grid(),
		memories: grid(),
		founded: grid(),
		raised: grid(),
		deferred: 0,
		majority: 0,
		incapable: 0,
		compositeRealmYears: 0,
		compositeEvaluations: 0,
		compositeRebellions: 0,
		elevateMs: 0,
	}
}

function cell({ kind, rank, quality }: CoronationCellParams): number {
	return (
		(KINDS.indexOf(kind) * RANKS + rank) * QUALITIES.length +
		QUALITIES.indexOf(quality)
	)
}

export const CORONATION_COUNTERS = {
	kinds: KINDS,
	qualities: QUALITIES,
	ranks: RANKS,
	create,
	cell,
}
