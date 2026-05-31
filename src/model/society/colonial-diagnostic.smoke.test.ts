import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import { initHistory } from "../history"
import { REL } from "../history/state"
import { generateOrogenWorld } from "../pipelines/generate-world"
import { ERA_CONFIGS } from "./eras"

const SEED = 42
const NUM_POINTS = 200_000

beforeAll(() => {
	vi.spyOn(console, "table").mockImplementation(() => undefined)
})
afterAll(() => {
	vi.restoreAllMocks()
})

describe("colonial diagnostic", () => {
	it("industrial era: government types and colonial relations are seeded", () => {
		const industrialMix = ERA_CONFIGS.industrial.governmentMix
		console.log("Era config colonial fraction:", industrialMix.colonial)

		const world = generateOrogenWorld({
			...DEFAULT_WORLD_PARAMS,
			seed: SEED,
			numPoints: NUM_POINTS,
			era: "industrial",
			tidallyLocked: false,
		})

		const nations = world.nations!
		const N = nations.count
		console.log("Nation count:", N)

		// -- Government types --
		const govCounts = new Map<number, number>()
		for (let n = 0; n < N; n++) {
			const g = nations.governmentType?.[nations.seeds[n]] ?? -1
			govCounts.set(g, (govCounts.get(g) ?? 0) + 1)
		}
		const tradingCo = govCounts.get(19) ?? 0
		const settlerCol = govCounts.get(20) ?? 0
		console.log("Gov type 19 (trading_company):", tradingCo)
		console.log("Gov type 20 (settler_colony):", settlerCol)
		console.log(
			"All gov types:",
			Object.fromEntries([...govCounts.entries()].sort((a, b) => a[0] - b[0])),
		)

		// -- nationColonizer --
		const nc = nations.nationColonizer
		const colonizerPairs: { colony: number; colonizer: number }[] = []
		if (nc) {
			for (let col = 0; col < nc.length; col++) {
				if (nc[col] >= 0)
					colonizerPairs.push({ colony: col, colonizer: nc[col] })
			}
		}
		console.log("nationColonizer total assigned:", colonizerPairs.length)
		console.log("nationColonizer first 5:", colonizerPairs.slice(0, 5))

		// -- History state relations --
		const state = initHistory({
			nations,
			provinces: world.provinces!,
			population: world.population!,
			coastal: world.coastal!,
			riverVisible: world.rivers!.visible,
			r_xyz: world.mesh.r_xyz,
			cultures: world.cultures!,
			seed: world.params.seed,
		})

		// Count COLONY relations in live mirror
		const P = state.P
		let colonyCount = 0
		const colonyExamples: string[] = []
		for (let a = 0; a < P; a++) {
			for (let b = 0; b < P; b++) {
				const rel = state.relationsCurrent[a * P + b]
				if (rel === REL.COLONY) {
					colonyCount++
					if (colonyExamples.length < 5) colonyExamples.push(`${a}→${b}=COLONY`)
				}
			}
		}
		console.log("COLONY relations in live state:", colonyCount)
		console.log("Examples:", colonyExamples)

		// Count COLONY in _relations timeline
		let timelineColonyCount = 0
		for (const [, timeline] of state._relations.entries()) {
			if (
				timeline.length > 0 &&
				timeline[timeline.length - 1].value === REL.COLONY
			) {
				timelineColonyCount++
			}
		}
		console.log("COLONY entries in _relations timeline:", timelineColonyCount)

		// Basic assertions — if colonial pass ran, there should be some
		expect(
			tradingCo + settlerCol,
			"expected some colonial governments",
		).toBeGreaterThan(0)
		expect(
			colonyCount,
			"expected some COLONY relations in live state",
		).toBeGreaterThan(0)
	}, 120_000)
})

it("verifies colony capitals are in nationModel-equivalent set", () => {
	vi.spyOn(console, "table").mockImplementation(() => undefined)
	const world = generateOrogenWorld({
		...DEFAULT_WORLD_PARAMS,
		seed: SEED,
		numPoints: NUM_POINTS,
		era: "industrial",
		tidallyLocked: false,
	})

	const nations = world.nations!
	const state = initHistory({
		nations,
		provinces: world.provinces!,
		population: world.population!,
		coastal: world.coastal!,
		riverVisible: world.rivers!.visible,
		r_xyz: world.mesh.r_xyz,
		cultures: world.cultures!,
		seed: world.params.seed,
	})

	// Build the sovereign set (what nationModel.counts would contain)
	const sovereigns = new Set<number>()
	for (let p = 0; p < state.P; p++) {
		if (state.parentCurrent[p] < 0 && state.sovereignCurrent[p] >= 0) {
			sovereigns.add(p)
		}
	}
	console.log("Total sovereigns:", sovereigns.size)

	// For each COLONY relation, check both endpoints are sovereigns
	let mismatches = 0
	for (const [key, timeline] of state._relations.entries()) {
		if (!timeline.length || timeline[timeline.length - 1].value !== REL.COLONY)
			continue
		const a = Math.floor(key / state.P)
		const b = key % state.P
		const aIsSov = sovereigns.has(a)
		const bIsSov = sovereigns.has(b)
		if (!aIsSov || !bIsSov) {
			mismatches++
			console.log(`COLONY pair a=${a}(sov=${aIsSov}) b=${b}(sov=${bIsSov})`)
		}
	}
	console.log(
		"Colony pairs where both endpoints are sovereigns:",
		22 - mismatches,
		"/ 22",
	)
	console.log("Mismatches (endpoint not a sovereign):", mismatches)

	// Now simulate the forEachRelationPair + nationModel.counts check
	// to see exactly what buildRelationDistribution would count
	const { aIdx, bIdx } = (() => {
		// Reconstruct what the serialized timelines would look like
		const entries = [...state._relations.entries()].filter(
			([, tl]) => tl.length > 0 && tl[tl.length - 1].value !== REL.NEUTRAL,
		)
		return {
			aIdx: entries.map(([k]) => Math.floor(k / state.P)),
			bIdx: entries.map(([k]) => k % state.P),
		}
	})()

	let counted = 0
	const seen = new Set<string>()
	for (let i = 0; i < aIdx.length; i++) {
		const a = aIdx[i]
		const b = bIdx[i]
		if (a >= b) continue
		if (!sovereigns.has(a) || !sovereigns.has(b)) continue
		const key = `${a},${b}`
		if (seen.has(key)) continue
		const relAB = state.relationsCurrent[a * state.P + b]
		const relBA = state.relationsCurrent[b * state.P + a]
		if (relAB === REL.COLONY || relBA === REL.COLONY) {
			seen.add(key)
			counted++
		}
	}
	console.log("Colony pairs buildRelationDistribution would count:", counted)
	expect(counted).toBeGreaterThan(0)
}, 120_000)
