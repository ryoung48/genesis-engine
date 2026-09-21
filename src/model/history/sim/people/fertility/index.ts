import { PEOPLE } from "@/model/history/sim/people"
import type {
	AgeFactorParams,
	BirthParams,
	BirthResult,
	FamilyBetweenParams,
	OutcomeParams,
	Pregnancy,
	PregnancyOutcome,
	TwinChanceParams,
} from "@/model/history/sim/people/fertility/types"

const CHILD_LIMIT = [1, 2, 3, 5, 5, 8]
const MONTH = 1 / 12
const GESTATION = 280 / 365
const REST = 0.25

function ageFactor({ age, female }: AgeFactorParams): number {
	if (female) {
		if (age <= 25) return 1
		if (age <= 30) return 0.9
		if (age <= 35) return 0.7
		if (age <= 40) return 0.5
		if (age <= 45) return 0.33
		return 0.1
	}
	if (age <= 35) return 1
	if (age <= 40) return 0.9
	if (age <= 50) return 0.8
	if (age <= 60) return 0.7
	if (age <= 70) return 0.6
	return 0.5
}

function outcome({ mother, people, rng }: OutcomeParams): PregnancyOutcome {
	const persons = people.persons
	let previous = 0
	let child = persons.firstChild[mother]
	while (child >= 0) {
		previous++
		child = persons.nextSiblingMother[child]
	}
	let smooth = 215
	if (persons.health[mother] <= 40) smooth -= 10
	if (persons.health[mother] <= 24) smooth -= 15
	if (previous >= 2) smooth += 5
	if (previous >= 4) smooth += 5
	let roll = rng.random() * (smooth + 17)
	if ((roll -= smooth) < 0) return "smooth"
	if ((roll -= 10) < 0) return "early_end"
	if ((roll -= 3) < 0) return "child_dies"
	if ((roll -= 2) < 0) return "mother_dies"
	return "mother_and_child_die"
}

function twinChance({ mother, people, age }: TwinChanceParams): number {
	const persons = people.persons
	let chance = age >= 25 && age <= 35 ? 0.04 : 0.02
	for (const woman of [mother, persons.mother[mother]]) {
		if (woman < 0) continue
		const births = new Set<number>()
		let child = persons.firstChild[woman]
		while (child >= 0) {
			const date = persons.birth[child]
			if (births.has(date)) {
				chance += woman === mother ? 0.05 : 0.03
				break
			}
			births.add(date)
			child = persons.nextSiblingMother[child]
		}
	}
	return chance
}

function familyBetween({
	people,
	mother,
	father,
	from,
	to,
	standing,
	ruler,
	rng,
}: FamilyBetweenParams): Pregnancy[] {
	const persons = people.persons
	const pregnancies: Pregnancy[] = []
	const lowered =
		((Math.imul(mother + 1, 1103515245) ^ Math.imul(father + 1, 12345)) >>> 0) %
		2
	const cap =
		CHILD_LIMIT[Math.max(0, Math.min(5, standing))] + (ruler ? 2 : 0) - lowered
	let next = Math.max(from, persons.nextBirth[mother] + REST)
	const pending = people.pendingPregnancies.get(mother)
	for (; next < to; next += MONTH) {
		if (persons.death[mother] <= next || persons.death[father] <= next) break
		if (
			pending &&
			pending.due <= next &&
			(pending.outcome === "mother_dies" ||
				pending.outcome === "mother_and_child_die")
		)
			break
		const motherAge = next - persons.birth[mother]
		const fatherAge = next - persons.birth[father]
		if (motherAge < 16 || fatherAge < 16 || motherAge + GESTATION >= 45)
			continue
		let children = 0
		let previous = 0
		let motherPrevious = 0
		let child = persons.firstChild[mother]
		while (child >= 0) {
			motherPrevious++
			if (persons.father[child] === father) {
				previous++
				if (persons.birth[child] <= next && persons.death[child] > next)
					children++
			}
			child = persons.nextSiblingMother[child]
		}
		for (const pregnancy of pregnancies) {
			if (
				pregnancy.due <= next &&
				(pregnancy.outcome === "smooth" || pregnancy.outcome === "mother_dies")
			) {
				children += pregnancy.twins ? 2 : 1
				previous += pregnancy.twins ? 2 : 1
				motherPrevious += pregnancy.twins ? 2 : 1
			}
		}
		if (pending) {
			const pregnancy = pending
			if (
				pregnancy.due <= next &&
				(pregnancy.outcome === "smooth" || pregnancy.outcome === "mother_dies")
			) {
				motherPrevious += pregnancy.twins ? 2 : 1
				if (pregnancy.father === father) {
					children += pregnancy.twins ? 2 : 1
					previous += pregnancy.twins ? 2 : 1
				}
			}
		}
		if (children >= cap) continue
		const femaleFertility =
			Math.max(0, persons.fertility[mother] - motherPrevious * 0.05) *
			ageFactor({ age: motherAge, female: true })
		const maleFertility =
			persons.fertility[father] * ageFactor({ age: fatherAge, female: false })
		const bonus = previous === 0 && ruler ? 0.3 : 0
		const chance =
			Math.max(
				0.01,
				Math.min(
					0.25,
					((femaleFertility + maleFertility) / 2 + bonus) * 0.0475,
				),
			) * (ruler ? 1 : 0.85)
		if (rng.random() >= chance) continue
		const result = outcome({ mother, people, rng })
		const days =
			result === "early_end"
				? 80 + rng.random() * 40
				: result === "child_dies" || result === "mother_and_child_die"
					? 180 + rng.random() * 20
					: 280
		const due = next + days / 365
		const twins =
			(result === "smooth" || result === "mother_dies") &&
			rng.random() < twinChance({ mother, people, age: motherAge })
		pregnancies.push({
			mother,
			father,
			conception: next,
			due,
			outcome: result,
			twins,
		})
		persons.nextBirth[mother] = due
		if (result === "mother_dies" || result === "mother_and_child_die") break
		next = due + REST - MONTH
	}
	return pregnancies
}

function birth({ people, pregnancy, rng }: BirthParams): BirthResult {
	const { mother, father, due, outcome, twins } = pregnancy
	if (people.pendingPregnancies.get(mother) === pregnancy)
		people.pendingPregnancies.delete(mother)
	const persons = people.persons
	if (!PEOPLE.aliveAt({ people, person: mother, time: due }))
		return { children: [], motherDied: false }
	const children: number[] = []
	if (outcome === "smooth" || outcome === "mother_dies") {
		for (let i = 0; i < (twins ? 2 : 1); i++) {
			const sex = rng.random() < 0.49 ? 1 : 0
			children.push(
				PEOPLE.addPerson({
					people,
					sex,
					birth: due,
					father,
					mother,
					dynasty: persons.dynasty[father],
					culture: persons.culture[father],
					residence: persons.residence[father],
					health: 36 + Math.floor(rng.random() * 5) + (sex === 1 ? 4 : 0),
					rng,
				}),
			)
		}
	}
	const motherDied =
		outcome === "mother_dies" || outcome === "mother_and_child_die"
	if (motherDied) PEOPLE.endLife({ people, person: mother, time: due })
	return { children, motherDied }
}

export const FERTILITY = { familyBetween, birth }
