import { describe, expect, it } from "vitest"
import { REL } from "@/model/history/state"
import { buildLiveHistoryView } from "./live-history-view"

describe("buildLiveHistoryView", () => {
	it("uses live ruler fields while the simulation is running", () => {
		const view = buildLiveHistoryView({
			selectedTimeMs: 10,
			simTimeMs: 10,
			liveFrame: {
				timeMs: 10,
				assignment: new Int32Array([2, 2, 2]),
				parent: new Int32Array([-1, 0, -1]),
				sovereign: new Int32Array([0, 0, 2]),
				leaderDynasty: new Int32Array([8, -1, 9]),
				leaderNameSeed: new Int32Array([80, -1, 90]),
				leaderClaim: new Int32Array([3, 0, 1]),
				leaderBirthYear: new Float32Array([100, -1, 120]),
				colors: new Float32Array([1, 0, 0, 1, 0, 0, 0, 0, 1]),
				populationTotal: new Float32Array([12, 4, 9]),
				populationUrban: new Float32Array([2, 1, 3]),
				development: new Float32Array([0.5, 0.25, 0.75]),
				consumption: new Float32Array([1, 0.5, 1.5]),
				nationWealth: new Float32Array([11, 0, 7.5]),
				nationOptimalWealth: new Float32Array([12, 0, 9]),
				relationA: new Int32Array([0]),
				relationB: new Int32Array([2]),
				relationValues: new Uint8Array([REL.ALLY]),
				activeWars: [],
				sovereignCount: 2,
				totalPopulation: 25,
				cultureBlendSecondary: new Int32Array([-1, -1, -1]),
				cultureBlendWeight: new Float32Array([0, 0, 0]),
			},
		})

		expect(view).not.toBeNull()
		expect(Array.from(view!.leaderDynasty)).toEqual([8, -1, 9])
		expect(Array.from(view!.leaderNameSeed)).toEqual([80, -1, 90])
		expect(Array.from(view!.leaderClaim)).toEqual([3, 0, 1])
		expect(Array.from(view!.leaderBirthYear)).toEqual([100, -1, 120])
		expect(Array.from(view!.populationRural)).toEqual([10, 3, 6])
		expect(view!.relationAt(0, 2)).toBe(REL.ALLY)
		expect(view!.relationAt(2, 0)).toBe(REL.NEUTRAL)
		expect(view!.getNationWealth(2)).toBe(7.5)
		expect(view!.getNationOptimalWealth(0)).toBe(12)
	})

	it("returns null when not viewing the current simulation time", () => {
		expect(
			buildLiveHistoryView({
				selectedTimeMs: 0,
				simTimeMs: 10,
				liveFrame: {
					timeMs: 10,
					assignment: new Int32Array(0),
					parent: new Int32Array(0),
					sovereign: new Int32Array(0),
					leaderDynasty: new Int32Array(0),
					leaderNameSeed: new Int32Array(0),
					leaderClaim: new Int32Array(0),
					leaderBirthYear: new Float32Array(0),
					colors: new Float32Array(0),
					populationTotal: new Float32Array(0),
					populationUrban: new Float32Array(0),
					development: new Float32Array(0),
					consumption: new Float32Array(0),
					nationWealth: new Float32Array(0),
					nationOptimalWealth: new Float32Array(0),
					relationA: new Int32Array(0),
					relationB: new Int32Array(0),
					relationValues: new Uint8Array(0),
					activeWars: [],
					sovereignCount: 0,
					totalPopulation: 0,
					cultureBlendSecondary: new Int32Array(0),
					cultureBlendWeight: new Float32Array(0),
				},
			}),
		).toBeNull()
	})
})
