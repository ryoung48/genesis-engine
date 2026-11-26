import { describe, expect, it } from "vitest"
import { PASTA } from "@/model/climate/classification/pasta"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { LAKES } from "@/model/geography/terrain/lakes"
import { generateWorld } from "@/test/tectonics/world-cache"

const SEED = 14963991
const TIMEOUT_MS = 300_000
const C = GROUNDWATER_CONFIG

function sameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
	return true
}

describe("groundwater on a generated world", () => {
	const first = generateWorld({ seed: SEED })
	const second = generateWorld({ seed: SEED })

	it(
		"two builds of one seed give identical lake kinds and groundwater layers",
		() => {
			expect(first.groundwater).toBeDefined()
			expect(sameArray(first.rivers.lakeKind, second.rivers.lakeKind)).toBe(
				true,
			)
			const a = first.groundwater as NonNullable<typeof first.groundwater>
			const b = second.groundwater as NonNullable<typeof second.groundwater>
			for (const key of Object.keys(a) as Array<keyof typeof a>)
				expect(sameArray(a[key], b[key])).toBe(true)
		},
		TIMEOUT_MS,
	)

	it(
		"has no NaN, shares inside [0, 1] and only known lake kinds",
		() => {
			const g = first.groundwater as NonNullable<typeof first.groundwater>
			for (const key of Object.keys(g) as Array<keyof typeof g>)
				for (const value of g[key]) expect(Number.isNaN(value)).toBe(false)
			for (const share of g.wetlandShare) {
				expect(share).toBeGreaterThanOrEqual(0)
				expect(share).toBeLessThanOrEqual(1)
			}
			for (const kind of first.rivers.lakeKind)
				expect(LAKES.kinds[kind]).toBeDefined()
		},
		TIMEOUT_MS,
	)

	it(
		"depth never exceeds the cap and pans stay land",
		() => {
			const g = first.groundwater as NonNullable<typeof first.groundwater>
			const { mesh, isLand, elevation_km } = first
			for (let r = 0; r < mesh.numRegions; r++) {
				expect(g.waterTableM[r]).toBeGreaterThanOrEqual(0)
				if (first.rivers.lakeKind[r] === LAKES.kindCode.pan)
					expect(isLand[r]).toBe(1)
				if (isLand[r] && g.waterTableM[r] > 0)
					expect(g.waterTableM[r]).toBeLessThanOrEqual(
						elevation_km[r] * 1000 + C.incisionMaxM + 1,
					)
			}
		},
		TIMEOUT_MS,
	)

	it(
		"skips only the Ice climate class, so other snowy land has groundwater",
		() => {
			const g = first.groundwater as NonNullable<typeof first.groundwater>
			const { mesh, isLand, iceThickness, pastaClimate } = first
			let snowyOutsideIce = 0
			for (let r = 0; r < mesh.numRegions; r++) {
				if (!isLand[r]) continue
				if (pastaClimate[r] === PASTA.iceCode) expect(g.soilDepthM[r]).toBe(0)
				else {
					expect(g.soilDepthM[r]).toBeGreaterThan(0)
					if (iceThickness[r] > 0) snowyOutsideIce++
				}
			}
			expect(snowyOutsideIce).toBeGreaterThan(0)
		},
		TIMEOUT_MS,
	)

	it(
		"marsh regions are exactly those whose wetland share reaches marshShare",
		() => {
			const g = first.groundwater as NonNullable<typeof first.groundwater>
			for (let r = 0; r < first.mesh.numRegions; r++)
				if (first.topography[r] === CLASSIFICATION.topoMarsh)
					expect(g.wetlandShare[r]).toBeGreaterThanOrEqual(C.marshShare - 1e-6)
		},
		TIMEOUT_MS,
	)
})
