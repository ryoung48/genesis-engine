import { describe, expect, it } from "vitest"
import { PEOPLE } from "@/model/history/sim/people"
import { BACKFILL } from "@/model/history/sim/people/backfill"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import { HEIRS } from "@/model/history/sim/people/heirs"
import { KIN } from "@/model/history/sim/people/kin"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { MARRIAGE } from "@/model/history/sim/people/marriage"
import { RNG } from "@/model/shared/random/rng"
import type { SyntheticPeopleEvent } from "@/test/history-run/types"

describe("dynastic people", () => {
	it("keeps both parent lists and marriages intact across growth", () => {
		const people = PEOPLE.createPeople({
			capacity: 1,
			marriageCapacity: 1,
			seatCount: 3,
		})
		const father = PEOPLE.addPerson({
			people,
			sex: 0,
			birth: 0,
			dynasty: 1,
			culture: 0,
			residence: 10,
		})
		const mother = PEOPLE.addPerson({
			people,
			sex: 1,
			birth: 4,
			dynasty: 2,
			culture: 0,
			residence: 11,
		})
		const secondMother = PEOPLE.addPerson({
			people,
			sex: 1,
			birth: 5,
			dynasty: 3,
			culture: 0,
			residence: 12,
		})
		const seatRank = new Uint8Array([2, 1, 3])
		PEOPLE.assignSeat({ people, person: father, seat: 0, seatRank })
		PEOPLE.assignSeat({ people, person: father, seat: 2, seatRank })
		expect(people.persons.seat[father]).toBe(2)
		expect(people.nextSeatOfHolder[2]).toBe(0)
		PEOPLE.removeSeat({ people, seat: 2 })
		expect(people.persons.seat[father]).toBe(0)
		const first = MARRIAGE.marry({
			people,
			husband: father,
			wife: mother,
			time: 24,
		})
		expect(first).toBe(0)
		const child = PEOPLE.addPerson({
			people,
			sex: 1,
			birth: 25,
			father,
			mother,
			dynasty: 1,
			culture: 0,
			residence: 10,
		})
		expect(KIN.childrenOf({ kin: people.persons, parent: father })).toEqual([
			child,
		])
		expect(KIN.childrenOf({ kin: people.persons, parent: mother })).toEqual([
			child,
		])
		expect(PEOPLE.closeKin({ people, a: father, b: child })).toBe(true)
		expect(PEOPLE.closeKin({ people, a: mother, b: secondMother })).toBe(false)
		MARRIAGE.endMarriage({
			people,
			marriage: first,
			time: 30,
			reason: "widowed",
		})
		expect(
			MARRIAGE.marry({ people, husband: father, wife: secondMother, time: 31 }),
		).toBe(1)
		expect(MARRIAGE.activeMarriage({ people, person: father, time: 31 })).toBe(
			1,
		)
		PEOPLE.endLife({ people, person: father, time: 40 })
		expect(
			PEOPLE.applyDeath({ people, person: father, time: 39, serial: 0 }),
		).toBe(false)
		expect(
			PEOPLE.applyDeath({
				people,
				person: father,
				time: 40,
				serial: people.persons.deathSerial[father],
			}),
		).toBe(true)
		expect(
			MARRIAGE.activeMarriage({ people, person: secondMother, time: 41 }),
		).toBe(-1)
		expect(people.persons.growths).toBeGreaterThan(0)
		expect(people.marriages.growths).toBeGreaterThan(0)
	})

	it("makes deterministic pregnancies and never births from a dead mother", () => {
		const run = () => {
			const people = PEOPLE.createPeople({
				capacity: 2,
				marriageCapacity: 1,
				seatCount: 1,
			})
			const father = PEOPLE.addPerson({
				people,
				sex: 0,
				birth: 0,
				dynasty: 1,
				culture: 2,
				residence: 3,
				fertility: 0.55,
			})
			const mother = PEOPLE.addPerson({
				people,
				sex: 1,
				birth: 4,
				dynasty: 2,
				culture: 2,
				residence: 3,
				fertility: 0.55,
			})
			const rng = RNG.createRng({ seed: 177 })
			const pregnancies = FERTILITY.familyBetween({
				people,
				mother,
				father,
				from: 24,
				to: 35,
				standing: 3,
				ruler: true,
				rng,
			})
			return { people, pregnancies, rng }
		}
		const first = run()
		const second = run()
		expect(first.pregnancies).toEqual(second.pregnancies)
		expect(first.pregnancies.length).toBeGreaterThan(0)
		for (const pregnancy of first.pregnancies) {
			if (
				pregnancy.outcome === "mother_dies" ||
				pregnancy.outcome === "mother_and_child_die"
			)
				break
			FERTILITY.birth({ people: first.people, pregnancy, rng: first.rng })
		}
		const last = first.pregnancies[0]
		PEOPLE.endLife({
			people: first.people,
			person: last.mother,
			time: last.due - 0.01,
		})
		expect(
			FERTILITY.birth({ people: first.people, pregnancy: last, rng: first.rng })
				.children,
		).toEqual([])
	})

	it("counts an in-flight birth against the next yearly child cap", () => {
		const people = PEOPLE.createPeople({
			capacity: 5,
			marriageCapacity: 1,
			seatCount: 1,
		})
		const father = PEOPLE.addPerson({
			people,
			sex: 0,
			birth: 6,
			dynasty: 1,
			culture: 0,
			residence: 0,
		})
		const mother = PEOPLE.addPerson({
			people,
			sex: 1,
			birth: 10,
			dynasty: 2,
			culture: 0,
			residence: 0,
		})
		for (const birth of [26, 28])
			PEOPLE.addPerson({
				people,
				sex: 0,
				birth,
				father,
				mother,
				dynasty: 1,
				culture: 0,
				residence: 0,
			})
		const pregnancy = {
			mother,
			father,
			conception: 29.3,
			due: 30.1,
			outcome: "smooth" as const,
			twins: false,
		}
		people.pendingPregnancies.set(mother, pregnancy)
		people.persons.nextBirth[mother] = pregnancy.due
		expect(
			FERTILITY.familyBetween({
				people,
				mother,
				father,
				from: 30,
				to: 40,
				standing: 1,
				ruler: true,
				rng: RNG.createRng({ seed: 3 }),
			}),
		).toEqual([])
	})

	it("gives children a mortality hazard and ages adults", () => {
		const people = PEOPLE.createPeople({
			capacity: 1,
			marriageCapacity: 1,
			seatCount: 1,
		})
		const person = PEOPLE.addPerson({
			people,
			sex: 0,
			birth: 0,
			dynasty: 1,
			culture: 0,
			residence: 0,
			health: 24,
		})
		const rng = RNG.createRng({ seed: 4 })
		const before = people.persons.health[person]
		for (let year = 25; year < 50; year++)
			LIFESPAN.checkYear({ people, person, from: year, rng })
		expect(people.persons.health[person]).toBeLessThan(before)
	})

	it("keeps childhood deaths near the planned rate", () => {
		const people = PEOPLE.createPeople({
			capacity: 10000,
			marriageCapacity: 1,
			seatCount: 1,
		})
		const rng = RNG.createRng({ seed: 99 })
		for (let i = 0; i < 10000; i++) {
			PEOPLE.addPerson({
				people,
				sex: i % 2 === 0 ? 0 : 1,
				birth: 0,
				dynasty: i,
				culture: 0,
				residence: 0,
			})
		}
		let deaths = 0
		for (let year = 0; year < 16; year++) {
			for (let person = 0; person < people.persons.count; person++) {
				if (!PEOPLE.aliveAt({ people, person, time: year })) continue
				const result = LIFESPAN.checkYear({ people, person, from: year, rng })
				if (result.death === undefined) continue
				PEOPLE.endLife({ people, person, time: result.death })
				deaths++
			}
		}
		expect(deaths / 10000).toBeGreaterThan(0.22)
		expect(deaths / 10000).toBeLessThan(0.28)
	})

	it("keeps adult ageing within the planned quantiles", () => {
		const rng = RNG.createRng({ seed: 7654 })
		const ages: number[] = []
		for (let i = 0; i < 10000; i++) {
			const life = LIFESPAN.trajectory({
				birth: 0,
				until: 100,
				sex: i % 2 === 0 ? 0 : 1,
				rng,
				requireAlive: false,
				initialHealth: null,
			})
			if (life.death >= 16 && Number.isFinite(life.death)) ages.push(life.death)
		}
		ages.sort((a, b) => a - b)
		expect(ages.length).toBeGreaterThan(7000)
		expect(ages[Math.floor(ages.length * 0.5)]).toBeGreaterThan(65)
		expect(ages[Math.floor(ages.length * 0.5)]).toBeLessThan(70)
	})

	it("matches eligible adults once and schedules pregnancies after weddings", () => {
		const people = PEOPLE.createPeople({
			capacity: 200,
			marriageCapacity: 100,
			seatCount: 1,
		})
		for (let i = 0; i < 100; i++) {
			PEOPLE.addPerson({
				people,
				sex: i % 2 === 0 ? 0 : 1,
				birth: i % 2 === 0 ? 0 : 4,
				dynasty: i,
				culture: 0,
				residence: 0,
				fertility: 0.55,
			})
		}
		const result = PEOPLE.runYear({
			people,
			from: 24,
			sovereignOfResidence: new Int32Array([0]),
			cultureOfResidence: new Int16Array([0]),
			neighbors: new Map(),
			rng: RNG.createRng({ seed: 9876 }),
		})
		expect(result.weddings.length).toBeGreaterThan(0)
		const used = new Set<number>()
		for (const wedding of result.weddings) {
			expect(used.has(wedding.husband)).toBe(false)
			expect(used.has(wedding.wife)).toBe(false)
			used.add(wedding.husband)
			used.add(wedding.wife)
			expect(MARRIAGE.marry({ people, ...wedding })).toBeGreaterThanOrEqual(0)
		}
		for (const pregnancy of result.pregnancies) {
			expect(pregnancy.conception).toBeGreaterThanOrEqual(24)
			expect(pregnancy.due).toBeGreaterThan(pregnancy.conception)
		}
	})

	it("finds represented descendants before siblings", () => {
		const people = PEOPLE.createPeople({
			capacity: 8,
			marriageCapacity: 1,
			seatCount: 1,
		})
		const father = PEOPLE.addPerson({
			people,
			sex: 0,
			birth: 0,
			dynasty: 1,
			culture: 0,
			residence: 0,
		})
		const mother = PEOPLE.addPerson({
			people,
			sex: 1,
			birth: 4,
			dynasty: 2,
			culture: 0,
			residence: 0,
		})
		const ruler = PEOPLE.addPerson({
			people,
			sex: 0,
			birth: 24,
			father,
			mother,
			dynasty: 1,
			culture: 0,
			residence: 0,
		})
		const brother = PEOPLE.addPerson({
			people,
			sex: 0,
			birth: 26,
			father,
			mother,
			dynasty: 1,
			culture: 0,
			residence: 0,
		})
		const wife = PEOPLE.addPerson({
			people,
			sex: 1,
			birth: 25,
			dynasty: 3,
			culture: 0,
			residence: 0,
		})
		const son = PEOPLE.addPerson({
			people,
			sex: 0,
			birth: 43,
			father: ruler,
			mother: wife,
			dynasty: 1,
			culture: 0,
			residence: 0,
			death: 70,
		})
		const daughter = PEOPLE.addPerson({
			people,
			sex: 1,
			birth: 45,
			father: ruler,
			mother: wife,
			dynasty: 1,
			culture: 0,
			residence: 0,
		})
		const grandson = PEOPLE.addPerson({
			people,
			sex: 0,
			birth: 63,
			father: son,
			dynasty: 1,
			culture: 0,
			residence: 0,
		})
		const heirs = HEIRS.of({
			people,
			dying: ruler,
			time: 80,
			law: "partition",
			gender: "male_preference",
		})
		expect(heirs.primary).toBe(grandson)
		expect(heirs.order).toEqual([grandson, daughter])
		expect(heirs.juniors).toEqual([daughter])
		PEOPLE.endLife({ people, person: grandson, time: 81 })
		PEOPLE.endLife({ people, person: daughter, time: 81 })
		expect(
			HEIRS.of({
				people,
				dying: ruler,
				time: 82,
				law: "single_heir",
				gender: "male_preference",
			}).primary,
		).toBe(brother)
	})

	it("keeps the columnar people log chronological across chunks", () => {
		const log = PEOPLE_LOG.create({ capacity: 2 })
		for (let i = 0; i < 5; i++)
			PEOPLE_LOG.append({
				log,
				time: i,
				kind: "birth",
				a: i,
				b: -1,
				c: -1,
				d: 0,
			})
		const chunks = PEOPLE_LOG.drain({ log })
		expect(chunks.map((part) => part.count)).toEqual([2, 2, 1])
		expect(
			chunks.flatMap((part) => [...part.time.slice(0, part.count)]),
		).toEqual([0, 1, 2, 3, 4])
		expect(() =>
			PEOPLE_LOG.append({
				log,
				time: 3,
				kind: "death",
				a: 0,
				b: 0,
				c: 0,
				d: 0,
			}),
		).toThrow()
	})

	it("backfills every seat in canonical order", () => {
		const seatCount = Number(process.env.PEOPLE_SEATS ?? 100)
		const seats = Array.from({ length: seatCount }, (_, seat) => ({
			seat,
			culture: seat % 3,
			dynasty: seat,
			standing: 2,
		}))
		const params = {
			seats,
			seatRank: new Uint8Array(seatCount).fill(2),
			seatCount,
			start: 1066,
			years: 100,
			seed: 191,
		}
		const first = BACKFILL.create(params)
		const second = BACKFILL.create({ ...params, seats: [...seats].reverse() })
		expect(first.people.persons.count).toBeGreaterThan(seatCount)
		expect(first.people.persons.aliveCount).toBeGreaterThanOrEqual(
			seatCount * 11.25,
		)
		expect(first.people.persons.aliveCount).toBeLessThanOrEqual(
			seatCount * 18.75,
		)
		expect(first.people.holderOfSeat).toEqual(second.people.holderOfSeat)
		expect(
			first.people.persons.birth.slice(0, first.people.persons.count),
		).toEqual(second.people.persons.birth.slice(0, second.people.persons.count))
		for (const seat of seats)
			expect(first.people.holderOfSeat[seat.seat]).toBeGreaterThanOrEqual(0)
		let previous = Number.NEGATIVE_INFINITY
		let rows = 0
		for (const chunk of PEOPLE_LOG.drain({ log: first.people.log })) {
			for (let i = 0; i < chunk.count; i++) {
				expect(chunk.time[i]).toBeGreaterThanOrEqual(previous)
				previous = chunk.time[i]
				rows++
			}
		}
		expect(rows).toBeGreaterThan(first.people.persons.count)
	})

	it.fails("keeps a closed dynastic population viable for two hundred years", () => {
		const seatCount = 100
		const seats = Array.from({ length: seatCount }, (_, seat) => ({
			seat,
			culture: 0,
			dynasty: seat,
			standing: 2,
		}))
		const seatRank = new Uint8Array(seatCount).fill(2)
		const { people, pending } = BACKFILL.create({
			seats,
			seatRank,
			seatCount,
			start: 1066,
			years: 200,
			seed: 492,
		})
		const initial = people.persons.aliveCount
		const rng = RNG.createRng({ seed: 9001 })
		const sovereignOfResidence = Int32Array.from(
			{ length: seatCount },
			(_, seat) => seat,
		)
		const neighbors = new Map<number, readonly number[]>()
		for (let seat = 0; seat < seatCount; seat++)
			neighbors.set(
				seat,
				[seat - 1, seat + 1].filter(
					(neighbor) => neighbor >= 0 && neighbor < seatCount,
				),
			)
		const queue: SyntheticPeopleEvent[] = pending.map((pregnancy) => ({
			kind: "birth",
			time: pregnancy.due,
			pregnancy,
		}))
		let nextDynasty = 10000
		const processDeath = (death: SyntheticPeopleEvent & { kind: "death" }) => {
			if (
				!PEOPLE.applyDeath({
					people,
					person: death.death.person,
					time: death.time,
					serial: death.death.serial,
				})
			)
				return
			const seat = people.persons.seat[death.death.person]
			if (seat < 0) return
			PEOPLE.removeSeat({ people, seat })
			const heir = HEIRS.of({
				people,
				dying: death.death.person,
				time: death.time,
				law: "single_heir",
				gender: "male_preference",
			}).primary
			const successor =
				heir >= 0
					? heir
					: PEOPLE.addPerson({
							people,
							sex: 0,
							birth: death.time - 30,
							dynasty: nextDynasty++,
							culture: 0,
							residence: seat,
							rng,
						})
			PEOPLE.assignSeat({ people, person: successor, seat, seatRank })
		}
		for (let year = 1066; year < 1266; year++) {
			const result = PEOPLE.runYear({
				people,
				from: year,
				sovereignOfResidence,
				cultureOfResidence: new Int16Array(seatCount),
				neighbors,
				rng,
			})
			queue.push(
				...result.deaths.map((death) => ({
					kind: "death" as const,
					time: death.time,
					death,
				})),
			)
			queue.push(
				...result.weddings.map((wedding) => ({
					kind: "wedding" as const,
					time: wedding.time,
					wedding,
				})),
			)
			queue.push(
				...result.pregnancies.map((pregnancy) => ({
					kind: "birth" as const,
					time: pregnancy.due,
					pregnancy,
				})),
			)
			queue.sort((a, b) => a.time - b.time)
			while (queue.length > 0 && queue[0].time < year + 1) {
				const event = queue.shift()
				if (!event) break
				if (event.kind === "wedding")
					MARRIAGE.marry({ people, ...event.wedding })
				else if (event.kind === "death") processDeath(event)
				else {
					const birth = FERTILITY.birth({
						people,
						pregnancy: event.pregnancy,
						rng,
					})
					if (birth.motherDied)
						processDeath({
							kind: "death",
							time: event.time,
							death: {
								person: event.pregnancy.mother,
								time: event.time,
								serial: people.persons.deathSerial[event.pregnancy.mother],
							},
						})
				}
			}
		}
		PEOPLE.compactAlive({ people, time: 1266 })
		expect(people.persons.aliveCount / initial).toBeGreaterThan(0.75)
		expect(people.persons.aliveCount / initial).toBeLessThan(1.25)
	})
})
