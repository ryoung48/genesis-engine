import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import type {
	ValidateEngineParams,
	ValidateRecordParams,
	ValidationTracker,
	ViolationParams,
} from "@/test/history-run/report/validation/types"

function createTracker(): ValidationTracker {
	return { violations: {}, examples: {} }
}

function violation({ tracker, rule, detail }: ViolationParams): void {
	tracker.violations[rule] = (tracker.violations[rule] ?? 0) + 1
	tracker.examples[rule] ??= detail
}

// Every standing alliance is still one the two realms may hold.
function alliances({ engine, tracker }: ValidateEngineParams): void {
	const year = engine.time / STATE.yearMs
	for (let a = 0; a < engine.P; a++) {
		if (engine.desolate[a] || !STATE.isSovereign({ state: engine, p: a }))
			continue
		for (const b of engine.relationColumns[a])
			if (
				b > a &&
				STATE.getRelation({ state: engine, a, b }) === STATE.rel.ALLY &&
				!STATE.canAlly({ state: engine, a, b })
			)
				violation({
					tracker,
					rule: "alliance no longer allowed",
					detail: `realms ${a} and ${b} in ${year.toFixed(0)}`,
				})
	}
}

// Every sovereign seat with a ruler has a living one.
function rulers({ engine, tracker }: ValidateEngineParams): void {
	const year = engine.time / STATE.yearMs
	for (let seat = 0; seat < engine.P; seat++) {
		const ruler = engine.people.rulerOf[seat]
		if (ruler < 0 || !STATE.isSovereign({ state: engine, p: seat })) continue
		if (!PEOPLE.aliveAt({ people: engine.people, person: ruler, time: year }))
			violation({
				tracker,
				rule: "sovereign ruler is dead",
				detail: `seat ${seat}, person ${ruler} in ${year.toFixed(0)}`,
			})
	}
}

// Read straight after a yearly people pass. Both columns agree, no betrothed
// person has a living spouse, every pair was made between 12+ parties within
// the age gap with one under 16, is wed within a yearly pass of coming of age,
// and stands on a marriage alliance whose rulers are tied by marriage.
function betrothals({ engine, tracker }: ValidateEngineParams): void {
	const people = engine.people
	const table = people.persons
	const time = engine.time / STATE.yearMs
	const check = (ok: boolean, rule: string, person: number) => {
		if (!ok)
			violation({
				tracker,
				rule,
				detail: `person ${person} in ${time.toFixed(0)}`,
			})
	}
	for (const person of people.alive) {
		const partner = table.betrothed[person]
		if (partner < 0) continue
		check(
			table.betrothed[partner] === person &&
				table.betrothedAt[partner] === table.betrothedAt[person],
			"betrothal columns disagree",
			person,
		)
		if (table.death[person] <= time || table.death[partner] <= time) continue
		const spouse = table.spouse[person]
		check(
			spouse < 0 || table.death[spouse] <= time,
			"betrothed with a living spouse",
			person,
		)
		const made = table.betrothedAt[person]
		const ages = [made - table.birth[person], made - table.birth[partner]]
		check(
			Math.min(...ages) >= BETROTHAL.minAge &&
				Math.min(...ages) < BETROTHAL.adultAge &&
				Math.abs(ages[0] - ages[1]) <= BETROTHAL.maxAgeGap,
			"betrothal made outside its age rules",
			person,
		)
		check(
			Math.min(time - table.birth[person], time - table.birth[partner]) <
				BETROTHAL.adultAge + 1,
			"betrothed pair not wed on coming of age",
			person,
		)
		const realmA = HOUSEHOLD.realmOf({ people, person })
		const realmB = HOUSEHOLD.realmOf({ people, person: partner })
		check(
			STATE.getRelation({ state: engine, a: realmA, b: realmB }) !==
				STATE.rel.WAR,
			"betrothal between realms at war",
			person,
		)
		check(
			people.marriageAlliances.has(
				Math.min(realmA, realmB) * engine.P + Math.max(realmA, realmB),
			),
			"betrothal without a marriage alliance",
			person,
		)
	}
	for (const { first, second } of people.marriageAlliances.values()) {
		const rulerA = people.rulerOf[first]
		const rulerB = people.rulerOf[second]
		check(
			rulerA >= 0 &&
				rulerB >= 0 &&
				PEOPLE.tiedByMarriage({ people, a: rulerA, b: rulerB, time }),
			"marriage alliance without a marriage tie",
			rulerA,
		)
	}
}

// Every district is one connected piece, hangs off its realm or another
// district seat, and ranks one below its realm's top tier.
function districts({ engine, tracker }: ValidateEngineParams): void {
	const year = engine.time / STATE.yearMs
	const fail = (rule: string, seat: number) =>
		violation({
			tracker,
			rule,
			detail: `province ${seat} in ${year.toFixed(0)}`,
		})
	for (let seat = 0; seat < engine.P; seat++) {
		if (!STATE_TITLES.isDistrictSeat({ state: engine, seat })) continue
		const land = new Set(
			STATE.getNationProvinces({ state: engine, root: seat }),
		)
		const reached = new Set([seat])
		const queue = [seat]
		for (let head = 0; head < queue.length; head++)
			for (const neighbor of STATE.getProvinceNeighbors({
				state: engine,
				p: queue[head],
			})) {
				if (!land.has(neighbor) || reached.has(neighbor)) continue
				reached.add(neighbor)
				queue.push(neighbor)
			}
		if (reached.size !== land.size) fail("district not connected", seat)
	}
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p] || engine.stateless[p]) continue
		const realm = engine.sovereignCurrent[p]
		const parent = engine.parentCurrent[p]
		if (
			p !== realm &&
			parent !== realm &&
			!STATE_TITLES.isDistrictSeat({ state: engine, seat: parent })
		)
			fail("province outside its realm's districts", p)
		if (
			STATE_TITLES.isDistrictSeat({ state: engine, seat: p }) &&
			engine.seatRank[p] !== engine.topTier[realm] - 1
		)
			fail("district seat at the wrong rank", p)
	}
}

// The people record agrees with the engine it was built from.
function record({ engine, tracker, people }: ValidateRecordParams): void {
	const years = engine.time / STATE.yearMs
	const table = engine.people.persons
	const fail = (rule: string, detail: string) =>
		violation({ tracker, rule, detail })
	if (PEOPLE_RECORD.count(people) !== table.birth.length)
		fail(
			"record and engine count different people",
			`${PEOPLE_RECORD.count(people)} recorded, ${table.birth.length} born`,
		)
	for (const tenures of [
		...people.tenuresOfSeat.values(),
		...people.regentsOfSeat.values(),
	])
		for (let i = 1; i < tenures.length; i++)
			if (
				people.tenures[tenures[i - 1]].endTimeMs >
				people.tenures[tenures[i]].startTimeMs
			)
				fail("tenures of a seat overlap", `tenure ${tenures[i]}`)
	for (const marriage of people.marriages)
		if (
			!PEOPLE_RECORD.has({ people, id: marriage.husband }) ||
			!PEOPLE_RECORD.has({ people, id: marriage.wife })
		)
			fail(
				"marriage names an unrecorded person",
				`${marriage.husband} and ${marriage.wife}`,
			)
	for (const [realm, regency] of engine.people.regencies) {
		if (regency.regent < 0) continue
		if (
			!PEOPLE_RECORD.has({ people, id: regency.regent }) ||
			years - table.birth[regency.regent] < 16 ||
			(engine.people.rulerOf[realm] === regency.ward &&
				table.death[regency.regent] <= years)
		)
			fail("regent unrecorded, underage or dead", `realm ${realm}`)
	}
	for (const claim of engine.people.deposed.values())
		if (
			claim.generation >= 2 ||
			!PEOPLE_RECORD.has({ people, id: claim.claimant })
		)
			fail("deposed claim stale or unrecorded", `claimant ${claim.claimant}`)
	const count = Math.min(PEOPLE_RECORD.count(people), table.birth.length)
	for (let id = 0; id < count; id++) {
		const recorded = PEOPLE_RECORD.deathTimeMs({ people, id })
		const died = table.death[id] * STATE.yearMs
		if (
			died > engine.time
				? recorded !== Infinity
				: Math.abs(recorded - died) >= 1
		)
			fail("recorded death differs from the engine", `person ${id}`)
	}
	for (let seat = 0; seat < engine.P; seat++) {
		const ruler = engine.people.rulerOf[seat]
		if (ruler < 0 || !STATE.isSovereign({ state: engine, p: seat })) continue
		const view = PERSON_QUERY.view({ people, id: ruler, timeMs: engine.time })
		if (
			!view?.tenures.some((tenure) => tenure.endTimeMs === null) ||
			PERSON_QUERY.health({ people, id: ruler, timeMs: engine.time }) === null
		)
			fail("ruler without an open tenure or health", `seat ${seat}`)
	}
}

// Thrown once the report is saved, so a violation late in a long run still
// leaves its statistics on disk.
function assert(tracker: ValidationTracker): void {
	const rules = Object.keys(tracker.violations)
	if (rules.length === 0) return
	throw new Error(
		`History validation failed: ${rules
			.map(
				(rule) =>
					`${rule} x${tracker.violations[rule]} (first: ${tracker.examples[rule]})`,
			)
			.join("; ")}`,
	)
}

export const HISTORY_VALIDATION = {
	tracker: createTracker,
	alliances,
	rulers,
	betrothals,
	districts,
	record,
	assert,
}
