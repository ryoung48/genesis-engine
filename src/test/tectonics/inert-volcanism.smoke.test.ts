import { describe, expect, it } from "vitest"
import { generateWorld } from "./world-cache"

const SEED = 14963991
const NUM_POINTS = 60_000

describe("present tectonics: the volcanism parameter is inert", () => {
	it("gives identical elevation, records and hazards at volcanism 0 and 10", () => {
		const low = generateWorld({
			seed: SEED,
			numPoints: NUM_POINTS,
			volcanism: 0,
		})
		const high = generateWorld({
			seed: SEED,
			numPoints: NUM_POINTS,
			volcanism: 10,
		})
		expect(Array.from(high.elevation_km)).toEqual(Array.from(low.elevation_km))
		expect(Array.from(high.hazards.volcano)).toEqual(
			Array.from(low.hazards.volcano),
		)
		const a = low.presentTectonics!.crust
		const b = high.presentTectonics!.crust
		expect(Array.from(b.volcType)).toEqual(Array.from(a.volcType))
		expect(Array.from(b.volcAt)).toEqual(Array.from(a.volcAt))
		expect(Array.from(b.oroType)).toEqual(Array.from(a.oroType))
		expect(Array.from(b.coverKm)).toEqual(Array.from(a.coverKm))
	}, 300_000)
})
