import { expect, it, vi } from "vitest"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { HISTORY_RUN } from "@/test/history-run"

it("starts with marriage ties and unions retaining each senior's ruler", () => {
	let startingRulers = new Int32Array()
	const seedUnions = STATE.seedUnions
	const seeding = vi.spyOn(STATE, "seedUnions").mockImplementation((params) => {
		startingRulers = params.state.leaderRuntime.rulerId.slice()
		seedUnions(params)
	})
	const { engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 20000,
	})
	seeding.mockRestore()
	expect(engine.marriageTies.size).toBeGreaterThan(0)
	expect(
		engine.events.filter((note) => note.tag === "marriage alliance").length,
	).toBe(engine.marriageTies.size)
	const unions = engine.events.filter(
		(note) => note.tag === "personal union formed",
	)
	expect(unions.length).toBeGreaterThan(0)
	expect(unions.length).toBe(engine.unionGenerations.size)
	for (const note of unions) {
		const senior = note.data.senior as number
		const junior = note.data.junior as number
		expect(STATE.getRulerRelation({ state: engine, nation: junior })).toEqual({
			ruler: senior,
			relation: STATE.rel.PU_SENIOR,
		})
		expect(engine.leaderRuntime.rulerId[senior]).toBe(note.data.ruler)
		expect(note.data.ruler).toBe(startingRulers[senior])
		expect(engine.leaderRuntime.rulerId[junior]).toBe(note.data.ruler)
		expect(GOVERNMENT.successionOfIndex(engine.governmentType[senior])).toBe(
			"single_heir",
		)
		expect(GOVERNMENT.successionOfIndex(engine.governmentType[junior])).toBe(
			"single_heir",
		)
		expect(
			STATE.getNationProvinces({ state: engine, root: senior }).length,
		).toBeGreaterThanOrEqual(
			STATE.getNationProvinces({ state: engine, root: junior }).length,
		)
		expect(engine.unionGenerations.get(junior)).toBe(1)
	}
}, 120000)
