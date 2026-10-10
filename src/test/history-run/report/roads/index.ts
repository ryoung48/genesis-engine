import { UNITS } from "@/model/shared/units"
import type {
	RoadsReport,
	RoadsReportParams,
} from "@/test/history-run/report/roads/types"

const KINDS = ["major", "minor", "sea"]
function of({ engine, fromBatch }: RoadsReportParams): RoadsReport {
	const state = engine.roads
	const report: RoadsReport = {
		routes: {},
		lengthKm: {},
		members: {},
		batches: 0,
		membershipChanges: 0,
		searched: 0,
		added: 0,
		released: 0,
		rejected: 0,
		retried: 0,
		transitions: Array.from({ length: 4 }, () => Array<number>(4).fill(0)),
		promoted: 0,
		demoted: 0,
		routeLogEntries: 0,
		pathRegions: 0,
		timing: {
			initialBuildMs: state?.batches[0]?.ms ?? 0,
			totalBatchMs: 0,
			maxBatchMs: 0,
			seaNeighborMs: 0,
			landMs: 0,
			seaMs: 0,
		},
	}
	if (!state) return report
	for (let kind = 0; kind < 3; kind++) {
		report.routes[KINDS[kind]] = state.pairs[kind].stored.size
		report.members[kind === 2 ? "port" : KINDS[kind]] = state.membership[
			kind
		].reduce((n, flag) => n + flag, 0)
		report.lengthKm[KINDS[kind]] = 0
	}
	const world = state.world
	for (let region = 0; region < world.regionProvince.length; region++) {
		for (
			let slot = world.regionAdjOffset[region];
			slot < world.regionAdjOffset[region + 1];
			slot++
		) {
			const neighbor = world.regionAdjList[slot]
			if (neighbor <= region) continue
			const length = UNITS.regionDistanceKm({
				r_xyz: world.r_xyz,
				fromRegion: region,
				toRegion: neighbor,
				planetRadiusKm: state.planetRadiusKm,
			})
			if (state.landUsage[slot])
				report.lengthKm[state.landMajorUsage[slot] ? "major" : "minor"] +=
					length
			if (state.seaUsage[slot]) report.lengthKm.sea += length
		}
	}
	for (let i = fromBatch; i < state.batches.length; i++) {
		const batch = state.batches[i]
		report.batches++
		for (const field of [
			"membershipChanges",
			"searched",
			"added",
			"released",
			"rejected",
			"retried",
			"promoted",
			"demoted",
		] as const)
			report[field] += batch[field]
		for (let from = 0; from < 4; from++)
			for (let to = 0; to < 4; to++)
				report.transitions[from][to] += batch.transitions[from][to]
		if (i > 0) {
			report.timing.totalBatchMs += batch.ms
			report.timing.maxBatchMs = Math.max(report.timing.maxBatchMs, batch.ms)
		}
		report.timing.seaNeighborMs += batch.neighborMs
		report.timing.landMs += batch.landMs
		report.timing.seaMs += batch.seaMs
	}
	report.routeLogEntries = state.batches.reduce(
		(n, batch) => n + batch.added,
		0,
	)
	report.pathRegions = state.batches.reduce(
		(n, batch) => n + batch.pathRegions,
		0,
	)
	return report
}
export const ROADS_REPORT = { of }
