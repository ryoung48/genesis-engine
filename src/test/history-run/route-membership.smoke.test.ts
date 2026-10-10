import { expect, it } from "vitest"
import { ROUTES } from "@/model/society/infrastructure/trade/routing/network"
import { routePopulationThresholds } from "@/model/society/infrastructure/trade/routing/route-tuning"
import { ROUTE_FIXTURE } from "@/test/history-run/route-fixture"

it("uses hysteresis and two batches of dwell even after storm losses", () => {
	const { state, inputs } = ROUTE_FIXTURE.create({ sea: false, landCount: 2 })
	const threshold = routePopulationThresholds(
		state.world.era,
	).minorSettlementMin
	inputs.urbanPopulation.set([threshold, threshold * 0.75])
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	expect(Array.from(state.membership[1])).toEqual([1, 0])
	inputs.urbanPopulation[0] = threshold * 0.9 * 0.737
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	expect(state.membership[1][0]).toBe(1)
	inputs.urbanPopulation[0] *= 0.9
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	expect(state.membership[1][0]).toBe(0)
	inputs.urbanPopulation[0] = threshold
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	inputs.urbanPopulation[0] = threshold * 0.75
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	expect(state.membership[1][0]).toBe(1)
	inputs.urbanPopulation[0] = threshold * 0.69
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	expect(state.membership[1][0]).toBe(0)
})
