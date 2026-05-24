/**
 * WAR EVENT — evaluates whether a nation should start a war.
 * Port of src/model/history/events/war.ts
 */

import { provinceWars } from "../derive"
import { EVT } from "../event-heap"
import { PROV } from "../fields"
import type { HistoryRng } from "../history-rng"
import {
	createActiveWar,
	deltaMonth,
	deltaYear,
	fixConnections,
	getNationNeighbors,
	getNationProvinces,
	getProvinceNeighbors,
	getRelation,
	getRulerRelation,
	getSovereign,
	type HistoryState,
	isSovereign,
	provinceDistanceSq,
	REL,
	type Relation,
	releaseProvince,
	startWar,
	warThreat,
	wealthOptimal,
} from "../state"

/** Relation-based threshold for attack willingness */
const INTERSTATE_WAR_SEED_FRACTION = 0.025
const REBELLION_SEED_FRACTION = 0.0125

const ATTACK_THRESHOLD: Record<number, number> = {
	[REL.WAR]: 0,
	[REL.RIVAL]: 0.8,
	[REL.SUSPICIOUS]: 0.6,
	[REL.NEUTRAL]: 0.45,
	[REL.FRIENDLY]: 0.1,
	[REL.ALLY]: 0,
	[REL.VASSAL]: 0,
	[REL.OVERLORD]: 0,
	[REL.PU_SENIOR]: 0,
	[REL.PU_JUNIOR]: 0,
	[REL.NONE]: 0,
}

function nextEvent(
	state: HistoryState,
	province: number,
	rng: HistoryRng,
	years?: number,
): void {
	state.heap.enqueue(
		state.time + deltaYear(years ?? rng.uniform(5, 10)),
		EVT.WAR,
		province,
		0,
		0,
		0,
		state.time,
	)
}

function listWarTargets(
	state: HistoryState,
	nation: number,
): {
	n: number
	threshold: number
	w: number
	hasWar: boolean
	d: number
}[] {
	const wars = provinceWars(state, nation)
		.map((idx: number) => state.wars[idx])
		.filter((w) => w.endTime === undefined)

	return getNationNeighbors(state, nation).map((nb) => {
		const rel = getRelation(state, nation, nb) as Relation
		return {
			n: nb,
			threshold: ATTACK_THRESHOLD[rel] ?? 0,
			w: warThreat(state, nation, nb),
			hasWar: wars.some((w) => w.defender === nb || w.attacker === nb),
			d: provinceDistanceSq(state, nation, nb),
		}
	})
}

function getDefenderOccupationCandidates(
	state: HistoryState,
	attacker: number,
	defender: number,
): number[] {
	const attackerTerritory = new Set(getNationProvinces(state, attacker))
	return getNationProvinces(state, defender).filter((province) => {
		if (province === defender || state.occupationCurrent[province] >= 0)
			return false
		const neighbors = getProvinceNeighbors(state, province)
		return neighbors.some((neighbor) => attackerTerritory.has(neighbor))
	})
}

function pickSeededOccupationCount(params: {
	candidateCount: number
	lateStage: boolean
	rebel: boolean
	rng: HistoryRng
}): number {
	const { candidateCount, lateStage, rebel, rng } = params
	if (candidateCount <= 0) return 0

	const ratio = rebel
		? lateStage
			? rng.uniform(0.25, 0.45)
			: rng.uniform(0.12, 0.25)
		: lateStage
			? rng.uniform(0.45, 0.7)
			: rng.uniform(0.2, 0.35)
	const minimum = lateStage && !rebel ? 2 : 1
	return Math.max(
		minimum,
		Math.min(candidateCount, Math.round(candidateCount * ratio)),
	)
}

function seedWarStage(
	state: HistoryState,
	attacker: number,
	defender: number,
	rng: HistoryRng,
	rebel = false,
	forceOccupied = false,
): void {
	const occupationCandidates = getDefenderOccupationCandidates(
		state,
		attacker,
		defender,
	)
	const canOccupy = occupationCandidates.length > 0
	const progressed = forceOccupied
		? canOccupy
		: canOccupy
			? rng.random() < 0.6
			: rng.random() < 0.35
	const lateStage =
		progressed &&
		(forceOccupied && !rebel && occupationCandidates.length > 1
			? true
			: rng.random() < 0.5)
	const occupied =
		progressed && occupationCandidates.length > 0
			? rng.shuffle(occupationCandidates).slice(
					0,
					pickSeededOccupationCount({
						candidateCount: occupationCandidates.length,
						lateStage,
						rebel,
						rng,
					}),
				)
			: []
	const startTime =
		state.time -
		deltaYear(
			lateStage
				? rng.uniform(2, 5)
				: progressed
					? rng.uniform(1, 3)
					: rng.uniform(0.05, 0.75),
		)
	const nextBattleTime =
		state.time +
		(lateStage
			? deltaMonth(rng.uniform(0.25, 1.5))
			: deltaMonth(rng.uniform(1, 4)))

	createActiveWar(state, attacker, defender, rng, {
		rebel,
		startTime,
		nextBattleTime,
		occupied,
		rebellion: rebel ? { overlord: attacker, subject: defender } : undefined,
	})
}

function seedInterstateWars(state: HistoryState, rng: HistoryRng): void {
	const sovereigns: { nation: number; size: number; wealth: number }[] = []
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation] || !isSovereign(state, nation)) continue
		sovereigns.push({
			nation,
			size: getNationProvinces(state, nation).length,
			wealth: wealthOptimal(state, nation),
		})
	}
	const targetParticipants = Math.round(
		sovereigns.length * INTERSTATE_WAR_SEED_FRACTION,
	)
	if (targetParticipants <= 0) return

	const engaged = new Set<number>()
	let seededOccupiedWar = false
	const seededOrder = rng.shuffle([...sovereigns]).sort((a, b) => {
		if (b.size !== a.size) return b.size - a.size
		return b.wealth - a.wealth
	})
	for (const candidate of seededOrder) {
		const nation = candidate.nation
		if (engaged.size >= targetParticipants) break
		if (engaged.has(nation)) continue
		const targets = listWarTargets(state, nation)
			.filter((target) => !target.hasWar && !engaged.has(target.n))
			.filter((target) => {
				const relation = getRelation(state, nation, target.n)
				return (
					relation !== REL.ALLY &&
					relation !== REL.VASSAL &&
					relation !== REL.OVERLORD &&
					relation !== REL.PU_SENIOR &&
					relation !== REL.PU_JUNIOR
				)
			})
			.map((target) => ({
				...target,
				targetSize: getNationProvinces(state, target.n).length,
				targetWealth: wealthOptimal(state, target.n),
				occupationCount: getDefenderOccupationCandidates(
					state,
					nation,
					target.n,
				).length,
			}))
			.sort((a, b) => {
				const aOccupiable = a.occupationCount > 0 ? 1 : 0
				const bOccupiable = b.occupationCount > 0 ? 1 : 0
				if (aOccupiable !== bOccupiable) return bOccupiable - aOccupiable
				if (b.targetSize !== a.targetSize) return b.targetSize - a.targetSize
				if (b.targetWealth !== a.targetWealth)
					return b.targetWealth - a.targetWealth
				const aHostile = Math.max(0, a.threshold - a.w)
				const bHostile = Math.max(0, b.threshold - b.w)
				if (bHostile !== aHostile) return bHostile - aHostile
				const aBalanced = Math.abs(0.5 - a.w)
				const bBalanced = Math.abs(0.5 - b.w)
				if (aBalanced !== bBalanced) return aBalanced - bBalanced
				return a.d - b.d
			})
		const target = targets[0]
		if (!target) continue
		const forceOccupied = !seededOccupiedWar && target.occupationCount > 0
		seedWarStage(state, nation, target.n, rng, false, forceOccupied)
		if (forceOccupied) seededOccupiedWar = true
		engaged.add(nation)
		engaged.add(target.n)
	}
}

function seedRebellions(state: HistoryState, rng: HistoryRng): void {
	const directSubjects = []
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation]) continue
		const parent = PROV.parent.get(state, nation)
		if (parent < 0 || parent !== getSovereign(state, nation)) continue
		directSubjects.push(nation)
	}
	const targetRebellions = Math.round(
		directSubjects.length * REBELLION_SEED_FRACTION,
	)
	if (targetRebellions <= 0) return

	let seeded = 0
	for (const nation of rng.shuffle([...directSubjects])) {
		if (seeded >= targetRebellions) break
		const sovereignNation = getSovereign(state, nation)
		if (provinceWars(state, sovereignNation).length > 0) continue
		const threat = warThreat(state, sovereignNation, nation, nation)
		if (threat <= 0.4) continue
		releaseProvince(state, nation, rng)
		fixConnections(state, nation, rng)
		seedWarStage(state, sovereignNation, nation, rng, true)
		seeded++
	}
}

export function initWar(state: HistoryState, rng: HistoryRng): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		nextEvent(state, p, rng, rng.uniform(0, 5))
	}
	seedInterstateWars(state, rng)
	seedRebellions(state, rng)
}

export function runWar(
	state: HistoryState,
	nation: number,
	rng: HistoryRng,
): void {
	const parent = PROV.parent.get(state, nation)
	const sovereignNation = getSovereign(state, nation)
	const rulerRelation = getRulerRelation(state, nation)

	// Only independent nations can act
	if (parent < 0 && !rulerRelation) {
		const viable = listWarTargets(state, nation).filter(
			(t) => t.threshold > 0 && t.w < t.threshold && !t.hasWar,
		)

		if (viable.length > 0) {
			// Favor closer viable opponents, matching the old history model.
			viable.sort((a, b) => a.d - b.d)
			const closest = viable[0]
			if (rng.random() > closest.w) {
				startWar(state, nation, closest.n, rng)
			}
		}
	} else if (parent === sovereignNation) {
		// Direct subject of the sovereign — consider rebellion
		if (provinceWars(state, sovereignNation).length === 0) {
			const threat = warThreat(state, sovereignNation, nation, nation)
			if (threat > 0.4 && rng.random() < threat) {
				state.events.push({
					tag: "rebellion",
					time: state.time,
					data: { overlord: sovereignNation, subject: nation },
				})
				releaseProvince(state, nation, rng)
				if (rng.random() > threat) {
					startWar(state, sovereignNation, nation, rng, true)
				}
				fixConnections(state, nation, rng)
			}
		}
	}

	nextEvent(state, nation, rng)
}
