import { expect, it, vi } from "vitest"
import { HISTORY } from "@/model/history/record"
import { RECORD_ROUTES } from "@/model/history/record/routes"
import { STATE } from "@/model/history/sim/engine/state"
import { TRANSLATOR } from "@/model/history/sim/record/translator"
import { FRAME } from "@/model/history/world-frame"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import { ROAD_HISTORY_FIXTURE } from "@/test/history-run/road-history-fixture"
import {
	buildGlobeSettlements,
	buildMapSettlements,
	settlementId,
} from "@/ui/genesis/renderer/settlement-overlay"
import { buildSettlementLabelNames } from "@/ui/genesis/shared/label-names"

it("keeps road endpoints below townMin visible in both marker builders and labels", () => {
	const { state, engine, world } = ROAD_HISTORY_FIXTURE.create()
	const frame = HISTORY.frameAt({
		state,
		timeMs: TRANSLATOR.recordTime(engine.time + STATE.yearMs),
	})
	const province = frame.routes[0].fromProvince
	const endpoints = RECORD_ROUTES.endpoints(frame.routes)
	const capitalProvinces = new Set(FRAME.toRenderInputs({ frame }).seeds)
	const urbanPop = frame.provincePopulationUrban.slice()
	urbanPop[province] =
		0.8 * SETTLEMENT_TUNING.getSettlementEraTuning(engine.era).townMin
	const displayWorld = { ...world, urbanPopulation: urbanPop }
	const context = {
		clearRect: vi.fn(),
		beginPath: vi.fn(),
		arc: vi.fn(),
		stroke: vi.fn(),
		fill: vi.fn(),
	}
	vi.stubGlobal("document", {
		createElement: () => ({ width: 0, height: 0, getContext: () => context }),
	})
	const resolvers = {
		nation: () => "Nation",
		dynasty: () => "House",
		province: (p: number) => `Settlement ${p}`,
		culture: () => "Culture",
		heritage: () => "Heritage",
		religion: () => "Religion",
	}
	try {
		for (const routeEndpoints of [endpoints, new Set<number>()]) {
			const globe = buildGlobeSettlements({
				world: displayWorld,
				locations: world.settlementRegions!,
				urbanPop,
				elevationVisible: false,
				routeEndpoints,
				capitalProvinces,
			})
			const map = buildMapSettlements({
				world: displayWorld,
				locations: world.settlementRegions!,
				urbanPop,
				centerLongitudeDeg: 0,
				projectionLatitudeDeg: 0,
				routeEndpoints,
				capitalProvinces,
			})
			const labels = buildSettlementLabelNames({
				world: displayWorld,
				resolvers,
				routeEndpoints,
			})
			const visible = routeEndpoints.size > 0
			expect(
				globe.children.some(
					(child) => child.userData.settlementId === settlementId(province),
				),
			).toBe(visible)
			expect(
				map.children.some(
					(child) => child.userData.settlementId === settlementId(province),
				),
			).toBe(visible)
			expect(Boolean(labels?.[province])).toBe(visible)
		}
	} finally {
		vi.unstubAllGlobals()
	}
	console.info({
		endpointOnlyMarkers: [...endpoints].filter(
			(p) =>
				urbanPop[p] <
				SETTLEMENT_TUNING.getSettlementEraTuning(engine.era).townMin,
		).length,
	})
})

it("moves capital styling with the selected frame and clears extinct capitals", () => {
	const { state, engine, world } = ROAD_HISTORY_FIXTURE.create()
	const frame = HISTORY.frameAt({
		state,
		timeMs: TRANSLATOR.recordTime(engine.time),
	})
	const nation = [...frame.nations.values()].find(
		(n) => n.capitalProvince >= 0,
	)!
	const oldCapital = nation.capitalProvince
	const capitals = new Set(FRAME.toRenderInputs({ frame }).seeds)
	const newCapital = world.settlementRegions!.findIndex(
		(region, province) => region >= 0 && !capitals.has(province),
	)
	expect(newCapital).toBeGreaterThanOrEqual(0)
	const urbanPop = frame.provincePopulationUrban.slice()
	const townMin = SETTLEMENT_TUNING.getSettlementEraTuning(engine.era).townMin
	urbanPop[oldCapital] = townMin
	urbanPop[newCapital] = townMin
	const movedNations = new Map(frame.nations)
	movedNations.set(nation.id, { ...nation, capitalProvince: newCapital })
	const extinctNations = new Map(movedNations)
	extinctNations.delete(nation.id)
	const context = {
		clearRect: vi.fn(),
		beginPath: vi.fn(),
		arc: vi.fn(),
		stroke: vi.fn(),
		fill: vi.fn(),
	}
	vi.stubGlobal("document", {
		createElement: () => ({ width: 0, height: 0, getContext: () => context }),
	})
	try {
		for (const selected of [
			frame,
			{ ...frame, nations: movedNations },
			{ ...frame, nations: extinctNations },
		]) {
			const capitalProvinces = new Set(
				FRAME.toRenderInputs({ frame: selected }).seeds,
			)
			const shared = {
				world,
				locations: world.settlementRegions!,
				urbanPop,
				routeEndpoints: RECORD_ROUTES.endpoints(selected.routes),
				capitalProvinces,
			}
			const globe = buildGlobeSettlements({
				...shared,
				elevationVisible: false,
			})
			const map = buildMapSettlements({
				...shared,
				centerLongitudeDeg: 0,
				projectionLatitudeDeg: 0,
			})
			for (const group of [globe, map]) {
				const oldMarkers = group.children.filter(
					(child) => child.userData.province === oldCapital,
				)
				const newMarkers = group.children.filter(
					(child) => child.userData.province === newCapital,
				)
				expect(oldMarkers.length).toBeGreaterThan(0)
				expect(newMarkers.length).toBeGreaterThan(0)
				expect(
					oldMarkers.every(
						(marker) => marker.userData.isCapital === (selected === frame),
					),
				).toBe(true)
				expect(
					newMarkers.every(
						(marker) =>
							marker.userData.isCapital === (selected.nations === movedNations),
					),
				).toBe(true)
			}
		}
	} finally {
		vi.unstubAllGlobals()
	}
})
