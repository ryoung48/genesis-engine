import { ECONOMY } from "@/model/history/sim/engine/economy"
import { NAVY } from "@/model/history/sim/engine/military/navy"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { STATE } from "@/model/history/sim/engine/state"
import type {
	BlockadeBeats,
	NavalOutcomeMix,
	NavyLogParams,
	NavyReport,
	NavySampleParams,
	NavySummaryParams,
	NavyTracker,
	PortSiegeGroup,
} from "@/test/history-run/report/navy/types"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics"

const TOP_FLEETS = 5

function tracker(): NavyTracker {
	return {
		samples: [],
		totals: {
			decommissions: 0,
			shipsLost: 0,
			crewDeaths: 0,
			reachViolations: 0,
		},
	}
}

function sample({ engine, tracker: current }: NavySampleParams): void {
	const result = {
		shares: [] as number[],
		realms: 0,
		withShips: 0,
		ships: [] as number[],
		upkeep: 0,
		revenue: 0,
		coastal: 0,
		coastalWithShips: 0,
		largest: 0,
		top5Ships: 0,
		top5Share: 0,
	}
	const fleets: { ships: number; share: number }[] = []
	for (let nation = 0; nation < engine.P; nation++) {
		if (
			engine.desolate[nation] ||
			engine.stateless[nation] ||
			engine.parentCurrent[nation] >= 0
		)
			continue
		const ships = NAVY.ships({ state: engine, nation })
		result.realms++
		if (ships > 0) {
			result.ships.push(ships)
			result.withShips++
		}
		result.upkeep += NAVY.upkeep({ state: engine, nation })
		result.revenue += ECONOMY.revenue({ state: engine, p: nation })
		const targets = RECRUITMENT.realmTargets({ state: engine, nation })
		const spend = targets.fleetCost + targets.funding * targets.budget
		const share = spend > 0 ? targets.fleetCost / spend : 0
		fleets.push({ ships, share })
		if (NAVY.exposure({ state: engine, nation }).ports <= 0) continue
		result.coastal++
		if (ships > 0) result.coastalWithShips++
		result.shares.push(share)
	}
	fleets.sort((a, b) => b.ships - a.ships)
	const top = fleets.slice(0, TOP_FLEETS)
	result.largest = top[0]?.ships ?? 0
	result.top5Ships = top.reduce((sum, fleet) => sum + fleet.ships, 0)
	result.top5Share =
		top.reduce((sum, fleet) => sum + fleet.share, 0) / Math.max(1, top.length)
	current.samples.push(result)
}

function group(): PortSiegeGroup {
	return { count: 0, outcomes: {} }
}

function add(target: PortSiegeGroup, outcome: string): void {
	target.count++
	target.outcomes[outcome] = (target.outcomes[outcome] ?? 0) + 1
}

function beats(): BlockadeBeats {
	return { attempted: 0, successful: 0 }
}

function summarize({
	engine,
	tracker: current,
	from,
	to,
}: NavySummaryParams): NavyReport {
	const lo = from * STATE.yearMs
	const hi = to * STATE.yearMs
	const samples = current.samples.splice(0)
	const shares = samples.flatMap((entry) => entry.shares)
	const ships = samples.flatMap((entry) => entry.ships)
	const realms = samples.reduce((sum, entry) => sum + entry.realms, 0)
	const outcomes: NavalOutcomeMix = {
		inconclusive: 0,
		normal: 0,
		decisive: 0,
		rout: 0,
	}
	let battles = 0
	let naval = 0
	const started = new Map<
		number,
		{ supplied: boolean; defenders: number; port: boolean }
	>()
	const portSieges = {
		count: 0,
		suppliedStarts: 0,
		supplied: group(),
		blockaded: group(),
		defenderHeldShips: group(),
		defenderHeldNone: group(),
	}
	const blockades = { imposed: beats(), broken: beats() }
	for (const note of engine.events) {
		if (note.time >= hi) break
		if (note.tag === "siege started")
			started.set(note.data.war as number, {
				supplied: note.data.seaSupplied as boolean,
				defenders: note.data.reachingDefenders as number,
				port: (note.data.waterBody as number) >= 0,
			})
		if (note.time < lo) continue
		if (note.tag === "battle") {
			battles++
			if (note.data.kind === "naval") {
				naval++
				outcomes[note.data.result as keyof NavalOutcomeMix]++
			}
		} else if (note.tag === "siege beat") {
			const kind =
				note.data.beat === "blockade imposed"
					? blockades.imposed
					: note.data.beat === "blockade broken"
						? blockades.broken
						: null
			if (kind) {
				kind.attempted++
				if (note.data.effect !== "none") kind.successful++
			}
		} else if (note.tag === "siege ended") {
			const start = started.get(note.data.war as number)
			if (!start?.port) continue
			const outcome = note.data.outcome as string
			portSieges.count++
			if (start.supplied) portSieges.suppliedStarts++
			add(start.supplied ? portSieges.supplied : portSieges.blockaded, outcome)
			add(
				start.defenders > 0
					? portSieges.defenderHeldShips
					: portSieges.defenderHeldNone,
				outcome,
			)
		}
	}
	const totals = engine.navalTotals
	const report: NavyReport = {
		share: {
			mean:
				shares.reduce((sum, share) => sum + share, 0) /
				Math.max(1, shares.length),
			p10: REPORT_STATISTICS.percentile({ values: shares, fraction: 0.1 }),
			p50: REPORT_STATISTICS.percentile({ values: shares, fraction: 0.5 }),
			p90: REPORT_STATISTICS.percentile({ values: shares, fraction: 0.9 }),
		},
		realmsWithShips:
			samples.reduce((sum, entry) => sum + entry.withShips, 0) /
			Math.max(1, realms),
		ships: {
			...REPORT_STATISTICS.summarize(ships),
			p10: REPORT_STATISTICS.percentile({ values: ships, fraction: 0.1 }),
			p25: REPORT_STATISTICS.percentile({ values: ships, fraction: 0.25 }),
			p75: REPORT_STATISTICS.percentile({ values: ships, fraction: 0.75 }),
			max: REPORT_STATISTICS.percentile({ values: ships, fraction: 1 }),
			total:
				ships.reduce((sum, count) => sum + count, 0) /
				Math.max(1, samples.length),
		},
		coastalWithShips:
			samples.reduce((sum, entry) => sum + entry.coastalWithShips, 0) /
			Math.max(
				1,
				samples.reduce((sum, entry) => sum + entry.coastal, 0),
			),
		largestFleet: Math.max(0, ...samples.map((entry) => entry.largest)),
		top5ShipShare:
			samples.reduce((sum, entry) => sum + entry.top5Ships, 0) /
			Math.max(
				1,
				samples.reduce(
					(sum, entry) => sum + entry.ships.reduce((a, b) => a + b, 0),
					0,
				),
			),
		top5NavalShare:
			samples.reduce((sum, entry) => sum + entry.top5Share, 0) /
			Math.max(1, samples.length),
		upkeepShareOfRevenue:
			samples.reduce((sum, entry) => sum + entry.upkeep, 0) /
			Math.max(
				1e-9,
				samples.reduce((sum, entry) => sum + entry.revenue, 0),
			),
		engagements: {
			count: naval,
			shareOfBattles: naval / Math.max(1, battles),
			outcomes,
		},
		shipsLost: totals.shipsLost - current.totals.shipsLost,
		crewDeaths: totals.crewDeaths - current.totals.crewDeaths,
		portSieges: {
			count: portSieges.count,
			startedSuppliedShare:
				portSieges.suppliedStarts / Math.max(1, portSieges.count),
			supplied: portSieges.supplied,
			blockaded: portSieges.blockaded,
			defenderHeldShips: portSieges.defenderHeldShips,
			defenderHeldNone: portSieges.defenderHeldNone,
		},
		decommissions: totals.decommissions - current.totals.decommissions,
		reachViolations: totals.reachViolations - current.totals.reachViolations,
		blockades,
	}
	current.totals = { ...totals }
	return report
}

function log({ reports, log: write }: NavyLogParams): void {
	write(
		"period      navy share mean/p50/p90  realms with ships  ships p50/p90  largest  top5 ships  top5 navy share  coastal w/ ships  upkeep/revenue  engagements  of battles  ships lost  crew deaths  port sieges  supplied start  decommissions  reach violations  blockades imposed/broken",
	)
	for (const { from, to, navy: n } of reports)
		write(
			`${`${from}-${to}`.padEnd(11)} ${`${(100 * n.share.mean).toFixed(1)}%/${(100 * n.share.p50).toFixed(1)}%/${(100 * n.share.p90).toFixed(1)}%`.padStart(24)} ${`${(100 * n.realmsWithShips).toFixed(1)}%`.padStart(18)} ${`${n.ships.p50}/${n.ships.p90}`.padStart(14)} ${String(n.largestFleet).padStart(8)} ${`${(100 * n.top5ShipShare).toFixed(0)}%`.padStart(11)} ${`${(100 * n.top5NavalShare).toFixed(0)}%`.padStart(16)} ${`${(100 * n.coastalWithShips).toFixed(0)}%`.padStart(17)} ${`${(100 * n.upkeepShareOfRevenue).toFixed(2)}%`.padStart(15)} ${String(n.engagements.count).padStart(12)} ${`${(100 * n.engagements.shareOfBattles).toFixed(1)}%`.padStart(11)} ${String(n.shipsLost).padStart(11)} ${n.crewDeaths.toFixed(0).padStart(12)} ${String(n.portSieges.count).padStart(12)} ${`${(100 * n.portSieges.startedSuppliedShare).toFixed(0)}%`.padStart(15)} ${String(n.decommissions).padStart(14)} ${String(n.reachViolations).padStart(17)} ${`${n.blockades.imposed.successful}/${n.blockades.imposed.attempted} ${n.blockades.broken.successful}/${n.blockades.broken.attempted}`.padStart(25)}`,
		)
}

export const NAVY_REPORT = { tracker, sample, summarize, log }
