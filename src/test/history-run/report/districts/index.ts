import { DERIVE } from "@/model/history/sim/engine/derive"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { PEOPLE } from "@/model/history/sim/people"
import { DEJURE } from "@/model/society/dejure"
import { TITLES } from "@/model/society/titles"
import type {
	DistrictCapture,
	DistrictEngineParams,
	DistrictReport,
	DistrictSampleParams,
	DistrictSummaryParams,
	DistrictTracker,
} from "@/test/history-run/report/districts/types"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics"

function counts(): Record<string, number> {
	return Object.fromEntries(TITLES.tierOrder.map((tier) => [tier, 0]))
}

function tiers({ engine }: DistrictEngineParams): Map<number, number> {
	DERIVE.ensureHierarchyClean(engine)
	const result = new Map<number, number>()
	for (let p = 0; p < engine.P; p++)
		if (
			!engine.desolate[p] &&
			!engine.stateless[p] &&
			engine.sovereignCurrent[p] === p
		)
			result.set(p, STATE_TITLES.topTier({ state: engine, realm: p }))
	return result
}

function capture({ engine }: DistrictEngineParams): DistrictCapture {
	const tracker: DistrictTracker = {
		tiers: tiers({ engine }),
		changes: [],
		reseatings: [],
		derivations: [],
	}
	const derive = DEJURE.deriveParents
	const reseat = DISTRICTS.reseat
	DEJURE.deriveParents = (params) => {
		const started = performance.now()
		try {
			return derive(params)
		} finally {
			tracker.derivations.push({
				year: engine.time / STATE.yearMs,
				ms: performance.now() - started,
			})
		}
	}
	DISTRICTS.reseat = (params) => {
		const displaced = params.displaced.filter(
			(holder) =>
				params.state.people.persons.heldSeats[holder.person].length === 0 &&
				PEOPLE.aliveAt({
					people: params.state.people,
					person: holder.person,
					time: params.state.time / STATE.yearMs,
				}),
		)
		const moves = reseat(params)
		if (params.reason !== "partition")
			tracker.reseatings.push({
				year: engine.time / STATE.yearMs,
				displaced,
				moves,
			})
		return moves
	}
	return {
		tracker,
		detach: () => {
			DEJURE.deriveParents = derive
			DISTRICTS.reseat = reseat
		},
	}
}

function sample({ engine, tracker }: DistrictSampleParams): void {
	const next = tiers({ engine })
	for (const [realm, tier] of next) {
		const previous = tracker.tiers.get(realm)
		if (previous !== undefined && previous !== tier)
			tracker.changes.push({
				year: engine.time / STATE.yearMs,
				realm,
				from: previous,
				to: tier,
			})
	}
	tracker.tiers = next
}

function summarize({
	engine,
	tracker,
	from,
	to,
}: DistrictSummaryParams): DistrictReport {
	const report: DistrictReport = {
		realmsByTopTier: counts(),
		seatsByTier: counts(),
		heldByTier: counts(),
		seats: 0,
		held: 0,
		attached: { crown: 0, district: 0, separated: 0 },
		crownLandShare: {},
		displaced: counts(),
		promoted: counts(),
		demoted: counts(),
		landless: counts(),
		rises: counts(),
		falls: counts(),
		repeatedTierChanges: 0,
		deriveMs: 0,
		deriveCalls: 0,
	}
	const crownShares = new Map<number, number[]>()
	for (const [realm, top] of tiers({ engine })) {
		report.realmsByTopTier[TITLES.tierOrder[top]]++
		const provinces = STATE.getNationProvinces({
			state: engine,
			root: realm,
		}).filter((p) => !engine.desolate[p])
		const placed = new Set<number>()
		const region =
			top >= 2
				? DEJURE.tierRegion({
						titles: engine.titles,
						provinceCount: engine.P,
						tier: top - 1,
					})
				: null
		const crownTitles = new Set<number>()
		for (const p of provinces)
			if (p === realm || engine.seatRank[p] === top) {
				placed.add(p)
				if (region) crownTitles.add(region[p])
			}
		let crown = 0
		for (const p of provinces) {
			if (
				p === realm ||
				(engine.parentCurrent[p] === realm && !engine.districtSeat[p])
			)
				crown++
			if (
				top <= 1 ||
				(region &&
					region[p] >= 0 &&
					engine.titles.holder[region[p]] === realm &&
					crownTitles.has(region[p]))
			)
				placed.add(p)
			if (!STATE_TITLES.isDistrictSeat({ state: engine, seat: p })) continue
			report.seats++
			report.seatsByTier[TITLES.tierOrder[engine.seatRank[p]]]++
			if (engine.people.rulerOf[p] >= 0) {
				report.held++
				report.heldByTier[TITLES.tierOrder[engine.seatRank[p]]]++
			}
			placed.add(p)
			if (!region) continue
			const queue = [p]
			for (let head = 0; head < queue.length; head++) {
				const current = queue[head]
				for (
					let j = engine.provinceAdjOffset[current];
					j < engine.provinceAdjOffset[current + 1];
					j++
				) {
					const neighbor = engine.provinceAdjList[j]
					if (
						engine.desolate[neighbor] ||
						engine.sovereignCurrent[neighbor] !== realm ||
						region[neighbor] !== region[p] ||
						placed.has(neighbor)
					)
						continue
					placed.add(neighbor)
					queue.push(neighbor)
				}
			}
		}
		for (const p of provinces) {
			if (placed.has(p)) continue
			if (engine.parentCurrent[p] === realm) report.attached.crown++
			else report.attached.district++
			if (region && region[p] >= 0 && engine.titles.holder[region[p]] === realm)
				report.attached.separated++
		}
		const shares = crownShares.get(top) ?? []
		shares.push(crown / Math.max(1, provinces.length))
		crownShares.set(top, shares)
	}
	for (const [tier, values] of crownShares)
		report.crownLandShare[TITLES.tierOrder[tier]] =
			REPORT_STATISTICS.summarize(values)
	for (const entry of tracker.reseatings) {
		if (entry.year < from || entry.year >= to) continue
		for (const holder of entry.displaced)
			report.displaced[TITLES.tierOrder[holder.rank]]++
		for (const move of entry.moves) {
			if (!entry.displaced.some((holder) => holder.person === move.person))
				report.displaced[TITLES.tierOrder[move.rank]]++
			report[
				move.reason === "promotion"
					? "promoted"
					: move.reason === "demotion"
						? "demoted"
						: "landless"
			][TITLES.tierOrder[move.rank]]++
		}
	}
	const changes = new Map<number, number>()
	for (const change of tracker.changes) {
		if (change.year <= from || change.year > to) continue
		report[change.to > change.from ? "rises" : "falls"][
			TITLES.tierOrder[change.from]
		]++
		changes.set(change.realm, (changes.get(change.realm) ?? 0) + 1)
	}
	report.repeatedTierChanges = [...changes.values()].filter(
		(count) => count > 1,
	).length
	for (const entry of tracker.derivations) {
		if (entry.year < from || entry.year >= to) continue
		report.deriveCalls++
		report.deriveMs += entry.ms
	}
	return report
}

export const DISTRICTS_REPORT = { capture, sample, summarize }
