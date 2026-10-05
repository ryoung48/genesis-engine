import { serialize } from "node:v8"
import { LIVE_OPINION_CONTEXT } from "@/model/history/sim/engine/opinion-context"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { OPINION } from "@/model/history/sim/people/opinion"
import { OPINION_MEMORY } from "@/model/history/sim/people/opinion/memory"
import type {
	HolderOpinions,
	OpinionReportParams,
	OpinionSampleParams,
	OpinionTracker,
	OpinionWindowReport,
	PopularitySummary,
} from "@/test/history-run/report/people-opinion/types"

const DISPOSITIONS = ["RIVAL", "SUSPICIOUS", "NEUTRAL", "FRIENDLY", "TRUSTED"]
const ROW_BYTES = 25

function tracker(): OpinionTracker {
	return {
		memory: OPINION.counts(),
		politics: LIVE_OPINION_CONTEXT.totals(),
		districtYears: [0, 0, 0, 0],
		unavailableDistrictYears: 0,
		sampleMs: 0,
	}
}

function districts(engine: HistoryState): number[] {
	const seats: number[] = []
	for (let seat = 0; seat < engine.P; seat++)
		if (
			engine.people.rulerOf[seat] >= 0 &&
			STATE_TITLES.isDistrictSeat({ state: engine, seat })
		)
			seats.push(seat)
	return seats
}

function sample({ engine, tracker }: OpinionSampleParams): void {
	const started = performance.now()
	const builds = engine.opinionPolitics.contextBuilds
	const people = engine.people
	const time = engine.time / STATE.yearMs
	const context = LIVE_OPINION_CONTEXT.of({ state: engine, time })
	for (const seat of districts(engine)) {
		const breakdown = OPINION.of({
			observer: people.rulerOf[seat],
			target: people.rulerOf[engine.sovereignCurrent[seat]],
			time,
			context,
		})
		if (breakdown)
			tracker.districtYears[OPINION.band(OPINION.loyaltyOf({ breakdown }))]++
		else tracker.unavailableDistrictYears++
	}
	engine.opinionPolitics.contextBuilds = builds
	tracker.sampleMs += performance.now() - started
}

function holderOpinions(engine: HistoryState): HolderOpinions {
	const people = engine.people
	const time = engine.time / STATE.yearMs
	const context = LIVE_OPINION_CONTEXT.of({ state: engine, time })
	const withReligion = [0, 0, 0, 0]
	const withoutReligion = [0, 0, 0, 0]
	let sum = 0
	let holders = 0
	for (const seat of districts(engine)) {
		const breakdown = OPINION.of({
			observer: people.rulerOf[seat],
			target: people.rulerOf[engine.sovereignCurrent[seat]],
			time,
			context,
		})
		if (!breakdown) continue
		const loyalty = OPINION.loyaltyOf({ breakdown })
		withReligion[OPINION.band(breakdown.total)]++
		withoutReligion[OPINION.band(loyalty)]++
		sum += loyalty
		holders++
	}
	return {
		holders,
		withReligion,
		withoutReligion,
		mean: holders > 0 ? sum / holders : null,
	}
}

function popularity(engine: HistoryState): PopularitySummary {
	const people = engine.people
	const time = engine.time / STATE.yearMs
	const context = LIVE_OPINION_CONTEXT.of({ state: engine, time })
	const holdersOf = new Map<number, number[]>()
	for (const seat of districts(engine)) {
		const realm = engine.sovereignCurrent[seat]
		const list = holdersOf.get(realm)
		if (list) list.push(people.rulerOf[seat])
		else holdersOf.set(realm, [people.rulerOf[seat]])
	}
	const values: number[] = []
	let holders = 0
	let empty = 0
	for (let realm = 0; realm < engine.P; realm++) {
		const ruler = people.rulerOf[realm]
		if (ruler < 0 || !STATE.isSovereign({ state: engine, p: realm })) continue
		const result = OPINION.popularity({
			ruler,
			holders: holdersOf.get(realm) ?? [],
			time,
			context,
		})
		if (result.count === 0) {
			empty++
			continue
		}
		values.push(result.value)
		holders += result.count
	}
	values.sort((a, b) => a - b)
	const quantile = (share: number) =>
		values.length > 0 ? values[Math.floor((values.length - 1) * share)] : null
	return {
		realms: values.length,
		realmsWithoutHolders: empty,
		meanHolders: values.length > 0 ? holders / values.length : null,
		mean:
			values.length > 0
				? values.reduce((sum, value) => sum + value, 0) / values.length
				: null,
		p10: quantile(0.1),
		p50: quantile(0.5),
		p90: quantile(0.9),
	}
}

function dispositions(engine: HistoryState): number[] {
	const counts = DISPOSITIONS.map(() => 0)
	for (let nation = 0; nation < engine.P; nation++) {
		if (
			engine.desolate[nation] ||
			!STATE.isSovereign({ state: engine, p: nation })
		)
			continue
		for (const other of STATE.getNationNeighbors({ state: engine, nation }))
			if (
				other > nation &&
				!engine.desolate[other] &&
				STATE.isSovereign({ state: engine, p: other })
			)
				counts[
					DISPOSITIONS.indexOf(
						STATE.getDisposition({ state: engine, a: nation, b: other }),
					)
				]++
	}
	return counts
}

function of({
	engine,
	tracker,
	record,
	from,
	to,
}: OpinionReportParams): OpinionWindowReport {
	const years = Math.max(1, to - from)
	const lo = from * STATE.yearMs
	const hi = to * STATE.yearMs
	const builds = engine.opinionPolitics.contextBuilds
	const holderOpinion = holderOpinions(engine)
	const popular = popularity(engine)
	engine.opinionPolitics.contextBuilds = builds
	const evaluations = [0, 0, 0, 0]
	const rebellions = [0, 0, 0, 0]
	let alliancesFormed = 0
	let alliancesEnded = 0
	for (const note of engine.events) {
		if (note.time < lo || note.time >= hi) continue
		if (note.tag === "alliance formed") alliancesFormed++
		else if (note.tag === "alliance ended") alliancesEnded++
		else if (
			note.tag === "rebellion evaluated" &&
			typeof note.data.holderOpinion === "number"
		) {
			const band = OPINION.band(note.data.holderOpinion)
			evaluations[band]++
			if (note.data.decision === "accepted") rebellions[band]++
		}
	}
	const memory = engine.people.memoryCounts
	const politics = engine.opinionPolitics
	const since = (key: "refreshes" | "expired" | "died") =>
		memory[key].map((value, index) => value - tracker.memory[key][index])
	const live = OPINION_MEMORY.reasons.map(() => 0)
	for (const targets of engine.people.memories.values())
		for (const entries of targets.values())
			for (const entry of entries) live[OPINION_MEMORY.codeOf(entry.reason)]++
	const refreshes = since("refreshes")
	const calls = politics.driftCalls - tracker.politics.driftCalls
	const perCall = (
		key: "driftBias" | "driftOriginalStep" | "driftTiltedStep",
	) => (calls > 0 ? (politics[key] - tracker.politics[key]) / calls : null)
	const originalStep = perCall("driftOriginalStep")
	const tiltedStep = perCall("driftTiltedStep")
	let recordRefreshRows = 0
	for (const targets of record.memoriesOf.values())
		for (const rows of targets.values()) recordRefreshRows += rows.length
	const report: OpinionWindowReport = {
		statistics: {
			holderOpinion,
			popularity: popular,
			rebellion: {
				districtYears: [...tracker.districtYears],
				unavailableDistrictYears: tracker.unavailableDistrictYears,
				evaluations,
				rebellions,
				perDistrictYear: rebellions.map((count, band) =>
					tracker.districtYears[band] > 0
						? count / tracker.districtYears[band]
						: null,
				),
			},
			memory: {
				live,
				refreshes,
				expired: since("expired"),
				died: since("died"),
			},
			drift: {
				calls,
				biased: politics.driftBiased - tracker.politics.driftBiased,
				bands: politics.driftBands.map(
					(count, band) => count - tracker.politics.driftBands[band],
				),
				meanBias: perCall("driftBias"),
				meanOriginalStep: originalStep,
				meanTiltedStep: tiltedStep,
				meanStepDelta:
					originalStep === null || tiltedStep === null
						? null
						: tiltedStep - originalStep,
			},
			diplomacy: {
				dispositions: dispositions(engine),
				alliancesFormed,
				alliancesEnded,
			},
			loyaltyEvaluations:
				politics.loyaltyEvaluations - tracker.politics.loyaltyEvaluations,
			contextBuilds: politics.contextBuilds - tracker.politics.contextBuilds,
			marriageCacheMisses:
				politics.marriageCacheMisses - tracker.politics.marriageCacheMisses,
			pruneVisited: memory.visited - tracker.memory.visited,
		},
		cost: {
			loyaltyMsPerYear:
				(politics.loyaltyMs - tracker.politics.loyaltyMs) / years,
			driftMsPerYear: (politics.driftMs - tracker.politics.driftMs) / years,
			pruneMsPerYear: (memory.pruneMs - tracker.memory.pruneMs) / years,
			reportSampleMsPerYear: tracker.sampleMs / years,
			logPayloadBytes:
				ROW_BYTES * refreshes.reduce((sum, count) => sum + count, 0),
			liveMemoryBytes: serialize(engine.people.memories).byteLength,
			recordMemoryBytes: serialize(record.memoriesOf).byteLength,
			recordRefreshRows,
		},
	}
	tracker.memory = structuredClone(memory)
	tracker.politics = structuredClone(politics)
	tracker.districtYears = [0, 0, 0, 0]
	tracker.unavailableDistrictYears = 0
	tracker.sampleMs = 0
	return report
}

export const PEOPLE_OPINION_REPORT = { tracker, sample, of }
