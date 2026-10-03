import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { FIELDS, RELATION_CODE } from "@/model/history/sim/engine/fields"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { DEPLOYMENTS } from "@/model/history/sim/engine/military/deployments"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { ARMY_STRENGTH } from "@/model/history/sim/engine/military/strength"
import type {
	ApplyLossesParams,
	ApplyTroopLossesParams,
	BattleDeployments,
	BattleOutcome,
	BattleResult,
	CasualtiesParams,
	ClashParams,
	ClashResult,
	Coalition,
	CoalitionMember,
	CoalitionParams,
	DeploymentDataParams,
	DeploymentsOfParams,
	FightParams,
	ForceShareParams,
	LeadRelationsParams,
	LossShareParams,
	MemberDeploymentsParams,
	MemberRolesParams,
	MobilizeParams,
	MutationParams,
	NationParams,
	PlunderParams,
	ProvinceMutationParams,
	RaidParams,
	RaidResult,
	RealmMutationParams,
	RebellionPreview,
	RebellionThreatParams,
	RecordArmiesParams,
	SideMembersParams,
	ThreatParams,
} from "@/model/history/sim/engine/military/types"
import { STATE } from "@/model/history/sim/engine/state"
import { MATH } from "@/model/shared/math/core"

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

const MIN_FORCE = 1

const SUBJECT_LEVY_SHARE = 0.9

const LEAGUE_SHARE = 0.25

const PLUNDER_OUTPUT_SHARE = 0.03

const PLUNDER_TREASURY_SHARE = 0.2

const PLUNDER_COOLDOWN_YEARS = 5

const RAID_PARTY_SHARE = 0.25

const RESPONSE_SHARE = 0.15

function realmKnowledge({ state, nation }: NationParams): number {
	return ECONOMY.realmKnowledge({ state, p: nation })
}

function logistics({ state, nation }: NationParams): number {
	return KNOWLEDGE.maxFieldArmy({
		knowledge: realmKnowledge({ state, nation }),
	})
}

function armySize({ state, nation }: NationParams): number {
	return DEPLOYMENTS.available({ state, nation })
}

function previewMember({ state, nation }: NationParams): CoalitionMember {
	const divisor = 1 + DERIVE.provinceWars({ state, p: nation }).length
	const troops = {
		levy: state.levyCurrent[nation] / divisor,
		regular: state.regularCurrent[nation] / divisor,
	}
	return { nation, ...troops, force: ARMY_STRENGTH.of(troops) }
}

// Allies and vassals fighting beside a war's lead are at war too.
function atWar({ state, nation }: NationParams): boolean {
	return DEPLOYMENTS.assignments({ state, nation }).length > 0
}

function upkeep(params: NationParams): number {
	const expense = RECRUITMENT.upkeep(params)
	return expense.levy + expense.regular
}

function logCoalition({ state }: RecordArmiesParams): void {
	reconcile({ state })
}

function sideMembers({
	state,
	nation,
	type,
	target,
}: SideMembersParams): CoalitionMember[] {
	const members = [
		previewMember({ state, nation }),
		...DEPLOYMENTS.previewSide({
			state,
			war: null,
			leader: nation,
			side: type === "offensive" ? "attacker" : "defender",
			target,
		}).map((ally) => previewMember({ state, nation: ally })),
	]
	const total = totalTroops(members)
	const cap = logistics({ state, nation })
	if (total <= cap) return members
	return members.map((member) => ({
		...member,
		force: (member.force * cap) / total,
		levy: (member.levy * cap) / total,
		regular: (member.regular * cap) / total,
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

function rebellionPreview({
	state,
	overlord,
	subject,
}: RebellionThreatParams): RebellionPreview {
	const rebelProvinces = STATE.getNationProvinces({ state, root: subject })
	const excluded = new Set(rebelProvinces)
	const crownProvinces = STATE.getNationProvinces({
		state,
		root: overlord,
	}).filter((p) => !excluded.has(p))
	const rebel = RECRUITMENT.territoryTargets({
		state,
		nation: subject,
		provinces: rebelProvinces,
	})
	const crown = RECRUITMENT.territoryTargets({
		state,
		nation: overlord,
		provinces: crownProvinces,
	})
	const league = { levy: 0, regular: 0 }
	for (const vassal of STATE.getChildren({ state, p: overlord }))
		if (
			vassal !== subject &&
			state.seatRank[vassal] > 0 &&
			state.people.rulerOf[vassal] >= 0
		) {
			const potential = RECRUITMENT.realmTargets({ state, nation: vassal })
			league.levy += potential.levy
			league.regular += potential.regular
		}
	const existingWars = DERIVE.provinceWars({ state, p: overlord }).length
	const crownStrength = Math.max(
		MIN_FORCE,
		ARMY_STRENGTH.of(crown) / (1 + existingWars),
	)
	const rebelEstimate = {
		levy: (rebel.levy + LEAGUE_SHARE * league.levy) * SUBJECT_LEVY_SHARE,
		regular:
			(rebel.regular + LEAGUE_SHARE * league.regular) * SUBJECT_LEVY_SHARE,
	}
	const rebelCount = rebelEstimate.levy + rebelEstimate.regular
	const rebelStrength = Math.max(
		MIN_FORCE,
		ARMY_STRENGTH.of(rebelEstimate) *
			(rebelCount > 0 ? Math.min(1, rebel.logistics / rebelCount) : 1),
	)
	return {
		crown,
		rebel,
		league,
		existingWars,
		crownStrength,
		rebelStrength,
		threat: forceShare({
			a: crownStrength,
			b: rebelStrength,
			k: BATTLE_EXPONENT,
		}),
	}
}

function rebellionThreat(params: RebellionThreatParams): number {
	return rebellionPreview(params).threat
}

function coalition({ state, war, side, excluded }: CoalitionParams): Coalition {
	const nation = side === "attacker" ? war.attacker : war.defender
	let intended = 0
	const members = DEPLOYMENTS.sideMembers({ state, war, side }).map(
		(participant) => {
			const deployed = war.deployed[participant] ?? { levy: 0, regular: 0 }
			const troops = {
				levy: Math.max(0, deployed.levy - (excluded[participant]?.levy ?? 0)),
				regular: Math.max(
					0,
					deployed.regular - (excluded[participant]?.regular ?? 0),
				),
			}
			const reference = state.militaryIntervals.get(participant)?.reference
			intended += reference
				? (reference.levy + reference.regular) *
					(war.allocation[participant] ?? 0)
				: 0
			return {
				nation: participant,
				force: ARMY_STRENGTH.of(troops),
				levy: troops.levy,
				regular: troops.regular,
			}
		},
	)
	const deployed = totalTroops(members)
	const shortfall =
		intended > 0
			? MATH.clamp({ value: 1 - deployed / intended, lo: 0, hi: 1 })
			: 0
	const cap = logistics({ state, nation })
	if (deployed <= cap) return { members, shortfall }
	return {
		members: members.map((member) => ({
			...member,
			force: (member.force * cap) / deployed,
			levy: (member.levy * cap) / deployed,
			regular: (member.regular * cap) / deployed,
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

function totalTroops(members: CoalitionMember[]): number {
	return members.reduce((sum, member) => sum + member.levy + member.regular, 0)
}

function casualties({ members, losses }: CasualtiesParams) {
	const total = totalTroops(members)
	const result: ApplyTroopLossesParams["losses"] = {}
	if (total <= 0 || losses <= 0) return result
	const share = Math.min(1, losses / total)
	for (const member of members)
		result[member.nation] = {
			levy: member.levy * share,
			regular: member.regular * share,
		}
	return result
}
function applyLosses({ state, war, members, losses }: ApplyLossesParams): void {
	applyTroopLosses({ state, war, losses: casualties({ members, losses }) })
}
function applyTroopLosses({
	state,
	losses,
	war,
}: ApplyTroopLossesParams): ApplyTroopLossesParams["losses"] {
	const applied: ApplyTroopLossesParams["losses"] = {}
	for (const [id, requested] of Object.entries(losses)) {
		const nation = Number(id)
		RECRUITMENT.advance({ state, nation })
		const troops = war?.deployed[nation] ?? {
			levy: state.levyCurrent[nation],
			regular: state.regularCurrent[nation],
		}
		const enrolled = troops.levy + troops.regular
		const share =
			Math.min(troops.levy, requested.levy) +
			Math.min(troops.regular, requested.regular)
		if (share <= 0 || enrolled <= 0) continue
		const interval = state.militaryIntervals.get(nation)
		const actual = { levy: 0, regular: 0 }
		for (const type of ["levy", "regular"] as const) {
			const column = type === "levy" ? state.levyCurrent : state.regularCurrent
			const loss = Math.min(
				column[nation],
				Math.min(troops[type], requested[type]),
			)
			column[nation] -= loss
			actual[type] = loss
			state.militaryTotals.casualties[type] += loss
			if (interval) interval.casualties[type] += loss
			if (war?.deployed[nation])
				war.deployed[nation][type] = Math.max(
					0,
					war.deployed[nation][type] - loss,
				)
		}
		applied[nation] = actual
		state.militaryDirty.add(nation)
		state.militaryAllocationDirty.add(nation)
		state.militaryStrengthDirty.add(nation)
		const provinces = STATE.getNationProvinces({ state, root: nation })
		const rural = provinces.reduce(
			(sum, p) => sum + state.popRuralCurrent[p],
			0,
		)
		if (rural <= 0) continue
		const scale = Math.max(0, 1 - (actual.levy + actual.regular) / rural)
		beforeRealmMutation({ state, provinces })
		for (const p of provinces) state.popRuralCurrent[p] *= scale
		afterMutation({ state })
	}
	return applied
}

function battleOutcome(margin: number): BattleOutcome {
	if (margin < INCONCLUSIVE_MARGIN) return "inconclusive"
	return margin < DECISIVE_MARGIN ? "normal" : "decisive"
}

function memberDeployments({
	war,
	nations,
}: MemberDeploymentsParams): CoalitionMember[] {
	return nations.map((nation) => {
		const troops = war.deployed[nation] ?? { levy: 0, regular: 0 }
		return {
			nation,
			force: ARMY_STRENGTH.of(troops),
			levy: troops.levy,
			regular: troops.regular,
		}
	})
}

function leadRelations({ state, coalitions }: LeadRelationsParams): number[] {
	return coalitions.flatMap(({ members }) =>
		members.map((member) =>
			member.nation === members[0].nation
				? -1
				: RELATION_CODE[
						STATE.getRelation({
							state,
							a: members[0].nation,
							b: member.nation,
						})
					],
		),
	)
}

function memberRoles({
	war,
	coalitions,
}: MemberRolesParams): ("backer" | null)[] {
	return coalitions.flatMap(({ members }) =>
		members.map((member) =>
			war.backers.includes(member.nation) ? "backer" : null,
		),
	)
}

function deploymentsOf({
	state,
	war,
	attackers,
	defenders,
}: DeploymentsOfParams): BattleDeployments {
	const attacking = memberDeployments({
		war,
		nations: attackers.members.map((member) => member.nation),
	})
	const defending = memberDeployments({
		war,
		nations: defenders.members.map((member) => member.nation),
	})
	return {
		attackerDeployed: totalTroops(attacking),
		defenderDeployed: totalTroops(defending),
		deployments: [...attacking, ...defending],
		relations: leadRelations({ state, coalitions: [attackers, defenders] }),
		roles: memberRoles({ war, coalitions: [attackers, defenders] }),
	}
}

function recordArmies({ state }: RecordArmiesParams): void {
	for (let p = 0; p < state.P; p++)
		if (!state.desolate[p] && STATE.isSovereign({ state, p }))
			state.armySizeCurrent[p] = armySize({ state, nation: p })
}

function mobilize({ state, war }: MobilizeParams): void {
	logCoalition({ state })
	state.events.push({
		tag: "war mobilized",
		time: state.time,
		data: {
			war: war.idx,
			...deploymentData({ state, war, attackerSide: "attacker" }),
		},
	})
}

function deploymentData({ state, war, attackerSide }: DeploymentDataParams) {
	const [attackers, defenders] = (
		attackerSide === "attacker"
			? (["attacker", "defender"] as const)
			: (["defender", "attacker"] as const)
	).map((side) => ({
		members: memberDeployments({
			war,
			nations: DEPLOYMENTS.sideMembers({ state, war, side }),
		}),
		shortfall: 0,
	}))
	const data = deploymentsOf({ state, war, attackers, defenders })
	return {
		deployedNations: data.deployments.map((member) => member.nation),
		deployedTroops: data.deployments.map(
			(member) => member.levy + member.regular,
		),
		deployedLevies: data.deployments.map((member) => member.levy),
		deployedRegulars: data.deployments.map((member) => member.regular),
		deployedRelations: data.relations,
		deployedRoles: data.roles,
	}
}

function clash({
	attackers,
	defenders,
	attackerShortfall,
	defenderShortfall,
	attackerMultiplier,
	defenderMultiplier,
	rng,
}: ClashParams): ClashResult {
	const attackerArmy = totalTroops(attackers)
	const defenderArmy = totalTroops(defenders)
	const attackerForce = totalForce(attackers) * attackerMultiplier
	const defenderForce = totalForce(defenders)
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
			attackerLosses: 0,
			defenderLosses: 0,
			loserShortfall: 0,
		}
	}
	const defended = defenderForce * defenderMultiplier
	const u = MATH.clamp({
		value: rng.random(),
		lo: ROLL_EPSILON,
		hi: 1 - ROLL_EPSILON,
	})
	const roll =
		Math.log(attackerForce / defended) + Math.log(u / (1 - u)) / BATTLE_EXPONENT
	const attackerWon = roll > 0
	const balance = 1 / (1 + Math.exp(-roll))
	const margin = Math.abs(roll)
	const attackerCasualties =
		attackerArmy * BATTLE_LOSS_SCALE * (1 - balance) ** BATTLE_LOSS_EXPONENT
	const defenderCasualties =
		defenderArmy * BATTLE_LOSS_SCALE * balance ** BATTLE_LOSS_EXPONENT
	const loserArmy = attackerWon ? defenderArmy : attackerArmy
	const loserCasualties = attackerWon ? defenderCasualties : attackerCasualties
	const loserShortfall = attackerWon ? defenderShortfall : attackerShortfall
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
	const initialOutcome = battleOutcome(margin)
	return {
		outcome: routed ? "rout" : initialOutcome,
		initialOutcome,
		attackerWon,
		preBattleWinProbability:
			1 - forceShare({ a: attackerForce, b: defended, k: BATTLE_EXPONENT }),
		powerShare: balance,
		attackerLosses,
		defenderLosses,
		loserShortfall,
	}
}

function fight({
	state,
	war,
	eventAttacker,
	attackerMultiplier,
	defenderMultiplier,
	rng,
}: FightParams): BattleResult {
	const attackerSide = eventAttacker === war.attacker ? "attacker" : "defender"
	const attackers = coalition({ state, war, side: attackerSide, excluded: {} })
	const defenders = coalition({
		state,
		war,
		side: attackerSide === "attacker" ? "defender" : "attacker",
		excluded: {},
	})
	const attackerArmy = totalTroops(attackers.members)
	const defenderArmy = totalTroops(defenders.members)
	const result = clash({
		attackers: attackers.members,
		defenders: defenders.members,
		attackerShortfall: attackers.shortfall,
		defenderShortfall: defenders.shortfall,
		attackerMultiplier,
		defenderMultiplier,
		rng,
	})
	applyLosses({
		state,
		war,
		members: attackers.members,
		losses: result.attackerLosses,
	})
	applyLosses({
		state,
		war,
		members: defenders.members,
		losses: result.defenderLosses,
	})
	return {
		...result,
		attackerArmy,
		defenderArmy,
		attackerLossShare:
			attackerArmy > 0 ? result.attackerLosses / attackerArmy : 0,
		defenderLossShare:
			defenderArmy > 0 ? result.defenderLosses / defenderArmy : 0,
		...deploymentsOf({ state, war, attackers, defenders }),
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
	const crownLoot = (outputLoot + treasuryLoot) * (1 / 3)
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
	const raiding = {
		nation: raider,
		levy: state.levyCurrent[raider] * RAID_PARTY_SHARE,
		regular: state.regularCurrent[raider] * RAID_PARTY_SHARE,
		force:
			ARMY_STRENGTH.of({
				levy: state.levyCurrent[raider],
				regular: state.regularCurrent[raider],
			}) * RAID_PARTY_SHARE,
	}
	const victimPreview = previewMember({ state, nation: victim })
	const responding = {
		nation: victim,
		levy: victimPreview.levy * RESPONSE_SHARE,
		regular: victimPreview.regular * RESPONSE_SHARE,
		force: victimPreview.force * RESPONSE_SHARE,
	}
	const response = responding.levy + responding.regular
	const attack = Math.max(MIN_FORCE, raiding.force)
	const defense = Math.max(MIN_FORCE, responding.force * DEFENDER_BONUS)
	const success =
		rng.random() < 1 - forceShare({ a: attack, b: defense, k: RAID_EXPONENT })
	const ratio = success ? attack / defense : defense / attack
	const loserShare = lossShare({ ratio, multiplier: 1, rng })
	const winnerShare = lossShare({ ratio: 1 / ratio, multiplier: 1, rng })
	const raiderLosses = raiderParty * (success ? winnerShare : loserShare)
	const victimLosses = response * (success ? loserShare : winnerShare)
	applyLosses({
		state,
		members: [raiding],
		losses: raiderLosses,
		war: null,
	})
	applyLosses({
		state,
		members: [responding],
		losses: victimLosses,
		war: null,
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

function exhausted(params: NationParams): boolean {
	return DEPLOYMENTS.exhausted(params)
}

function initialize({ state }: RecordArmiesParams): void {
	RECRUITMENT.initialize({ state })
	state.militaryReady = true
}

function advance(params: NationParams): void {
	RECRUITMENT.advance(params)
}

function beforeMutation({ state, nation }: NationParams): void {
	if (!state.militaryReady) return
	RECRUITMENT.advance({ state, nation })
	state.militaryDirty.add(nation)
}

function beforeProvinceMutation({ state, p }: ProvinceMutationParams): void {
	if (!state.militaryReady) return
	const nation =
		state.militaryDepth > 0
			? state.sovereignCurrent[p]
			: STATE.getSovereign({ state, p })
	if (nation >= 0) beforeMutation({ state, nation })
	let current = p
	while (current >= 0) {
		state.realmCache.delete(current)
		current = state.parentCurrent[current]
	}
}

// One pass for a whole realm (root first), equivalent to beforeProvinceMutation on each province.
function beforeRealmMutation({ state, provinces }: RealmMutationParams): void {
	if (!state.militaryReady) return
	const root = provinces[0]
	const nation =
		state.militaryDepth > 0
			? state.sovereignCurrent[root]
			: STATE.getSovereign({ state, p: root })
	if (nation >= 0) beforeMutation({ state, nation })
	for (const p of provinces) state.realmCache.delete(p)
	let current = state.parentCurrent[root]
	while (current >= 0) {
		state.realmCache.delete(current)
		current = state.parentCurrent[current]
	}
}

// One pass for the whole world, equivalent to beforeProvinceMutation on every settled province after a census bump.
function beforeCensus({ state }: RecordArmiesParams): void {
	if (!state.militaryReady) return
	DERIVE.ensureHierarchyClean(state)
	const advanced = new Uint8Array(state.P)
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const nation = state.sovereignCurrent[p]
		if (nation < 0 || advanced[nation]) continue
		advanced[nation] = 1
		beforeMutation({ state, nation })
	}
	state.realmCache.clear()
}

function afterMutation({ state }: RecordArmiesParams): void {
	if (state.militaryDepth === 0) reconcile({ state })
}

function reconcile({ state }: RecordArmiesParams): void {
	if (!state.militaryReady) return
	const touched = state.militaryTouched
	if (
		state.militaryDirty.size === 0 &&
		state.militaryAllocationDirty.size === 0 &&
		state.militaryStrengthDirty.size === 0 &&
		DEPLOYMENTS.quiet({ state, nations: touched })
	) {
		touched.clear()
		return
	}
	for (const nation of state.militaryDirty) touched.add(nation)
	for (const nation of state.militaryAllocationDirty) touched.add(nation)
	for (const nation of state.militaryStrengthDirty) touched.add(nation)
	const wars = DEPLOYMENTS.touchedWars({ state, nations: touched })
	touched.clear()
	if (
		wars.size === 0 &&
		state.militaryDirty.size === 0 &&
		state.militaryAllocationDirty.size === 0 &&
		state.militaryStrengthDirty.size === 0
	) {
		state.militaryDiplomacyDirty = false
		return
	}
	const affected = DEPLOYMENTS.affected({ state, wars })
	for (const nation of state.militaryDirty) affected.add(nation)
	for (const nation of affected) RECRUITMENT.advance({ state, nation })
	const dirty = new Set(state.militaryDirty)
	for (const nation of dirty)
		if (STATE.isSovereign({ state, p: nation }))
			RECRUITMENT.refresh({ state, nation })
	const changed = DEPLOYMENTS.reconcileParticipation({ state, wars })
	const allocation = new Set([...changed, ...state.militaryAllocationDirty])
	const rebalance = new Set(allocation)
	for (const idx of state.militaryStrengthDirty.size > 0
		? state.activeWarIds
		: []) {
		const war = state.wars[idx]
		for (const side of ["attacker", "defender"] as const) {
			const opponent = side === "attacker" ? war.defender : war.attacker
			if (state.militaryStrengthDirty.has(opponent))
				for (const nation of DEPLOYMENTS.sideMembers({ state, war, side }))
					rebalance.add(nation)
		}
	}
	for (const nation of rebalance) DEPLOYMENTS.rebalance({ state, nation })
	for (const nation of new Set([...dirty, ...rebalance]))
		if (STATE.isSovereign({ state, p: nation }))
			RECRUITMENT.refresh({ state, nation })
	state.militaryAllocationDirty.clear()
	state.militaryStrengthDirty.clear()
	state.militaryDirty.clear()
	state.militaryDiplomacyDirty = false
}

function touch({ state, nation }: NationParams): void {
	state.militaryTouched.add(nation)
}

function touchAll({ state }: RecordArmiesParams): void {
	for (const idx of state.activeWarIds)
		state.militaryTouched.add(state.wars[idx].attacker)
}

function mutate<T>({ state, action }: MutationParams<T>): T {
	if (!state.militaryReady) return action()
	const outer = state.militaryDepth === 0
	if (outer) reconcile({ state })
	state.militaryDepth++
	try {
		return action()
	} finally {
		state.militaryDepth--
		if (outer) reconcile({ state })
	}
}

function validate({ state }: RecordArmiesParams): void {
	for (const [nation, interval] of state.militaryIntervals) {
		const holdings = {
			levy: state.levyCurrent[nation],
			regular: state.regularCurrent[nation],
		}
		const assigned = DEPLOYMENTS.assignments({ state, nation })
		for (const type of ["levy", "regular"] as const) {
			for (const { war } of assigned) {
				const troops = war.deployed[nation]
				if (troops && (!Number.isFinite(troops[type]) || troops[type] < 0))
					throw new Error("Invalid " + type + " commitment in realm " + nation)
			}
			const committed = assigned.reduce(
				(sum, { war }) => sum + (war.deployed[nation]?.[type] ?? 0),
				0,
			)
			if (
				!Number.isFinite(holdings[type]) ||
				holdings[type] < 0 ||
				!Number.isFinite(interval.pending[type]) ||
				interval.pending[type] < 0 ||
				committed > holdings[type] + Math.max(1, holdings[type]) * 1e-9
			)
				throw new Error(
					"Invalid " +
						type +
						" holdings/expense/commitments in realm " +
						nation,
				)
		}
		if (STATE.isSovereign({ state, p: nation })) {
			const targets = RECRUITMENT.realmTargets({ state, nation })
			if (
				holdings.levy + holdings.regular >
				targets.safety + Math.max(1, targets.safety) * 1e-9
			)
				throw new Error("Population safety ceiling exceeded in realm " + nation)
			if (
				holdings.levy + holdings.regular >
				targets.logistics + Math.max(1, targets.logistics) * 1e-9
			)
				throw new Error("Army logistics ceiling exceeded in realm " + nation)
		}
	}
}

export const MILITARY = {
	totalTroops,
	totalForce,
	coalition,
	clash,
	casualties,
	applyTroopLosses,
	deploymentData,
	initialize,
	advance,
	reconcile,
	touch,
	touchAll,
	mutate,
	beforeMutation,
	beforeProvinceMutation,
	beforeCensus,
	afterMutation,
	validate,
	armySize,
	atWar,
	upkeep,
	plunder: (params: PlunderParams) =>
		mutate({ state: params.state, action: () => plunder(params) }),
	raid: (params: RaidParams) =>
		mutate({ state: params.state, action: () => raid(params) }),
	threat,
	rebellionThreat,
	rebellionPreview,
	mobilize,
	logCoalition,
	recordArmies,
	fight: (params: FightParams) =>
		mutate({ state: params.state, action: () => fight(params) }),
	exhausted,
	applyLosses: (params: ApplyLossesParams) =>
		mutate({ state: params.state, action: () => applyLosses(params) }),
}
