import { expect, it } from "vitest"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import type { War } from "@/model/history/sim/engine/state/types"
import { HISTORY_RUN } from "@/test/history-run"

it("weights shared deployments and carries losses into the next battle", () => {
	const { engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const war = engine.wars.find(
		(candidate) => candidate.endTime === undefined && !candidate.rebel,
	)
	expect(war).toBeDefined()
	if (!war) return
	const weak = Array.from({ length: engine.P }, (_, nation) => nation).find(
		(nation) =>
			nation !== war.attacker &&
			nation !== war.defender &&
			STATE.isSovereign({ state: engine, p: nation }),
	)
	expect(weak).toBeDefined()
	if (weak === undefined) return
	engine.manpowerCurrent[weak] = 1
	engine.manpowerCurrent[war.defender] = 1_000_000
	engine.treasuryCurrent[war.defender] =
		1_000_000_000_000 * ECONOMY.ducatsPerGram
	const smallerWar: War = {
		idx: engine.wars.length,
		attacker: war.attacker,
		defender: weak,
		startTime: engine.time,
		rebel: false,
		deployed: {},
		occupied: [],
		allies: new Set(),
	}
	engine.wars.push(smallerWar)
	engine.activeWarIds.add(smallerWar.idx)
	engine.provinceWars[war.attacker].push(smallerWar.idx)
	engine.provinceWars[weak].push(smallerWar.idx)

	const rng = HISTORY_RNG.createHistoryRng(42)
	const first = MILITARY.fight({
		state: engine,
		war,
		eventAttacker: war.attacker,
		defense: 1,
		rng,
	})
	expect(war.deployed[war.attacker]).toBeGreaterThan(
		smallerWar.deployed[war.attacker],
	)
	const committed = Array.from(engine.activeWarIds).reduce(
		(sum, idx) => sum + (engine.wars[idx].deployed[war.attacker] ?? 0),
		0,
	)
	expect(committed).toBeLessThanOrEqual(engine.manpowerCurrent[war.attacker])
	const second = MILITARY.fight({
		state: engine,
		war,
		eventAttacker: war.attacker,
		defense: 1,
		rng,
	})

	expect(second.attackerArmy).toBeLessThan(first.attackerArmy)
	expect(second.defenderArmy).toBeLessThan(first.defenderArmy)
}, 120_000)

it("changes each side's losses when the battle outcome changes", () => {
	const options = {
		seed: 14963991,
		era: "lateMedieval" as const,
		numPoints: 30000,
	}
	const winning = HISTORY_RUN.createEngine(options).engine
	const losing = HISTORY_RUN.createEngine(options).engine
	const winningWar = winning.wars.find(
		(candidate) => candidate.endTime === undefined && !candidate.rebel,
	)
	expect(winningWar).toBeDefined()
	if (!winningWar) return
	const losingWar = losing.wars[winningWar.idx]
	const winRng = HISTORY_RNG.createHistoryRng(42)
	winRng.random = () => 1
	winRng.uniform = () => 1
	const lossRng = HISTORY_RNG.createHistoryRng(42)
	lossRng.random = () => 0
	lossRng.uniform = () => 1
	const victory = MILITARY.fight({
		state: winning,
		war: winningWar,
		eventAttacker: winningWar.attacker,
		defense: 1,
		rng: winRng,
	})
	const defeat = MILITARY.fight({
		state: losing,
		war: losingWar,
		eventAttacker: losingWar.attacker,
		defense: 1,
		rng: lossRng,
	})

	expect(victory.attackerWon).toBe(true)
	expect(defeat.attackerWon).toBe(false)
	expect(victory.attackerArmy).toBeCloseTo(defeat.attackerArmy)
	expect(victory.defenderArmy).toBeCloseTo(defeat.defenderArmy)
	expect(victory.attackerLossShare).toBeLessThan(defeat.attackerLossShare)
	expect(victory.defenderLossShare).toBeGreaterThan(defeat.defenderLossShare)
}, 120_000)
