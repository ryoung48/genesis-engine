import { Delaunay } from "d3-delaunay"
import { describe, expect, it } from "vitest"
import { GALAXY } from "@/model/celestial/galaxy"
import { SECTORS } from "@/model/celestial/galaxy/sectors"
import type {
	Colony,
	Sector,
	SectorState,
} from "@/model/celestial/galaxy/sectors/types"
import { GALAXY_TOPOLOGY } from "@/model/celestial/galaxy/topology"

function setup({
	ownership,
	colonies,
	lanes,
	capitals,
}: {
	ownership: number[]
	colonies: Colony[]
	lanes: number[]
	capitals: number[]
}) {
	const { laneAdjOffset, laneAdjList } = GALAXY_TOPOLOGY.buildLaneCSR({
		lanes: Int32Array.from(lanes),
		numSystems: ownership.length,
	})
	const state: SectorState = {
		colonies,
		sectors: [],
		assignment: new Int32Array(ownership.length).fill(-1),
		nextSectorId: 0,
	}
	return {
		state,
		ownership: Int32Array.from(ownership),
		empireCapitals: Int32Array.from(capitals),
		laneAdjOffset,
		laneAdjList,
	}
}

describe("galactic sectors", () => {
	it("seeds deterministic provisional capitals across a large empire", () => {
		const ownership = new Int32Array(15).fill(0)
		const lanes = Int32Array.from(
			Array.from({ length: 14 }, (_, systemId) => [
				systemId,
				systemId + 1,
			]).flat(),
		)
		const { laneAdjOffset, laneAdjList } = GALAXY_TOPOLOGY.buildLaneCSR({
			lanes,
			numSystems: 15,
		})
		const params = {
			ownership,
			empireCapitals: Int32Array.of(0),
			laneAdjOffset,
			laneAdjList,
			seed: 42,
		}
		const colonies = SECTORS.seedProvisionalAnchors(params)
		expect(SECTORS.seedProvisionalAnchors(params)).toEqual(colonies)
		expect(colonies[0]?.provisional).toBe(false)
		expect(
			colonies.filter((colony) => colony.provisional).length,
		).toBeGreaterThan(0)
		const sectors: Sector[] = colonies.map((colony, id) => ({
			id,
			empireId: colony.empireId,
			capitalColonyId: colony.id,
			leaderId: null as number | null,
			core: !colony.provisional,
		}))
		const state = SECTORS.rebuild({
			...params,
			state: {
				colonies,
				sectors,
				assignment: new Int32Array(15).fill(-1),
				nextSectorId: colonies.length,
			},
		})
		expect(state.sectors.length).toBe(3)
		const sizes = state.sectors.map(
			(sector) => state.assignment.filter((id) => id === sector.id).length,
		)
		expect(Math.min(...sizes)).toBeGreaterThanOrEqual(3)
		const anchor = colonies.find((colony) => colony.provisional)!
		const sectorId = state.assignment[anchor.systemId]!
		const founded = SECTORS.colonize({
			...params,
			state,
			colony: { id: 100, empireId: 0, systemId: anchor.systemId },
		})
		expect(
			founded.sectors.find((sector) => sector.id === sectorId)?.capitalColonyId,
		).toBe(100)
		expect(founded.colonies.some((colony) => colony.id === anchor.id)).toBe(
			false,
		)
	})

	it("keeps generated sector cells connected to their capitals", () => {
		const { galaxy } = GALAXY.spawn({
			size: 2000,
			seed: 1,
			radius: { min: 4000, max: 13000 },
			dimensions: { w: 52000, h: 52000 },
			eccentricityInner: 0.85,
			eccentricityOuter: 0.95,
			angleWindPerUnit: 0.0004,
			pertN: 2,
			pertAmp: 40,
		})
		for (let index = 0; index < galaxy.r_xy.length; index += 2) {
			galaxy.r_xy[index]! -= galaxy.dimensions.w / 2
			galaxy.r_xy[index + 1]! -= galaxy.dimensions.h / 2
		}
		expect(
			galaxy.sectorState.assignment.filter(
				(id, systemId) => id < 0 && galaxy.nationAssignment[systemId]! >= 0,
			).length,
		).toBe(0)
		const delaunay = Delaunay.from(
			Array.from({ length: galaxy.numSystems }, (_, id) => id),
			(id) => galaxy.r_xy[2 * id]!,
			(id) => galaxy.r_xy[2 * id + 1]!,
		)
		const largeEmpireSectors = galaxy.sectorState.sectors.filter(
			(sector) => sector.empireId === 0,
		)
		expect(largeEmpireSectors.length).toBeLessThanOrEqual(13)
		expect(
			Math.min(
				...largeEmpireSectors.map(
					(sector) =>
						galaxy.sectorState.assignment.filter((id) => id === sector.id)
							.length,
				),
			),
		).toBeGreaterThanOrEqual(5)
		expect(
			galaxy.sectorState.sectors.filter((sector) => sector.core),
		).toHaveLength(galaxy.nationSeeds.length)
		for (const sector of galaxy.sectorState.sectors) {
			const colony = galaxy.sectorState.colonies.find(
				(candidate) => candidate.id === sector.capitalColonyId,
			)!
			expect(galaxy.nationAssignment[colony.systemId]).toBe(sector.empireId)
			expect(galaxy.sectorState.assignment[colony.systemId]).toBe(sector.id)
			const seen = new Uint8Array(galaxy.numSystems)
			const queue = [colony.systemId]
			seen[colony.systemId] = 1
			for (let head = 0; head < queue.length; head++) {
				for (const neighbor of delaunay.neighbors(queue[head]!)) {
					if (
						seen[neighbor] ||
						galaxy.sectorState.assignment[neighbor] !== sector.id
					)
						continue
					seen[neighbor] = 1
					queue.push(neighbor)
				}
			}
			expect(queue.length).toBe(
				galaxy.sectorState.assignment.filter((id) => id === sector.id).length,
			)
		}
	})

	it("stops at four hyperlanes and creates a sector for a remote colony", () => {
		const params = setup({
			ownership: Array(10).fill(0),
			colonies: [
				{ id: 0, empireId: 0, systemId: 0 },
				{ id: 1, empireId: 0, systemId: 8 },
			],
			lanes: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9],
			capitals: [0],
		})
		const state = SECTORS.rebuild(params)
		expect([...state.assignment]).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
		expect(state.sectors.map((sector) => sector.capitalColonyId)).toEqual([
			0, 1,
		])
	})

	it("cannot traverse another empire or disconnected holdings", () => {
		const params = setup({
			ownership: [0, 0, 1, 0, 0, 0],
			colonies: [{ id: 0, empireId: 0, systemId: 0 }],
			lanes: [0, 1, 1, 2, 2, 3, 3, 4],
			capitals: [0, 2],
		})
		const state = SECTORS.rebuild(params)
		expect([...state.assignment]).toEqual([0, 0, -1, -1, -1, -1])
	})

	it("uses distance, core priority, and stable IDs for competing claims", () => {
		const params = setup({
			ownership: Array(5).fill(0),
			colonies: [
				{ id: 0, empireId: 0, systemId: 0 },
				{ id: 1, empireId: 0, systemId: 4 },
			],
			lanes: [0, 1, 1, 2, 2, 3, 3, 4],
			capitals: [0],
		})
		params.state.sectors = [
			{ id: 10, empireId: 0, capitalColonyId: 0, leaderId: null, core: true },
			{ id: 3, empireId: 0, capitalColonyId: 1, leaderId: null, core: false },
		]
		params.state.assignment[0] = 10
		params.state.assignment[4] = 3
		params.state.nextSectorId = 11
		const first = SECTORS.rebuild(params)
		const second = SECTORS.rebuild({ ...params, state: first })
		expect([...first.assignment]).toEqual([10, 10, 10, 3, 3])
		expect([...second.assignment]).toEqual([...first.assignment])
		expect(second.sectors).toEqual(first.sectors)
	})

	it("retains valid territory after capital movement and releases cut off systems", () => {
		const params = setup({
			ownership: Array(10).fill(0),
			colonies: [
				{ id: 0, empireId: 0, systemId: 0 },
				{ id: 1, empireId: 0, systemId: 8 },
			],
			lanes: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9],
			capitals: [0],
		})
		const first = SECTORS.rebuild(params)
		const lost = SECTORS.changeOwnership({
			...params,
			state: first,
			systemId: 5,
			empireId: -1,
		})
		expect([...lost.assignment]).toEqual([0, 0, 0, 0, 0, -1, 1, 1, 1, 1])
		expect(lost.sectors.map((sector) => sector.id)).toEqual([0, 1])
	})

	it("replaces a lost non-core capital with a colony in its old sector", () => {
		const params = setup({
			ownership: Array(11).fill(0),
			colonies: [
				{ id: 0, empireId: 0, systemId: 0 },
				{ id: 1, empireId: 0, systemId: 8 },
				{ id: 2, empireId: 0, systemId: 9 },
			],
			lanes: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10],
			capitals: [0],
		})
		const first = SECTORS.rebuild(params)
		const second = SECTORS.loseColony({ ...params, state: first, colonyId: 1 })
		expect(second.sectors[1]?.id).toBe(first.sectors[1]?.id)
		expect(second.sectors[1]?.capitalColonyId).toBe(2)
	})

	it("reserves the new core capital when it moves into another sector", () => {
		const params = setup({
			ownership: Array(10).fill(0),
			colonies: [
				{ id: 0, empireId: 0, systemId: 0 },
				{ id: 1, empireId: 0, systemId: 8 },
				{ id: 2, empireId: 0, systemId: 9 },
			],
			lanes: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9],
			capitals: [0],
		})
		const first = SECTORS.rebuild(params)
		const second = SECTORS.moveEmpireCapital({
			...params,
			state: first,
			empireId: 0,
			systemId: 8,
		})
		expect(second.sectors[0]?.capitalColonyId).toBe(1)
		expect(second.sectors[1]?.capitalColonyId).toBe(2)
		expect(second.assignment[8]).toBe(second.sectors[0]?.id)
		expect(second.assignment[9]).toBe(second.sectors[1]?.id)
	})

	it("creates a sector after a distant colony is founded", () => {
		const params = setup({
			ownership: Array(8).fill(0),
			colonies: [{ id: 0, empireId: 0, systemId: 0 }],
			lanes: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
			capitals: [0],
		})
		const first = SECTORS.rebuild(params)
		expect(first.assignment[7]).toBe(-1)
		const second = SECTORS.colonize({
			...params,
			state: first,
			colony: { id: 1, empireId: 0, systemId: 7 },
		})
		expect(second.sectors).toHaveLength(2)
		expect(second.assignment[7]).toBe(second.sectors[1]?.id)
	})

	it("moves a non-core capital without changing its sector ID", () => {
		const params = setup({
			ownership: Array(11).fill(0),
			colonies: [
				{ id: 0, empireId: 0, systemId: 0 },
				{ id: 1, empireId: 0, systemId: 8 },
				{ id: 2, empireId: 0, systemId: 10 },
			],
			lanes: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10],
			capitals: [0],
		})
		const first = SECTORS.rebuild(params)
		const sectorId = first.assignment[10]!
		const second = SECTORS.moveCapital({
			...params,
			state: first,
			sectorId,
			colonyId: 2,
		})
		expect(
			second.sectors.find((sector) => sector.id === sectorId)?.capitalColonyId,
		).toBe(2)
		expect(second.assignment[10]).toBe(sectorId)
		expect(second.nextSectorId).toBe(first.nextSectorId)
	})

	it("resolves a colony's leader through its current sector assignment", () => {
		const params = setup({
			ownership: [0, 0],
			colonies: [
				{ id: 0, empireId: 0, systemId: 0 },
				{ id: 1, empireId: 0, systemId: 1 },
			],
			lanes: [0, 1],
			capitals: [0],
		})
		const first = SECTORS.rebuild(params)
		const second = SECTORS.assignLeader({
			state: first,
			sectorId: first.sectors[0]!.id,
			leaderId: 42,
		})
		expect(SECTORS.leaderAtColony({ state: second, colonyId: 1 })).toBe(42)
		expect(SECTORS.leaderAtColony({ state: first, colonyId: 1 })).toBeNull()
	})
})
