import { ROYAL_MARRIAGE } from "@/model/history/sim/engine/events/diplomacy/marriage"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type {
	ValidateEngineParams,
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

// Every sovereign realm has a ruler who is alive, born before dying, a child
// only under a regency, and whose succession is queued once.
function rulers({ engine, tracker }: ValidateEngineParams): void {
	const year = engine.time / STATE.yearMs
	for (let p = 0; p < engine.P; p++) {
		if (
			engine.desolate[p] ||
			engine.stateless[p] ||
			!STATE.isSovereign({ state: engine, p })
		)
			continue
		const detail = `realm ${p} in ${year.toFixed(0)}`
		if (!STATE_RULERS.has({ state: engine, p }))
			violation({ tracker, rule: "sovereign without a ruler", detail })
		else {
			const { birth, death } = engine.leaderRuntime
			if (death[p] <= birth[p])
				violation({ tracker, rule: "ruler dies before birth", detail })
			if (death[p] < engine.time - 1)
				violation({ tracker, rule: "sovereign ruler is dead", detail })
			if (
				STATE_RULERS.ageYears({ state: engine, p }) < STATE_RULERS.adultAge !==
				(engine.regency[p] === 1)
			)
				violation({ tracker, rule: "regency disagrees with age", detail })
		}
	}
}

// Realms sharing a ruler belong to one union group.
function unions({ engine, tracker }: ValidateEngineParams): void {
	const year = engine.time / STATE.yearMs
	const groups = new Map<number, Set<number>>()
	for (let p = 0; p < engine.P; p++) {
		if (
			engine.desolate[p] ||
			engine.stateless[p] ||
			!STATE.isSovereign({ state: engine, p })
		)
			continue
		const ruler = engine.leaderRuntime.rulerId[p]
		if (ruler < 0) continue
		const senior = STATE.seniorOf({ state: engine, p })
		const group = groups.get(ruler) ?? new Set<number>()
		group.add(senior >= 0 ? senior : p)
		groups.set(ruler, group)
	}
	for (const [ruler, group] of groups)
		if (group.size > 1)
			violation({
				tracker,
				rule: "ruler of realms outside one union group",
				detail: `ruler ${ruler}, groups ${[...group].join(",")} in ${year.toFixed(0)}`,
			})
	for (const junior of engine.unionGenerations.keys())
		if (STATE.seniorOf({ state: engine, p: junior }) < 0)
			violation({
				tracker,
				rule: "union generation without a senior",
				detail: `realm ${junior} in ${year.toFixed(0)}`,
			})
}

// Every marriage tie joins two allied sovereign realms that marry for alliance.
function marriageTies({ engine, tracker }: ValidateEngineParams): void {
	const year = engine.time / STATE.yearMs
	for (const { first, second } of engine.marriageTies.values())
		if (
			!ROYAL_MARRIAGE.marries({ state: engine, realm: first }) ||
			!ROYAL_MARRIAGE.marries({ state: engine, realm: second }) ||
			STATE.getRelation({ state: engine, a: first, b: second }) !==
				STATE.rel.ALLY
		)
			violation({
				tracker,
				rule: "marriage tie without an alliance",
				detail: `realms ${first} and ${second} in ${year.toFixed(0)}`,
			})
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
	unions,
	marriageTies,
	districts,
	assert,
}
