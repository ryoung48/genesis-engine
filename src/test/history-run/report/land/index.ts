import { STATE } from "@/model/history/sim/engine/state"
import { TARGET_PROFILE } from "@/model/history/sim/targets"
import type {
	LandReport,
	LandSnapshotParams,
	LandTracker,
} from "@/test/history-run/report/land/types"

function tracker(): LandTracker {
	return { absorptions: 0, settlements: 0 }
}

function snapshot({ engine, tracker: since }: LandSnapshotParams): LandReport {
	const land = engine.land
	const counts = { uninhabited: 0, stateless: 0, stateHeld: 0 }
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p]) continue
		if (engine.uninhabited[p]) counts.uninhabited++
		else if (engine.stateless[p]) counts.stateless++
		else counts.stateHeld++
	}
	const percent = (count: number) => (100 * count) / Math.max(1, land.habitable)
	const sovereigns = new Array<number>(TARGET_PROFILE.bucketCount).fill(0)
	let realms = 0
	for (let root = 0; root < engine.P; root++) {
		if (land.realmSize[root] <= 0) continue
		realms++
		sovereigns[TARGET_PROFILE.bucketOf({ size: land.realmSize[root] })]++
	}
	const bucketShares = Array.from(land.shares, (share) => 100 * share)
	const bucketTargets = Array.from(land.targets, (share) => 100 * share)
	const report: LandReport = {
		year: Math.floor(engine.time / STATE.yearMs),
		habitableProvinces: land.habitable,
		statusShares: {
			uninhabited: percent(counts.uninhabited),
			stateless: percent(counts.stateless),
			stateHeld: percent(counts.stateHeld),
		},
		stateHeldTarget: 100 * land.stateHeldTarget,
		bucketShares,
		bucketTargets,
		sovereignShares: sovereigns.map(
			(count) => (100 * count) / Math.max(1, realms),
		),
		totalVariation:
			0.5 *
			bucketShares.reduce(
				(sum, share, b) => sum + Math.abs(share - bucketTargets[b]),
				0,
			),
		absorptions: land.counters.absorptions - since.absorptions,
		absorptionViolations: land.counters.absorptionViolations,
		settlements: land.counters.settlements - since.settlements,
		unmetDemand: land.counters.unmetDemand,
	}
	since.absorptions = land.counters.absorptions
	since.settlements = land.counters.settlements
	return report
}

export const LAND_REPORT = { tracker, snapshot }
