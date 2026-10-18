import { CHARACTER } from "@/model/people/character"
import type {
	CapParams,
	ChildLineageParams,
	CoupleParams,
	Lineage,
	SmoothWeightParams,
} from "@/model/people/fertility/types"
import { HEALTH } from "@/model/people/health"
import { AGEING } from "@/model/people/health/ageing"
import type { Life } from "@/model/people/health/types"
import { PERSON_KEY } from "@/model/people/keys"
import type { Pregnancy } from "@/model/people/marriage/types"
import { PERSON_STUB } from "@/model/people/stub"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const DAY = TIME.constants.dayMS
const MONTH = YEAR / 12
const GESTATION = 280 * DAY
const REST = 0.25 * YEAR
const ADULT = 16
const LAST_BIRTH = 45
const MONTHLY_SCALE = 0.0475
const COMMONER_FACTOR = 0.85
const FIRST_HEIR_BONUS = 0.3
const GIRL_CHANCE = 0.49
const SMOOTH_WEIGHT = 215
const LOSS_WEIGHTS = { miscarriage: 10, stillbirth: 3 }
const VIABLE = 180 * DAY
const MOTHER_SURVIVES = 0.5
const CHILD_LIMIT = [1, 2, 3, 5, 5, 8]
const RULER_EXTRA_CHILDREN = 2
const STANDING = { ruler: 3, house: 3, commoner: 1 }
const CHANNEL = {
	conception: 1200,
	outcome: 1201,
	twins: 1202,
	sex: 1203,
	timing: 1205,
	cap: 1206,
	survival: 1207,
	fertility: 1208,
}

function motherAgeFactor(age: number): number {
	if (age <= 25) return 1
	if (age <= 30) return 0.9
	if (age <= 35) return 0.7
	if (age <= 40) return 0.5
	if (age <= 45) return 0.33
	return 0.1
}

function fatherAgeFactor(age: number): number {
	if (age <= 35) return 1
	if (age <= 40) return 0.9
	if (age <= 50) return 0.8
	if (age <= 60) return 0.7
	if (age <= 70) return 0.6
	return 0.5
}

function smoothWeight({ health, earlier }: SmoothWeightParams): number {
	let weight = SMOOTH_WEIGHT
	if (health <= 5) weight -= 10
	if (health <= 3) weight -= 15
	if (earlier >= 2) weight += 5
	if (earlier >= 4) weight += 5
	return weight
}

function isRuler(key: string): boolean {
	return key.startsWith("R(")
}

function lineageOf(stub: ChildLineageParams["husband"]): Lineage {
	return {
		house: stub.house,
		dynasty: stub.dynasty,
		dynastyOrigin: stub.dynastyOrigin,
		home: stub.home,
	}
}

function childLineage({ husband, wife }: ChildLineageParams): Lineage {
	if (husband.house && wife.house)
		return lineageOf(isRuler(wife.key) ? wife : husband)
	if (husband.house) return lineageOf(husband)
	if (wife.house) return lineageOf(wife)
	return { house: false, dynasty: -1, dynastyOrigin: -1, home: husband.home }
}

function capOf({ husband, wife, seed }: CapParams): number {
	const ruler = isRuler(husband.key) || isRuler(wife.key)
	const standing = ruler
		? STANDING.ruler
		: husband.house || wife.house
			? STANDING.house
			: STANDING.commoner
	const lowered =
		HASH.unit({ seed, channel: CHANNEL.cap, salt: 0 }) < 0.5 ? 1 : 0
	return CHILD_LIMIT[standing] + (ruler ? RULER_EXTRA_CHILDREN : 0) - lowered
}

function baseFertility(seed: number): number {
	return 0.5 + 0.1 * HASH.unit({ seed, channel: CHANNEL.fertility, salt: 0 })
}

function conditionFertility(life: Life, timeMs: number): number {
	return (
		AGEING.effectsOfLevels(HEALTH.at({ life, timeMs }).levels)?.fertility ?? 1
	)
}

function couple({ store, marriage, anchored }: CoupleParams): void {
	const husband = PERSON_STUB.of({ store, key: marriage.husband })
	const wife = PERSON_STUB.of({ store, key: marriage.wife })
	const husbandLife = PERSON_STUB.life({ store, stub: husband })
	const wifeLife = PERSON_STUB.life({ store, stub: wife })
	const husbandCharacter = PERSON_STUB.character({ store, stub: husband })
	const wifeCharacter = PERSON_STUB.character({ store, stub: wife })
	const seed = PERSON_KEY.seed({
		worldSeed: store.worldSeed,
		key: marriage.key,
	})
	const ruler = isRuler(husband.key) || isRuler(wife.key)
	const limit = capOf({ husband, wife, seed })
	const lineage = childLineage({ husband, wife })
	const husbandFertility = baseFertility(PERSON_STUB.seedOf(store, husband.key))
	const wifeFertility = baseFertility(PERSON_STUB.seedOf(store, wife.key))
	const husbandMultiplier = CHARACTER.fertilityMultiplier(husbandCharacter)
	const wifeMultiplier = CHARACTER.fertilityMultiplier(wifeCharacter)
	marriage.pregnancies = []
	marriage.children = []
	for (const child of [...anchored].sort((a, b) => a.birthMs - b.birthMs)) {
		marriage.pregnancies.push({
			conceptionMs: child.birthMs - GESTATION,
			dueMs: child.birthMs,
			outcome: "birth",
			twins: false,
			anchored: true,
			children: [child.key],
		})
		marriage.children.push({
			key: child.key,
			birthMs: child.birthMs,
			anchored: true,
		})
	}
	const blackouts = marriage.pregnancies.map(
		(pregnancy) =>
			[
				pregnancy.conceptionMs - GESTATION - REST,
				pregnancy.dueMs + REST,
			] as const,
	)
	const until = Math.min(marriage.endMs, store.horizonMs)
	let nextFree = marriage.startMs
	let freeIndex = 0
	const livingAt = (time: number): number => {
		let living = 0
		for (const child of marriage.children) {
			if (child.birthMs > time) continue
			const stub = PERSON_STUB.of({ store, key: child.key })
			if (
				HEALTH.alive({ life: PERSON_STUB.life({ store, stub }), timeMs: time })
			)
				living++
		}
		return living
	}
	for (let month = 0; ; month++) {
		const time = marriage.startMs + month * MONTH
		if (time >= until) break
		const motherAge = (time - wife.birthMs) / YEAR
		const fatherAge = (time - husband.birthMs) / YEAR
		if (motherAge + GESTATION / YEAR >= LAST_BIRTH) break
		if (motherAge < ADULT || fatherAge < ADULT || time < nextFree) continue
		if (
			HEALTH.incapable({ life: wifeLife, timeMs: time }) ||
			HEALTH.incapable({ life: husbandLife, timeMs: time })
		)
			break
		if (blackouts.some(([from, to]) => time > from && time < to)) continue
		if (livingAt(time) >= limit) continue
		const earlier = marriage.children.filter(
			(child) => child.birthMs <= time,
		).length
		const motherFertility =
			Math.max(0, wifeFertility - 0.05 * earlier) *
			motherAgeFactor(motherAge) *
			wifeMultiplier *
			conditionFertility(wifeLife, time)
		const fatherFertility =
			husbandFertility *
			fatherAgeFactor(fatherAge) *
			husbandMultiplier *
			conditionFertility(husbandLife, time)
		const bonus = ruler && earlier === 0 ? FIRST_HEIR_BONUS : 0
		const chance =
			Math.max(
				0.01,
				Math.min(
					0.25,
					((motherFertility + fatherFertility) / 2 + bonus) * MONTHLY_SCALE,
				),
			) * (ruler ? 1 : COMMONER_FACTOR)
		if (HASH.unit({ seed, channel: CHANNEL.conception, salt: month }) >= chance)
			continue
		const health = HEALTH.value({ life: wifeLife, timeMs: time })
		const normal = smoothWeight({ health, earlier })
		let roll =
			HASH.unit({ seed, channel: CHANNEL.outcome, salt: month }) *
			(normal + LOSS_WEIGHTS.miscarriage + LOSS_WEIGHTS.stillbirth)
		const timing = HASH.unit({ seed, channel: CHANNEL.timing, salt: month })
		let outcome: Pregnancy["outcome"] = "birth"
		let duration = GESTATION
		if ((roll -= normal) >= 0) {
			if ((roll -= LOSS_WEIGHTS.miscarriage) < 0) {
				outcome = "miscarriage"
				duration = (80 + 40 * timing) * DAY
			} else {
				outcome = "stillbirth"
				duration = (180 + 20 * timing) * DAY
			}
		}
		let due = time + duration
		if (wifeLife.deathMs < due) {
			if (outcome !== "birth" || wifeLife.deathMs < time + VIABLE) break
			outcome = "childbirth death"
			due = wifeLife.deathMs
		}
		if (due > store.horizonMs) break
		nextFree = due + REST
		const pregnancy: Pregnancy = {
			conceptionMs: time,
			dueMs: due,
			outcome,
			twins: false,
			anchored: false,
			children: [],
		}
		marriage.pregnancies.push(pregnancy)
		if (outcome === "miscarriage" || outcome === "stillbirth") continue
		const twinChance = motherAge >= 25 && motherAge <= 35 ? 0.04 : 0.02
		pregnancy.twins =
			HASH.unit({ seed, channel: CHANNEL.twins, salt: month }) < twinChance
		for (let baby = 0; baby < (pregnancy.twins ? 2 : 1); baby++) {
			const key = PERSON_KEY.child({
				marriage: marriage.key,
				index: freeIndex++,
			})
			const survives =
				outcome === "birth" ||
				HASH.unit({ seed, channel: CHANNEL.survival, salt: month * 2 + baby }) <
					MOTHER_SURVIVES
			PERSON_STUB.make({
				store,
				key,
				kind: "child",
				sex:
					HASH.unit({ seed, channel: CHANNEL.sex, salt: month * 2 + baby }) <
					GIRL_CHANCE
						? 1
						: 0,
				birthMs: due,
				lineage,
				noParentCharacter: false,
				tier: -2,
				seat: -2,
				survivesMs: due,
				fixedDeathMs: survives ? null : due,
				forcedCause: survives ? null : "Died in childbirth",
			})
			pregnancy.children.push(key)
			marriage.children.push({ key, birthMs: due, anchored: false })
		}
	}
	marriage.pregnancies.sort((a, b) => a.conceptionMs - b.conceptionMs)
	marriage.children.sort((a, b) => a.birthMs - b.birthMs)
}

export const FERTILITY = { couple, smoothWeight }
