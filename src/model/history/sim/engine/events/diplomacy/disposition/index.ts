import type {
	AfterWarParams,
	DispositionPairParams,
	DispositionSetParams,
	DriftParams,
	RollParams,
	SeedParams,
	StepParams,
	WeightsParams,
} from "@/model/history/sim/engine/events/diplomacy/disposition/types"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { LIVE_OPINION_CONTEXT } from "@/model/history/sim/engine/opinion-context"
import { STATE } from "@/model/history/sim/engine/state"
import type { Disposition } from "@/model/history/sim/engine/state/types"
import { OPINION } from "@/model/history/sim/people/opinion"
import type { WeightedValue } from "@/model/shared/random/rng"

const LADDER: Disposition[] = [
	"RIVAL",
	"SUSPICIOUS",
	"NEUTRAL",
	"FRIENDLY",
	"TRUSTED",
]
const INITIAL_POOL: ReadonlyArray<WeightedValue<Disposition>> = [
	{ v: "RIVAL", w: 3 },
	{ v: "SUSPICIOUS", w: 10 },
	{ v: "NEUTRAL", w: 57 },
	{ v: "FRIENDLY", w: 22 },
	{ v: "TRUSTED", w: 8 },
]
const MATRIX: Record<Disposition, number[]> = {
	RIVAL: [0.65, 0.25, 0.08, 0.02, 0],
	SUSPICIOUS: [0.18, 0.5, 0.22, 0.05, 0.05],
	NEUTRAL: [0.05, 0.18, 0.5, 0.15, 0.12],
	FRIENDLY: [0.02, 0.1, 0.2, 0.45, 0.23],
	TRUSTED: [0.01, 0.04, 0.1, 0.2, 0.65],
}
// A full bias scales a move across the whole ladder by half, so every
// multiplier stays within 0.5-1.5.
const TILT_STRENGTH = 0.5
const LADDER_SPAN = LADDER.length - 1

function of({ state, a, b }: DispositionPairParams): Disposition {
	return STATE.getDisposition({ state, a, b })
}

function set({ state, a, b, value, cause }: DispositionSetParams): void {
	const before = of({ state, a, b })
	if (before === value) return
	STATE.setDisposition({ state, a, b, disposition: value, cause })
}

function seed({ rng }: SeedParams): Disposition {
	return rng.weightedChoice(INITIAL_POOL) ?? "NEUTRAL"
}

// How much the people governing two realms like each other: the mean of
// their opinions of one another, or 0 when either realm has no such person.
function bias({ state, a, b }: DispositionPairParams): number {
	const first = GOVERNOR.of({ state, realm: a })
	const second = GOVERNOR.of({ state, realm: b })
	if (first < 0 || second < 0 || first === second) return 0
	const time = state.time / STATE.yearMs
	const context = LIVE_OPINION_CONTEXT.of({ state, time })
	const forward = OPINION.of({ observer: first, target: second, time, context })
	const backward = OPINION.of({
		observer: second,
		target: first,
		time,
		context,
	})
	return forward && backward ? (forward.total + backward.total) / 200 : 0
}

// The transition row: mutual liking favours moves up the ladder and mutual
// dislike moves down. No bias leaves the row untouched.
function weights({ current, bias: q }: WeightsParams): number[] {
	if (q === 0) return MATRIX[current]
	const index = LADDER.indexOf(current)
	const tilted = MATRIX[current].map(
		(weight, step) =>
			weight * (1 + (TILT_STRENGTH * q * (step - index)) / LADDER_SPAN),
	)
	const total = tilted.reduce((sum, weight) => sum + weight, 0)
	return tilted.map((weight) => weight / total)
}

function expectedStep({ current, bias: q }: WeightsParams): number {
	const index = LADDER.indexOf(current)
	return weights({ current, bias: q }).reduce(
		(sum, weight, step) => sum + weight * (step - index),
		0,
	)
}

function roll({ current, rng, bias: q }: RollParams): Disposition {
	const row = weights({ current, bias: q })
	let choice = rng.random()
	for (let i = 0; i < LADDER.length; i++) {
		choice -= row[i]
		if (choice <= 0) return LADDER[i]
	}
	return "TRUSTED"
}

function step({ current, steps }: StepParams): Disposition {
	return LADDER[Math.max(0, Math.min(4, LADDER.indexOf(current) + steps))]
}

function drift({ state, a, b, rng, bound }: DriftParams): void {
	const current = of({ state, a, b })
	const started = performance.now()
	const q = bias({ state, a, b })
	const totals = state.opinionPolitics
	totals.driftCalls++
	if (q !== 0) totals.driftBiased++
	totals.driftBands[q < -0.5 ? 0 : q < 0 ? 1 : q === 0 ? 2 : q <= 0.5 ? 3 : 4]++
	totals.driftBias += q
	totals.driftOriginalStep += expectedStep({ current, bias: 0 })
	totals.driftTiltedStep += expectedStep({ current, bias: q })
	totals.driftMs += performance.now() - started
	let next = roll({ current, rng, bias: q })
	if (bound && LADDER.indexOf(next) < LADDER.indexOf(current)) next = current
	set({ state, a, b, value: next, cause: "drift" })
}

function afterWar({ state, war, outcome }: AfterWarParams): void {
	if (outcome === "regime change" || outcome === "union") return
	for (const leader of [war.attacker, war.defender]) {
		const overlord = STATE.diplomaticOverlord({ state, nation: leader })
		if (overlord < 0) continue
		const current = of({ state, a: leader, b: overlord })
		const aided = war.allies.has(overlord)
		set({
			state,
			a: leader,
			b: overlord,
			value: step({ current, steps: aided ? 1 : -1 }),
			cause: aided ? "aid" : "abandoned",
		})
		OPINION.remember({
			people: state.people,
			observer: GOVERNOR.of({ state, realm: leader }),
			target: GOVERNOR.of({ state, realm: overlord }),
			reason: aided ? "aid" : "abandonment",
			time: state.time / STATE.yearMs,
		})
	}
}

export const DISPOSITION = {
	of,
	set,
	seed,
	bias,
	weights,
	roll,
	step,
	drift,
	afterWar,
}
