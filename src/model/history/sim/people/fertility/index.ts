import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { PEOPLE } from "@/model/history/sim/people"
import { CHARACTER } from "@/model/history/sim/people/character"
import type {
	BearParams,
	CancelParams,
	ChildCount,
	ChildDynastyParams,
	CoupleAtParams,
	CoupleParams,
	DeliverParams,
	Delivery,
	DurationParams,
	FinishDeliveryParams,
	OutcomeParams,
	Pregnancy,
	PregnancyOutcome,
	ProjectParams,
	QueueParams,
	SiblingsParams,
	SmoothWeightParams,
	TakeQueuedParams,
	TwinChanceParams,
	WomanParams,
} from "@/model/history/sim/people/fertility/types"
import { HEALTH } from "@/model/history/sim/people/health"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { STRESS } from "@/model/history/sim/people/stress"
import { TRAITS } from "@/model/history/sim/people/traits"

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
// CK3 pregnancy.0001: the weight of an untroubled birth, with the Sickly and
// Ill Mother weights folded in.
const SMOOTH_WEIGHT = 215

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
	return (
		table.heldSeats[mother].length > 0 || table.heldSeats[father].length > 0
	)
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

function smoothWeight({ health, earlier }: SmoothWeightParams): number {
	let weight = SMOOTH_WEIGHT
	if (health <= 5) weight -= 10
	if (health <= 3) weight -= 15
	if (earlier >= 2) weight += 5
	if (earlier >= 4) weight += 5
	return weight
}

function outcome({
	people,
	mother,
	time,
	earlier,
	rng,
}: OutcomeParams): PregnancyOutcome {
	const normal = smoothWeight({
		health: HEALTH.effective({ people, person: mother, time }),
		earlier,
	})
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

function bornAlive(outcome: PregnancyOutcome): boolean {
	return outcome === "birth" || outcome === "mother dies"
}

function kills(outcome: PregnancyOutcome): boolean {
	return outcome === "mother dies" || outcome === "mother and child die"
}

// Ends a pregnancy at its time: the children are created and a loss is
// logged. True when it kills the mother.
function deliver({ people, pregnancy, time, rng }: DeliverParams): boolean {
	const { mother, father, origin } = pregnancy
	if (bornAlive(pregnancy.outcome)) {
		const dynasty = childDynasty({ people, mother, father, origin })
		for (let i = 0; i < (pregnancy.twins ? 2 : 1); i++)
			PEOPLE.spawn({
				people,
				sex: rng.random() < GIRL_CHANCE ? 1 : 0,
				birth: time,
				survives: time,
				father,
				mother,
				dynasty,
				origin,
				rng,
			})
	}
	const fatal = kills(pregnancy.outcome)
	if (pregnancy.outcome !== "birth")
		PEOPLE_LOG.append({
			log: people.log,
			row: {
				kind: "pregnancy",
				mother,
				father,
				time,
				outcome:
					pregnancy.outcome === "miscarriage" ||
					pregnancy.outcome === "stillbirth"
						? pregnancy.outcome
						: "childbirth death",
			},
		})
	return fatal
}

// Children already born, with those of pending deliveries from their due
// dates on; a pending child counts as living.
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
	for (const id of people.deliveries.byMother.get(mother) ?? []) {
		const delivery = people.deliveries.byId.get(id)
		if (!delivery || delivery.due > time || !bornAlive(delivery.outcome))
			continue
		const children = delivery.twins ? 2 : 1
		earlier += children
		if (delivery.father !== father) continue
		together += children
		living += children
	}
	return { earlier, living, together }
}

// The couple's next pregnancy conceived in the interval, with its end already
// decided; the mother rests until a season after it.
function conceive({
	people,
	mother,
	father,
	from,
	until,
	survives,
	origin,
	rng,
}: BearParams): Pregnancy | null {
	const table = people.persons
	const cap = capOf({ people, mother, father })
	const ruler = isRuler({ people, mother, father })
	let motherCharacterFertility: number | null = null
	let fatherCharacterFertility: number | null = null
	for (
		let time = Math.max(from, table.nextBirth[mother]);
		time < until;
		time += MONTH
	) {
		if (table.death[mother] <= time || table.death[father] <= time) return null
		const motherAge = time - table.birth[mother]
		const fatherAge = time - table.birth[father]
		if (motherAge + GESTATION >= LAST_BIRTH_AGE) return null
		if (motherAge < ADULT_AGE || fatherAge < ADULT_AGE) continue
		if (
			AGEING.incapable({ people, person: mother }) ||
			AGEING.incapable({ people, person: father })
		)
			return null
		const { earlier, living, together } = countChildren({
			people,
			mother,
			father,
			time,
		})
		if (living >= cap) continue
		motherCharacterFertility ??=
			TRAITS.fertility({
				character: CHARACTER.of({ people, person: mother }),
				age: 16,
			}) *
			STRESS.fertilityFactor(table.stress[mother]) *
			HEALTH.fertility({ people, person: mother })
		fatherCharacterFertility ??=
			TRAITS.fertility({
				character: CHARACTER.of({ people, person: father }),
				age: 16,
			}) *
			STRESS.fertilityFactor(table.stress[father]) *
			HEALTH.fertility({ people, person: father })
		const motherFertility =
			Math.max(0, table.fertility[mother] - 0.05 * earlier) *
			motherAgeFactor(motherAge) *
			motherCharacterFertility
		const fatherFertility =
			table.fertility[father] *
			fatherAgeFactor(fatherAge) *
			fatherCharacterFertility
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
		if (kills(result) && due < survives) continue
		if (table.death[mother] <= due) return null
		const twins =
			bornAlive(result) &&
			rng.random() < twinChance({ people, mother, age: motherAge })
		table.nextBirth[mother] = due + REST
		return {
			mother,
			father,
			conception: time,
			due,
			outcome: result,
			twins,
			origin,
		}
	}
	return null
}

function queue({ people, pregnancy }: QueueParams): number {
	const deliveries = people.deliveries
	const id = deliveries.next++
	deliveries.byId.set(id, { ...pregnancy, id })
	const list = deliveries.byMother.get(pregnancy.mother)
	if (list) list.push(id)
	else deliveries.byMother.set(pregnancy.mother, [id])
	return id
}

// Pregnancies of a past interval, each delivered as it is conceived; one that
// ends after the present is left pending. True when a delivery moved the
// mother's death earlier.
function bear(params: BearParams): boolean {
	const { people, mother, now, rng } = params
	for (;;) {
		const pregnancy = conceive(params)
		if (!pregnancy) return false
		if (pregnancy.due > now) {
			queue({ people, pregnancy })
			if (kills(pregnancy.outcome)) return false
			continue
		}
		if (deliver({ people, pregnancy, time: pregnancy.due, rng }))
			return PEOPLE.shortenLife({
				people,
				person: mother,
				time: pregnancy.due,
			})
	}
}

// Pregnancies conceived in the coming interval, queued for delivery. Each
// mother is projected once per interval, and not again while a pregnancy that
// will kill her is pending.
function project({
	people,
	mother,
	father,
	from,
	until,
	origin,
	rng,
}: ProjectParams): number[] {
	const deliveries = people.deliveries
	const queued: number[] = []
	if ((deliveries.projected.get(mother) ?? -Infinity) >= until) return queued
	deliveries.projected.set(mother, until)
	const pending = deliveries.byMother.get(mother) ?? []
	if (pending.some((id) => kills(deliveries.byId.get(id)?.outcome ?? "birth")))
		return queued
	for (;;) {
		const pregnancy = conceive({
			people,
			mother,
			father,
			from,
			until,
			survives: from,
			now: from,
			origin,
			rng,
		})
		if (!pregnancy) return queued
		queued.push(queue({ people, pregnancy }))
		if (kills(pregnancy.outcome)) return queued
	}
}

// Takes a pending delivery at its time. Null when it was cancelled, the
// mother has died, or the father was dead at conception; the mother is then
// free again from the conception or her last remaining delivery.
function finishDelivery({
	people,
	id,
	time,
}: FinishDeliveryParams): Delivery | null {
	const deliveries = people.deliveries
	const delivery = deliveries.byId.get(id)
	if (!delivery) return null
	deliveries.byId.delete(id)
	const table = people.persons
	const { mother, father } = delivery
	const remaining = (deliveries.byMother.get(mother) ?? []).filter(
		(other) => other !== id,
	)
	if (remaining.length > 0) deliveries.byMother.set(mother, remaining)
	else deliveries.byMother.delete(mother)
	if (table.death[mother] >= time && table.death[father] > delivery.conception)
		return delivery
	let free = delivery.conception
	for (const other of remaining)
		free = Math.max(free, (deliveries.byId.get(other)?.due ?? free) + REST)
	table.nextBirth[mother] = free
	return null
}

// Pending deliveries not yet handed to the event queue.
function takeQueued({ people }: TakeQueuedParams): Delivery[] {
	const deliveries = people.deliveries
	const fresh: Delivery[] = []
	for (let id = deliveries.queued; id < deliveries.next; id++) {
		const delivery = deliveries.byId.get(id)
		if (delivery) fresh.push(delivery)
	}
	deliveries.queued = deliveries.next
	return fresh
}

// A dead mother's pending deliveries never happen.
function cancelForDeath({ people, person }: CancelParams): number {
	const deliveries = people.deliveries
	const pending = deliveries.byMother.get(person) ?? []
	for (const id of pending) deliveries.byId.delete(id)
	deliveries.byMother.delete(person)
	deliveries.projected.delete(person)
	return pending.length
}

// Brothers and sisters of a child created on its own, kept clear of its
// pregnancy. The mother lives at least to the child's birth.
function siblings({ people, child, until, origin, rng }: SiblingsParams): void {
	const table = people.persons
	const mother = table.mother[child]
	const father = table.father[child]
	const birth = table.birth[child]
	const family = {
		people,
		mother,
		father,
		survives: birth,
		now: until,
		origin,
		rng,
	}
	bear({
		...family,
		from: table.birth[mother] + ADULT_AGE,
		until: birth - 2 * GESTATION - REST,
	})
	table.nextBirth[mother] = Math.max(table.nextBirth[mother], birth + REST)
	bear({ ...family, from: birth, until })
}

export const FERTILITY = {
	bear,
	siblings,
	project,
	smoothWeight,
	deliver,
	takeQueued,
	finishDelivery,
	cancelForDeath,
}
