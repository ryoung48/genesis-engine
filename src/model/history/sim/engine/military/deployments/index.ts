import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import type {
	Assignment,
	CandidateSideParams,
	EligibleParams,
	NationParams,
	SideParams,
	StateParams,
	WarSide,
} from "@/model/history/sim/engine/military/deployments/types"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { ARMY_STRENGTH } from "@/model/history/sim/engine/military/strength"
import { STATE } from "@/model/history/sim/engine/state"

function assignments({ state, nation }: NationParams): Assignment[] {
	return (state.militaryAssignments.get(nation) ?? []).filter(
		({ war }) => war.endTime === undefined && !!war.participants[nation],
	)
}

function available({ state, nation }: NationParams): number {
	return state.levyCurrent[nation] + state.regularCurrent[nation]
}

function exhausted({ state, nation }: NationParams): boolean {
	const target = RECRUITMENT.realmTargets({ state, nation })
	const strength = available({ state, nation })
	const pending = state.militaryIntervals.get(nation)?.pending
	const treasury =
		state.treasuryCurrent[nation] -
		(pending ? pending.levy + pending.regular : 0)
	return (
		strength <= 0 ||
		target.levy + target.regular <= 0 ||
		strength < 0.25 * (target.levy + target.regular) ||
		treasury < -0.5 * Math.max(0, ECONOMY.surplus({ state, p: nation }))
	)
}

function candidates({
	state,
	leader,
	target,
	side,
	war,
}: CandidateSideParams): number[] {
	const ordinary = STATE.getWarAllies({
		state,
		nation: leader,
		target,
		type: side === "attacker" ? "offensive" : "defensive",
	})
	const rebels = war ? STATE.warSides({ war }).rebels : -1
	return [
		...new Set([...ordinary, ...(war && leader === rebels ? war.backers : [])]),
	].sort((a, b) => a - b)
}

function eligible({
	state,
	exhaustion,
	nation,
	leader,
	target,
	side,
	war,
}: EligibleParams): boolean {
	if (
		nation === leader ||
		nation === target ||
		!STATE.isSovereign({ state, p: nation })
	)
		return false
	if (
		war?.backers.includes(nation) &&
		leader !== STATE.warSides({ war }).rebels
	)
		return false
	if (!war?.backers.includes(nation)) {
		const tie = STATE.getRelation({ state, a: leader, b: nation })
		const disposition = STATE.getDisposition({ state, a: leader, b: nation })
		if (
			tie === STATE.rel.ALLY &&
			(disposition === STATE.disp.RIVAL ||
				disposition === STATE.disp.SUSPICIOUS)
		)
			return false
		if (
			tie === STATE.rel.VASSAL &&
			!VASSALAGE.answers({
				state,
				overlord: leader,
				vassal: nation,
				attacking: side === "attacker",
			})
		)
			return false
	}
	let depleted = exhaustion.get(nation)
	if (depleted === undefined) {
		depleted = exhausted({ state, nation })
		exhaustion.set(nation, depleted)
	}
	if (depleted) return false
	const pending = state.militaryIntervals.get(nation)?.pending
	const treasury =
		state.treasuryCurrent[nation] -
		(pending ? pending.levy + pending.regular : 0)
	return !!war?.participants[nation] || treasury >= 0
}

function previewSide(params: CandidateSideParams): number[] {
	const exhaustion = new Map<number, boolean>()
	return candidates(params).filter((nation) =>
		eligible({ ...params, nation, exhaustion }),
	)
}

function affected({ state }: StateParams): Set<number> {
	DERIVE.ensureHierarchyClean(state)
	const nations = new Set<number>()
	for (const idx of state.activeWarIds) {
		const war = state.wars[idx]
		if (
			state.militaryDiplomacyDirty ||
			war.candidatesHierarchyVersion !== state.hierarchyVersion
		) {
			for (const side of ["attacker", "defender"] as const)
				war.candidates[side] = candidates({
					state,
					leader: side === "attacker" ? war.attacker : war.defender,
					target: side === "attacker" ? war.defender : war.attacker,
					side,
					war,
				})
			war.candidatesHierarchyVersion = state.hierarchyVersion
		}
		for (const nation of Object.keys(war.participants))
			nations.add(Number(nation))
		for (const side of ["attacker", "defender"] as const) {
			const leader = side === "attacker" ? war.attacker : war.defender
			nations.add(leader)
			for (const nation of war.candidates[side]) nations.add(nation)
		}
	}
	return nations
}

function sideMembers({ war, side }: SideParams): number[] {
	const lead = side === "attacker" ? war.attacker : war.defender
	return Object.keys(war.participants)
		.map(Number)
		.filter((nation) => war.participants[nation] === side)
		.sort((a, b) => (a === lead ? -1 : b === lead ? 1 : a - b))
}

function reconcileParticipation({ state }: StateParams): Set<number> {
	const exhaustion = new Map<number, boolean>()
	const changed = new Set<number>()
	const desired = new Map<number, Record<number, WarSide>>()
	const refused = new Map<number, Set<number>>()
	for (const idx of state.activeWarIds) {
		const war = state.wars[idx]
		if (
			war.candidates.attacker.length === 0 &&
			war.candidates.defender.length === 0 &&
			Object.keys(war.participants).length === 2 &&
			war.participants[war.attacker] === "attacker" &&
			war.participants[war.defender] === "defender" &&
			STATE.isSovereign({ state, p: war.attacker }) &&
			STATE.isSovereign({ state, p: war.defender })
		)
			continue
		const calls = { attacker: new Set<number>(), defender: new Set<number>() }
		const refusals = new Set<number>()
		for (const side of ["attacker", "defender"] as const) {
			const leader = side === "attacker" ? war.attacker : war.defender
			const target = side === "attacker" ? war.defender : war.attacker
			if (STATE.isSovereign({ state, p: leader })) calls[side].add(leader)
			for (const nation of war.candidates[side]) {
				if (eligible({ state, nation, leader, target, side, war, exhaustion }))
					calls[side].add(nation)
				else refusals.add(nation)
			}
		}
		let membership = war.participants
		for (const nation of new Set([...calls.attacker, ...calls.defender])) {
			let side: WarSide | undefined = war.participants[nation]
			if (nation === war.attacker) side = "attacker"
			else if (nation === war.defender) side = "defender"
			else if (war.backers.includes(nation))
				side =
					STATE.warSides({ war }).rebels === war.attacker
						? "attacker"
						: "defender"
			else if (!calls.attacker.has(nation) || !calls.defender.has(nation))
				side = calls.attacker.has(nation) ? "attacker" : "defender"
			if (war.participants[nation] === side) continue
			if (membership === war.participants) membership = { ...war.participants }
			if (side) membership[nation] = side
			else delete membership[nation]
		}
		for (const key in war.participants) {
			if (calls.attacker.has(Number(key)) || calls.defender.has(Number(key)))
				continue
			if (membership === war.participants) membership = { ...war.participants }
			delete membership[Number(key)]
		}
		if (membership !== war.participants) desired.set(idx, membership)
		refused.set(idx, refusals)
	}
	for (const [idx, refusals] of refused) {
		const war = state.wars[idx]
		const membership = desired.get(idx)
		if (membership) {
			for (const key in war.participants) {
				const nation = Number(key)
				if (war.participants[nation] === membership[nation]) continue
				changed.add(nation)
				delete war.deployed[nation]
				delete war.allocation[nation]
			}
			for (const key in membership) {
				const nation = Number(key)
				if (war.participants[nation]) continue
				changed.add(nation)
				delete war.deployed[nation]
				delete war.allocation[nation]
			}
			war.participants = membership
			war.allies = new Set(
				Object.keys(membership)
					.map(Number)
					.filter(
						(nation) => nation !== war.attacker && nation !== war.defender,
					),
			)
		}
		for (const nation of refusals)
			if (!war.refusedCalls.has(nation))
				state.events.push({
					tag: "call refused",
					time: state.time,
					data: { war: idx, nation, leader: war.attacker },
				})
		war.refusedCalls = refusals
		if (membership)
			JOURNAL.coalition({
				state,
				warId: idx,
				goal: war.goal,
				attackers: sideMembers({ state, war, side: "attacker" }),
				defenders: sideMembers({ state, war, side: "defender" }),
			})
	}
	if (changed.size > 0 || state.militaryDiplomacyDirty) {
		state.militaryAssignments.clear()
		for (const idx of state.activeWarIds) {
			const war = state.wars[idx]
			for (const [key, side] of Object.entries(war.participants)) {
				const nation = Number(key)
				const assigned = state.militaryAssignments.get(nation) ?? []
				assigned.push({
					war,
					opponent: side === "attacker" ? war.defender : war.attacker,
				})
				state.militaryAssignments.set(nation, assigned)
			}
		}
	}
	return changed
}

function rebalance({ state, nation }: NationParams): void {
	const assigned = assignments({ state, nation })
	const interval = state.militaryIntervals.get(nation)
	if (!interval) return
	if (assigned.length === 0) {
		interval.reference = { levy: 0, regular: 0 }
		return
	}
	const holdings = {
		levy: state.levyCurrent[nation],
		regular: state.regularCurrent[nation],
	}
	interval.reference.levy = Math.max(interval.reference.levy, holdings.levy)
	interval.reference.regular = Math.max(
		interval.reference.regular,
		holdings.regular,
	)
	const weights = assigned.map(({ opponent }) =>
		Math.max(
			1,
			ARMY_STRENGTH.of({
				levy: state.levyCurrent[opponent],
				regular: state.regularCurrent[opponent],
			}),
		),
	)
	const total = weights.reduce((sum, weight) => sum + weight, 0)
	for (let i = 0; i < assigned.length; i++) {
		const fraction = 0.2 / assigned.length + (0.8 * weights[i]) / total
		assigned[i].war.allocation[nation] = fraction
		assigned[i].war.deployed[nation] = {
			levy: holdings.levy * fraction,
			regular: holdings.regular * fraction,
		}
	}
}

export const DEPLOYMENTS = {
	assignments,
	available,
	exhausted,
	previewSide,
	affected,
	sideMembers,
	reconcileParticipation,
	rebalance,
}
