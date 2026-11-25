import { describe, expect, it } from "vitest"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { WETLANDS } from "@/model/geography/terrain/groundwater/wetlands"
import type { WetlandKindParams } from "@/model/geography/terrain/groundwater/wetlands/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG
const SURFACE_CLASS = C.depthClassesM.indexOf(C.wetDepthM)

const NO_CAUSES = { groundwater: 0, floodplain: 0, coast: 0, lake: 0 }

function kind(overrides: Partial<WetlandKindParams>) {
	return WETLANDS.kindOf({
		causes: { ...NO_CAUSES, groundwater: 0.5 },
		wetIndex: 1,
		mean: 12,
		coldest: 5,
		warmest: 20,
		seepShare: 0,
		saltShore: false,
		forested: false,
		...overrides,
	})
}

describe("wetlands", () => {
	it("combines causes as 1 - product, capped at wetCap and cut under wetMin", () => {
		const causes = { groundwater: 0.2, floodplain: 0.3, coast: 0.1, lake: 0.05 }
		expect(WETLANDS.combine({ causes })).toBeCloseTo(
			1 - 0.8 * 0.7 * 0.9 * 0.95,
			9,
		)
		expect(
			WETLANDS.combine({
				causes: { groundwater: 1, floodplain: 1, coast: 1, lake: 1 },
			}),
		).toBe(C.wetCap)
		expect(
			WETLANDS.combine({
				causes: { ...NO_CAUSES, groundwater: C.wetMin * 0.5 },
			}),
		).toBe(0)
		expect(
			WETLANDS.combine({ causes: { ...NO_CAUSES, groundwater: C.wetMin } }),
		).toBeCloseTo(C.wetMin, 9)
	})

	it("mangroves are coastal and need the coldest month at the threshold", () => {
		const coast = { ...NO_CAUSES, coast: 0.6 }
		expect(kind({ causes: coast, coldest: C.mangroveColdC })).toBe("mangrove")
		expect(kind({ causes: coast, coldest: C.mangroveColdC - 0.01 })).toBe(
			"coastalSaltMarsh",
		)
	})

	it("peat bog needs a cold mean and a wet index at the threshold", () => {
		expect(kind({ mean: C.peatWarmC - 0.01, wetIndex: C.peatWet })).toBe(
			"peatBog",
		)
		expect(kind({ mean: C.peatWarmC, wetIndex: C.peatWet })).not.toBe("peatBog")
		expect(
			kind({ mean: C.peatWarmC - 0.01, wetIndex: C.peatWet - 0.01 }),
		).not.toBe("peatBog")
	})

	it("forested peatland needs warm summer, wet index, mean above the floor and forest", () => {
		const peat = {
			mean: C.peatWarmC - 0.5,
			wetIndex: C.peatWet,
			forested: true,
		}
		expect(kind({ ...peat, warmest: C.forestWarmC })).toBe("forestedPeatland")
		expect(kind({ ...peat, warmest: C.forestWarmC - 0.01 })).toBe("peatBog")
		expect(kind({ ...peat, warmest: C.forestWarmC, mean: C.forestMeanC })).toBe(
			"peatBog",
		)
		expect(
			kind({ ...peat, warmest: C.forestWarmC, mean: C.forestMeanC + 0.01 }),
		).toBe("forestedPeatland")
		expect(kind({ ...peat, warmest: C.forestWarmC, forested: false })).toBe(
			"peatBog",
		)
	})

	it("swamp forest needs a freshwater base and the same forest conditions", () => {
		const base = { mean: 14, wetIndex: C.peatWet, warmest: C.forestWarmC }
		expect(kind({ ...base, forested: true })).toBe("swampForest")
		expect(kind({ ...base, forested: false })).toBe("marsh")
		expect(
			kind({ ...base, forested: true, warmest: C.forestWarmC - 0.01 }),
		).toBe("marsh")
		expect(
			kind({ ...base, forested: true, wetIndex: C.peatWet - 0.01 }),
		).not.toBe("swampForest")
		expect(
			kind({
				...base,
				forested: true,
				causes: { ...NO_CAUSES, floodplain: 0.5 },
			}),
		).toBe("swampForest")
	})

	it("salt kinds are unchanged by forest", () => {
		const forest = { forested: true, warmest: C.forestWarmC + 5, wetIndex: 1 }
		expect(
			kind({ ...forest, causes: { ...NO_CAUSES, coast: 0.5 }, coldest: 20 }),
		).toBe("mangrove")
		expect(
			kind({ ...forest, causes: { ...NO_CAUSES, lake: 0.5 }, saltShore: true }),
		).toBe("inlandSaltMarsh")
	})

	it("wet meadow sits inside the meadow wetness window", () => {
		expect(kind({ wetIndex: C.meadowWet[0] })).toBe("wetMeadow")
		expect(kind({ wetIndex: C.meadowWet[1] - 0.01 })).toBe("wetMeadow")
		expect(kind({ wetIndex: C.meadowWet[1] })).toBe("marsh")
	})

	function classify({
		width,
		clayShallow,
		coast = 0,
		shelter = 1,
	}: {
		width: number
		clayShallow: number
		coast?: number
		shelter?: number
	}) {
		const shallowShare = new Uint8Array(C.depthClassesM.length)
		shallowShare[SURFACE_CLASS] = Math.round(clayShallow * 255)
		return WETLANDS.classify({
			shallowShare,
			flow: Float32Array.of(0),
			widthM: Float64Array.of(width),
			slope: Float32Array.of(0.001),
			tidalRange: Float32Array.of(0),
			shelter: Float32Array.of(shelter),
			touchesSea: Uint8Array.of(coast),
			touchesLake: Uint8Array.of(0),
			touchesSalt: Uint8Array.of(0),
			seepShare: Float32Array.of(0),
			wetIndex: Float32Array.of(1),
			mean: Float32Array.of(14),
			coldest: Float32Array.of(5),
			warmest: Float32Array.of(22),
			forested: Uint8Array.of(0),
			active: Uint8Array.of(1),
		})
	}

	it("coast share scales with one over region width", () => {
		const narrow = classify({ width: 20000, clayShallow: 0, coast: 1 })
		const wide = classify({ width: 40000, clayShallow: 0, coast: 1 })
		expect(narrow.wetCoast[0]).toBeCloseTo(2 * wide.wetCoast[0], 6)
	})

	it("the coast cause is multiplied by shelter and the other causes are not", () => {
		const open = classify({ width: 20000, clayShallow: 0.5, coast: 1 })
		const half = classify({
			width: 20000,
			clayShallow: 0.5,
			coast: 1,
			shelter: 0.5,
		})
		const none = classify({
			width: 20000,
			clayShallow: 0.5,
			coast: 1,
			shelter: 0,
		})
		expect(half.wetCoast[0]).toBeCloseTo(0.5 * open.wetCoast[0], 6)
		expect(none.wetCoast[0]).toBe(0)
		expect(half.wetGw[0]).toBe(open.wetGw[0])
		expect(none.wetGw[0]).toBe(open.wetGw[0])
	})

	it("inactive regions carry no wetland", () => {
		const out = WETLANDS.classify({
			shallowShare: new Uint8Array(C.depthClassesM.length).fill(255),
			flow: Float32Array.of(0),
			widthM: Float64Array.of(20000),
			slope: Float32Array.of(0.001),
			tidalRange: Float32Array.of(0),
			shelter: Float32Array.of(1),
			touchesSea: Uint8Array.of(1),
			touchesLake: Uint8Array.of(0),
			touchesSalt: Uint8Array.of(0),
			seepShare: Float32Array.of(0),
			wetIndex: Float32Array.of(1),
			mean: Float32Array.of(14),
			coldest: Float32Array.of(5),
			warmest: Float32Array.of(22),
			forested: Uint8Array.of(0),
			active: Uint8Array.of(0),
		})
		expect(out.share[0]).toBe(0)
		expect(out.kind[0]).toBe(0)
	})
})

describe("marsh", () => {
	const flat = CLASSIFICATION.topoFlat
	const hill = CLASSIFICATION.topoHill
	const marsh = CLASSIFICATION.topoMarsh

	it("a region is marsh exactly when it was flat and its wetland share is at least marshShare", () => {
		const topography = Uint8Array.of(flat, hill, flat, hill, flat, flat)
		CLASSIFICATION.applyMarsh({
			topography,
			wetlandShare: Float32Array.of(
				0.9,
				0.9,
				C.marshShare,
				C.marshShare,
				C.marshShare - 0.01,
				0,
			),
		})
		expect(Array.from(topography)).toEqual([
			marsh,
			hill,
			marsh,
			hill,
			flat,
			flat,
		])
	})

	it("a zero share array gives no marsh", () => {
		const topography = Uint8Array.of(flat, hill, flat, flat)
		CLASSIFICATION.applyMarsh({ topography, wetlandShare: new Float32Array(4) })
		expect(Array.from(topography)).toEqual([flat, hill, flat, flat])
	})
})
