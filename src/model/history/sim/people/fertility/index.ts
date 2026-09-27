import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { PEOPLE } from "@/model/history/sim/people"
import type {
	BearParams,
	ChildCount,
	ChildDynastyParams,
	CoupleAtParams,
	CoupleParams,
	DeliverParams,
	DurationParams,
	OutcomeParams,
	PregnancyOutcome,
	SiblingsParams,
	TwinChanceParams,
	WomanParams,
} from "@/model/history/sim/people/fertility/types"
import { HEALTH } from "@/model/history/sim/people/health"

// Living children allowed per couple, by standing 0-5.
const CHILD_LIMIT = [1, 2, 3, 5, 5, 8]
const RULER_EXTRA_CHILDREN = 2
const MONTH = 1 / 12
const YEAR_DAYS = 365
const GESTATION = 280 / YEAR_DAYS
const REST = 0.25
const ADULT_AGE = 16
const LAST_BIRTH_AGE = 45
const MONTHLY_SCALE = 0.0475
const COMMONER_FACTOR = 0.85
const FIRST_HEIR_BONUS = 0.3
const GIRL_CHANCE = 0.49

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

// Highest standing among the spouses and their parents.
function standingOf({ people, mother, father }: CoupleParams): number {
	const table = people.persons
	let standing = 0
	for (const person of [
		mother,
		father,
		table.father[mother],
		table.mother[mother],
		table.father[father],
		table.mother[father],
	])
		if (person >= 0) standing = Math.max(standing, table.peak[person])
	return standing
}

function isRuler({ people, mother, father }: CoupleParams): boolean {
	const table = people.persons
	return table.throne[mother] >= 0 || table.throne[father] >= 0
}

// About half of couples, fixed per pair, stop one child short.
function capOf(params: CoupleParams): number {
	const { mother, father } = params
	const lowered =
		((Math.imul(mother + 1, 1103515245) ^ Math.imul(father + 1, 12345)) >>> 0) %
		2
	const standing = Math.min(CHILD_LIMIT.length - 1, standingOf(params))
	return (
		CHILD_LIMIT[standing] +
		(isRuler(params) ? RULER_EXTRA_CHILDREN : 0) -
		lowered
	)
}

function outcome({
	people,
	mother,
	time,
	earlier,
	rng,
}: OutcomeParams): PregnancyOutcome {
	const table = people.persons
	const band = HEALTH.band({
		birth: table.birth[mother],
		death: table.death[mother],
		time,
	})
	let normal = 215
	if (band === "Poor" || band === "Grave") normal -= 10
	if (band === "Grave") normal -= 15
	if (earlier >= 2) normal += 5
	if (earlier >= 4) normal += 5
	let roll = rng.random() * (normal + 17)
	if ((roll -= normal) < 0) return "birth"
	if ((roll -= 10) < 0) return "miscarriage"
	if ((roll -= 3) < 0) return "stillbirth"
	if ((roll -= 2) < 0) return "mother dies"
	return "mother and child die"
}

// Days from conception to the pregnancy's end.
function duration({ outcome, rng }: DurationParams): number {
	if (outcome === "miscarriage") return 80 + rng.random() * 40
	if (outcome === "stillbirth" || outcome === "mother and child die")
		return 180 + rng.random() * 20
	return GESTATION * YEAR_DAYS
}

function hadTwins({ people, woman }: WomanParams): boolean {
	const table = people.persons
	const births = new Set<number>()
	for (const child of table.children[woman]) {
		if (births.has(table.birth[child])) return true
		births.add(table.birth[child])
	}
	return false
}

function twinChance({ people, mother, age }: TwinChanceParams): number {
	let chance = age >= 25 && age <= 35 ? 0.04 : 0.02
	if (hadTwins({ people, woman: mother })) chance += 0.05
	const grandmother = people.persons.mother[mother]
	if (grandmother >= 0 && hadTwins({ people, woman: grandmother }))
		chance += 0.03
	return chance
}

function childDynasty({
	people,
	mother,
	father,
	origin,
}: ChildDynastyParams): number {
	const table = people.persons
	const [first, second] =
		origin.genderSystem === GENDER_SYSTEM.cultureGenderSystem.MATRIARCHAL
			? [mother, father]
			: [father, mother]
	return table.dynasty[first] >= 0
		? table.dynasty[first]
		: table.dynasty[second]
}

function deliver({
	people,
	mother,
	father,
	due,
	twins,
	origin,
	rng,
}: DeliverParams): void {
	const dynasty = childDynasty({ people, mother, father, origin })
	for (let i = 0; i < (twins ? 2 : 1); i++)
		PEOPLE.spawn({
			people,
			sex: rng.random() < GIRL_CHANCE ? 1 : 0,
			birth: due,
			father,
			mother,
			dynasty,
			origin,
			rng,
		})
}

function countChildren({
	people,
	mother,
	father,
	time,
}: CoupleAtParams): ChildCount {
	const table = people.persons
	let earlier = 0
	let living = 0
	let together = 0
	for (const child of table.children[mother]) {
		if (table.birth[child] > time) continue
		earlier++
		if (table.father[child] !== father) continue
		together++
		if (table.death[child] > time) living++
	}
	return { earlier, living, together }
}

// Steps month by month through [from, until), rolling conceptions and their
// outcomes. Children are created at conception with their due date as their
// birth. Returns whether the mother died in childbirth.
function bear({
	people,
	mother,
	father,
	from,
	until,
	survives,
	origin,
	rng,
}: BearParams): boolean {
	const table = people.persons
	const cap = capOf({ people, mother, father })
	const ruler = isRuler({ people, mother, father })
	for (
		let time = Math.max(from, table.nextBirth[mother]);
		time < until;
		time += MONTH
	) {
		if (table.death[mother] <= time || table.death[father] <= time) return false
		const motherAge = time - table.birth[mother]
		const fatherAge = time - table.birth[father]
		if (motherAge + GESTATION >= LAST_BIRTH_AGE) return false
		if (motherAge < ADULT_AGE || fatherAge < ADULT_AGE) continue
		const { earlier, living, together } = countChildren({
			people,
			mother,
			father,
			time,
		})
		if (living >= cap) continue
		const motherFertility =
			Math.max(0, table.fertility[mother] - 0.05 * earlier) *
			motherAgeFactor(motherAge)
		const fatherFertility = table.fertility[father] * fatherAgeFactor(fatherAge)
		const bonus = ruler && together === 0 ? FIRST_HEIR_BONUS : 0
		const chance =
			Math.max(
				0.01,
				Math.min(
					0.25,
					((motherFertility + fatherFertility) / 2 + bonus) * MONTHLY_SCALE,
				),
			) * (ruler ? 1 : COMMONER_FACTOR)
		if (rng.random() >= chance) continue
		const result = outcome({ people, mother, time, earlier, rng })
		const due = time + duration({ outcome: result, rng }) / YEAR_DAYS
		const fatal = result === "mother dies" || result === "mother and child die"
		if (fatal && due < survives) continue
		if (table.death[mother] <= due) return false
		if (result === "birth" || result === "mother dies")
			deliver({
				people,
				mother,
				father,
				due,
				twins: rng.random() < twinChance({ people, mother, age: motherAge }),
				origin,
				rng,
			})
		table.nextBirth[mother] = due + REST
		if (result !== "birth" && table.recorded[mother])
			people.log.pregnancies.push({
				mother,
				father,
				time: due,
				outcome: fatal ? "childbirth death" : result,
			})
		if (fatal) return PEOPLE.shortenLife({ people, person: mother, time: due })
		time = table.nextBirth[mother] - MONTH
	}
	return false
}

// Brothers and sisters of a child created on its own, kept clear of its
// pregnancy. The mother lives at least to the child's birth.
function siblings({ people, child, until, origin, rng }: SiblingsParams): void {
	const table = people.persons
	const mother = table.mother[child]
	const father = table.father[child]
	const birth = table.birth[child]
	const family = { people, mother, father, survives: birth, origin, rng }
	bear({
		...family,
		from: table.birth[mother] + ADULT_AGE,
		until: birth - 2 * GESTATION - REST,
	})
	table.nextBirth[mother] = Math.max(table.nextBirth[mother], birth + REST)
	bear({ ...family, from: birth, until })
}

export const FERTILITY = { bear, siblings }
