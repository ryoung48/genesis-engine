import { expect, it } from "vitest"
import { HISTORY } from "@/model/history/record"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { SIM_RECORD } from "@/model/history/sim/record"
import { FRAME } from "@/model/history/world-frame"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

it("preserves recruitment composition and combined maintenance at historical census dates", () => {
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const recordState = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: engine.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: recordState, world })
	SIM_ENGINE.simulateUntil({
		state: engine,
		targetTimeMs: engine.time + STATE.deltaYear(2),
		rng: HISTORY_RNG.createHistoryRng(15063990),
		validate: false,
	})
	SIM_RECORD.appendJournal({ translator, transactions: engine.journal })
	for (const census of recordState.record.events.censuses) {
		const frame = HISTORY.frameAt({ state: recordState, timeMs: census.timeMs })
		const source = census.economy
		expect(frame.economy).toBe(source)
		for (let index = 0; index < source.nations.length; index++) {
			const economy = FRAME.nationEconomy({
				frame,
				nationId: source.nations[index],
			})
			if (!economy) throw new Error("Missing historical army economy")
			expect(economy.levy).toBe(source.levy[index])
			expect(economy.regular).toBe(source.regular[index])
			expect(
				Math.abs(economy.army - economy.levy - economy.regular),
			).toBeLessThan(Math.max(1, economy.army) * 1e-6)
			const deployed = source.deployments[index].reduce(
				(sum, troops) => sum + troops.levy + troops.regular,
				0,
			)
			expect(economy.deployed).toBeCloseTo(deployed, 8)
			expect(
				economy.deployedLevyPercent + economy.deployedRegularPercent,
			).toBeCloseTo(deployed > 0 ? 100 : 0, 8)
			if (economy.budget)
				expect(economy.budget.armyExpenses).toBeCloseTo(
					economy.budget.levyExpenses + economy.budget.regularExpenses,
					8,
				)
		}
	}
}, 120000)
