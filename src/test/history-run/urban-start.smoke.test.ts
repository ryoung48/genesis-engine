import { expect, it } from "vitest"
import { ROUTES } from "@/model/society/infrastructure/trade/routing/network"
import { HISTORY_RUN } from "@/test/history-run"

it("starts history from the generated urban population and development", () => {
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed: 42,
		era: "lateMedieval",
		numPoints: 12000,
	})
	let mismatches = 0
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p]) continue
		if (
			engine.popUrbanCurrent[p] !== generated.urbanPopulation[p] ||
			engine.developmentCurrent[p] !== generated.development[p]
		)
			mismatches++
	}
	expect(mismatches).toBe(0)
	expect(engine.roads).not.toBeNull()
	expect(ROUTES.stored(engine.roads!)).toEqual(generated.routes?.routes)
}, 300_000)
