import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { STARTING_FAMILY } from "@/model/history/sim/people/family/starting"
import { STARTING_ANCHORS } from "@/model/history/sim/people/family/starting/anchors"
import { HEIRS } from "@/model/history/sim/people/heirs"
import type {
	FamiliesReport,
	FamiliesReportParams,
	FamilyCapture,
} from "@/test/history-run/report/people-families/types"

function attach(): FamilyCapture {
	const anchors = STARTING_ANCHORS.materialize
	const family = STARTING_FAMILY.materialize
	const capture: FamilyCapture = {
		peakInitializationHeapBytes: process.memoryUsage().heapUsed,
		skeleton: [],
		detach: () => {
			STARTING_ANCHORS.materialize = anchors
			STARTING_FAMILY.materialize = family
		},
	}
	STARTING_ANCHORS.materialize = (params) => {
		if (params.anchors.length > capture.skeleton.length)
			capture.skeleton = structuredClone(params.anchors)
		anchors(params)
		capture.peakInitializationHeapBytes = Math.max(
			capture.peakInitializationHeapBytes,
			process.memoryUsage().heapUsed,
		)
	}
	STARTING_FAMILY.materialize = (params) => {
		const person = family(params)
		capture.peakInitializationHeapBytes = Math.max(
			capture.peakInitializationHeapBytes,
			process.memoryUsage().heapUsed,
		)
		return person
	}
	return capture
}

function of({
	engine,
	peopleRecord,
	capture,
}: FamiliesReportParams): FamiliesReport {
	const people = engine.people
	const table = people.persons
	const time = engine.time / STATE.yearMs
	const live = (person: number) => table.death[person] > time
	const sovereigns: number[] = []
	const districts: number[] = []
	for (let seat = 0; seat < engine.P; seat++) {
		const person = people.rulerOf[seat]
		if (person < 0) continue
		;(STATE.isSovereign({ state: engine, p: seat })
			? sovereigns
			: districts
		).push(person)
	}
	const patricians = [...people.patricians.values()].flat()
	const holders = [...new Set([...sovereigns, ...districts, ...patricians])]
	const dynasties = new Map<number, number>()
	let roots = 0
	for (let person = 0; person < table.sex.length; person++) {
		const dynasty = table.dynasty[person]
		if (dynasty < 0) continue
		dynasties.set(dynasty, (dynasties.get(dynasty) ?? 0) + 1)
		if (table.father[person] < 0 && table.mother[person] < 0) roots++
	}
	const occupied = new Map<number, number>()
	let heirsMissing = 0
	const kin = { children: 0, grandchildren: 0, siblings: 0, nephews: 0 }
	for (const person of holders) {
		const dynasty = table.dynasty[person]
		occupied.set(dynasty, (occupied.get(dynasty) ?? 0) + 1)
		if (
			HEIRS.of({
				people,
				dying: person,
				time,
				preference: PEOPLE.preference(
					STATE.originOf({ state: engine, realm: table.home[person] }),
				),
				eligible: () => true,
			}).heir < 0
		)
			heirsMissing++
		kin.children += table.children[person].length
		for (const child of table.children[person])
			kin.grandchildren += table.children[child].length
		const siblings = new Set<number>()
		for (const parent of [table.mother[person], table.father[person]])
			if (parent >= 0)
				for (const sibling of table.children[parent])
					if (sibling !== person) siblings.add(sibling)
		kin.siblings += siblings.size
		for (const sibling of siblings)
			kin.nephews += table.children[sibling].length
	}
	const rejected = people.startingFamilies.rejectedCandidates
	const measurementStarted = performance.now()
	setFlagsFromString("--expose_gc")
	const collect = runInNewContext("gc") as () => void
	const copies: unknown[] = []
	const retained = (value: unknown): number => {
		collect()
		const before = process.memoryUsage()
		copies.push(structuredClone(value))
		collect()
		const after = process.memoryUsage()
		return Math.max(
			0,
			after.heapUsed -
				before.heapUsed +
				after.arrayBuffers -
				before.arrayBuffers,
		)
	}
	const rejectedColumns = Object.fromEntries(
		Object.entries(table).map(([key, values]) => [
			key,
			rejected.map((person) => values[person]),
		]),
	)
	const retainedBytes = {
		people: retained([
			table,
			people.alive,
			people.residenceHistory,
			people.deliveries,
		]),
		record: retained(peopleRecord),
		rejectedCandidateColumns: retained(rejectedColumns),
		skeleton: retained(capture.skeleton),
	}
	const living = table.death.filter((death) => death > time).length
	return {
		...structuredClone(people.startingFamilies),
		people: table.sex.length,
		living,
		dead: table.sex.length - living,
		holders: {
			sovereign: sovereigns.length,
			district: districts.length,
			patrician: patricians.length,
		},
		heirsMissing,
		dynastyRoots: roots,
		dynasties: dynasties.size,
		singletonDynasties: [...dynasties.values()].filter(
			(members) => members === 1,
		).length,
		occupiedHouseDynasties: occupied.size,
		sharedHouseDynasties: [...occupied.values()].filter((count) => count > 1)
			.length,
		priorMarriages: peopleRecord.marriages.filter(
			(marriage) =>
				Math.min(
					peopleRecord.persons.deathTimeMs[marriage.husband],
					peopleRecord.persons.deathTimeMs[marriage.wife],
				) <= engine.time,
		).length,
		kin,
		rejectedCandidatesLiving: rejected.filter(live).length,
		rejectedCandidatesDead: rejected.filter((person) => !live(person)).length,
		retainedBytes,
		peakInitializationHeapBytes: capture.peakInitializationHeapBytes,
		memoryMeasurementMs: performance.now() - measurementStarted,
	}
}

export const PEOPLE_FAMILIES_REPORT = { attach, of }
