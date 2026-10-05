import { DERIVE } from "@/model/history/sim/engine/derive"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { TRUCE } from "@/model/history/sim/engine/events/peace/truce"
import { OVERTHROW } from "@/model/history/sim/engine/events/succession/overthrow"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { BACKING } from "@/model/history/sim/engine/events/war/backing"
import { REBELLION_EVALUATION } from "@/model/history/sim/engine/events/war/rebellion-evaluation"
import { SUBMISSION } from "@/model/history/sim/engine/events/war/submission"
import type {
	GetDefenderOccupationCandidatesParams,
	InitWarParams,
	ListWarTargetsParams,
	MeasureWarTargetParams,
	NextEventParams,
	RebelParams,
	RunWarParams,
	SeedInterstateWarsParams,
	SeedRebellionsParams,
	SeedWarStageParams,
	WarCandidate,
	WarTarget,
} from "@/model/history/sim/engine/events/war/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { MILITARY } from "@/model/history/sim/engine/military"
import { LIVE_OPINION_CONTEXT } from "@/model/history/sim/engine/opinion-context"
import { STATE } from "@/model/history/sim/engine/state"
import type {
	Disposition,
	StartWarParams,
} from "@/model/history/sim/engine/state/types"
import { OPINION } from "@/model/history/sim/people/opinion"
import type { SharedRng } from "@/model/shared/random/rng"

const INTERSTATE_WAR_SEED_FRACTION = 0.025

const REBELLION_SEED_FRACTION = 0.0125

const REBELLION_THRESHOLD = 0.45

// Laxity per point of the holder's opinion of the ruler: 50 points weigh as
// much as one weak crown.
const HOLDER_OPINION_LAXITY = -0.002

const FRONT_PROVINCES = 15

const MAX_FRONT_FACTOR = 4

const ATTACK_THRESHOLD: Record<Disposition, number> = {
	[STATE.disp.RIVAL]: 0.8,
	[STATE.disp.SUSPICIOUS]: 0.6,
	[STATE.disp.NEUTRAL]: 0.45,
	[STATE.disp.FRIENDLY]: 0.1,
	[STATE.disp.TRUSTED]: 0,
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

function listWarCandidates({
	state,
	nation,
}: ListWarTargetsParams): WarCandidate[] {
	const wars = DERIVE.provinceWars({ state, p: nation })
		.map((idx: number) => state.wars[idx])
		.filter((w) => w.endTime === undefined)
	return STATE.getNationNeighbors({ state, nation })
		.filter(
			(nb) =>
				!TRUCE.active({ state, a: nation, b: nb }) &&
				!DERIVE.provinceWars({ state, p: nb }).some((idx) => {
					const war = state.wars[idx]
					return (
						war.goal !== "conquest" &&
						war.endTime === undefined &&
						STATE.warSides({ war }).rebels === nb &&
						war.attacker !== nation &&
						war.defender !== nation
					)
				}),
		)
		.map((nb) => {
			const tie = STATE.getRelation({ state, a: nation, b: nb })
			const disposition = STATE.getDisposition({ state, a: nation, b: nb })
			return {
				n: nb,
				threshold: tie === STATE.rel.NONE ? ATTACK_THRESHOLD[disposition] : 0,
				hasWar: wars.some((w) => w.defender === nb || w.attacker === nb),
			}
		})
}

function measureWarTarget({
	state,
	nation,
	candidate,
}: MeasureWarTargetParams): WarTarget {
	return {
		...candidate,
		w: MILITARY.threat({ state, attacker: nation, defender: candidate.n }),
		d: Math.min(
			...STATE.getNationProvinces({ state, root: candidate.n }).map((p) =>
				STATE.provinceDistanceSq({ state, a: nation, b: p }),
			),
		),
	}
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
	goal,
	forceOccupied,
}: SeedWarStageParams): void {
	const rebel = goal !== "conquest"
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
	const nextBattleTime = state.time + STATE.deltaMonth(rng.uniform(1, 4))

	const war = STATE.createActiveWar({
		state,
		attacker,
		defender,
		rng,
		options: {
			goal,
			startTime,
			nextBattleTime,
			occupied,
			rebellion: rebel
				? { overlord: attacker, subject: defender, goal }
				: undefined,
		},
	})
	if (war.goal !== "conquest") BACKING.recruit({ state, war, rng })
	MILITARY.reconcile({ state })
	for (const nation of [attacker, defender]) {
		const fraction = rng.uniform(0.5, 0.9) * (lateStage ? 0.7 : 1)
		MILITARY.applyLosses({
			state,
			war: null,
			members: [
				{
					nation,
					force: MILITARY.armySize({ state, nation }),
					levy: state.levyCurrent[nation],
					regular: state.regularCurrent[nation],
				},
			],
			losses: MILITARY.armySize({ state, nation }) * (1 - fraction),
		})
	}
	MILITARY.reconcile({ state })
	MILITARY.mobilize({ state, war })
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
		const targets = listWarCandidates({ state, nation })
			.filter((target) => !target.hasWar && !engaged.has(target.n))
			.map((candidate) => measureWarTarget({ state, nation, candidate }))
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
			goal: "conquest",
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
			state.seatRank[nation] === 0 ||
			state.people.rulerOf[nation] < 0
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
		const preview = MILITARY.rebellionPreview({
			state,
			overlord: sovereignNation,
			subject: nation,
		})
		const threat = preview.threat
		REBELLION_EVALUATION.record({
			state,
			overlord: sovereignNation,
			subject: nation,
			seeded: true,
			succession: false,
			laxity: 0,
			holderOpinion: null,
			threshold: REBELLION_THRESHOLD,
			roll: -1,
			decision: threat <= REBELLION_THRESHOLD ? "threshold" : "accepted",
			preview,
		})
		if (threat <= REBELLION_THRESHOLD) continue
		STATE.releaseProvince({
			state,
			p: nation,
			rng,
			reason: "territorial change",
		})
		STATE.fixConnections({ state, nation, rng })
		seedWarStage({
			state,
			attacker: sovereignNation,
			defender: nation,
			rng,
			goal: "independence",
			forceOccupied: false,
		})
		seeded++
	}
}

// Armies take the field when a war is declared.
function start(params: StartWarParams): void {
	if (
		params.goal === "conquest" &&
		TRUCE.active({
			state: params.state,
			a: params.attacker,
			b: params.defender,
		})
	)
		return
	const war = STATE.startWar(params)
	if (war) {
		if (war.goal !== "conquest")
			BACKING.recruit({ state: params.state, war, rng: params.rng })
		MILITARY.reconcile({ state: params.state })
		MILITARY.mobilize({ state: params.state, war })
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

// A district breaks away when its threat clears the threshold, lowered by
// `laxity` when the crown is weak.
function rebel({
	state,
	overlord,
	subject,
	laxity,
	succession,
	rng,
}: RebelParams): boolean {
	const preview = MILITARY.rebellionPreview({ state, overlord, subject })
	const threat = preview.threat
	laxity += GOVERNOR.factor({
		attribute: "diplomacy",
		value: GOVERNOR.attribute({
			state,
			realm: overlord,
			attribute: "diplomacy",
		}),
	})
	const holder = state.people.rulerOf[subject]
	laxity += GOVERNOR.personHas({ state, person: holder, trait: "ambitious" })
		? 0.02
		: GOVERNOR.personHas({ state, person: holder, trait: "content" })
			? -0.02
			: 0
	const started = performance.now()
	const time = state.time / STATE.yearMs
	const breakdown = OPINION.of({
		observer: holder,
		target: state.people.rulerOf[overlord],
		time,
		context: LIVE_OPINION_CONTEXT.of({ state, time }),
	})
	const holderOpinion = OPINION.loyaltyOf({ breakdown })
	laxity += HOLDER_OPINION_LAXITY * holderOpinion
	state.opinionPolitics.loyaltyEvaluations++
	state.opinionPolitics.loyaltyMs += performance.now() - started
	const threshold = REBELLION_THRESHOLD - laxity
	const roll = threat <= threshold ? -1 : rng.random()
	const decision =
		threat <= threshold ? "threshold" : roll >= threat ? "random" : "accepted"
	REBELLION_EVALUATION.record({
		state,
		overlord,
		subject,
		seeded: false,
		succession,
		laxity,
		holderOpinion: breakdown ? holderOpinion : null,
		threshold,
		roll,
		decision,
		preview,
	})
	if (decision !== "accepted") return false
	const supporters = OVERTHROW.seeks({
		state,
		realm: overlord,
		holder: state.people.rulerOf[subject],
		rng,
	})
	const throne = supporters.length > 0
	state.events.push({
		tag: "rebellion",
		time: state.time,
		data: {
			overlord,
			subject,
			succession,
			goal: throne ? "throne" : "independence",
			governorDiplomacy: GOVERNOR.attribute({
				state,
				realm: overlord,
				attribute: "diplomacy",
			}),
		},
	})
	if (throne)
		STATE.releaseFaction({
			state,
			p: subject,
			supporters,
			rng,
			reason: "rebellion",
		})
	else STATE.releaseProvince({ state, p: subject, rng, reason: "rebellion" })
	if (throne)
		start({ state, attacker: subject, defender: overlord, rng, goal: "throne" })
	else if (rng.random() > threat)
		start({
			state,
			attacker: overlord,
			defender: subject,
			rng,
			goal: "independence",
		})
	else TRUCE.sign({ state, a: overlord, b: subject })
	if (throne) STATE.fixConnections({ state, nation: overlord, rng })
	else STATE.fixConnections({ state, nation: subject, rng })
	return true
}

function runWar({ state, nation, rng }: RunWarParams): void {
	const parent = FIELDS.prov.parent.get({ state, p: nation })
	const sovereignNation = STATE.getSovereign({ state, p: nation })
	const rulerRelation = STATE.getRulerRelation({ state, nation })

	// Only independent nations with a strong crown start wars
	if (parent < 0 && !rulerRelation && !REGENCY.weak({ state, realm: nation })) {
		const viable = listWarCandidates({ state, nation })
			.filter((t) => t.threshold > 0 && !t.hasWar)
			.map((candidate) => measureWarTarget({ state, nation, candidate }))
			.filter((t) => t.w < t.threshold)

		if (viable.length > 0) {
			// Favor closer viable opponents, matching the old history model.
			viable.sort((a, b) => a.d - b.d)
			const closest = viable[0]
			if (
				GOVERNOR.startsWar({
					state,
					realm: nation,
					threat: closest.w,
					roll: rng.random(),
				}) &&
				!SUBMISSION.offer({
					state,
					attacker: nation,
					defender: closest.n,
					threat: closest.w,
					rng,
				})
			) {
				start({
					state,
					attacker: nation,
					defender: closest.n,
					rng,
					goal: "conquest",
				})
			}
		}
	} else if (
		parent === sovereignNation &&
		state.seatRank[nation] > 0 &&
		state.people.rulerOf[nation] >= 0
	) {
		// A great vassal's district — consider rebellion
		if (DERIVE.provinceWars({ state, p: sovereignNation }).length === 0)
			rebel({
				state,
				overlord: sovereignNation,
				subject: nation,
				laxity: REGENCY.weak({ state, realm: sovereignNation })
					? REGENCY.laxity
					: 0,
				succession: false,
				rng,
			})
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
	start: (params: StartWarParams) =>
		MILITARY.mutate({ state: params.state, action: () => start(params) }),
	initWar: (params: InitWarParams) =>
		MILITARY.mutate({ state: params.state, action: () => initWar(params) }),
	runWar: (params: RunWarParams) =>
		MILITARY.mutate({ state: params.state, action: () => runWar(params) }),
	rebel: (params: RebelParams) =>
		MILITARY.mutate({ state: params.state, action: () => rebel(params) }),
}
