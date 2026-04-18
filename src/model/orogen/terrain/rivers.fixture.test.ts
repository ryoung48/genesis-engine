import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline river output", () => {
	it("producesFlowArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.rivers?.flow.length).toBe(world.mesh.numRegions)
	})

	it("producesTwelveMonthsOfFlowPerRegion", () => {
		const world = getCachedWorld()
		expect(world.rivers?.flow_monthly.length).toBe(12 * world.mesh.numRegions)
	})

	it("producesNonNegativeFlowInEveryRegion", () => {
		const world = getCachedWorld()
		const flow = world.rivers!.flow
		for (let r = 0; r < flow.length; r++) {
			expect(flow[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesZeroFlowOnOceanCells", () => {
		const world = getCachedWorld()
		const flow = world.rivers!.flow
		const isLand = world.isLand!
		const lakes = world.rivers!.lakes
		for (let r = 0; r < flow.length; r++) {
			if (!isLand[r] && !lakes[r]) {
				expect(flow[r]).toBe(0)
			}
		}
	})

	it("marksTerminalCellsOnlyOnVisibleRiverCells", () => {
		const world = getCachedWorld()
		const { terminal, visible } = world.rivers!
		for (let r = 0; r < terminal.length; r++) {
			if (terminal[r]) expect(visible[r]).toBe(1)
		}
	})

	it("splitsTerminalCellsIntoCoastalAndInteriorWithoutOverlap", () => {
		const world = getCachedWorld()
		const { terminalCoastal, terminalInterior } = world.rivers!
		for (let r = 0; r < terminalCoastal.length; r++) {
			expect(terminalCoastal[r] && terminalInterior[r]).toBe(0)
		}
	})

	it("boundsRiverIdToValidRangeOrSentinel", () => {
		const world = getCachedWorld()
		const { riverId } = world.rivers!
		for (let r = 0; r < riverId.length; r++) {
			expect(riverId[r]).toBeGreaterThanOrEqual(-1)
		}
	})
})
