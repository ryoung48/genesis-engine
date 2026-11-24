import { describe, expect, it } from "vitest"
import { CRUST } from "@/model/geography/tectonics/crust"
import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import { WORLD_SAMPLE } from "@/model/geography/tectonics/world-sample"
import { cachedWorld } from "./world-cache"

const SEEDS = [14963991, 20251107, 77031]
const HIGH_KM = 2

describe("present tectonics: belt records", () => {
	for (const seed of SEEDS) {
		it(`keeps records inside the footprint (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { crust, belts, sample } = world.presentTectonics!
			const F = TERRAIN_FEATURES.genesisTerrainFeature
			const bits = [
				F.FOLD_RIDGES,
				F.PLATEAU_UPLIFT,
				F.RIFT_VALLEY,
				F.PULL_APART_BASIN,
				F.TRENCH,
			]
				.map((f) => 2 ** (f - 1))
				.reduce((a, b) => a | b, 0)
			const mask = WORLD_SAMPLE.anyBits({
				sample,
				field: world.terrainFeatures!.featureMask,
			})
			let recorded = 0
			for (let c = 0; c < crust.numCells; c++) {
				if (crust.oroType[c] === CRUST.OROGENY.NONE) continue
				recorded++
				const isArc = crust.type[c] === CRUST.TYPE.ARC
				if (crust.oroType[c] === CRUST.OROGENY.ARC) expect(isArc).toBe(true)
				if (
					!isArc &&
					crust.oroType[c] !== CRUST.OROGENY.URAL &&
					crust.oroType[c] !== CRUST.OROGENY.INTRAPLATE
				)
					expect(mask[c] & bits).not.toBe(0)
				expect(crust.beltU[c]).toBeGreaterThanOrEqual(0)
				expect(crust.beltU[c]).toBeLessThanOrEqual(1)
			}
			for (let c = 0; c < crust.numCells; c++)
				if (crust.type[c] === CRUST.TYPE.ARC)
					expect(crust.oroType[c]).not.toBe(CRUST.OROGENY.NONE)
			expect(recorded).toBeGreaterThan(0)
			expect(belts.reports.length).toBeGreaterThan(0)
		})

		it(`reports how much high ground carries a record (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { crust, sample } = world.presentTectonics!
			const elev = WORLD_SAMPLE.gather({ sample, field: world.elevation_km })
			let high = 0
			let withRecord = 0
			const byKind: Record<string, number> = {}
			for (let c = 0; c < crust.numCells; c++) {
				const kind = CRUST.OROGENY_KINDS[crust.oroType[c]]
				byKind[kind] = (byKind[kind] ?? 0) + 1
				if (elev[c] < HIGH_KM) continue
				high++
				if (crust.oroType[c] !== CRUST.OROGENY.NONE) withRecord++
			}
			console.info(
				`seed ${seed}: high cells ${high}, with record ${withRecord} (${((100 * withRecord) / Math.max(1, high)).toFixed(1)}%), by kind ${JSON.stringify(byKind)}`,
			)
			expect(high).toBeGreaterThan(0)
		})
	}
})
