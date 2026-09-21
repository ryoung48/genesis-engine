import { PEOPLE } from "@/model/history/sim/people"
import type {
	BackfillContext,
	BackfillCoupleParams,
	BackfillFamilyParams,
	BackfillParams,
	BackfillPersonParams,
	BackfillResult,
	BackfillSeatParams,
	ValidateBackfillParams,
	WriteBackfillLogParams,
} from "@/model/history/sim/people/backfill/types"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import { HEIRS } from "@/model/history/sim/people/heirs"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { PeopleLogRow } from "@/model/history/sim/people/log/types"
import { MARRIAGE } from "@/model/history/sim/people/marriage"
import { RNG } from "@/model/shared/random/rng"

function rulerAge(context: BackfillContext): number {
	const quantiles = [16, 17, 28, 38, 51, 67, 70]
	const weights = [0.05, 0.2, 0.25, 0.25, 0.2, 0.05]
	let roll = context.rng.random()
	for (let i = 0; i < weights.length; i++) {
		if (roll <= weights[i])
			return (
				quantiles[i] + context.rng.random() * (quantiles[i + 1] - quantiles[i])
			)
		roll -= weights[i]
	}
	return 67
}

function addRelative({
	context,
	sex,
	birth,
	minimumSurvival,
	requireAlive,
	father,
	mother,
	dynasty,
	culture,
	residence,
}: BackfillPersonParams): number {
	let life = LIFESPAN.trajectory({
		birth,
		until: context.start,
		sex,
		rng: context.rng,
		requireAlive,
		initialHealth: null,
	})
	for (
		let attempt = 0;
		life.death <= minimumSurvival && attempt < 20;
		attempt++
	) {
		life = LIFESPAN.trajectory({
			birth,
			until: context.start,
			sex,
			rng: context.rng,
			requireAlive,
			initialHealth: null,
		})
	}
	if (life.death <= minimumSurvival)
		throw new Error("Could not generate a viable relative")
	return PEOPLE.addPerson({
		people: context.people,
		sex,
		birth,
		death: life.death,
		father,
		mother,
		dynasty,
		culture,
		residence,
		health: life.health,
		rng: context.rng,
	})
}

function addCouple({
	context,
	husband,
	wife,
	marriageTime,
	includeGrandchildren,
}: BackfillCoupleParams): void {
	const people = context.people
	const standing = Math.max(
		PEOPLE.standingOf({ people, person: husband }),
		PEOPLE.standingOf({ people, person: wife }),
	)
	const ruler =
		PEOPLE.isRuler({ people, person: husband }) ||
		PEOPLE.isRuler({ people, person: wife })
	const row = MARRIAGE.marry({ people, husband, wife, time: marriageTime })
	if (row < 0) return
	const pregnancies = FERTILITY.familyBetween({
		people,
		mother: wife,
		father: husband,
		from: marriageTime,
		to: context.start,
		standing,
		ruler,
		rng: context.rng,
	})
	for (const pregnancy of pregnancies) {
		if (pregnancy.due >= context.start) {
			context.pending.push(pregnancy)
			continue
		}
		const result = FERTILITY.birth({ people, pregnancy, rng: context.rng })
		for (const child of result.children) {
			const life = LIFESPAN.trajectory({
				birth: pregnancy.due,
				until: context.start,
				sex: people.persons.sex[child] as 0 | 1,
				rng: context.rng,
				requireAlive: false,
				initialHealth: people.persons.health[child],
			})
			people.persons.health[child] = life.health
			if (life.death < context.start)
				PEOPLE.endLife({ people, person: child, time: life.death })
			else if (includeGrandchildren && context.start - pregnancy.due >= 16) {
				marryRelative({ context, person: child, grandchildren: false })
			}
		}
		if (result.motherDied)
			MARRIAGE.endMarriage({
				people,
				marriage: row,
				time: pregnancy.due,
				reason: "widowed",
			})
	}
	const ended = Math.min(
		people.persons.death[husband],
		people.persons.death[wife],
	)
	if (ended < context.start)
		MARRIAGE.endMarriage({
			people,
			marriage: row,
			time: ended,
			reason: "widowed",
		})
}

function marryRelative({
	context,
	person,
	grandchildren,
}: BackfillFamilyParams): void {
	const people = context.people
	const table = people.persons
	if (context.start - table.birth[person] < 20) return
	if (context.rng.random() < 0.1) return
	const sex = table.sex[person] === 0 ? 1 : 0
	const birth = table.birth[person] + (sex === 1 ? 4 : -4)
	const marriageTime = Math.max(
		table.birth[person] + (table.sex[person] === 0 ? 23 : 20),
		birth + (sex === 0 ? 23 : 18),
	)
	if (
		marriageTime >= context.start ||
		context.start - birth >= 80 ||
		table.death[person] <= marriageTime
	)
		return
	const spouse = addRelative({
		context,
		sex,
		birth,
		minimumSurvival: marriageTime,
		requireAlive: false,
		dynasty: context.nextDynasty++,
		culture: table.culture[person],
		residence: table.residence[person],
	})
	addCouple({
		context,
		husband: sex === 1 ? person : spouse,
		wife: sex === 1 ? spouse : person,
		marriageTime,
		includeGrandchildren: grandchildren,
	})
}

function addSeatFamily({ context, seat, seatRank }: BackfillSeatParams): void {
	const age = rulerAge(context)
	const rulerBirth = context.start - age
	const fatherBirth = rulerBirth - (23 + context.rng.random() * 12)
	const motherBirth = rulerBirth - (19 + context.rng.random() * 10)
	const father = addRelative({
		context,
		sex: 0,
		birth: fatherBirth,
		minimumSurvival: rulerBirth,
		requireAlive: false,
		dynasty: seat.dynasty,
		culture: seat.culture,
		residence: seat.seat,
	})
	context.people.persons.peak[father] = seat.standing
	const mother = addRelative({
		context,
		sex: 1,
		birth: motherBirth,
		minimumSurvival: rulerBirth,
		requireAlive: false,
		dynasty: context.nextDynasty++,
		culture: seat.culture,
		residence: seat.seat,
	})
	const parentsMarriage = Math.max(fatherBirth + 18, motherBirth + 17)
	MARRIAGE.marry({
		people: context.people,
		husband: father,
		wife: mother,
		time: parentsMarriage,
	})
	const sex = context.rng.random() < 0.02 ? 1 : 0
	const ruler = addRelative({
		context,
		sex,
		birth: rulerBirth,
		minimumSurvival: context.start,
		requireAlive: true,
		father,
		mother,
		dynasty: seat.dynasty,
		culture: seat.culture,
		residence: seat.seat,
	})
	PEOPLE.assignSeat({
		people: context.people,
		person: ruler,
		seat: seat.seat,
		seatRank,
	})
	for (let i = -3; i <= 5; i++) {
		if (i === 0 || context.rng.random() > 0.9) continue
		const birth = rulerBirth + i * (2 + context.rng.random() * 2)
		if (
			birth >= context.start ||
			birth <= parentsMarriage ||
			birth - motherBirth > 44.9 ||
			birth - motherBirth < 16.1 ||
			birth - fatherBirth < 16.1 ||
			context.people.persons.death[father] <= birth ||
			context.people.persons.death[mother] <= birth
		)
			continue
		const sibling = addRelative({
			context,
			sex: context.rng.random() < 0.49 ? 1 : 0,
			birth,
			minimumSurvival: birth,
			requireAlive: false,
			father,
			mother,
			dynasty: seat.dynasty,
			culture: seat.culture,
			residence: seat.seat,
		})
		marryRelative({ context, person: sibling, grandchildren: false })
	}
	marryRelative({ context, person: ruler, grandchildren: true })
	if (context.people.persons.death[ruler] < context.start) {
		const heir = HEIRS.of({
			people: context.people,
			dying: ruler,
			time: context.start,
			law: "single_heir",
			gender: "male_preference",
		}).primary
		PEOPLE.removeSeat({ people: context.people, seat: seat.seat })
		const successor =
			heir >= 0
				? heir
				: addRelative({
						context,
						sex: 0,
						birth: context.start - 30,
						minimumSurvival: context.start,
						requireAlive: true,
						dynasty: context.nextDynasty++,
						culture: seat.culture,
						residence: seat.seat,
					})
		PEOPLE.assignSeat({
			people: context.people,
			person: successor,
			seat: seat.seat,
			seatRank,
		})
	}
	const ended = Math.min(
		context.people.persons.death[father],
		context.people.persons.death[mother],
	)
	if (ended < context.start)
		MARRIAGE.endMarriage({
			people: context.people,
			marriage: context.people.persons.firstMarriage[father],
			time: ended,
			reason: "widowed",
		})
}

function create({
	seats,
	seatRank,
	seatCount,
	start,
	years,
	seed,
}: BackfillParams): BackfillResult {
	const orderedSeats = [...seats].sort((a, b) => a.seat - b.seat)
	const capacity = Math.ceil(
		(orderedSeats.length * 19 + orderedSeats.length * 0.3 * years) * 1.25,
	)
	const people = PEOPLE.createPeople({
		capacity,
		marriageCapacity: Math.ceil(capacity / 2.5),
		seatCount,
	})
	const pending: BackfillResult["pending"] = []
	const nextDynastyStart =
		Math.max(0, ...orderedSeats.map((seat) => seat.dynasty)) + 1
	let nextDynasty = nextDynastyStart
	for (const seat of orderedSeats) {
		const context: BackfillContext = {
			people,
			start,
			pending,
			nextDynasty,
			rng: RNG.createRng({ seed: seed + Math.imul(seat.seat + 1, 1000003) }),
		}
		addSeatFamily({ context, seat, seatRank })
		nextDynasty = context.nextDynasty
	}
	PEOPLE.compactAlive({ people, time: start })
	for (const pregnancy of pending)
		people.pendingPregnancies.set(pregnancy.mother, pregnancy)
	validate({ people, start, seats: orderedSeats })
	writeLog({ people, start })
	return { people, pending }
}

function logRank(row: PeopleLogRow): number {
	if (row.kind === "birth") return 0
	if (row.kind === "health") return 1
	if (row.kind === "wedding") return 2
	if (row.kind === "seat") return row.c === 1 ? 3 : 5
	return 4
}

function writeLog({ people, start }: WriteBackfillLogParams): void {
	const rows: PeopleLogRow[] = []
	const persons = people.persons
	for (let person = 0; person < persons.count; person++) {
		rows.push(
			PEOPLE_LOG.birthRow({ persons, person, time: persons.birth[person] }),
		)
		if (Number.isFinite(persons.death[person]))
			rows.push(
				PEOPLE_LOG.deathRow({ persons, person, time: persons.death[person] }),
			)
		else rows.push(PEOPLE_LOG.healthRow({ persons, person, time: start }))
	}
	const marriages = people.marriages
	for (let marriage = 0; marriage < marriages.count; marriage++) {
		rows.push(
			PEOPLE_LOG.weddingRow({
				time: marriages.start[marriage],
				husband: marriages.husband[marriage],
				wife: marriages.wife[marriage],
			}),
		)
	}
	for (let seat = 0; seat < people.holderOfSeat.length; seat++) {
		const person = people.holderOfSeat[seat]
		if (person >= 0)
			rows.push(PEOPLE_LOG.seatRow({ time: start, person, seat, gained: true }))
	}
	rows.sort((a, b) => a.time - b.time || logRank(a) - logRank(b) || a.a - b.a)
	for (const row of rows) PEOPLE_LOG.append({ log: people.log, ...row })
}

function validate({ people, start, seats }: ValidateBackfillParams): void {
	const persons = people.persons
	const marriages = people.marriages
	const fatherLinks = new Uint8Array(persons.count)
	const motherLinks = new Uint8Array(persons.count)
	const husbandLinks = new Uint8Array(marriages.count)
	const wifeLinks = new Uint8Array(marriages.count)
	for (let person = 0; person < persons.count; person++) {
		if (
			persons.birth[person] >= start ||
			persons.death[person] <= persons.birth[person] ||
			(Number.isFinite(persons.death[person]) && persons.death[person] >= start)
		)
			throw new Error(
				`Invalid backfill life dates ${person}: ${persons.birth[person]} ${persons.death[person]} ${start}`,
			)
		for (const parent of [persons.father[person], persons.mother[person]]) {
			if (parent < 0) continue
			if (
				parent >= person ||
				persons.birth[person] - persons.birth[parent] < 16
			)
				throw new Error("Invalid backfill parent")
		}
		if (
			persons.mother[person] >= 0 &&
			persons.birth[person] - persons.birth[persons.mother[person]] > 45
		) {
			throw new Error("Backfill mother above age 45")
		}
		if (persons.father[person] >= 0 && persons.mother[person] >= 0) {
			let marriage = persons.firstMarriage[persons.father[person]]
			let found = false
			while (marriage >= 0) {
				if (
					marriages.wife[marriage] === persons.mother[person] &&
					marriages.start[marriage] < persons.birth[person]
				) {
					found = true
					break
				}
				marriage = marriages.nextOfHusband[marriage]
			}
			if (!found)
				throw new Error(
					`Backfill birth lacks earlier marriage ${person}: ${persons.father[person]} ${persons.mother[person]} ${persons.birth[person]} row ${persons.firstMarriage[persons.father[person]]}`,
				)
		}
		let child = persons.firstChild[person]
		for (let steps = 0; child >= 0; steps++) {
			if (child >= persons.count || steps >= persons.count)
				throw new Error("Invalid backfill child list")
			if (persons.sex[person] === 0) {
				if (persons.father[child] !== person || fatherLinks[child]++)
					throw new Error("Invalid backfill father link")
				child = persons.nextSiblingFather[child]
			} else {
				if (persons.mother[child] !== person || motherLinks[child]++)
					throw new Error("Invalid backfill mother link")
				child = persons.nextSiblingMother[child]
			}
		}
		let marriage = persons.firstMarriage[person]
		let latestStart = Number.POSITIVE_INFINITY
		for (let steps = 0; marriage >= 0; steps++) {
			if (marriage >= marriages.count || steps >= marriages.count)
				throw new Error("Invalid backfill marriage list")
			if (
				marriages.start[marriage] >= latestStart ||
				marriages.end[marriage] > latestStart
			)
				throw new Error("Overlapping backfill marriages")
			latestStart = marriages.start[marriage]
			if (persons.sex[person] === 0) {
				if (marriages.husband[marriage] !== person || husbandLinks[marriage]++)
					throw new Error("Invalid backfill husband link")
				marriage = marriages.nextOfHusband[marriage]
			} else {
				if (marriages.wife[marriage] !== person || wifeLinks[marriage]++)
					throw new Error("Invalid backfill wife link")
				marriage = marriages.nextOfWife[marriage]
			}
		}
	}
	for (let person = 0; person < persons.count; person++) {
		if (
			fatherLinks[person] !== (persons.father[person] >= 0 ? 1 : 0) ||
			motherLinks[person] !== (persons.mother[person] >= 0 ? 1 : 0)
		)
			throw new Error("Missing backfill parent link")
	}
	for (let marriage = 0; marriage < marriages.count; marriage++) {
		if (
			husbandLinks[marriage] !== 1 ||
			wifeLinks[marriage] !== 1 ||
			marriages.start[marriage] >= marriages.end[marriage] ||
			marriages.start[marriage] <
				persons.birth[marriages.husband[marriage]] + 16 ||
			marriages.start[marriage] < persons.birth[marriages.wife[marriage]] + 16
		) {
			throw new Error("Invalid backfill marriage")
		}
	}
	for (const seat of seats) {
		const holder = people.holderOfSeat[seat.seat]
		if (
			holder < 0 ||
			!PEOPLE.aliveAt({ people, person: holder, time: start })
		) {
			throw new Error("Backfill seat has no living holder")
		}
	}
	for (let seat = 0; seat < people.holderOfSeat.length; seat++) {
		const holder = people.holderOfSeat[seat]
		if (holder < 0) continue
		if (!PEOPLE.aliveAt({ people, person: holder, time: start }))
			throw new Error("Dead backfill seat holder")
		let current = persons.seat[holder]
		for (let steps = 0; current !== seat && current >= 0; steps++) {
			if (steps >= people.holderOfSeat.length)
				throw new Error("Cyclic backfill seat list")
			current = people.nextSeatOfHolder[current]
		}
		if (current !== seat) throw new Error("Missing backfill seat link")
	}
}

export const BACKFILL = { create, validate }
