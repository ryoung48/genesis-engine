import { expect, it, vi } from "vitest"
import { PATHFIND } from "@/model/society/infrastructure/pathfinding"
import { EDGE_USAGE } from "@/model/society/infrastructure/trade/routing/edge-usage"
import { ROUTES } from "@/model/society/infrastructure/trade/routing/network"
import { routePopulationThresholds } from "@/model/society/infrastructure/trade/routing/route-tuning"
import { ROUTE_SEARCH } from "@/model/society/infrastructure/trade/routing/search"
import { ROUTE_FIXTURE } from "@/test/history-run/route-fixture"

it("promotes, demotes and releases with exact reference counts and transition counters", () => {
	const { state, inputs } = ROUTE_FIXTURE.create({ sea: false, landCount: 2 })
	const threshold = routePopulationThresholds(
		state.world.era,
	).majorSettlementMin
	inputs.urbanPopulation[0] = threshold + 1
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	expect(ROUTES.stored(state).map((r) => r.kind)).toEqual([1])
	inputs.urbanPopulation[1] = threshold + 1
	const promotion = ROUTES.advance({
		state,
		urbanPopulation: inputs.urbanPopulation,
	})
	expect(promotion.promoted).toBe(1)
	expect(promotion.transitions[1][2]).toBe(1)
	expect(ROUTES.stored(state).map((r) => r.kind)).toEqual([0])
	inputs.urbanPopulation[1] = 2000
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	const demotion = ROUTES.advance({
		state,
		urbanPopulation: inputs.urbanPopulation,
	})
	expect(demotion.demoted).toBe(1)
	expect(demotion.transitions[2][1]).toBe(1)
	expect(ROUTES.stored(state).map((r) => r.kind)).toEqual([1])
	inputs.urbanPopulation.fill(0)
	const release = ROUTES.advance({
		state,
		urbanPopulation: inputs.urbanPopulation,
	})
	expect(release.transitions[1][0]).toBe(1)
	expect(ROUTES.stored(state)).toEqual([])
	for (const counts of [state.landUsage, state.landMajorUsage, state.seaUsage])
		expect(Array.from(counts)).toEqual(Array(counts.length).fill(0))
	for (const fixture of [
		ROUTE_FIXTURE.create({ sea: false, landCount: 2 }),
		ROUTE_FIXTURE.create({ sea: true, landCount: 2 }),
	]) {
		ROUTES.advance({
			state: fixture.state,
			urbanPopulation: fixture.inputs.urbanPopulation,
		})
		const expected = [
			new Uint32Array(fixture.state.landUsage.length),
			new Uint32Array(fixture.state.landUsage.length),
			new Uint32Array(fixture.state.landUsage.length),
		]
		for (const route of ROUTES.stored(fixture.state)) {
			const sea = route.kind === 2
			const params = {
				adjOffset: fixture.state.world.regionAdjOffset,
				adjList: fixture.state.world.regionAdjList,
				pathRegions: route.pathRegions,
				firstEdge: sea ? 2 : 1,
				endEdge: route.pathRegions.length - (sea ? 1 : 0),
				delta: 1,
			}
			EDGE_USAGE.recordPath({ ...params, counts: expected[sea ? 2 : 0] })
			if (route.kind === 0)
				EDGE_USAGE.recordPath({ ...params, counts: expected[1] })
		}
		expect(fixture.state.landUsage).toEqual(expected[0])
		expect(fixture.state.landMajorUsage).toEqual(expected[1])
		expect(fixture.state.seaUsage).toEqual(expected[2])
	}
})
it("keeps stored paths and does no searching on an unchanged batch", () => {
	const { state, inputs } = ROUTE_FIXTURE.create({ sea: false, landCount: 2 })
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	const route = ROUTES.stored(state)[0]
	const batch = ROUTES.advance({
		state,
		urbanPopulation: inputs.urbanPopulation,
	})
	expect(batch.searched).toBe(0)
	expect(batch.added).toEqual([])
	expect(ROUTES.stored(state)[0]).toBe(route)
})
it("retries sea rejections only when the length limit first rises", () => {
	const { state, inputs } = ROUTE_FIXTURE.create({ sea: true, landCount: 2 })
	expect(
		ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation }).searched,
	).toBe(1)
	expect(state.pairs[2].rejected.get(1)).toBe(2500)
	inputs.urbanPopulation[0] = routePopulationThresholds(
		state.world.era,
	).shortRouteMaxPop
	const retry = ROUTES.advance({
		state,
		urbanPopulation: inputs.urbanPopulation,
	})
	expect(retry.searched).toBe(1)
	expect(retry.retried).toBe(1)
	expect(state.pairs[2].rejected.get(1)).toBe(5000)
	inputs.urbanPopulation[0] = 2000
	expect(
		ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation }).searched,
	).toBe(0)
	inputs.urbanPopulation[0] = routePopulationThresholds(
		state.world.era,
	).shortRouteMaxPop
	expect(
		ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation }).searched,
	).toBe(0)
})
it("projects surviving points identically through a fixed group centre", () => {
	const { state } = ROUTE_FIXTURE.create({ sea: false, landCount: 2 })
	const center = state.centers.get(0)!
	const base = PATHFIND.tangentProjectFlat({
		regions: [0],
		r_xyz: state.world.r_xyz,
		center,
	})
	const added = PATHFIND.tangentProjectFlat({
		regions: [0, 1],
		r_xyz: state.world.r_xyz,
		center,
	})
	const removed = PATHFIND.tangentProjectFlat({
		regions: [1],
		r_xyz: state.world.r_xyz,
		center,
	})
	expect(Array.from(base)).toEqual(Array.from(added.slice(0, 2)))
	expect(Array.from(removed)).toEqual(Array.from(added.slice(2)))
})

it("searches replacements before releasing departing settlement edges", () => {
	const { state, inputs } = ROUTE_FIXTURE.create({ sea: false, landCount: 3 })
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	ROUTES.advance({ state, urbanPopulation: inputs.urbanPopulation })
	const oldUsage = state.landUsage.slice()
	inputs.urbanPopulation[1] = 0
	const search = ROUTE_SEARCH.findPath
	let sawDepartingEdges = false
	const spy = vi
		.spyOn(ROUTE_SEARCH, "findPath")
		.mockImplementation((params) => {
			sawDepartingEdges = Array.from(params.edgeUsed).every(
				(count, slot) => count === oldUsage[slot],
			)
			return search(params)
		})
	try {
		const batch = ROUTES.advance({
			state,
			urbanPopulation: inputs.urbanPopulation,
		})
		expect(batch.added).toHaveLength(1)
		expect(batch.released).toHaveLength(2)
		expect(sawDepartingEdges).toBe(true)
		expect(ROUTES.stored(state)[0].pathRegions).toEqual([0, 1, 2])
	} finally {
		spy.mockRestore()
	}
})
it("leaves unrelated groups untouched and finds the same desired sets in stages", () => {
	const fixture = ROUTE_FIXTURE.create({ sea: false, landCount: 4 })
	fixture.world.mesh.adjOffset = Int32Array.from([0, 1, 2, 3, 4])
	fixture.world.mesh.adjList = Int32Array.from([1, 0, 3, 2])
	fixture.world.landmarks.regionLandmark = Int32Array.from([0, 0, 1, 1])
	fixture.world.landmarks.size = Int32Array.from([2, 2])
	fixture.world.landmarks.count = 2
	fixture.inputs.urbanPopulation[1] = 0
	const state = ROUTES.createState(fixture)
	ROUTES.advance({ state, urbanPopulation: fixture.inputs.urbanPopulation })
	const survivor = ROUTES.stored(state)[0]
	fixture.inputs.urbanPopulation[1] = 2000
	const batch = ROUTES.advance({
		state,
		urbanPopulation: fixture.inputs.urbanPopulation,
	})
	expect(batch.searched).toBe(1)
	expect(ROUTES.stored(state)).toContain(survivor)
	const fresh = ROUTES.createState(fixture)
	ROUTES.advance({
		state: fresh,
		urbanPopulation: fixture.inputs.urbanPopulation,
	})
	expect(state.pairs.map((pair) => pair.desired)).toEqual(
		fresh.pairs.map((pair) => pair.desired),
	)
})
it("counts sea construction and removal once each", () => {
	const fixture = ROUTE_FIXTURE.create({ sea: true, landCount: 2 })
	fixture.world.mesh.r_xyz[6] = Math.cos(0.1)
	fixture.world.mesh.r_xyz[7] = Math.sin(0.1)
	const state = ROUTES.createState(fixture)
	const built = ROUTES.advance({
		state,
		urbanPopulation: fixture.inputs.urbanPopulation,
	})
	expect(built.transitions[0][3]).toBe(1)
	ROUTES.advance({ state, urbanPopulation: fixture.inputs.urbanPopulation })
	fixture.inputs.urbanPopulation.fill(0)
	const removed = ROUTES.advance({
		state,
		urbanPopulation: fixture.inputs.urbanPopulation,
	})
	expect(removed.transitions[3][0]).toBe(1)
	expect(Array.from(state.seaUsage)).toEqual(
		Array(state.seaUsage.length).fill(0),
	)
})
