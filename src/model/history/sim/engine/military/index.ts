import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import type { ArmyTradition } from "@/model/history/sim/engine/economy/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import type {
	ApplyLossesParams,
	BattleDeployments,
	BattleOutcome,
	BattleResult,
	Coalition,
	CoalitionMember,
	CoalitionParams,
	CostPerManYearParams,
	DeploymentAssignment,
	DeploymentsOfParams,
	FightParams,
	ForceShareParams,
	LeadRelationsParams,
	LogCoalitionParams,
	LossShareParams,
	MemberDeploymentsParams,
	MobilizeParams,
	NationParams,
	PlunderParams,
	RaidParams,
	RaidResult,
	RebellionThreatParams,
	RecordArmiesParams,
	SideMembersParams,
	ThreatParams,
	WarAlliesParams,
} from "@/model/history/sim/engine/military/types"
import { STATE } from "@/model/history/sim/engine/state"
import { MATH } from "@/model/shared/math/core"

const PEACE_COST_GRAMS = 400

const WAR_COST_GRAMS = 1250

const REFERENCE_OUTPUT_GRAMS = 450

const COST_OUTPUT_EXPONENT = 0.5

// Tribal and steppe warriors bring lighter kit and serve for shares of the
// spoils more than for continuous pay.
const TRADITION_COST_SHARE: Record<ArmyTradition, number> = {
	settled: 0.5,
	tribal: 0.05,
	steppe: 0.05,
}

const PEACE_ARMY_BUDGET_SHARE = 0.75

const DEPLOYMENT_RECOVERY_PER_YEAR = 0.75

const MINIMUM_DEPLOYMENT_SHARE = 0.2

const DEFENDER_BONUS = 1.2

const LOSS_BASE = 0.1

const LOSS_CAP = 0.6

const BATTLE_EXPONENT = 3

const RAID_EXPONENT = 2

const ROLL_EPSILON = 1e-12

const BATTLE_LOSS_SCALE = 0.2

const BATTLE_LOSS_EXPONENT = 1.5

const INCONCLUSIVE_MARGIN = 0.2

const DECISIVE_MARGIN = 0.9

const ROUT_MARGIN_WEIGHT = 0.15

const ROUT_SHORTFALL_WEIGHT = 0.2

const ROUT_MIDPOINT = 0.4

const ROUT_STEEPNESS = 20

const PURSUIT_MIN = 0.05

const PURSUIT_MAX = 0.2

const EXHAUSTION_MANPOWER: Record<ArmyTradition, number> = {
	settled: 0.25,
	tribal: 0.8,
	steppe: 0.8,
}

const EXHAUSTION_DEBT_YEARS = 0.5

const MIN_FORCE = 1

const SUBJECT_LEVY_SHARE = 0.9

const LEAGUE_SHARE = 0.25

const BASE_MUSTER = 0.1

const GIFT_BONUS = 0.2

const DISLOYALTY = 0.5

const PLUNDER_OUTPUT_SHARE = 0.03

const PLUNDER_TREASURY_SHARE = 0.2

const PLUNDER_COOLDOWN_YEARS = 5

const RAID_PARTY_SHARE = 0.25

const RESPONSE_SHARE = 0.15

const CROWN_LOOT_SHARE: Record<ArmyTradition, number> = {
	settled: 1 / 3,
	tribal: 1,
	steppe: 1,
}

function realmKnowledge({ state, nation }: NationParams): number {
	return ECONOMY.realmKnowledge({ state, p: nation })
}

function costPerManYear({
	state,
	nation,
	grams,
}: CostPerManYearParams): number {
	return (
		grams *
		TRADITION_COST_SHARE[ECONOMY.armyTradition({ state, p: nation })] *
		(ECONOMY.outputPerHead({ state, p: nation }) / REFERENCE_OUTPUT_GRAMS) **
			COST_OUTPUT_EXPONENT *
		ECONOMY.ducatsPerGram
	)
}

function peaceCost({ state, nation }: NationParams): number {
	return costPerManYear({ state, nation, grams: PEACE_COST_GRAMS })
}

function warCost({ state, nation }: NationParams): number {
	return costPerManYear({ state, nation, grams: WAR_COST_GRAMS })
}

function logistics({ state, nation }: NationParams): number {
	return KNOWLEDGE.maxFieldArmy({
		knowledge: realmKnowledge({ state, nation }),
	})
}

function armySize({ state, nation }: NationParams): number {
	const manpower = Math.max(0, FIELDS.prov.manpower.get({ state, p: nation }))
	const price = peaceCost({ state, nation })
	const affordable =
		price > 0
			? (PEACE_ARMY_BUDGET_SHARE *
					Math.max(0, ECONOMY.surplus({ state, p: nation }))) /
				price
			: 0
	const size = Math.min(logistics({ state, nation }), manpower, affordable)
	if (ECONOMY.armyTradition({ state, p: nation }) === "settled") return size
	return Math.min(
		size,
		manpower *
			(BASE_MUSTER + GIFT_BONUS * ECONOMY.treasuryFill({ state, p: nation })),
	)
}

function force({ state, nation }: NationParams): number {
	return (
		armySize({ state, nation }) /
		(1 + DERIVE.provinceWars({ state, p: nation }).length)
	)
}

// Allies and vassals fighting beside a war's lead are at war too.
function atWar({ state, nation }: NationParams): boolean {
	return (
		DERIVE.provinceWars({ state, p: nation }).length > 0 ||
		deploymentAssignments({ state, nation }).length > 0
	)
}

function upkeep({ state, nation }: NationParams): number {
	return (
		armySize({ state, nation }) *
		(atWar({ state, nation })
			? warCost({ state, nation })
			: peaceCost({ state, nation }))
	)
}

// An exhausted realm makes a separate peace: it neither joins nor stays in
// its partners' wars.
function warAllies({ war, ...params }: WarAlliesParams): number[] {
	return STATE.getWarAllies(params).filter(
		(ally) =>
			!exhausted({ state: params.state, nation: ally }) &&
			(war?.allies.has(ally) ||
				FIELDS.prov.treasury.get({ state: params.state, p: ally }) >= 0),
	)
}

function logCoalition({ state, war }: LogCoalitionParams): void {
	const attackers = warAllies({
		state,
		war,
		nation: war.attacker,
		type: "offensive",
		target: war.defender,
	})
	const defenders = warAllies({
		state,
		war,
		nation: war.defender,
		type: "defensive",
		target: war.attacker,
	})
	war.allies = new Set([...attackers, ...defenders])
	JOURNAL.coalition({
		state,
		warId: war.idx,
		rebel: war.rebel,
		attackers: [war.attacker, ...attackers],
		defenders: [war.defender, ...defenders],
	})
}

function sideMembers({
	state,
	nation,
	type,
	target,
}: SideMembersParams): CoalitionMember[] {
	const members = [
		{ nation, force: force({ state, nation }) },
		...warAllies({ state, war: null, nation, type, target }).map((ally) => ({
			nation: ally,
			force: force({ state, nation: ally }),
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

function forceShare({ a, b, k }: ForceShareParams): number {
	return 1 / (1 + Math.exp(k * (Math.log(a) - Math.log(b))))
}

function threat({ state, attacker, defender }: ThreatParams): number {
	return forceShare({
		a: Math.max(
			MIN_FORCE,
			totalForce(
				sideMembers({
					state,
					nation: attacker,
					type: "offensive",
					target: defender,
				}),
			),
		),
		b: Math.max(
			MIN_FORCE,
			totalForce(
				sideMembers({
					state,
					nation: defender,
					type: "defensive",
					target: attacker,
				}),
			),
		),
		k: BATTLE_EXPONENT,
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
		if (
			vassal !== subject &&
			state.seatRank[vassal] > 0 &&
			state.people.rulerOf[vassal] >= 0
		)
			league += ECONOMY.subtreeManpower({ state, p: vassal })
	const loyalty =
		ECONOMY.armyTradition({ state, p: overlord }) === "settled"
			? 1
			: 1 + DISLOYALTY * (1 - ECONOMY.treasuryFill({ state, p: overlord }))
	return forceShare({
		a: Math.max(
			MIN_FORCE,
			Math.min(
				force({ state, nation: overlord }),
				FIELDS.prov.manpower.get({ state, p: overlord }) - share,
			),
		),
		b: Math.max(
			MIN_FORCE,
			Math.min(
				logistics({ state, nation: overlord }),
				(share + LEAGUE_SHARE * league) * SUBJECT_LEVY_SHARE * loyalty,
			),
		),
		k: BATTLE_EXPONENT,
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
			assignments.push({ war, opponent: war.defender })
		} else if (war.defender === nation) {
			assignments.push({ war, opponent: war.attacker })
		} else if (
			warAllies({
				state,
				war,
				nation: war.attacker,
				type: "offensive",
				target: war.defender,
			}).includes(nation)
		) {
			assignments.push({ war, opponent: war.defender })
		} else if (
			warAllies({
				state,
				war,
				nation: war.defender,
				type: "defensive",
				target: war.attacker,
			}).includes(nation)
		) {
			assignments.push({ war, opponent: war.attacker })
		}
	}
	return assignments
}

function rebalanceDeployments({
	state,
	nation,
}: NationParams): Map<number, number> {
	const assigned = new Map<number, number>()
	const assignments = deploymentAssignments({ state, nation })
	if (assignments.length === 0) return assigned
	const capacity = armySize({ state, nation })
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
	const weights = assignments.map((assignment) =>
		Math.max(MIN_FORCE, armySize({ state, nation: assignment.opponent })),
	)
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
	for (let i = 0; i < assignments.length; i++) {
		const share =
			MINIMUM_DEPLOYMENT_SHARE / assignments.length +
			((1 - MINIMUM_DEPLOYMENT_SHARE) * weights[i]) / totalWeight
		assignments[i].war.deployed[nation] = budget * share
		assigned.set(assignments[i].war.idx, capacity * share)
	}
	state.deploymentUpdateTime[nation] = state.time
	return assigned
}

function coalition({ state, war, side }: CoalitionParams): Coalition {
	const nation = side === "attacker" ? war.attacker : war.defender
	const target = side === "attacker" ? war.defender : war.attacker
	const allies = warAllies({
		state,
		war,
		nation,
		type: side === "attacker" ? "offensive" : "defensive",
		target,
	})
	let assigned = 0
	const members = [nation, ...allies].map((participant) => {
		assigned +=
			rebalanceDeployments({ state, nation: participant }).get(war.idx) ?? 0
		return { nation: participant, force: war.deployed[participant] ?? 0 }
	})
	const deployed = totalForce(members)
	const shortfall =
		assigned > 0
			? MATH.clamp({ value: 1 - deployed / assigned, lo: 0, hi: 1 })
			: 0
	const cap = logistics({ state, nation })
	if (deployed <= cap) return { members, shortfall }
	return {
		members: members.map((member) => ({
			...member,
			force: (member.force * cap) / deployed,
		})),
		shortfall,
	}
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

function battleOutcome(margin: number): BattleOutcome {
	if (margin < INCONCLUSIVE_MARGIN) return "inconclusive"
	return margin < DECISIVE_MARGIN ? "normal" : "decisive"
}

function memberDeployments({
	war,
	members,
}: MemberDeploymentsParams): CoalitionMember[] {
	return members.map((member) => ({
		nation: member.nation,
		force: war.deployed[member.nation] ?? 0,
	}))
}

// Each member's relation from its coalition's lead (the first member), or -1
// for the lead itself.
function leadRelations({ state, coalitions }: LeadRelationsParams): number[] {
	return coalitions.flatMap(({ members }) =>
		members.map((member) =>
			member.nation === members[0].nation
				? -1
				: STATE.getRelation({
						state,
						a: members[0].nation,
						b: member.nation,
					}),
		),
	)
}

function deploymentsOf({
	state,
	war,
	attackers,
	defenders,
}: DeploymentsOfParams): BattleDeployments {
	const attacking = memberDeployments({ war, members: attackers.members })
	const defending = memberDeployments({ war, members: defenders.members })
	return {
		attackerDeployed: totalForce(attacking),
		defenderDeployed: totalForce(defending),
		deployments: [...attacking, ...defending],
		relations: leadRelations({ state, coalitions: [attackers, defenders] }),
	}
}

function recordArmies({ state }: RecordArmiesParams): void {
	for (let p = 0; p < state.P; p++)
		if (!state.desolate[p] && STATE.isSovereign({ state, p }))
			state.armySizeCurrent[p] = armySize({ state, nation: p })
}

function mobilize({ state, war }: MobilizeParams): void {
	logCoalition({ state, war })
	const coalitions = [
		coalition({ state, war, side: "attacker" }),
		coalition({ state, war, side: "defender" }),
	]
	const members = coalitions.flatMap((side) => side.members)
	state.events.push({
		tag: "war mobilized",
		time: state.time,
		data: {
			war: war.idx,
			deployedNations: members.map((member) => member.nation),
			deployedTroops: members.map((member) => Math.round(member.force)),
			deployedRelations: leadRelations({ state, coalitions }),
		},
	})
}

function fight({
	state,
	war,
	eventAttacker,
	defense,
	rng,
}: FightParams): BattleResult {
	const attackerSide = eventAttacker === war.attacker ? "attacker" : "defender"
	const attackers = coalition({ state, war, side: attackerSide })
	const defenders = coalition({
		state,
		war,
		side: attackerSide === "attacker" ? "defender" : "attacker",
	})
	const attackerArmy = totalForce(attackers.members)
	const defenderArmy = totalForce(defenders.members)
	if (attackerArmy <= 0 || defenderArmy <= 0) {
		const outcome =
			attackerArmy <= 0 && defenderArmy <= 0 ? "empty" : "uncontested"
		const attackerWon = attackerArmy > 0
		return {
			outcome,
			initialOutcome: outcome,
			attackerWon,
			preBattleWinProbability: attackerWon ? 1 : 0,
			powerShare: attackerWon ? 1 : 0,
			attackerArmy,
			defenderArmy,
			...deploymentsOf({ state, war, attackers, defenders }),
			attackerLossShare: 0,
			defenderLossShare: 0,
			loserShortfall: 0,
		}
	}
	const defended = defenderArmy * defense
	const u = MATH.clamp({
		value: rng.random(),
		lo: ROLL_EPSILON,
		hi: 1 - ROLL_EPSILON,
	})
	const roll =
		Math.log(attackerArmy / defended) + Math.log(u / (1 - u)) / BATTLE_EXPONENT
	const attackerWon = roll > 0
	const balance = 1 / (1 + Math.exp(-roll))
	const margin = Math.abs(roll)
	const attackerCasualties =
		attackerArmy * BATTLE_LOSS_SCALE * (1 - balance) ** BATTLE_LOSS_EXPONENT
	const defenderCasualties =
		defenderArmy * BATTLE_LOSS_SCALE * balance ** BATTLE_LOSS_EXPONENT
	const loserArmy = attackerWon ? defenderArmy : attackerArmy
	const loserCasualties = attackerWon ? defenderCasualties : attackerCasualties
	const loserShortfall = attackerWon ? defenders.shortfall : attackers.shortfall
	const routScore =
		loserCasualties / loserArmy +
		ROUT_MARGIN_WEIGHT * margin +
		ROUT_SHORTFALL_WEIGHT * loserShortfall
	const routed =
		rng.random() <
		1 / (1 + Math.exp(-ROUT_STEEPNESS * (routScore - ROUT_MIDPOINT)))
	const pursuit = routed
		? rng.uniform(PURSUIT_MIN, PURSUIT_MAX) * (loserArmy - loserCasualties)
		: 0
	const attackerLosses = attackerCasualties + (attackerWon ? 0 : pursuit)
	const defenderLosses = defenderCasualties + (attackerWon ? pursuit : 0)
	for (const [nation, losses] of applyLosses({
		state,
		members: attackers.members,
		losses: attackerLosses,
	}))
		war.deployed[nation] = Math.max(0, (war.deployed[nation] ?? 0) - losses)
	for (const [nation, losses] of applyLosses({
		state,
		members: defenders.members,
		losses: defenderLosses,
	}))
		war.deployed[nation] = Math.max(0, (war.deployed[nation] ?? 0) - losses)
	const initialOutcome = battleOutcome(margin)
	return {
		outcome: routed ? "rout" : initialOutcome,
		initialOutcome,
		attackerWon,
		preBattleWinProbability:
			1 - forceShare({ a: attackerArmy, b: defended, k: BATTLE_EXPONENT }),
		powerShare: balance,
		attackerArmy,
		defenderArmy,
		...deploymentsOf({ state, war, attackers, defenders }),
		attackerLossShare: attackerLosses / attackerArmy,
		defenderLossShare: defenderLosses / defenderArmy,
		loserShortfall,
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
	const loserBudget = TREASURY_BUDGET.get({ state, p: loser })
	loserBudget.plunder -= treasuryLoot
	loserBudget.otherChangesTotal -= treasuryLoot
	const crownLoot =
		(outputLoot + treasuryLoot) *
		CROWN_LOOT_SHARE[ECONOMY.armyTradition({ state, p: raider })]
	FIELDS.prov.treasury.set({
		state,
		p: raider,
		value: FIELDS.prov.treasury.get({ state, p: raider }) + crownLoot,
	})
	const raiderBudget = TREASURY_BUDGET.get({ state, p: raider })
	raiderBudget.plunder += crownLoot
	raiderBudget.otherChangesTotal += crownLoot
	return crownLoot
}

function raid({
	state,
	raider,
	victim,
	province,
	rng,
}: RaidParams): RaidResult {
	const raiderParty = armySize({ state, nation: raider }) * RAID_PARTY_SHARE
	const response = force({ state, nation: victim }) * RESPONSE_SHARE
	const attack = Math.max(MIN_FORCE, raiderParty)
	const defense = Math.max(MIN_FORCE, response * DEFENDER_BONUS)
	const success =
		rng.random() < 1 - forceShare({ a: attack, b: defense, k: RAID_EXPONENT })
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
		tradition === "settled" &&
		FIELDS.prov.treasury.get({ state, p: nation }) <
			-EXHAUSTION_DEBT_YEARS *
				Math.max(0, ECONOMY.surplus({ state, p: nation }))
	)
}

export const MILITARY = {
	armySize,
	atWar,
	upkeep,
	plunder,
	raid,
	threat,
	rebellionThreat,
	mobilize,
	logCoalition,
	recordArmies,
	fight,
	exhausted,
}
