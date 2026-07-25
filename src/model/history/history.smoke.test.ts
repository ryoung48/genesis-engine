import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import { NATION_BUCKETS } from "../society/nations"
import { createHistoryRng, initHistory, simulateUntil, YEAR_MS } from "."
import { nationAdjacency } from "./derive"
import type { HistoryState } from "./state"
import { ensureHierarchyClean, REL, validateLiveHierarchy } from "./state"
import { getCachedWorld } from "./test-world"

const HISTORY_NATION_SIZE_BUCKETS = [
	...NATION_BUCKETS,
	[101, Number.POSITIVE_INFINITY] as const,
]

function formatNationSizeBucket([min, max]: readonly [number, number]): string {
	return Number.isFinite(max) ? `${min}-${max}` : `${min}+`
}

function collectRelationDistribution(
	state: HistoryState,
): Record<string, number> {
	const adj = nationAdjacency(state)
	const counts = {
		"Personal Union": 0,
		Vassal: 0,
		Allied: 0,
		Friendly: 0,
		Neutral: 0,
		Suspicious: 0,
		Rival: 0,
		War: 0,
	}
	const seen = new Set<number>()
	const P = state.P
	for (let i = 0; i < adj.offset.length - 1; i++) {
		for (let e = adj.offset[i]; e < adj.offset[i + 1]; e++) {
			const j = adj.list[e]
			const key = Math.min(i, j) * P + Math.max(i, j)
			if (seen.has(key)) continue
			seen.add(key)
			const rel = state.relationsCurrent[i * P + j]
			if (rel === REL.OVERLORD || rel === REL.VASSAL) counts.Vassal++
			else if (rel === REL.PU_SENIOR || rel === REL.PU_JUNIOR)
				counts["Personal Union"]++
			else if (rel === REL.ALLY) counts.Allied++
			else if (rel === REL.FRIENDLY) counts.Friendly++
			else if (rel === REL.SUSPICIOUS) counts.Suspicious++
			else if (rel === REL.RIVAL) counts.Rival++
			else if (rel === REL.WAR) counts.War++
			else counts.Neutral++
		}
	}
	return counts
}

function collectYearlyMetrics(state: {
	P: number
	time: number
	desolate: Uint8Array
	sovereignCurrent: Int32Array
	popRuralCurrent: Float32Array
	popUrbanCurrent: Float32Array
	wars: { startTime: number; endTime?: number }[]
}): Record<string, number> {
	const sovereignSizes = new Map<number, number>()
	let globalPopulation = 0

	for (let p = 0; p < state.P; p++) {
		globalPopulation += state.popRuralCurrent[p] + state.popUrbanCurrent[p]
		if (state.desolate[p]) continue
		const sovereign = state.sovereignCurrent[p]
		if (sovereign < 0) continue
		sovereignSizes.set(sovereign, (sovereignSizes.get(sovereign) ?? 0) + 1)
	}

	const activeWars = state.wars.filter(
		(war) =>
			war.startTime <= state.time &&
			(war.endTime ?? Number.POSITIVE_INFINITY) > state.time,
	).length

	const row: Record<string, number> = {
		year: state.time / YEAR_MS,
		globalPopulation: Math.round(globalPopulation),
		activeWars,
	}
	for (const bucket of HISTORY_NATION_SIZE_BUCKETS) {
		const label = formatNationSizeBucket(bucket)
		row[`nationCount_${label}`] = 0
	}
	for (const size of sovereignSizes.values()) {
		const bucket = HISTORY_NATION_SIZE_BUCKETS.find(
			([min, max]) => size >= min && size <= max,
		)
		if (!bucket) continue
		row[`nationCount_${formatNationSizeBucket(bucket)}`] += 1
	}

	return row
}

beforeAll(() => {
	vi.spyOn(console, "time").mockImplementation(() => undefined)
	vi.spyOn(console, "timeEnd").mockImplementation(() => undefined)
})

afterAll(() => {
	vi.restoreAllMocks()
})

describe("history simulation on a generated world", () => {
	it("seeds from a generated world and simulates a short span", () => {
		const world = getCachedWorld({ numPoints: DEFAULT_WORLD_PARAMS.numPoints })
		expect(world.nations).toBeDefined()
		expect(world.provinces).toBeDefined()
		expect(world.population).toBeDefined()
		expect(world.cultures).toBeDefined()
		expect(world.rivers?.visible).toBeDefined()
		expect(world.coastal).toBeDefined()

		const rng = createHistoryRng(world.params.seed + 99999)
		const state = initHistory({
			nations: world.nations!,
			provinces: world.provinces!,
			population: world.population!,
			coastal: world.coastal!,
			riverVisible: world.rivers!.visible,
			r_xyz: world.mesh.r_xyz,
			cultures: world.cultures!,
			seed: world.params.seed,
		})

		const startYear = state.time / YEAR_MS
		const target = state.time + 10 * YEAR_MS
		const yearlyMetrics: Record<string, number>[] = []
		for (let year = startYear; year <= target / YEAR_MS; year++) {
			simulateUntil(state, year * YEAR_MS, rng, true)
			ensureHierarchyClean(state)
			yearlyMetrics.push(collectYearlyMetrics(state))
		}

		console.info("History yearly metrics")
		console.table(yearlyMetrics)
		console.info(JSON.stringify(yearlyMetrics, null, 2))

		const relationDistribution = collectRelationDistribution(state)
		console.info("Relation distribution (final year)")
		console.table([relationDistribution])
		console.info(JSON.stringify(relationDistribution, null, 2))

		expect(() => simulateUntil(state, target, rng)).not.toThrow()
		expect(state.time).toBe(target)
		expect(() =>
			validateLiveHierarchy(state, "test-after-simulate"),
		).not.toThrow()
		expect(yearlyMetrics).toHaveLength(11)
		expect(yearlyMetrics[0]?.year).toBe(startYear)
		expect(yearlyMetrics.at(-1)?.year).toBe(target / YEAR_MS)
		expect(yearlyMetrics.every((row) => row.globalPopulation > 0)).toBe(true)
	}, 600_000)
})
