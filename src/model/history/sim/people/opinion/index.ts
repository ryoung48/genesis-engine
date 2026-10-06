import { KINSHIP } from "@/model/history/sim/people/kinship"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { OPINION_MEMORY } from "@/model/history/sim/people/opinion/memory"
import type {
	LoyaltyParams,
	MemoryCounts,
	OpinionBreakdown,
	OpinionParams,
	Popularity,
	PopularityParams,
	PruneParams,
	RememberParams,
} from "@/model/history/sim/people/opinion/types"
import { TRAITS } from "@/model/history/sim/people/traits"
import type { PersonAtParams } from "@/model/history/sim/people/types"

function of({
	observer,
	target,
	time,
	context,
}: OpinionParams): OpinionBreakdown | null {
	const a = context.personOf(observer)
	const b = context.personOf(target)
	if (!a || !b || observer === target) return null
	const personality = TRAITS.compatibility({
		first: { character: a.character, age: a.age },
		second: { character: b.character, age: b.age },
	})
	const culture =
		a.culture >= 0 && b.culture >= 0
			? a.culture === b.culture
				? 10
				: a.heritage >= 0 && a.heritage === b.heritage
					? 5
					: 0
			: 0
	const religion = a.religion >= 0 && a.religion === b.religion ? 15 : 0
	const reputation = TRAITS.reputation({
		character: b.character,
		age: b.age,
		vassal: a.districtSovereigns.some((seat) =>
			b.sovereignSeats.includes(seat),
		),
	})
	const kin = KINSHIP.closeKin({
		context: context.kinship,
		a: observer,
		b: target,
	})
		? 10
		: 0
	const spouse = context.married({ a: observer, b: target, time }) ? 10 : 0
	let memories = 0
	for (const memory of context.memoriesOf({ observer, target, time }))
		memories += OPINION_MEMORY.contribution({ memory, time })
	const unclamped =
		personality + culture + religion + reputation + kin + spouse + memories
	return {
		personality,
		culture,
		religion,
		reputation,
		kin,
		spouse,
		memories,
		unclamped,
		total: Math.max(-100, Math.min(100, unclamped)),
	}
}

function counts(): MemoryCounts {
	const zero = () => OPINION_MEMORY.reasons.map(() => 0)
	return {
		refreshes: zero(),
		expired: zero(),
		died: zero(),
		visited: 0,
		pruneMs: 0,
	}
}

function alive({ people, person, time }: PersonAtParams): boolean {
	const table = people.persons
	return (
		person >= 0 &&
		person < table.sex.length &&
		table.birth[person] <= time &&
		table.death[person] > time
	)
}

// A repeated slot restarts from full strength with the new reason instead of
// stacking. Returns whether the observer and target are two living people.
function remember({
	people,
	observer,
	target,
	reason,
	time,
}: RememberParams): boolean {
	if (
		observer === target ||
		!alive({ people, person: observer, time }) ||
		!alive({ people, person: target, time })
	)
		return false
	let targets = people.memories.get(observer)
	if (!targets) {
		targets = new Map()
		people.memories.set(observer, targets)
	}
	const entries = targets.get(target) ?? []
	const slot = OPINION_MEMORY.slotOf(reason)
	const existing = entries.find(
		(entry) => OPINION_MEMORY.slotOf(entry.reason) === slot,
	)
	if (existing) {
		existing.reason = reason
		existing.start = time
	} else entries.push({ reason, start: time })
	targets.set(target, entries)
	people.memoryCounts.refreshes[OPINION_MEMORY.codeOf(reason)]++
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "opinion_memory", time, observer, target, reason },
	})
	return true
}

// Drops faded memories and those of or about the dead. The record keeps every
// refresh.
function prune({ people, time }: PruneParams): void {
	const started = performance.now()
	const totals = people.memoryCounts
	for (const [observer, targets] of people.memories) {
		const observerAlive = alive({ people, person: observer, time })
		for (const [target, entries] of targets) {
			const pairAlive = observerAlive && alive({ people, person: target, time })
			const kept = entries.filter((memory) => {
				totals.visited++
				const code = OPINION_MEMORY.codeOf(memory.reason)
				if (OPINION_MEMORY.expired({ memory, time })) totals.expired[code]++
				else if (!pairAlive) totals.died[code]++
				else return true
				return false
			})
			if (kept.length === 0) targets.delete(target)
			else if (kept.length < entries.length) targets.set(target, kept)
		}
		if (targets.size === 0) people.memories.delete(observer)
	}
	totals.pruneMs += performance.now() - started
}

// A holder's support for their ruler. Everyone in a realm shares its religion,
// so that term is left out.
function loyaltyOf({ breakdown }: LoyaltyParams): number {
	return breakdown
		? Math.max(-100, Math.min(100, breakdown.unclamped - breakdown.religion))
		: 0
}

function band(value: number): number {
	return value < -50 ? 0 : value < 0 ? 1 : value < 50 ? 2 : 3
}

function popularity({
	ruler,
	holders,
	time,
	context,
}: PopularityParams): Popularity {
	const bands = [0, 0, 0, 0]
	let sum = 0
	let count = 0
	for (const holder of new Set(holders)) {
		const breakdown = of({ observer: holder, target: ruler, time, context })
		if (!breakdown) continue
		const loyalty = loyaltyOf({ breakdown })
		sum += loyalty
		count++
		bands[band(loyalty)]++
	}
	return { value: count > 0 ? sum / count : 0, count, bands }
}

export const OPINION = {
	of,
	counts,
	remember,
	prune,
	loyaltyOf,
	band,
	popularity,
}
