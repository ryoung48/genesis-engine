import { expect, it } from "vitest"
import { ROUTE_MEMBERSHIP } from "@/model/society/infrastructure/trade/routing/membership"
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

it("admits every eligible settlement in a large land group", () => {
	const landCount = 801
	const { state, inputs } = ROUTE_FIXTURE.create({
		sea: false,
		landCount,
	})
	const population =
		routePopulationThresholds(state.world.era).majorSettlementMin * 2
	const { urbanPopulation } = inputs
	urbanPopulation.fill(population)
	const [major, minor] = state.membership
	const changed = ROUTE_MEMBERSHIP.advance({ state, urbanPopulation })
	expect(changed.land.size).toBe(1)
	expect(changed.count).toBe(2 * landCount)
	expect(major.every(Boolean)).toBe(true)
	expect(minor.every(Boolean)).toBe(true)
})
