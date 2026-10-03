import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import type {
	Assignment,
	CallParams,
	CandidateSideParams,
	EligibleParams,
	NationParams,
	NationsParams,
	ReadyParams,
	SameListParams,
	SideParams,
	StateParams,
	WarSide,
	WarsParams,
} from "@/model/history/sim/engine/military/deployments/types"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { ARMY_STRENGTH } from "@/model/history/sim/engine/military/strength"
import { STATE } from "@/model/history/sim/engine/state"

const NO_ASSIGNMENTS: Assignment[] = []

const participantLists = new WeakMap<Record<number, WarSide>, number[]>()

function participantNations(participants: Record<number, WarSide>): number[] {
	let nations = participantLists.get(participants)
	if (!nations) {
		nations = Object.keys(participants).map(Number)
		participantLists.set(participants, nations)
	}
	return nations
}

function assignments({ state, nation }: NationParams): Assignment[] {
	const assigned = state.militaryAssignments.get(nation)
	if (!assigned) return NO_ASSIGNMENTS
	return assigned.filter(
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

function answersCall({
	state,
	nation,
	leader,
	target,
	side,
	war,
}: CallParams): boolean {
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
	return true
}

function ready({ state, nation, war, exhaustion }: ReadyParams): boolean {
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

function eligible(params: EligibleParams): boolean {
	return answersCall(params) && ready(params)
}

function previewSide(params: CandidateSideParams): number[] {
	const exhaustion = new Map<number, boolean>()
	return candidates(params).filter((nation) =>
		eligible({ ...params, nation, exhaustion }),
	)
}

function sameList<T>({ a, b }: SameListParams<T>): boolean {
	return a.length === b.length && a.every((item, i) => item === b[i])
}

function refreshCandidates({ state }: StateParams): Set<number> {
	DERIVE.ensureHierarchyClean(state)
	const changed = new Set<number>()
	const refreshed = state.militaryCandidatesRefresh
	if (
		!state.militaryDiplomacyDirty &&
		refreshed.hierarchyVersion === state.hierarchyVersion &&
		refreshed.wars === state.wars.length
	)
		return changed
	refreshed.hierarchyVersion = state.hierarchyVersion
	refreshed.wars = state.wars.length
	const retied = state.militaryDiplomacyNations
	for (const idx of state.activeWarIds) {
		const war = state.wars[idx]
		if (
			war.candidatesHierarchyVersion === state.hierarchyVersion &&
			!retied.has(war.attacker) &&
			!retied.has(war.defender)
		)
			continue
		for (const side of ["attacker", "defender"] as const) {
			const leader = side === "attacker" ? war.attacker : war.defender
			const target = side === "attacker" ? war.defender : war.attacker
			const list = candidates({ state, leader, target, side, war })
			const callable = list.map((nation) =>
				answersCall({ state, nation, leader, target, side, war }),
			)
			if (
				war.candidatesHierarchyVersion < 0 ||
				!sameList({ a: list, b: war.candidates[side] }) ||
				!sameList({ a: callable, b: war.callable[side] })
			)
				changed.add(idx)
			war.candidates[side] = list
			war.callable[side] = callable
		}
		war.candidatesHierarchyVersion = state.hierarchyVersion
	}
	retied.clear()
	return changed
}

function indexWars({ state }: StateParams): void {
	state.militaryWarIndex.clear()
	for (const idx of state.activeWarIds) {
		const war = state.wars[idx]
		for (const nation of [
			war.attacker,
			war.defender,
			...participantNations(war.participants),
			...war.candidates.attacker,
			...war.candidates.defender,
		]) {
			const wars = state.militaryWarIndex.get(nation)
			if (!wars) state.militaryWarIndex.set(nation, [idx])
			else if (wars[wars.length - 1] !== idx) wars.push(idx)
		}
	}
	state.militaryWarIndexStale = false
}

function touchedWars({ state, nations }: NationsParams): Set<number> {
	const wars = refreshCandidates({ state })
	if (wars.size > 0) state.militaryWarIndexStale = true
	if (state.militaryWarIndexStale) indexWars({ state })
	for (const nation of nations)
		for (const idx of state.militaryWarIndex.get(nation) ?? [])
			if (state.activeWarIds.has(idx)) wars.add(idx)
	return wars
}

function affected({ state, wars }: WarsParams): Set<number> {
	const nations = new Set<number>()
	for (const idx of state.activeWarIds) {
		if (!wars.has(idx)) continue
		const war = state.wars[idx]
		for (const nation of participantNations(war.participants))
			nations.add(nation)
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

function reconcileParticipation({ state, wars }: WarsParams): Set<number> {
	const exhaustion = new Map<number, boolean>()
	const changed = new Set<number>()
	for (const idx of state.activeWarIds) {
		if (!wars.has(idx)) continue
		const war = state.wars[idx]
		const current = participantNations(war.participants)
		if (
			war.candidates.attacker.length === 0 &&
			war.candidates.defender.length === 0 &&
			current.length === 2 &&
			war.participants[war.attacker] === "attacker" &&
			war.participants[war.defender] === "defender" &&
			STATE.isSovereign({ state, p: war.attacker }) &&
			STATE.isSovereign({ state, p: war.defender })
		)
			continue
		const calls: Record<WarSide, number[]> = { attacker: [], defender: [] }
		const refusals: number[] = []
		for (const side of ["attacker", "defender"] as const) {
			const leader = side === "attacker" ? war.attacker : war.defender
			if (STATE.isSovereign({ state, p: leader })) calls[side].push(leader)
			const sideCandidates = war.candidates[side]
			const callable = war.callable[side]
			for (let i = 0; i < sideCandidates.length; i++) {
				const nation = sideCandidates[i]
				if (callable[i] && ready({ state, nation, war, exhaustion }))
					calls[side].push(nation)
				else if (!refusals.includes(nation)) refusals.push(nation)
			}
		}
		let membership = war.participants
		const called = [
			...calls.attacker,
			...calls.defender.filter((nation) => !calls.attacker.includes(nation)),
		]
		for (const nation of called) {
			let side: WarSide | undefined = war.participants[nation]
			if (nation === war.attacker) side = "attacker"
			else if (nation === war.defender) side = "defender"
			else if (war.backers.includes(nation))
				side =
					STATE.warSides({ war }).rebels === war.attacker
						? "attacker"
						: "defender"
			else if (
				!calls.attacker.includes(nation) ||
				!calls.defender.includes(nation)
			)
				side = calls.attacker.includes(nation) ? "attacker" : "defender"
			if (war.participants[nation] === side) continue
			if (membership === war.participants) membership = { ...war.participants }
			if (side) membership[nation] = side
			else delete membership[nation]
		}
		for (const nation of current) {
			if (calls.attacker.includes(nation) || calls.defender.includes(nation))
				continue
			if (membership === war.participants) membership = { ...war.participants }
			delete membership[nation]
		}
		const updated = membership !== war.participants
		if (updated) {
			state.militaryWarIndexStale = true
			for (const nation of current) {
				if (war.participants[nation] === membership[nation]) continue
				changed.add(nation)
				delete war.deployed[nation]
				delete war.allocation[nation]
			}
			for (const nation of participantNations(membership)) {
				if (war.participants[nation]) continue
				changed.add(nation)
				delete war.deployed[nation]
				delete war.allocation[nation]
			}
			war.participants = membership
			war.allies = new Set(
				participantNations(membership).filter(
					(nation) => nation !== war.attacker && nation !== war.defender,
				),
			)
		}
		let refusalsChanged = refusals.length !== war.refusedCalls.size
		for (const nation of refusals)
			if (!war.refusedCalls.has(nation)) {
				refusalsChanged = true
				state.events.push({
					tag: "call refused",
					time: state.time,
					data: { war: idx, nation, leader: war.attacker },
				})
			}
		if (refusalsChanged) war.refusedCalls = new Set(refusals)
		if (updated)
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
	RECRUITMENT.advance({ state, nation })
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
	touchedWars,
	affected,
	sideMembers,
	reconcileParticipation,
	rebalance,
}
