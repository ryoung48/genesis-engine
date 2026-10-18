import { CAST } from "@/model/people/cast"
import type { Person, Pregnancy } from "@/model/people/cast/types"
import { CHARACTER } from "@/model/people/character"
import type {
	AdvanceParams,
	CanBearParams,
	CapParams,
	ChildLineageParams,
	Lineage,
	LivingParams,
	PlanBirthParams,
	SmoothWeightParams,
} from "@/model/people/fertility/types"
import { HEALTH } from "@/model/people/health"
import { AGEING } from "@/model/people/health/ageing"
import type { Life } from "@/model/people/health/types"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const DAY = TIME.constants.dayMS
const MONTH = YEAR / 12
const GESTATION = 280 * DAY
const REST = 0.25 * YEAR
const TWIN_WINDOW = 3 * DAY
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

function lineageOf(person: ChildLineageParams["husband"]): Lineage {
	return {
		house: person.house,
		dynasty: person.dynasty,
		dynastyOrigin: person.dynastyOrigin,
		home: person.home,
	}
}

function childLineage({ husband, wife }: ChildLineageParams): Lineage {
	if (husband.house && wife.house)
		return lineageOf(wife.ruler.kind === "ruler" ? wife : husband)
	if (husband.house) return lineageOf(husband)
	if (wife.house) return lineageOf(wife)
	return { house: false, dynasty: -1, dynastyOrigin: -1, home: husband.home }
}

function capOf({ husband, wife, seed }: CapParams): number {
	const ruler = husband.ruler.kind === "ruler" || wife.ruler.kind === "ruler"
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

function living({ cast, marriage, timeMs }: LivingParams): number {
	let count = 0
	for (const child of marriage.children) {
		if (child.birthMs > timeMs) continue
		const life = CAST.lifeOf({ cast, person: cast.persons[child.id] })
		if (HEALTH.alive({ life, timeMs })) count++
	}
	return count
}

function blackedOut(
	marriage: PlanBirthParams["marriage"],
	time: number,
): boolean {
	for (const pregnancy of marriage.pregnancies) {
		if (
			time > pregnancy.conceptionMs - GESTATION - REST &&
			time < pregnancy.dueMs + REST
		)
			return true
	}
	return false
}

function planned(
	cast: CanBearParams["cast"],
	husband: Person,
	wife: Person,
	dueMs: number,
): boolean {
	for (const parent of [husband, wife]) {
		if (parent.ruler.kind !== "ruler") continue
		const block = cast.blocks.get(parent.ruler.ref.rulerId)
		if (block && dueMs > block.fromMs && dueMs < block.untilMs) return true
	}
	return false
}

function twinOf(pregnancy: Pregnancy, birthMs: number): boolean {
	return (
		pregnancy.outcome === "birth" &&
		pregnancy.children.length === 1 &&
		Math.abs(pregnancy.dueMs - birthMs) < TWIN_WINDOW
	)
}

function canBear({ cast, marriage, birthMs }: CanBearParams): boolean {
	const husband = cast.persons[marriage.husband]
	const wife = cast.persons[marriage.wife]
	const conceptionMs = birthMs - GESTATION
	if (conceptionMs < marriage.startMs) return false
	if (CAST.endOf({ cast, marriage }) < birthMs) return false
	if (CAST.lifeOf({ cast, person: husband }).deathMs <= conceptionMs)
		return false
	if (CAST.lifeOf({ cast, person: wife }).deathMs < birthMs) return false
	const motherAge = (conceptionMs - wife.birthMs) / YEAR
	const fatherAge = (conceptionMs - husband.birthMs) / YEAR
	if (motherAge < ADULT || fatherAge < ADULT) return false
	if (motherAge + GESTATION / YEAR >= LAST_BIRTH) return false
	for (const pregnancy of marriage.pregnancies) {
		if (twinOf(pregnancy, birthMs)) continue
		if (
			conceptionMs < pregnancy.dueMs + REST &&
			pregnancy.conceptionMs < birthMs + REST
		)
			return false
	}
	return true
}

function planBirth({ marriage, child, birthMs }: PlanBirthParams): void {
	const twin = marriage.pregnancies.find((entry) => twinOf(entry, birthMs))
	if (twin) {
		twin.twins = true
		twin.children.push(child)
		marriage.children.push({ id: child, birthMs, planned: true })
		marriage.children.sort((a, b) => a.birthMs - b.birthMs)
		return
	}
	const pregnancy: Pregnancy = {
		conceptionMs: birthMs - GESTATION,
		dueMs: birthMs,
		outcome: "birth",
		twins: false,
		planned: true,
		children: [child],
	}
	marriage.pregnancies.push(pregnancy)
	marriage.pregnancies.sort((a, b) => a.conceptionMs - b.conceptionMs)
	marriage.children.push({ id: child, birthMs, planned: true })
	marriage.children.sort((a, b) => a.birthMs - b.birthMs)
}

function run({ cast, marriage, untilMs }: AdvanceParams): void {
	const cursor = marriage.cursor
	if (cursor.closed) return
	const husband = cast.persons[marriage.husband]
	const wife = cast.persons[marriage.wife]
	const husbandLife = CAST.lifeOf({ cast, person: husband })
	const wifeLife = CAST.lifeOf({ cast, person: wife })
	const seed = CAST.marriageSeed({ cast, id: marriage.id })
	const ruler = husband.ruler.kind === "ruler" || wife.ruler.kind === "ruler"
	const limit = capOf({ husband, wife, seed })
	const lineage = childLineage({ husband, wife })
	const husbandFertility = baseFertility(CAST.seedOf({ cast, id: husband.id }))
	const wifeFertility = baseFertility(CAST.seedOf({ cast, id: wife.id }))
	const husbandMultiplier = CHARACTER.fertilityMultiplier(husband.character)
	const wifeMultiplier = CHARACTER.fertilityMultiplier(wife.character)
	const until = Math.min(CAST.endOf({ cast, marriage }), untilMs)
	for (let month = cursor.month; ; month++) {
		const time = marriage.startMs + month * MONTH
		if (time >= until) {
			cursor.month = month
			return
		}
		const motherAge = (time - wife.birthMs) / YEAR
		const fatherAge = (time - husband.birthMs) / YEAR
		if (motherAge + GESTATION / YEAR >= LAST_BIRTH) {
			cursor.closed = true
			return
		}
		if (motherAge < ADULT || fatherAge < ADULT || time < cursor.nextFreeMs)
			continue
		if (
			HEALTH.incapable({ life: wifeLife, timeMs: time }) ||
			HEALTH.incapable({ life: husbandLife, timeMs: time })
		) {
			cursor.closed = true
			return
		}
		if (blackedOut(marriage, time)) continue
		if (living({ cast, marriage, timeMs: time }) >= limit) continue
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
			if (outcome !== "birth" || wifeLife.deathMs < time + VIABLE) {
				cursor.closed = true
				return
			}
			outcome = "childbirth death"
			due = wifeLife.deathMs
		}
		if (due > cast.horizonMs) {
			cursor.month = month
			return
		}
		if (
			outcome !== "miscarriage" &&
			outcome !== "stillbirth" &&
			planned(cast, husband, wife, due)
		)
			continue
		cursor.nextFreeMs = due + REST
		const pregnancy: Pregnancy = {
			conceptionMs: time,
			dueMs: due,
			outcome,
			twins: false,
			planned: false,
			children: [],
		}
		marriage.pregnancies.push(pregnancy)
		if (outcome === "miscarriage" || outcome === "stillbirth") continue
		const twinChance = motherAge >= 25 && motherAge <= 35 ? 0.04 : 0.02
		pregnancy.twins =
			HASH.unit({ seed, channel: CHANNEL.twins, salt: month }) < twinChance
		for (let baby = 0; baby < (pregnancy.twins ? 2 : 1); baby++) {
			const survives =
				outcome === "birth" ||
				HASH.unit({ seed, channel: CHANNEL.survival, salt: month * 2 + baby }) <
					MOTHER_SURVIVES
			const child = CAST.add({
				cast,
				spec: {
					sex:
						HASH.unit({ seed, channel: CHANNEL.sex, salt: month * 2 + baby }) <
						GIRL_CHANCE
							? 1
							: 0,
					birthMs: due,
					lineage,
					ruler: { kind: "none" },
					tier: -2,
					seat: -2,
					parents: { kind: "couple", marriage: marriage.id },
					inputs: {
						survivesMs: due,
						fixedDeathMs: survives ? null : due,
						forcedCause: survives ? null : "Died in childbirth",
					},
				},
			})
			pregnancy.children.push(child.id)
			marriage.children.push({ id: child.id, birthMs: due, planned: false })
		}
	}
}

function sortMarriage(marriage: PlanBirthParams["marriage"]): void {
	marriage.pregnancies.sort((a, b) => a.conceptionMs - b.conceptionMs)
	marriage.children.sort((a, b) => a.birthMs - b.birthMs)
}

function advance(params: AdvanceParams): void {
	run(params)
	sortMarriage(params.marriage)
}

export const FERTILITY = {
	advance,
	canBear,
	planBirth,
	sortMarriage,
	childLineage,
	smoothWeight,
	gestationMs: GESTATION,
	restMs: REST,
	lastBirth: LAST_BIRTH,
	adult: ADULT,
}
