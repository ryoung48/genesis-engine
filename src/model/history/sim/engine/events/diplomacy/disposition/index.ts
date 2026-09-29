import type {
	AfterWarParams,
	DispositionPairParams,
	DispositionSetParams,
	DriftParams,
	RollParams,
	SeedParams,
	StepParams,
} from "@/model/history/sim/engine/events/diplomacy/disposition/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { Disposition } from "@/model/history/sim/engine/state/types"
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

function roll({ current, rng }: RollParams): Disposition {
	let choice = rng.random()
	for (let i = 0; i < LADDER.length; i++) {
		choice -= MATRIX[current][i]
		if (choice <= 0) return LADDER[i]
	}
	return "TRUSTED"
}

function step({ current, steps }: StepParams): Disposition {
	return LADDER[Math.max(0, Math.min(4, LADDER.indexOf(current) + steps))]
}

function drift({ state, a, b, rng, bound }: DriftParams): void {
	const current = of({ state, a, b })
	let next = roll({ current, rng })
	if (bound && LADDER.indexOf(next) < LADDER.indexOf(current)) next = current
	set({ state, a, b, value: next, cause: "drift" })
}

function afterWar({ state, war, outcome }: AfterWarParams): void {
	if (outcome === "regime change") return
	for (const leader of [war.attacker, war.defender]) {
		const overlord = STATE.diplomaticOverlord({ state, nation: leader })
		if (overlord < 0) continue
		const current = of({ state, a: leader, b: overlord })
		set({
			state,
			a: leader,
			b: overlord,
			value: step({ current, steps: war.allies.has(overlord) ? 1 : -1 }),
			cause: war.allies.has(overlord) ? "aid" : "abandoned",
		})
	}
}

export const DISPOSITION = { of, set, seed, roll, step, drift, afterWar }
