import { CHARACTER } from "@/model/people/character"
import { AGEING } from "@/model/people/health/ageing"
import { LIFESPAN } from "@/model/people/health/lifespan"
import type {
	EffectiveParams,
	HealthBand,
	Life,
	LifeAtParams,
	LifeParams,
	LifeRow,
	LifeStatus,
} from "@/model/people/health/types"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const NEWBORN_BASE = 4.5
const NEWBORN_SPAN = 0.5
const NEWBORN_FEMALE_BONUS = 0.5
const DECLINE_AGE = 25
const DECLINE_CHANCE = 0.075
const DECLINE_CHANCE_PER_YEAR = 0.022
const DECLINE_LOSS = 0.125
const THRESHOLDS = [0, 1, 3, 5, 7]
const BANDS: readonly HealthBand[] = [
	"Dying",
	"Near death",
	"Poor",
	"Fine",
	"Good",
	"Excellent",
]
const CHANNEL = { birth: 1000, ageing: 1001 }

function bandCode(health: number): number {
	let index = 0
	while (index < THRESHOLDS.length && health > THRESHOLDS[index]) index++
	return index
}

function effective({ character, base, state, age }: EffectiveParams): number {
	return Math.max(
		0,
		base +
			CHARACTER.healthModifier({ character, age }) +
			(AGEING.effects(state)?.health ?? 0),
	)
}

function deathCause({ health, age }: { health: number; age: number }): string {
	if (age < 16) return "Childhood illness"
	return health < 3 ? "Failing health" : "Illness"
}

function life({
	seed,
	character,
	birthMs,
	sex,
	survivesMs,
	fixedDeathMs,
	horizonMs,
}: LifeParams): Life {
	const state = AGEING.fresh()
	let base =
		NEWBORN_BASE +
		NEWBORN_SPAN * HASH.unit({ seed, channel: CHANNEL.birth, salt: 0 }) +
		(sex === 1 ? NEWBORN_FEMALE_BONUS : 0)
	const capUntil = fixedDeathMs ?? survivesMs
	const rows: LifeRow[] = []
	const healthByYear: number[] = []
	let health = effective({ character, base, state, age: 0 })
	let code = bandCode(health)
	rows.push({ timeMs: birthMs, kind: "band", band: BANDS[code] })
	healthByYear.push(health)
	let deathMs = Infinity
	let cause: string | null = null
	let incapableMs = Infinity
	const survivesYears = (survivesMs - birthMs) / YEAR
	for (let age = 0; ; age++) {
		const start = birthMs + age * YEAR
		if (start > horizonMs) break
		if (age >= 1) {
			const shift = AGEING.effects(state)?.ageingShift ?? 0
			const physiological = age + shift
			if (
				physiological >= DECLINE_AGE &&
				HASH.unit({ seed, channel: CHANNEL.ageing, salt: age }) <
					Math.min(
						1,
						DECLINE_CHANCE +
							DECLINE_CHANCE_PER_YEAR * (physiological - DECLINE_AGE),
					)
			)
				base -= DECLINE_LOSS
			health = effective({ character, base, state, age })
			const changes = AGEING.step({ state, seed, age, health })
			if (AGEING.heartFailed(state)) {
				if (start < capUntil) AGEING.spareHeart(state)
				else {
					for (const change of changes)
						rows.push({
							timeMs: start,
							kind: "condition",
							condition: AGEING.conditions[change.condition],
							before: change.before,
							after: change.after,
						})
					deathMs = start
					cause = "Heart failure"
					break
				}
			}
			for (const change of changes) {
				if (
					AGEING.conditions[change.condition] === "incapable" &&
					incapableMs === Infinity
				)
					incapableMs = start
				rows.push({
					timeMs: start,
					kind: "condition",
					condition: AGEING.conditions[change.condition],
					before: change.before,
					after: change.after,
				})
			}
			health = effective({ character, base, state, age })
			const next = bandCode(health)
			if (next !== code) {
				code = next
				rows.push({ timeMs: start, kind: "band", band: BANDS[code] })
			}
			healthByYear.push(health)
		}
		const end = start + YEAR
		if (fixedDeathMs !== null) {
			if (fixedDeathMs >= start && fixedDeathMs < end) {
				deathMs = Math.max(fixedDeathMs, birthMs)
				cause = "Natural causes"
				break
			}
			continue
		}
		const from = Math.max(age, survivesYears)
		if (from >= age + 1) continue
		const died = LIFESPAN.project({
			seed,
			birth: 0,
			health,
			from,
			to: age + 1,
			year: age,
		})
		if (died !== Infinity) {
			deathMs = birthMs + died * YEAR
			cause = deathCause({ health, age: died })
			break
		}
	}
	return { birthMs, rows, healthByYear, deathMs, cause, incapableMs }
}

function at({ life, timeMs }: LifeAtParams): LifeStatus {
	const levels = AGEING.levels(AGEING.fresh())
	let band: HealthBand = BANDS[0]
	for (const row of life.rows) {
		if (row.timeMs > timeMs) break
		if (row.kind === "band") band = row.band
		else {
			const index = AGEING.conditions.indexOf(
				row.condition as (typeof AGEING.conditions)[number],
			)
			levels[index] = row.after
		}
	}
	return { band: life.deathMs <= timeMs ? "Dead" : band, levels }
}

function value({ life, timeMs }: LifeAtParams): number {
	const age = Math.max(0, Math.floor((timeMs - life.birthMs) / YEAR))
	return life.healthByYear[Math.min(age, life.healthByYear.length - 1)]
}

function incapable({ life, timeMs }: LifeAtParams): boolean {
	return life.incapableMs <= timeMs
}

function alive({ life, timeMs }: LifeAtParams): boolean {
	return life.birthMs <= timeMs && life.deathMs > timeMs
}

export const HEALTH = {
	bands: BANDS,
	life,
	at,
	value,
	incapable,
	alive,
}
