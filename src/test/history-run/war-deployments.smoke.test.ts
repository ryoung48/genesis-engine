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
		(candidate) =>
			candidate.endTime === undefined && candidate.goal === "conquest",
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
	engine.levyCurrent[weak] = 1
	engine.levyCurrent[war.defender] = 1_000_000
	engine.treasuryCurrent[war.defender] =
		1_000_000_000_000 * ECONOMY.ducatsPerGram
	const smallerWar: War = {
		siege: null,
		idx: engine.wars.length,
		attacker: war.attacker,
		defender: weak,
		startTime: engine.time,
		goal: "conquest",
		backers: [],
		refusedCalls: new Set(),
		originalCrownRuler: -1,
		deployed: {},
		participants: {},
		candidates: { attacker: [], defender: [] },
		callable: { attacker: [], defender: [] },
		candidatesHierarchyVersion: -1,
		allocation: {},
		occupied: [],
		battleScore: 0,
		dealConsidered: false,
		allies: new Set(),
	}
	engine.wars.push(smallerWar)
	engine.activeWarIds.add(smallerWar.idx)
	engine.provinceWars[war.attacker].push(smallerWar.idx)
	engine.provinceWars[weak].push(smallerWar.idx)

	engine.militaryDirty.add(war.attacker)
	MILITARY.reconcile({ state: engine })
	const rng = HISTORY_RNG.createHistoryRng(42)
	const first = MILITARY.fight({
		state: engine,
		war,
		eventAttacker: war.attacker,
		attackerMultiplier: 1,
		defenderMultiplier: 1,
		rng,
	})
	expect(
		war.deployed[war.attacker].levy + war.deployed[war.attacker].regular,
	).toBeGreaterThan(
		smallerWar.deployed[war.attacker].levy +
			smallerWar.deployed[war.attacker].regular,
	)
	const committed = Array.from(engine.activeWarIds).reduce(
		(sum, idx) =>
			sum +
			((engine.wars[idx].deployed[war.attacker]?.levy ?? 0) +
				(engine.wars[idx].deployed[war.attacker]?.regular ?? 0)),
		0,
	)
	expect(committed).toBeLessThanOrEqual(
		MILITARY.armySize({ state: engine, nation: war.attacker }) * (1 + 1e-9),
	)
	const surviving =
		MILITARY.armySize({ state: engine, nation: war.attacker }) +
		MILITARY.armySize({ state: engine, nation: war.defender })
	const second = MILITARY.fight({
		state: engine,
		war,
		eventAttacker: war.attacker,
		attackerMultiplier: 1,
		defenderMultiplier: 1,
		rng,
	})

	expect(
		MILITARY.armySize({ state: engine, nation: war.attacker }) +
			MILITARY.armySize({ state: engine, nation: war.defender }),
	).toBeLessThan(surviving)
	expect(second.attackerArmy + second.defenderArmy).toBeGreaterThan(0)
	expect(first.attackerArmy + first.defenderArmy).toBeGreaterThan(0)
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
		(candidate) =>
			candidate.endTime === undefined && candidate.goal === "conquest",
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
		attackerMultiplier: 1,
		defenderMultiplier: 1,
		rng: winRng,
	})
	const defeat = MILITARY.fight({
		state: losing,
		war: losingWar,
		eventAttacker: losingWar.attacker,
		attackerMultiplier: 1,
		defenderMultiplier: 1,
		rng: lossRng,
	})

	expect(victory.attackerWon).toBe(true)
	expect(defeat.attackerWon).toBe(false)
	expect(victory.attackerArmy).toBeCloseTo(defeat.attackerArmy)
	expect(victory.defenderArmy).toBeCloseTo(defeat.defenderArmy)
	expect(victory.attackerLossShare).toBeLessThan(defeat.attackerLossShare)
	expect(victory.defenderLossShare).toBeGreaterThan(defeat.defenderLossShare)
}, 120_000)
