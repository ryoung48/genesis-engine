import { DATE } from "@/model/history/earth/date"
import type { HeirPlanChange } from "@/model/history/record/rulers/types"
import { DERIVE } from "@/model/history/sim/engine/derive"
import { ROYAL_MARRIAGE } from "@/model/history/sim/engine/events/diplomacy/marriage"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { TRANSLATOR } from "@/model/history/sim/record/translator"
import type {
	ValidateEngineParams,
	ValidateHeirsParams,
	ValidationTracker,
	ViolationParams,
} from "@/test/history-run/report/validation/types"

function createTracker(): ValidationTracker {
	return {
		violations: {},
		examples: {},
		planCreations: new Map(),
		planCancellations: new Set(),
		planFulfillments: new Set(),
		planRecordCursors: new Map(),
		lastTransactionId: -1,
		serializedPlanBytes: 0,
	}
}

function heirs({ engine, tracker, record }: ValidateHeirsParams): void {
	const fail = (rule: string) =>
		violation({ tracker, rule, detail: `year ${engine.time / STATE.yearMs}` })
	const date = (time: number) =>
		DATE.timeMsToEu4Date(TRANSLATOR.recordTime(time))
	const creations = new Map(
		engine.journal.flatMap((transaction) =>
			transaction.heirCreations.map(
				(created) => [created.owner.rulerId, created] as const,
			),
		),
	)
	const fulfillments = new Map(
		engine.journal.flatMap((transaction) =>
			transaction.heirFulfillments.map(
				(fulfilled) => [fulfilled.rulerId, fulfilled] as const,
			),
		),
	)
	const cancellations = new Map(
		engine.journal.flatMap((transaction) =>
			transaction.heirCancellations.map(
				(cancelled) => [cancelled.rulerId, cancelled] as const,
			),
		),
	)
	for (const transaction of engine.journal) {
		if (transaction.transactionId <= tracker.lastTransactionId)
			fail("heir transaction order")
		tracker.lastTransactionId = transaction.transactionId
	}
	const changes: HeirPlanChange[] = []
	for (const [id, log] of record.events.nationEvents.entries()) {
		const cursor = tracker.planRecordCursors.get(id) ?? 0
		for (const event of log.events.slice(cursor)) {
			if (event.kind !== "heirPlanChange") continue
			tracker.serializedPlanBytes += Buffer.byteLength(
				JSON.stringify(event),
				"utf8",
			)
			if (
				/"(?:death\w*|successionDate)"\s*:/.test(JSON.stringify(event.payload))
			)
				fail("future death in heir record")
			changes.push(event.payload as unknown as HeirPlanChange)
		}
		tracker.planRecordCursors.set(id, log.events.length)
	}
	changes.sort((a, b) => a.transactionId - b.transactionId)
	for (const change of changes) {
		for (const created of change.created) {
			const id = created.owner.rulerId
			const snapshot = creations.get(id)
			if (!snapshot || tracker.planCreations.has(id)) {
				fail("duplicated or unexpected heir creation")
				continue
			}
			const expected = {
				owner: snapshot.owner,
				birthDate: date(snapshot.birthTimeMs),
				relation: snapshot.relation,
				heir: snapshot.heir
					? {
							ref: snapshot.heir.ref,
							birthDate: date(snapshot.heir.birthTimeMs),
						}
					: null,
				juniors: snapshot.juniors.map((child) => ({
					ref: child.ref,
					birthDate: date(child.birthTimeMs),
				})),
			}
			if (JSON.stringify(created) !== JSON.stringify(expected))
				fail("changed heir creation identity or birth")
			tracker.planCreations.set(id, snapshot)
			creations.delete(id)
		}
	}
	for (const change of changes) {
		for (const fulfilled of change.fulfilled) {
			const id = fulfilled.rulerId
			const snapshot = fulfillments.get(id)
			const promise = tracker.planCreations.get(id)
			if (
				!snapshot ||
				!promise ||
				tracker.planFulfillments.has(id) ||
				tracker.planCancellations.has(id)
			)
				fail("duplicated or unexpected heir fulfillment")
			if (
				snapshot &&
				JSON.stringify(fulfilled) !==
					JSON.stringify({
						rulerId: id,
						relation: snapshot.relation,
						house: snapshot.house,
						claim: snapshot.claim,
						successor: snapshot.successor,
						birthDate: date(snapshot.birthTimeMs),
					})
			)
				fail("changed heir fulfillment")
			if (
				promise?.relation === "son" &&
				(JSON.stringify(fulfilled.successor) !==
					JSON.stringify(promise.heir?.ref) ||
					fulfilled.birthDate !== date(promise.heir!.birthTimeMs))
			)
				fail("broken direct child promise")
			tracker.planFulfillments.add(id)
			fulfillments.delete(id)
		}
		for (const cancelled of change.cancelled) {
			const id = cancelled.rulerId
			if (
				!tracker.planCreations.has(id) ||
				tracker.planCancellations.has(id) ||
				tracker.planFulfillments.has(id) ||
				cancellations.get(id)?.reason !== cancelled.reason
			)
				fail("duplicated or unexpected heir cancellation")
			tracker.planCancellations.add(id)
			cancellations.delete(id)
		}
	}
	if (creations.size || fulfillments.size || cancellations.size)
		fail("dropped heir snapshots")
	const stats = engine.heirPlanStats
	if (tracker.planCreations.size !== stats.rolled)
		fail("dropped heir creations")
	if (
		tracker.planCancellations.size !==
		stats.cancelledUnused + stats.cancelledUnreachable
	)
		fail("dropped heir cancellations")
	if (stats.missingPlans) fail("missing retained heir plans")
	if (stats.unreachablePlans) fail("unreachable retained heir plans")
	if (stats.biologyViolations) fail("impossible planned births")
	if (stats.identityViolations) fail("changed promised ruler identity or birth")
	if (engine.heirPlans.size > 2 * engine.rulerRealmCounts.size)
		fail("heir plan retention bound")
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

// Every province is exactly one of desolate, uninhabited, stateless or
// state-held; nobody lives on unreached land, the founding and absorption
// rules hold, and the land counters agree with the arrays.
function landStatus({ engine, tracker }: ValidateEngineParams): void {
	const year = engine.time / STATE.yearMs
	DERIVE.ensureHierarchyClean(engine)
	for (let p = 0; p < engine.P; p++) {
		const detail = `province ${p} in ${year.toFixed(0)}`
		if (engine.desolate[p]) {
			if (engine.uninhabited[p])
				violation({ tracker, rule: "desolate and uninhabited", detail })
			continue
		}
		if (engine.uninhabited[p]) {
			if (!engine.stateless[p])
				violation({ tracker, rule: "uninhabited yet held", detail })
			if (engine.popRuralCurrent[p] + engine.popUrbanCurrent[p] > 0)
				violation({ tracker, rule: "populated uninhabited land", detail })
		}
		const sovereign = engine.sovereignCurrent[p]
		if (engine.stateless[p] && sovereign >= 0)
			violation({ tracker, rule: "stateless land with a sovereign", detail })
		if (!engine.stateless[p] && sovereign < 0)
			violation({ tracker, rule: "state land without a sovereign", detail })
	}
	const { counters } = engine.land
	if (counters.absorptionViolations > 0)
		violation({
			tracker,
			rule: "absorbed land that was not open",
			detail: `${counters.absorptionViolations} in ${year.toFixed(0)}`,
		})
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
	heirs,
	tracker: createTracker,
	alliances,
	rulers,
	unions,
	marriageTies,
	districts,
	landStatus,
	assert,
}
