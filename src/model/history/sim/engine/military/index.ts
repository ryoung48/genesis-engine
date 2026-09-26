import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import type { ArmyTradition } from "@/model/history/sim/engine/economy/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import type {
	ApplyLossesParams,
	BattleResult,
	CoalitionMember,
	CoalitionParams,
	DeploymentAssignment,
	FightParams,
	LossShareParams,
	NationParams,
	PlunderParams,
	RaidParams,
	RaidResult,
	RebellionThreatParams,
	SideMembersParams,
	SquareShareParams,
	ThreatParams,
} from "@/model/history/sim/engine/military/types"
import { STATE } from "@/model/history/sim/engine/state"
import { MATH } from "@/model/shared/math/core"

const SOLDIER_PAY = 1000

const PEACE_UPKEEP = 5

const ALLY_COMMITMENT = 0.5

const DEPLOYMENT_RECOVERY_PER_YEAR = 0.25

const MINIMUM_DEPLOYMENT_SHARE = 0.2

const DEFENDER_BONUS = 1.2

const LOSS_BASE = 0.1

const LOSS_CAP = 0.6

const LOSER_LOSS_MULTIPLIER = 1.5

const WINNER_LOSS_MULTIPLIER = 0.75

const EXHAUSTION_MANPOWER: Record<ArmyTradition, number> = {
	paid: 0.25,
	tribal: 0.8,
	steppe: 0.8,
}

const DEBT_LIMIT_YEARS = 1

const EXHAUSTION_DEBT_YEARS = 0.5

const MIN_FORCE = 1

const SUBJECT_LEVY_SHARE = 0.9

const LEAGUE_SHARE = 0.25

const BASE_MUSTER = 0.1

const GIFT_BONUS = 0.2

const GIFT_PER_WARRIOR = 100

const DISLOYALTY = 0.5

const PLUNDER_OUTPUT_SHARE = 0.03

const PLUNDER_TREASURY_SHARE = 0.2

const PLUNDER_COOLDOWN_YEARS = 5

const RAID_PARTY_SHARE = 0.25

const RESPONSE_SHARE = 0.15

const CROWN_LOOT_SHARE: Record<ArmyTradition, number> = {
	paid: 1 / 3,
	tribal: 1,
	steppe: 1,
}

function realmKnowledge({ state, nation }: NationParams): number {
	return ECONOMY.realmKnowledge({ state, p: nation })
}

function payPerSoldier({ state, nation }: NationParams): number {
	return (
		SOLDIER_PAY *
		KNOWLEDGE.campaignShare({ knowledge: realmKnowledge({ state, nation }) })
	)
}

function logistics({ state, nation }: NationParams): number {
	return KNOWLEDGE.maxFieldArmy({
		knowledge: realmKnowledge({ state, nation }),
	})
}

function fielded({ state, nation }: NationParams): number {
	const manpower = Math.max(0, FIELDS.prov.manpower.get({ state, p: nation }))
	const cap = logistics({ state, nation })
	if (ECONOMY.armyTradition({ state, p: nation }) !== "paid")
		return Math.min(
			cap,
			manpower *
				(BASE_MUSTER + GIFT_BONUS * ECONOMY.treasuryFill({ state, p: nation })),
		)
	const affordable =
		Math.max(
			0,
			FIELDS.prov.treasury.get({ state, p: nation }) +
				(1 + DEBT_LIMIT_YEARS) *
					ECONOMY.discretionaryRevenue({ state, p: nation }),
		) / payPerSoldier({ state, nation })
	return Math.min(cap, manpower, affordable)
}

function force({ state, nation }: NationParams): number {
	return (
		fielded({ state, nation }) /
		(1 + DERIVE.provinceWars({ state, p: nation }).length)
	)
}

function upkeep({ state, nation }: NationParams): number {
	const atWar = DERIVE.provinceWars({ state, p: nation }).length > 0
	if (ECONOMY.armyTradition({ state, p: nation }) !== "paid")
		return atWar ? GIFT_PER_WARRIOR * fielded({ state, nation }) : 0
	if (!atWar) return PEACE_UPKEEP * ECONOMY.maxManpower({ state, p: nation })
	return payPerSoldier({ state, nation }) * fielded({ state, nation })
}

function sideMembers({
	state,
	nation,
	type,
	target,
}: SideMembersParams): CoalitionMember[] {
	const members = [
		{ nation, force: force({ state, nation }) },
		...STATE.getWarAllies({ state, nation, type, target }).map((ally) => ({
			nation: ally,
			force: force({ state, nation: ally }) * ALLY_COMMITMENT,
		})),
	]
	const total = totalForce(members)
	const cap = logistics({ state, nation })
	if (total <= cap) return members
	return members.map((member) => ({
		...member,
		force: (member.force * cap) / total,
	}))
}

function squareShare({ a, b }: SquareShareParams): number {
	const a2 = Math.max(MIN_FORCE, a) ** 2
	const b2 = Math.max(MIN_FORCE, b) ** 2
	return b2 / (a2 + b2)
}

function threat({ state, attacker, defender }: ThreatParams): number {
	return squareShare({
		a: totalForce(
			sideMembers({
				state,
				nation: attacker,
				type: "offensive",
				target: defender,
			}),
		),
		b: totalForce(
			sideMembers({
				state,
				nation: defender,
				type: "defensive",
				target: attacker,
			}),
		),
	})
}

function rebellionThreat({
	state,
	overlord,
	subject,
}: RebellionThreatParams): number {
	const share = ECONOMY.subtreeManpower({ state, p: subject })
	let league = 0
	for (const vassal of STATE.getChildren({ state, p: overlord }))
		if (vassal !== subject && state.seatRank[vassal] > 0)
			league += ECONOMY.subtreeManpower({ state, p: vassal })
	const loyalty =
		ECONOMY.armyTradition({ state, p: overlord }) === "paid"
			? 1
			: 1 + DISLOYALTY * (1 - ECONOMY.treasuryFill({ state, p: overlord }))
	return squareShare({
		a: Math.min(
			force({ state, nation: overlord }),
			FIELDS.prov.manpower.get({ state, p: overlord }) - share,
		),
		b: Math.min(
			logistics({ state, nation: overlord }),
			(share + LEAGUE_SHARE * league) * SUBJECT_LEVY_SHARE * loyalty,
		),
	})
}

function deploymentAssignments({
	state,
	nation,
}: NationParams): DeploymentAssignment[] {
	const assignments: DeploymentAssignment[] = []
	for (const idx of state.activeWarIds) {
		const war = state.wars[idx]
		if (war.attacker === nation) {
			assignments.push({ war, opponent: war.defender, primary: true })
		} else if (war.defender === nation) {
			assignments.push({ war, opponent: war.attacker, primary: true })
		} else if (
			STATE.getWarAllies({
				state,
				nation: war.attacker,
				type: "offensive",
				target: war.defender,
			}).includes(nation)
		) {
			assignments.push({ war, opponent: war.defender, primary: false })
		} else if (
			STATE.getWarAllies({
				state,
				nation: war.defender,
				type: "defensive",
				target: war.attacker,
			}).includes(nation)
		) {
			assignments.push({ war, opponent: war.attacker, primary: false })
		}
	}
	return assignments
}

function rebalanceDeployments({ state, nation }: NationParams): void {
	const assignments = deploymentAssignments({ state, nation })
	if (assignments.length === 0) return
	const primary = assignments.some((assignment) => assignment.primary)
	const capacity = fielded({ state, nation }) * (primary ? 1 : ALLY_COMMITMENT)
	const deployed = assignments.reduce(
		(sum, assignment) => sum + (assignment.war.deployed[nation] ?? 0),
		0,
	)
	const initialized = assignments.some(
		(assignment) => assignment.war.deployed[nation] !== undefined,
	)
	const years = Math.max(
		0,
		(state.time - state.deploymentUpdateTime[nation]) / STATE.yearMs,
	)
	const recovery = Math.min(1, DEPLOYMENT_RECOVERY_PER_YEAR * years)
	const budget = initialized
		? Math.min(capacity, deployed + Math.max(0, capacity - deployed) * recovery)
		: capacity
	const weights = assignments.map(
		(assignment) =>
			Math.max(MIN_FORCE, fielded({ state, nation: assignment.opponent })) *
			(assignment.primary ? 1 : ALLY_COMMITMENT),
	)
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
	for (let i = 0; i < assignments.length; i++) {
		assignments[i].war.deployed[nation] =
			budget *
			(MINIMUM_DEPLOYMENT_SHARE / assignments.length +
				((1 - MINIMUM_DEPLOYMENT_SHARE) * weights[i]) / totalWeight)
	}
	state.deploymentUpdateTime[nation] = state.time
}

function coalition({ state, war, side }: CoalitionParams): CoalitionMember[] {
	const nation = side === "attacker" ? war.attacker : war.defender
	const target = side === "attacker" ? war.defender : war.attacker
	const allies = STATE.getWarAllies({
		state,
		nation,
		type: side === "attacker" ? "offensive" : "defensive",
		target,
	})
	const members = [nation, ...allies].map((participant) => {
		rebalanceDeployments({ state, nation: participant })
		return { nation: participant, force: war.deployed[participant] ?? 0 }
	})
	const total = totalForce(members)
	const cap = logistics({ state, nation })
	if (total <= cap) return members
	return members.map((member) => ({
		...member,
		force: (member.force * cap) / total,
	}))
}

function lossShare({ ratio, multiplier, rng }: LossShareParams): number {
	return MATH.clamp({
		value: LOSS_BASE * ratio * multiplier * rng.uniform(0.7, 1.3),
		lo: 0,
		hi: LOSS_CAP,
	})
}

function totalForce(members: CoalitionMember[]): number {
	return members.reduce((sum, member) => sum + member.force, 0)
}

function applyLosses({
	state,
	members,
	losses,
}: ApplyLossesParams): Map<number, number> {
	const byNation = new Map<number, number>()
	const total = totalForce(members)
	if (total <= 0 || losses <= 0) return byNation
	for (const { nation, force: committed } of members) {
		const share = (losses * committed) / total
		byNation.set(nation, share)
		FIELDS.prov.manpower.set({
			state,
			p: nation,
			value: Math.max(
				0,
				FIELDS.prov.manpower.get({ state, p: nation }) - share,
			),
		})
		const provinces = STATE.getNationProvinces({ state, root: nation })
		let rural = 0
		for (const p of provinces)
			rural += FIELDS.prov.population.rural.get({ state, p })
		if (rural <= 0) continue
		const scale = Math.max(0, 1 - share / rural)
		for (const p of provinces)
			FIELDS.prov.population.rural.set({
				state,
				p,
				value: FIELDS.prov.population.rural.get({ state, p }) * scale,
			})
	}
	return byNation
}

function fight({ state, war, eventAttacker, rng }: FightParams): BattleResult {
	const attackerSide = eventAttacker === war.attacker ? "attacker" : "defender"
	const attackers = coalition({ state, war, side: attackerSide })
	const defenders = coalition({
		state,
		war,
		side: attackerSide === "attacker" ? "defender" : "attacker",
	})
	const attackerArmy = totalForce(attackers)
	const defenderArmy = totalForce(defenders)
	const effectiveAttack = Math.max(MIN_FORCE, attackerArmy)
	const effectiveDefense = Math.max(MIN_FORCE, defenderArmy * DEFENDER_BONUS)
	const winChance = 1 - squareShare({ a: effectiveAttack, b: effectiveDefense })
	const attackerWon = rng.random() < winChance
	const ratio = attackerWon
		? effectiveAttack / effectiveDefense
		: effectiveDefense / effectiveAttack
	const loserShare = lossShare({
		ratio,
		multiplier: LOSER_LOSS_MULTIPLIER,
		rng,
	})
	const winnerShare = lossShare({
		ratio: 1 / ratio,
		multiplier: WINNER_LOSS_MULTIPLIER,
		rng,
	})
	const attackerLossShare = attackerWon ? winnerShare : loserShare
	const defenderLossShare = attackerWon ? loserShare : winnerShare
	const attackerLosses = applyLosses({
		state,
		members: attackers,
		losses: attackerArmy * attackerLossShare,
	})
	const defenderLosses = applyLosses({
		state,
		members: defenders,
		losses: defenderArmy * defenderLossShare,
	})
	for (const [nation, losses] of attackerLosses)
		war.deployed[nation] = Math.max(0, (war.deployed[nation] ?? 0) - losses)
	for (const [nation, losses] of defenderLosses)
		war.deployed[nation] = Math.max(0, (war.deployed[nation] ?? 0) - losses)
	const attackerDeployed = attackers.reduce(
		(sum, member) => sum + (war.deployed[member.nation] ?? 0),
		0,
	)
	const defenderDeployed = defenders.reduce(
		(sum, member) => sum + (war.deployed[member.nation] ?? 0),
		0,
	)
	return {
		attackerWon,
		winChance,
		attackerArmy,
		defenderArmy,
		attackerDeployed,
		defenderDeployed,
		attackerLossShare,
		defenderLossShare,
	}
}

function plunder({
	state,
	raider,
	loser,
	province,
	sack,
}: PlunderParams): number {
	const outputLoot =
		FIELDS.prov.plunderedUntil.get({ state, p: province }) > state.time
			? 0
			: PLUNDER_OUTPUT_SHARE * ECONOMY.provinceOutput({ state, p: province })
	FIELDS.prov.plunderedUntil.set({
		state,
		p: province,
		value: state.time + STATE.deltaYear(PLUNDER_COOLDOWN_YEARS),
	})
	const loserTreasury = FIELDS.prov.treasury.get({ state, p: loser })
	const treasuryLoot = sack
		? PLUNDER_TREASURY_SHARE * Math.max(0, loserTreasury)
		: 0
	FIELDS.prov.treasury.set({
		state,
		p: loser,
		value: loserTreasury - treasuryLoot,
	})
	const crownLoot =
		(outputLoot + treasuryLoot) *
		CROWN_LOOT_SHARE[ECONOMY.armyTradition({ state, p: raider })]
	FIELDS.prov.treasury.set({
		state,
		p: raider,
		value: Math.min(
			ECONOMY.reserveCap({ state, p: raider }),
			FIELDS.prov.treasury.get({ state, p: raider }) + crownLoot,
		),
	})
	return crownLoot
}

function raid({
	state,
	raider,
	victim,
	province,
	rng,
}: RaidParams): RaidResult {
	const raiderParty = fielded({ state, nation: raider }) * RAID_PARTY_SHARE
	const response = force({ state, nation: victim }) * RESPONSE_SHARE
	const attack = Math.max(MIN_FORCE, raiderParty)
	const defense = Math.max(MIN_FORCE, response * DEFENDER_BONUS)
	const success = rng.random() < 1 - squareShare({ a: attack, b: defense })
	const ratio = success ? attack / defense : defense / attack
	const loserShare = lossShare({ ratio, multiplier: 1, rng })
	const winnerShare = lossShare({ ratio: 1 / ratio, multiplier: 1, rng })
	const raiderLosses = raiderParty * (success ? winnerShare : loserShare)
	const victimLosses = response * (success ? loserShare : winnerShare)
	applyLosses({
		state,
		members: [{ nation: raider, force: raiderParty }],
		losses: raiderLosses,
	})
	applyLosses({
		state,
		members: [{ nation: victim, force: response }],
		losses: victimLosses,
	})
	return {
		success,
		loot: success
			? plunder({ state, raider, loser: victim, province, sack: false })
			: 0,
		raiderParty,
		response,
		raiderLosses,
		victimLosses,
	}
}

function exhausted({ state, nation }: NationParams): boolean {
	const tradition = ECONOMY.armyTradition({ state, p: nation })
	if (
		FIELDS.prov.manpower.get({ state, p: nation }) <
		EXHAUSTION_MANPOWER[tradition] * ECONOMY.maxManpower({ state, p: nation })
	)
		return true
	return (
		tradition === "paid" &&
		FIELDS.prov.treasury.get({ state, p: nation }) <
			-EXHAUSTION_DEBT_YEARS *
				ECONOMY.discretionaryRevenue({ state, p: nation })
	)
}

export const MILITARY = {
	upkeep,
	plunder,
	raid,
	threat,
	rebellionThreat,
	fight,
	exhausted,
}
