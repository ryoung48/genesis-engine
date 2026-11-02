import { expect, it } from "vitest"
import { getRainfallSeasonality } from "@/ui/genesis/shared/rainfall-seasonality"

it("subtracts each region's driest month from its wettest month", () => {
	const monthly = new Float32Array(24)
	for (let month = 0; month < 12; month++) {
		monthly[month * 2] = 100
		monthly[month * 2 + 1] = 50
	}
	monthly[4 * 2] = 300
	monthly[9 * 2] = 10
	expect(getRainfallSeasonality({ monthly, numRegions: 2, region: 0 })).toBe(
		290,
	)
	expect(getRainfallSeasonality({ monthly, numRegions: 2, region: 1 })).toBe(0)
})
