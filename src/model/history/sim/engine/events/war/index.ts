import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	GetDefenderOccupationCandidatesParams,
	InitWarParams,
	ListWarTargetsParams,
	NextEventParams,
	RunWarParams,
	SeedInterstateWarsParams,
	SeedRebellionsParams,
	SeedWarStageParams,
} from "@/model/history/sim/engine/events/war/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { type Relation, STATE } from "@/model/history/sim/engine/state"
import type { SharedRng } from "@/model/shared/random/rng"

const INTERSTATE_WAR_SEED_FRACTION = 0.025

const REBELLION_SEED_FRACTION = 0.0125

const REBELLION_THRESHOLD = 0.55

const FRONT_PROVINCES = 15

const MAX_FRONT_FACTOR = 4

const ATTACK_THRESHOLD: Record<number, number> = {
	[STATE.rel.WAR]: 0,
	[STATE.rel.RIVAL]: 0.8,
	[STATE.rel.SUSPICIOUS]: 0.6,
	[STATE.rel.NEUTRAL]: 0.45,
	[STATE.rel.FRIENDLY]: 0.1,
	[STATE.rel.ALLY]: 0,
	[STATE.rel.VASSAL]: 0,
	[STATE.rel.OVERLORD]: 0,
	[STATE.rel.PU_SENIOR]: 0,
	[STATE.rel.PU_JUNIOR]: 0,
	[STATE.rel.NONE]: 0,
	[STATE.rel.COLONY]: 0,
}

function nextEvent({ state, province, rng, years }: NextEventParams): void {
	state.heap.enqueue(
		state.time + STATE.deltaYear(years ?? rng.uniform(5, 10)),
		EVENT_HEAP.evt.WAR,
		province,
		0,
		0,
		0,
		state.time,
	)
}

function listWarTargets({ state, nation }: ListWarTargetsParams): {
	n: number
	threshold: number
	w: number
	hasWar: boolean
	d: number
}[] {
	const wars = DERIVE.provinceWars({ state, p: nation })
		.map((idx: number) => state.wars[idx])
		.filter((w) => w.endTime === undefined)
	return STATE.getNationNeighbors({ state, nation })
		.filter(
			(nb) =>
				!DERIVE.provinceWars({ state, p: nb }).some((idx) => {
					const war = state.wars[idx]
					return (
						war.rebel &&
						war.endTime === undefined &&
						war.defender === nb &&
						war.attacker !== nation
					)
				}),
		)
		.map((nb) => {
			const rel = STATE.getRelation({ state, a: nation, b: nb }) as Relation
			return {
				n: nb,
				threshold: ATTACK_THRESHOLD[rel] ?? 0,
				w: MILITARY.threat({ state, attacker: nation, defender: nb }),
				hasWar: wars.some((w) => w.defender === nb || w.attacker === nb),
				d: STATE.provinceDistanceSq({ state, a: nation, b: nb }),
			}
		})
}

function getDefenderOccupationCandidates({
	state,
	attacker,
	defender,
}: GetDefenderOccupationCandidatesParams): number[] {
	const attackerTerritory = new Set(
		STATE.getNationProvinces({ state, root: attacker }),
	)
	return STATE.getNationProvinces({ state, root: defender }).filter(
		(province) => {
			if (province === defender || state.occupationCurrent[province] >= 0)
				return false
			const neighbors = STATE.getProvinceNeighbors({ state, p: province })
			return neighbors.some((neighbor) => attackerTerritory.has(neighbor))
		},
	)
}

function pickSeededOccupationCount(params: {
	candidateCount: number
	lateStage: boolean
	rebel: boolean
	rng: SharedRng
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

function seedWarStage({
	state,
	attacker,
	defender,
	rng,
	rebel,
	forceOccupied,
}: SeedWarStageParams): void {
	const occupationCandidates = getDefenderOccupationCandidates({
		state,
		attacker,
		defender,
	})
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
		STATE.deltaYear(
			lateStage
				? rng.uniform(2, 5)
				: progressed
					? rng.uniform(1, 3)
					: rng.uniform(0.05, 0.75),
		)
	const nextBattleTime =
		state.time +
		(lateStage
			? STATE.deltaMonth(rng.uniform(0.25, 1.5))
			: STATE.deltaMonth(rng.uniform(1, 4)))

	STATE.createActiveWar({
		state,
		attacker,
		defender,
		rng,
		options: {
			rebel,
			startTime,
			nextBattleTime,
			occupied,
			rebellion: rebel ? { overlord: attacker, subject: defender } : undefined,
		},
	})
	for (const nation of [attacker, defender])
		FIELDS.prov.manpower.set({
			state,
			p: nation,
			value:
				ECONOMY.maxManpower({ state, p: nation }) *
				rng.uniform(0.5, 0.9) *
				(lateStage ? 0.7 : 1),
		})
}

function seedInterstateWars({ state, rng }: SeedInterstateWarsParams): void {
	const sovereigns: { nation: number; size: number; revenue: number }[] = []
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation] || !STATE.isSovereign({ state, p: nation }))
			continue
		sovereigns.push({
			nation,
			size: STATE.getNationProvinces({ state, root: nation }).length,
			revenue: ECONOMY.revenue({ state, p: nation }),
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
		return b.revenue - a.revenue
	})
	for (const candidate of seededOrder) {
		const nation = candidate.nation
		if (engaged.size >= targetParticipants) break
		if (engaged.has(nation)) continue
		const targets = listWarTargets({ state, nation })
			.filter((target) => !target.hasWar && !engaged.has(target.n))
			.filter((target) => {
				const relation = STATE.getRelation({ state, a: nation, b: target.n })
				return (
					relation !== STATE.rel.ALLY &&
					relation !== STATE.rel.VASSAL &&
					relation !== STATE.rel.OVERLORD &&
					relation !== STATE.rel.PU_SENIOR &&
					relation !== STATE.rel.PU_JUNIOR &&
					relation !== STATE.rel.COLONY
				)
			})
			.map((target) => ({
				...target,
				targetSize: STATE.getNationProvinces({ state, root: target.n }).length,
				targetRevenue: ECONOMY.revenue({ state, p: target.n }),
				occupationCount: getDefenderOccupationCandidates({
					state,
					attacker: nation,
					defender: target.n,
				}).length,
			}))
			.sort((a, b) => {
				const aOccupiable = a.occupationCount > 0 ? 1 : 0
				const bOccupiable = b.occupationCount > 0 ? 1 : 0
				if (aOccupiable !== bOccupiable) return bOccupiable - aOccupiable
				if (b.targetSize !== a.targetSize) return b.targetSize - a.targetSize
				if (b.targetRevenue !== a.targetRevenue)
					return b.targetRevenue - a.targetRevenue
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
		seedWarStage({
			state,
			attacker: nation,
			defender: target.n,
			rng,
			rebel: false,
			forceOccupied,
		})
		if (forceOccupied) seededOccupiedWar = true
		engaged.add(nation)
		engaged.add(target.n)
	}
}

function seedRebellions({ state, rng }: SeedRebellionsParams): void {
	const directSubjects = []
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation]) continue
		const parent = FIELDS.prov.parent.get({ state, p: nation })
		if (
			parent < 0 ||
			parent !== STATE.getSovereign({ state, p: nation }) ||
			state.seatRank[nation] === 0
		)
			continue
		directSubjects.push(nation)
	}
	const targetRebellions = Math.round(
		directSubjects.length * REBELLION_SEED_FRACTION,
	)
	if (targetRebellions <= 0) return

	let seeded = 0
	for (const nation of rng.shuffle([...directSubjects])) {
		if (seeded >= targetRebellions) break
		const sovereignNation = STATE.getSovereign({ state, p: nation })
		if (DERIVE.provinceWars({ state, p: sovereignNation }).length > 0) continue
		const threat = MILITARY.rebellionThreat({
			state,
			overlord: sovereignNation,
			subject: nation,
		})
		if (threat <= REBELLION_THRESHOLD) continue
		STATE.releaseProvince({ state, p: nation, rng })
		STATE.fixConnections({ state, nation, rng })
		seedWarStage({
			state,
			attacker: sovereignNation,
			defender: nation,
			rng,
			rebel: true,
			forceOccupied: false,
		})
		seeded++
	}
}

function initWar({ state, rng }: InitWarParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		nextEvent({ state, province: p, rng, years: rng.uniform(0, 5) })
	}
	seedInterstateWars({ state, rng })
	seedRebellions({ state, rng })
}

function runWar({ state, nation, rng }: RunWarParams): void {
	const parent = FIELDS.prov.parent.get({ state, p: nation })
	const sovereignNation = STATE.getSovereign({ state, p: nation })
	const rulerRelation = STATE.getRulerRelation({ state, nation })

	// Only independent nations can act
	if (parent < 0 && !rulerRelation) {
		const viable = listWarTargets({ state, nation }).filter(
			(t) => t.threshold > 0 && t.w < t.threshold && !t.hasWar,
		)

		if (viable.length > 0) {
			// Favor closer viable opponents, matching the old history model.
			viable.sort((a, b) => a.d - b.d)
			const closest = viable[0]
			if (rng.random() > closest.w) {
				STATE.startWar({
					state,
					attacker: nation,
					defender: closest.n,
					rng,
					rebel: false,
				})
			}
		}
	} else if (parent === sovereignNation && state.seatRank[nation] > 0) {
		// Titled direct subject of the sovereign — consider rebellion
		if (DERIVE.provinceWars({ state, p: sovereignNation }).length === 0) {
			const threat = MILITARY.rebellionThreat({
				state,
				overlord: sovereignNation,
				subject: nation,
			})
			if (threat > REBELLION_THRESHOLD && rng.random() < threat) {
				state.events.push({
					tag: "rebellion",
					time: state.time,
					data: { overlord: sovereignNation, subject: nation },
				})
				STATE.releaseProvince({ state, p: nation, rng })
				if (rng.random() > threat) {
					STATE.startWar({
						state,
						attacker: sovereignNation,
						defender: nation,
						rng,
						rebel: true,
					})
				}
				STATE.fixConnections({ state, nation, rng })
			}
		}
	}

	const frontFactor = STATE.isSovereign({ state, p: nation })
		? Math.min(
				MAX_FRONT_FACTOR,
				Math.max(
					1,
					Math.sqrt(
						STATE.getNationProvinces({ state, root: nation }).length /
							FRONT_PROVINCES,
					),
				),
			)
		: 1
	nextEvent({
		state,
		province: nation,
		rng,
		years: rng.uniform(8, 16) / frontFactor,
	})
}

export const WAR = {
	initWar,
	runWar,
}
