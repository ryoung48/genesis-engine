import { describe, expect, it } from "vitest"
import { DEFAULT_PLANET_RADIUS_KM } from "@/model/shared/units"
import { PROVINCE_AREA_TARGET_KM2 } from "@/model/terrain/provinces"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import type { GenesisParams } from ".."
import { generateGenesisWorld } from "./generate-world"

/**
 * Calibration diagnostics for province sizing and the 1444 nation-size mix.
 *
 * Reference figures come from the EU4 extended-timeline data shipped in
 * public/earth-history: 3,522 land provinces (median 20,035 km²) and
 * ownership folded to 1444.11.11 giving 711 nations over 2,563 provinces.
 */

// Nation-count share per size bucket at 1444.11.11, largest bucket first.
const EU4_1444_COUNT_SHARE: Array<{
	label: string
	min: number
	max: number
	share: number
}> = [
	{ label: "50+", min: 50, max: Number.POSITIVE_INFINITY, share: 0.001 },
	{ label: "25-49", min: 25, max: 49, share: 0.014 },
	{ label: "10-24", min: 10, max: 24, share: 0.059 },
	{ label: "5-9", min: 5, max: 9, share: 0.091 },
	{ label: "2-4", min: 2, max: 4, share: 0.373 },
	{ label: "1", min: 1, max: 1, share: 0.461 },
]

function median(values: number[]): number {
	if (values.length === 0) return 0
	const sorted = [...values].sort((a, b) => a - b)
	const mid = sorted.length >> 1
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

describe("province + nation calibration", () => {
	it.each([14963991, 777, 20260725])("seed %d", (seed) => {
		const params: GenesisParams = {
			...DEFAULT_WORLD_PARAMS,
			seed,
			era: "lateMedieval",
		} as GenesisParams

		const world = generateGenesisWorld(params)
		const provinces = world.provinces
		const nations = world.nations
		expect(provinces).toBeDefined()
		expect(nations).toBeDefined()
		if (!provinces || !nations) return

		// ── Province area ────────────────────────────────────────────────
		const radiusKm = params.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM
		const sphereAreaKm2 = 4 * Math.PI * radiusKm * radiusKm
		let landRegions = 0
		const total = world.mesh.numRegions
		for (let r = 0; r < total; r++) if (world.isLand?.[r]) landRegions++
		const landAreaKm2 = (landRegions / total) * sphereAreaKm2

		// size[] is per-province land-region count; convert to km².
		const regionAreaKm2 = sphereAreaKm2 / total
		const areas: number[] = []
		let nonDesolate = 0
		for (let p = 0; p < provinces.count; p++) {
			if (provinces.desolate[p]) continue
			nonDesolate++
			areas.push(provinces.size[p] * regionAreaKm2)
		}
		const meanArea =
			areas.reduce((a, b) => a + b, 0) / Math.max(1, areas.length)

		console.info("\n── Province sizing ──")
		console.info(`target                 ${PROVINCE_AREA_TARGET_KM2} km2`)
		console.info(`provinces (total)      ${provinces.count}`)
		console.info(`provinces (habitable)  ${nonDesolate}`)
		console.info(`land area              ${landAreaKm2.toFixed(0)} km2`)
		console.info(`mean area              ${meanArea.toFixed(0)} km2`)
		console.info(`median area            ${median(areas).toFixed(0)} km2`)

		// ── Nation size mix ──────────────────────────────────────────────
		const provincesPerNation = new Map<number, number>()
		for (let p = 0; p < provinces.count; p++) {
			const sovereign = nations.sovereign[p]
			if (sovereign < 0) continue
			provincesPerNation.set(
				sovereign,
				(provincesPerNation.get(sovereign) ?? 0) + 1,
			)
		}
		const sizes = [...provincesPerNation.values()].sort((a, b) => b - a)
		const nationCount = sizes.length

		console.info("\n── Nation size mix vs EU4 1444 ──")
		console.info(`nations                ${nationCount}`)
		console.info(`provinces owned        ${sizes.reduce((a, b) => a + b, 0)}`)
		console.info(
			`mean provinces/nation  ${(sizes.reduce((a, b) => a + b, 0) / Math.max(1, nationCount)).toFixed(2)}  (EU4 1444: 3.60)`,
		)
		console.info(`median                 ${median(sizes)}  (EU4 1444: 2)`)
		console.info(`largest                ${sizes[0] ?? 0}  (EU4 1444: 113)`)
		console.info("")
		console.info("bucket      generated   EU4 1444    delta")
		for (const bucket of EU4_1444_COUNT_SHARE) {
			const inBucket = sizes.filter(
				(s) => s >= bucket.min && s <= bucket.max,
			).length
			const share = nationCount > 0 ? inBucket / nationCount : 0
			console.info(
				`${bucket.label.padEnd(10)} ${(share * 100).toFixed(1).padStart(7)}% ${(bucket.share * 100).toFixed(1).padStart(9)}% ${((share - bucket.share) * 100).toFixed(1).padStart(8)}pp`,
			)
		}

		expect(provinces.count).toBeGreaterThan(0)
		expect(nationCount).toBeGreaterThan(0)
	}, 300_000)
})
