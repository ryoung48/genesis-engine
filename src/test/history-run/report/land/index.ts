import { STATE } from "@/model/history/sim/engine/state"
import { TARGET_PROFILE } from "@/model/history/sim/targets"
import type {
	GapStatus,
	GapStatusParams,
	LandmassBreakdownParams,
	LandmassStatus,
	LandReport,
	LandSnapshotParams,
	LandTracker,
} from "@/test/history-run/report/land/types"

function tracker(): LandTracker {
	return { absorptions: 0, settlements: 0 }
}

const DEVELOPMENT_BUCKETS = 5
const MIN_LANDMASS_SHARE = 0.01
const KNOWLEDGE_BUCKETS = 7

function levelBucket(params: {
	value: number
	low: number
	high: number
	count: number
}): number {
	const index = Math.floor(
		((params.value - params.low) / (params.high - params.low)) * params.count,
	)
	return Math.min(params.count - 1, Math.max(0, index))
}

function median(values: number[]): number {
	if (!values.length) return 0
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[sorted.length >> 1]
}

function gapStatus({ held, stateless, threshold }: GapStatusParams): GapStatus {
	return {
		heldSuitability: median(held),
		statelessSuitability: median(stateless),
		goodStatelessShare:
			(100 * stateless.filter((value) => value >= threshold).length) /
			Math.max(1, stateless.length),
	}
}

function landmassBreakdown({
	engine,
	context,
}: LandmassBreakdownParams): Pick<
	LandReport,
	"landmasses" | "heldCores" | "gaps"
> {
	const { landmassId, cradleProvinces, contactYear, suitability } = context
	const held = (p: number) =>
		!engine.desolate[p] && !engine.uninhabited[p] && !engine.stateless[p]
	const rows = new Map<
		number,
		{
			habitable: number
			held: number
			contact: number[]
			heldSuitability: number[]
			statelessSuitability: number[]
		}
	>()
	const heldSuitability: number[] = []
	const statelessSuitability: number[] = []
	let habitable = 0
	let heldTotal = 0
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p] || landmassId[p] < 0) continue
		const row = rows.get(landmassId[p]) ?? {
			habitable: 0,
			held: 0,
			contact: [],
			heldSuitability: [],
			statelessSuitability: [],
		}
		row.habitable++
		row.contact.push(contactYear[p])
		habitable++
		if (held(p)) {
			row.held++
			heldTotal++
			row.heldSuitability.push(suitability[p])
			heldSuitability.push(suitability[p])
		} else if (!engine.uninhabited[p]) {
			row.statelessSuitability.push(suitability[p])
			statelessSuitability.push(suitability[p])
		}
		rows.set(landmassId[p], row)
	}
	const threshold = median(heldSuitability)
	const landmasses: LandmassStatus[] = [...rows.entries()]
		.filter(([, row]) => row.habitable >= MIN_LANDMASS_SHARE * habitable)
		.sort((a, b) => b[1].habitable - a[1].habitable || a[0] - b[0])
		.map(([landmass, row]) => ({
			landmass,
			habitableShare: (100 * row.habitable) / Math.max(1, habitable),
			heldShare: (100 * row.held) / row.habitable,
			shareOfHeld: (100 * row.held) / Math.max(1, heldTotal),
			cradles: cradleProvinces.filter((p) => landmassId[p] === landmass).length,
			contactYear: median(row.contact),
			gaps: gapStatus({
				held: row.heldSuitability,
				stateless: row.statelessSuitability,
				threshold,
			}),
		}))
	const seen = new Uint8Array(engine.P)
	let heldCores = 0
	for (let p = 0; p < engine.P; p++) {
		if (seen[p] || !held(p)) continue
		heldCores++
		seen[p] = 1
		const stack = [p]
		while (stack.length) {
			const q = stack.pop()!
			for (
				let j = engine.provinceAdjOffset[q];
				j < engine.provinceAdjOffset[q + 1];
				j++
			) {
				const n = engine.provinceAdjList[j]
				if (seen[n] || !held(n) || landmassId[n] !== landmassId[q]) continue
				seen[n] = 1
				stack.push(n)
			}
		}
	}
	return {
		landmasses,
		heldCores,
		gaps: gapStatus({
			held: heldSuitability,
			stateless: statelessSuitability,
			threshold,
		}),
	}
}

function snapshot({
	engine,
	tracker: since,
	landmass,
}: LandSnapshotParams): LandReport {
	const land = engine.land
	const counts = { uninhabited: 0, stateless: 0, stateHeld: 0 }
	const population = { stateHeld: 0, stateless: 0 }
	let largestCity = 0
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p]) continue
		const people = engine.popRuralCurrent[p] + engine.popUrbanCurrent[p]
		largestCity = Math.max(largestCity, engine.popUrbanCurrent[p])
		if (engine.uninhabited[p]) counts.uninhabited++
		else if (engine.stateless[p]) {
			counts.stateless++
			population.stateless += people
		} else {
			counts.stateHeld++
			population.stateHeld += people
		}
	}
	const development = new Array<number>(DEVELOPMENT_BUCKETS).fill(0)
	const knowledge = new Array<number>(KNOWLEDGE_BUCKETS).fill(0)
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p] || engine.uninhabited[p]) continue
		development[
			levelBucket({
				value: engine.developmentCurrent[p],
				low: 0,
				high: 1,
				count: DEVELOPMENT_BUCKETS,
			})
		]++
		knowledge[
			levelBucket({
				value: engine.knowledgeCurrent[p],
				low: -3,
				high: 4,
				count: KNOWLEDGE_BUCKETS,
			})
		]++
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
		development,
		knowledge,
		population,
		largestCity,
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
		...landmassBreakdown({ engine, context: landmass }),
	}
	since.absorptions = land.counters.absorptions
	since.settlements = land.counters.settlements
	return report
}

export const LAND_REPORT = { tracker, snapshot }
