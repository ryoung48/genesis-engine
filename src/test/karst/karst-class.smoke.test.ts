import { describe, expect, it } from "vitest"
import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import { KARST } from "@/model/geography/terrain/karst"
import { KARST_CAVES } from "@/model/geography/terrain/karst-caves"
import { KARST_CONFIG } from "@/model/geography/terrain/karst-config"

const code = KARST_CAVES.classCode
const edge = CAVE_CONFIG.caveRange[0]

function classOf({
	kind = KARST.kindCode.carbonate,
	potential,
	lava = 0,
	slopeScore = 0,
}: {
	kind?: number
	potential: number
	lava?: number
	slopeScore?: number
}) {
	return KARST_CAVES.classOf({ kind, potential, lava, slopeScore })
}

describe("karst class", () => {
	it("is pseudo wherever the lava potential reaches the cave edge, whatever the kind", () => {
		expect(
			classOf({ kind: KARST.kindCode.none, potential: 0, lava: 0.25 }),
		).toBe(code.pseudo)
		expect(classOf({ potential: 1, lava: edge })).toBe(code.pseudo)
		expect(classOf({ kind: KARST.kindCode.none, potential: 0 })).toBe(code.none)
	})

	it("is absent below the cave edge and not at it", () => {
		expect(classOf({ potential: edge - 0.01 })).toBe(code.absent)
		expect(classOf({ potential: edge })).not.toBe(code.absent)
	})

	it("reads flat karst short however wet", () => {
		for (const potential of [0.3, 0.6, 1])
			expect(classOf({ potential, slopeScore: 0 })).toBe(code.short)
	})

	it("reads steep wet karst long and never makes steeper karst shorter", () => {
		expect(
			classOf({ potential: 0.5, slopeScore: KARST_CONFIG.lengthSlope[1] }),
		).toBe(code.long)
		const rank = { [code.short]: 0, [code.long]: 1 } as Record<number, number>
		for (const potential of [0.3, 0.5, 0.7, 1]) {
			let last = 0
			for (let slope = 0; slope <= 1; slope += 0.05) {
				const now = rank[classOf({ potential, slopeScore: slope })]
				expect(now).toBeGreaterThanOrEqual(last)
				last = now
			}
		}
	})
})
