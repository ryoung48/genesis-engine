import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { CONQUEST } from "@/model/history/sim/engine/events/battle/conquest"
import { BATTLE_KIND } from "@/model/history/sim/engine/events/battle/kind"
import { SIEGE_TROOPS } from "@/model/history/sim/engine/events/siege/troops"
import type {
	EndParams,
	FinishParams,
	LogBeatParams,
	Shortage,
	SiegeParams,
	TickParams,
} from "@/model/history/sim/engine/events/siege/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { DEPLOYMENTS } from "@/model/history/sim/engine/military/deployments"
import { STATE } from "@/model/history/sim/engine/state"
import { TERRAIN } from "@/model/history/sim/engine/terrain"

const SIEGE_PHASE_DAYS = 30
const DAY_MS = 86_400_000
const SIEGE_ATTRITION_MONTHLY = 0.01
const SIEGE_ABANDON_SHARE = 0.75
const SIEGE_GATES_CHANCE = 0.01
const SIEGE_WEARING_PHASES = 2
const SIEGE_MAX_PHASES = 48
const SORTIE_PARTY_SHARE = 0.2
const SORTIE_MAX_RATIO = 3
const SORTIE_BASE_CHANCE = 0.1
const SORTIE_PER_BREACH = 0.1
const SORTIE_CAP = 0.4
const SORTIE_DISRUPTION = 0.03
const DISEASE_LOSS = 0.04
const SHORTAGE_LOSS = { supplies: 0.03, food: 0.05, water: 0.05 }
const BREACH_GARRISON_LOSS = 0.02
const DESERTION_LOSS = 0.1
const ASSAULT_MIN_RATIO = 1.5
const SIEGE_DESPERATION = 0.15
const ASSAULT_WALL_BONUS = 1.5
const RELIEF_CHANCE = 0.06
const RELIEF_MIN_RATIO = 0.25
const STORM_URBAN_LOSS = 0.1

function snapshot(params: SiegeParams) {
	const { state, war, siege } = params
	return {
		war: war.idx,
		province: siege.province,
		besiegers: MILITARY.totalTroops(SIEGE_TROOPS.besiegersOf(params)),
		garrisonTroops: MILITARY.totalTroops(SIEGE_TROOPS.garrisonOf(siege)),
		...MILITARY.deploymentData({
			state,
			war,
			attackerSide: siege.besiegerSide,
		}),
	}
}
function queue({ state, war }: SiegeParams): void {
	state.heap.enqueue(
		state.time + SIEGE_PHASE_DAYS * DAY_MS,
		EVENT_HEAP.evt.SIEGE,
		war.idx,
	)
}
function begin(params: SiegeParams): void {
	const { state, war, siege } = params
	war.siege = siege
	MILITARY.logCoalition({ state })
	state.events.push({
		tag: "siege started",
		time: state.time,
		data: {
			...snapshot(params),
			besieger: siege.besieger,
			defender: SIEGE_TROOPS.defenderOf(params),
		},
	})
	queue(params)
}
function end({ state, war, outcome, reason }: EndParams): void {
	const siege = war.siege
	if (siege === null) return
	MILITARY.logCoalition({ state })
	state.events.push({
		tag: "siege ended",
		time: state.time,
		data: {
			...snapshot({ state, war, siege }),
			outcome,
			reason,
			phases: siege.phase,
			besiegerLosses: 0,
			garrisonLosses: 0,
		},
	})
	war.siege = null
}
function finish(params: FinishParams): void {
	const { state, war, siege, outcome, reason, rng } = params
	const fall = outcome !== "lifted" && outcome !== "relieved"
	const defender = SIEGE_TROOPS.defenderOf(params)
	end({ state, war, outcome, reason })
	if (outcome === "stormed")
		FIELDS.prov.population.urban.set({
			state,
			p: siege.province,
			value: state.popUrbanCurrent[siege.province] * (1 - STORM_URBAN_LOSS),
		})
	CONQUEST.apply({
		state,
		war,
		attacker: siege.besieger,
		defender,
		province: siege.province,
		attackerWon: fall,
		outcome: fall ? "normal" : "inconclusive",
		sack: outcome === "stormed",
		record: () => undefined,
		rng,
	})
}

function logBeat({
	state,
	war,
	siege,
	beat,
	besiegerLosses,
	garrisonLosses,
}: LogBeatParams): void {
	MILITARY.logCoalition({ state })
	state.events.push({
		tag: "siege beat",
		time: state.time,
		data: {
			...snapshot({ state, war, siege }),
			...beat,
			phase: siege.phase,
			besiegerLosses,
			garrisonLosses,
		},
	})
}

function tick({ state, warIdx, rng }: TickParams): void {
	const war = state.wars[warIdx]
	if (war.endTime !== undefined || war.siege === null) return
	const siege = war.siege
	const params = { state, war, siege }
	const defender = SIEGE_TROOPS.defenderOf(params)
	const restoration = siege.besiegerSide === "defender"
	if (
		!STATE.isSovereign({ state, p: war.attacker }) ||
		!STATE.isSovereign({ state, p: war.defender }) ||
		(restoration
			? state.occupationCurrent[siege.province] !== war.idx
			: state.occupationCurrent[siege.province] === war.idx ||
				STATE.getSovereign({ state, p: siege.province }) !== defender)
	) {
		finish({ ...params, outcome: "lifted", reason: "invalid", rng })
		return
	}
	MILITARY.logCoalition({ state })
	const defendingMembers = new Set(
		DEPLOYMENTS.sideMembers({
			state,
			war,
			side: restoration ? "attacker" : "defender",
		}),
	)
	for (const id of Object.keys(siege.garrison).map(Number)) {
		if (!defendingMembers.has(id)) {
			delete siege.garrison[id]
			continue
		}
		for (const type of ["levy", "regular"] as const)
			siege.garrison[id][type] = Math.min(
				siege.garrison[id][type],
				war.deployed[id]?.[type] ?? 0,
			)
	}
	if (siege.phase >= SIEGE_MAX_PHASES) {
		finish({ ...params, outcome: "lifted", reason: "besiegers spent", rng })
		return
	}
	siege.phase++
	let troopsMoved = false
	let besiegers = SIEGE_TROOPS.besiegersOf(params)
	SIEGE_TROOPS.lose({
		...params,
		members: besiegers,
		losses: MILITARY.totalTroops(besiegers) * SIEGE_ATTRITION_MONTHLY,
		garrison: false,
	})
	const capitulate = () =>
		finish({
			...params,
			outcome: siege.shortages.length > 0 ? "starved out" : "surrendered",
			reason: null,
			rng,
		})
	besiegers = SIEGE_TROOPS.besiegersOf(params)
	let garrison = SIEGE_TROOPS.garrisonOf(siege)
	if (SIEGE_TROOPS.empty(besiegers)) {
		finish({ ...params, outcome: "lifted", reason: "besiegers spent", rng })
		return
	}
	if (SIEGE_TROOPS.empty(garrison)) {
		capitulate()
		return
	}
	let ratio = MILITARY.totalForce(besiegers) / MILITARY.totalForce(garrison)
	if (ratio < SIEGE_ABANDON_SHARE) {
		finish({ ...params, outcome: "lifted", reason: "besiegers spent", rng })
		return
	}
	if (rng.random() < SIEGE_GATES_CHANCE) {
		logBeat({
			...params,
			beat: { beat: "gates opened" },
			besiegerLosses: 0,
			garrisonLosses: 0,
		})
		finish({ ...params, outcome: "betrayed", reason: null, rng })
		return
	}
	const modifier =
		(ratio < 1.25 ? -2 : ratio < 2 ? 0 : ratio < 3 ? 1 : ratio < 6 ? 2 : 3) +
		2 * siege.breaches +
		siege.shortages.length +
		Math.floor((siege.phase - 1) / SIEGE_WEARING_PHASES)
	const roll = Math.floor(rng.random() * 20) + 1 + modifier
	if (roll >= 20) {
		logBeat({
			...params,
			beat: { beat: "surrender" },
			besiegerLosses: 0,
			garrisonLosses: 0,
		})
		capitulate()
		return
	}
	if (roll === 4 || roll === 5) {
		const loss = SIEGE_TROOPS.lose({
			...params,
			members: besiegers,
			losses: MILITARY.totalTroops(besiegers) * DISEASE_LOSS,
			garrison: false,
		})
		logBeat({
			...params,
			beat: { beat: "disease" },
			besiegerLosses: loss,
			garrisonLosses: 0,
		})
		troopsMoved = true
	} else if (roll >= 10 && roll <= 15) {
		const shortage: Shortage =
			roll <= 11 ? "supplies" : roll <= 13 ? "food" : "water"
		if (!siege.shortages.includes(shortage)) {
			siege.shortages.push(shortage)
			const loss = SIEGE_TROOPS.lose({
				...params,
				members: garrison,
				losses: MILITARY.totalTroops(garrison) * SHORTAGE_LOSS[shortage],
				garrison: true,
			})
			logBeat({
				...params,
				beat: {
					beat:
						shortage === "supplies"
							? "supplies shortage"
							: shortage === "food"
								? "food shortage"
								: "water shortage",
				},
				besiegerLosses: 0,
				garrisonLosses: loss,
			})
			troopsMoved = true
		}
	} else if (roll >= 16 && roll <= 19) {
		const breach = roll <= 17
		if (breach) siege.breaches++
		const loss = SIEGE_TROOPS.lose({
			...params,
			members: garrison,
			losses:
				MILITARY.totalTroops(garrison) *
				(breach ? BREACH_GARRISON_LOSS : DESERTION_LOSS),
			garrison: true,
		})
		logBeat({
			...params,
			beat: breach
				? { beat: "breach", breaches: siege.breaches }
				: { beat: "desertion" },
			besiegerLosses: 0,
			garrisonLosses: loss,
		})
		troopsMoved = true
	}
	if (SIEGE_TROOPS.empty(SIEGE_TROOPS.garrisonOf(siege))) {
		capitulate()
		return
	}
	const terrain = TERRAIN.battlefield({ state, p: siege.province })
	if (troopsMoved) besiegers = SIEGE_TROOPS.besiegersOf(params)
	troopsMoved = false
	garrison = SIEGE_TROOPS.garrisonOf(siege)
	ratio = MILITARY.totalForce(besiegers) / MILITARY.totalForce(garrison)
	if (
		ratio < SORTIE_MAX_RATIO &&
		rng.random() <
			Math.min(
				SORTIE_CAP,
				SORTIE_BASE_CHANCE + SORTIE_PER_BREACH * siege.breaches,
			)
	) {
		const attackers = SIEGE_TROOPS.party({
			members: garrison,
			share: SORTIE_PARTY_SHARE,
		})
		const defenders = SIEGE_TROOPS.party({
			members: besiegers,
			share: SORTIE_PARTY_SHARE,
		})
		const fight = MILITARY.clash({
			attackers,
			defenders,
			attackerShortfall: 0,
			defenderShortfall: 0,
			...BATTLE_KIND.modifiers({
				kind: "ambush",
				ambusher: "attacker",
				terrain,
			}),
			rng,
		})
		const garrisonLosses = SIEGE_TROOPS.lose({
			...params,
			members: attackers,
			losses: fight.attackerLosses,
			garrison: true,
		})
		let besiegerLosses = SIEGE_TROOPS.lose({
			...params,
			members: defenders,
			losses: fight.defenderLosses,
			garrison: false,
		})
		let effect: "breach repaired" | "works burned" | "none" = "none"
		if (fight.attackerWon && fight.outcome !== "inconclusive") {
			if (siege.breaches > 0) {
				siege.breaches--
				effect = "breach repaired"
			} else {
				effect = "works burned"
				const camp = SIEGE_TROOPS.besiegersOf(params)
				besiegerLosses += SIEGE_TROOPS.lose({
					...params,
					members: camp,
					losses: MILITARY.totalTroops(camp) * SORTIE_DISRUPTION,
					garrison: false,
				})
			}
		}
		logBeat({
			...params,
			beat: {
				beat: "sortie",
				won: fight.attackerWon,
				outcome: fight.outcome,
				powerShare: fight.powerShare,
				effect,
			},
			besiegerLosses,
			garrisonLosses,
		})
		troopsMoved = true
		if (SIEGE_TROOPS.empty(SIEGE_TROOPS.garrisonOf(siege))) {
			capitulate()
			return
		}
	}
	if (troopsMoved) besiegers = SIEGE_TROOPS.besiegersOf(params)
	garrison = SIEGE_TROOPS.garrisonOf(siege)
	ratio = MILITARY.totalForce(besiegers) / MILITARY.totalForce(garrison)
	if (
		ratio >= ASSAULT_MIN_RATIO &&
		rng.random() <
			Math.min(
				0.9,
				0.3 * siege.breaches +
					(MILITARY.totalForce(besiegers) <
					(1 - SIEGE_DESPERATION) * siege.startBesiegerStrength
						? 0.5
						: 0),
			)
	) {
		const fight = MILITARY.clash({
			attackers: besiegers,
			defenders: garrison,
			attackerShortfall: 0,
			defenderShortfall: 0,
			attackerMultiplier: 1,
			defenderMultiplier:
				terrain.defense *
				Math.max(1, ASSAULT_WALL_BONUS - 0.15 * siege.breaches),
			rng,
		})
		const besiegerLosses = SIEGE_TROOPS.lose({
			...params,
			members: besiegers,
			losses: fight.attackerLosses,
			garrison: false,
		})
		const garrisonLosses = SIEGE_TROOPS.lose({
			...params,
			members: garrison,
			losses: fight.defenderLosses,
			garrison: true,
		})
		const effect =
			SIEGE_TROOPS.empty(SIEGE_TROOPS.garrisonOf(siege)) ||
			(fight.attackerWon && fight.outcome !== "inconclusive")
				? "stormed"
				: !fight.attackerWon
					? "repelled"
					: "none"
		logBeat({
			...params,
			beat: {
				beat: "assault",
				won: fight.attackerWon,
				outcome: fight.outcome,
				powerShare: fight.powerShare,
				effect,
			},
			besiegerLosses,
			garrisonLosses,
		})
		if (effect !== "none") {
			finish({
				...params,
				outcome: effect === "stormed" ? "stormed" : "lifted",
				reason: effect === "repelled" ? "repelled" : null,
				rng,
			})
			return
		}
		besiegers = SIEGE_TROOPS.besiegersOf(params)
	}
	const relief = MILITARY.coalition({
		state,
		war,
		side: restoration ? "attacker" : "defender",
		excluded: siege.garrison,
	}).members
	if (
		MILITARY.totalForce(relief) >=
			RELIEF_MIN_RATIO * MILITARY.totalForce(besiegers) &&
		rng.random() < RELIEF_CHANCE
	) {
		const fight = MILITARY.clash({
			attackers: relief,
			defenders: besiegers,
			attackerShortfall: 0,
			defenderShortfall: 0,
			attackerMultiplier: 1,
			defenderMultiplier: terrain.defense,
			rng,
		})
		const garrisonLosses = SIEGE_TROOPS.lose({
			...params,
			members: relief,
			losses: fight.attackerLosses,
			garrison: false,
		})
		const besiegerLosses = SIEGE_TROOPS.lose({
			...params,
			members: besiegers,
			losses: fight.defenderLosses,
			garrison: false,
		})
		const effect =
			fight.attackerWon && fight.outcome !== "inconclusive"
				? "relieved"
				: "none"
		logBeat({
			...params,
			beat: {
				beat: "relief",
				won: fight.attackerWon,
				outcome: fight.outcome,
				powerShare: fight.powerShare,
				effect,
			},
			besiegerLosses,
			garrisonLosses,
		})
		if (effect === "relieved") {
			finish({ ...params, outcome: "relieved", reason: null, rng })
			return
		}
	}
	queue(params)
}
export const SIEGE = {
	prepare: SIEGE_TROOPS.prepare,
	begin,
	end,
	tick: (params: TickParams) => {
		const war = params.state.wars[params.warIdx]
		if (war.endTime !== undefined || war.siege === null) return
		MILITARY.mutate({ state: params.state, action: () => tick(params) })
	},
}
