import type { NavalTotals } from "@/model/history/sim/engine/military/navy/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { Distribution } from "@/test/history-run/report/statistics/types"

export interface NavySample {
	shares: number[]
	realms: number
	withShips: number
	ships: number[]
	upkeep: number
	revenue: number
	coastal: number
	coastalWithShips: number
	largest: number
	top5Ships: number
	top5Share: number
}

export interface NavyTracker {
	samples: NavySample[]
	totals: NavalTotals
}

export interface NavySampleParams {
	engine: HistoryState
	tracker: NavyTracker
}

export interface NavySummaryParams extends NavySampleParams {
	from: number
	to: number
}

export interface NavalOutcomeMix {
	inconclusive: number
	normal: number
	decisive: number
	rout: number
}

export interface BlockadeBeats {
	attempted: number
	successful: number
}

export interface PortSiegeGroup {
	count: number
	outcomes: Record<string, number>
}

export interface NavyReport {
	share: { mean: number; p10: number; p50: number; p90: number }
	realmsWithShips: number
	coastalWithShips: number
	largestFleet: number
	top5ShipShare: number
	top5NavalShare: number
	ships: Distribution & {
		p10: number
		p25: number
		p75: number
		max: number
		total: number
	}
	upkeepShareOfRevenue: number
	engagements: {
		count: number
		shareOfBattles: number
		outcomes: NavalOutcomeMix
	}
	shipsLost: number
	crewDeaths: number
	portSieges: {
		count: number
		startedSuppliedShare: number
		supplied: PortSiegeGroup
		blockaded: PortSiegeGroup
		defenderHeldShips: PortSiegeGroup
		defenderHeldNone: PortSiegeGroup
	}
	decommissions: number
	reachViolations: number
	blockades: { imposed: BlockadeBeats; broken: BlockadeBeats }
}

export interface NavyLogParams {
	reports: { from: number; to: number; navy: NavyReport }[]
	log: (line: string) => void
}
