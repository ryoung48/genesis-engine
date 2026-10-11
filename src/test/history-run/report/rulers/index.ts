import { ROYAL_MARRIAGE } from "@/model/history/sim/engine/events/diplomacy/marriage"
import { STATE } from "@/model/history/sim/engine/state"
import type {
	RulerSampleParams,
	RulersReport,
	RulerTracker,
	RulerWindowParams,
} from "@/test/history-run/report/rulers/types"

function tracker(): RulerTracker {
	return {
		cursor: 0,
		tieYears: 0,
		tiedRealmYears: 0,
		marryingRealmYears: 0,
		realmYears: 0,
		sharedDynastyRealmYears: 0,
		unionJuniorYears: 0,
	}
}

// Call once a year, after the year's events.
function sample({ engine, tracker: tracked }: RulerSampleParams): void {
	tracked.tieYears += engine.marriageTies.size
	const tied = new Set<number>()
	for (const { first, second } of engine.marriageTies.values()) {
		tied.add(first)
		tied.add(second)
	}
	for (let p = 0; p < engine.P; p++) {
		if (
			engine.desolate[p] ||
			engine.stateless[p] ||
			!STATE.isSovereign({ state: engine, p }) ||
			engine.leaderRuntime.rulerId[p] < 0
		)
			continue
		tracked.realmYears++
		if (ROYAL_MARRIAGE.marries({ state: engine, realm: p })) {
			tracked.marryingRealmYears++
			if (tied.has(p)) tracked.tiedRealmYears++
		}
		const dynasty = engine.leaderDynCurrent[p]
		if (
			STATE.getNationNeighbors({ state: engine, nation: p }).some(
				(other) =>
					engine.leaderRuntime.rulerId[other] >= 0 &&
					engine.leaderDynCurrent[other] === dynasty,
			)
		)
			tracked.sharedDynastyRealmYears++
	}
	tracked.unionJuniorYears += engine.unionGenerations.size
}

function of({
	engine,
	tracker: tracked,
	from,
	to,
}: RulerWindowParams): RulersReport {
	const lo = from * STATE.yearMs
	const hi = to * STATE.yearMs
	const notes = engine.events.filter(
		(note) => note.time >= lo && note.time < hi,
	)
	const count = (tag: string) => notes.filter((note) => note.tag === tag).length
	const successions = notes.filter((note) => note.tag === "succession")
	const succession = {
		count: successions.length,
		bySystem: {} as Record<string, number>,
		byHouse: {} as Record<string, number>,
		byClaim: [0, 0, 0, 0],
		minors: 0,
		minorShare: 0,
		juniors: {} as Record<number, number>,
		pretenderRevolts: notes.filter(
			(note) => note.tag === "rebellion" && note.data.pretender,
		).length,
		interregnums: count("interregnum"),
	}
	for (const note of successions) {
		const system = String(note.data.system)
		const house = String(note.data.house)
		succession.bySystem[system] = (succession.bySystem[system] ?? 0) + 1
		succession.byHouse[house] = (succession.byHouse[house] ?? 0) + 1
		succession.byClaim[note.data.claim as number]++
		if (note.data.minor) succession.minors++
	}
	succession.minorShare = succession.minors / Math.max(1, successions.length)
	for (const note of notes)
		if (note.tag === "partition") {
			const seated = (note.data.seats as number[]).length
			succession.juniors[seated] = (succession.juniors[seated] ?? 0) + 1
		}
	const years = Math.max(1, to - from)
	return {
		succession,
		marriageTies: {
			formed: count("marriage alliance"),
			ended: count("marriage alliance ended"),
			standing: engine.marriageTies.size,
			meanStanding: tracked.tieYears / years,
			tiedShare:
				tracked.tiedRealmYears / Math.max(1, tracked.marryingRealmYears),
			tiesPerTiedRealm:
				(2 * tracked.tieYears) / Math.max(1, tracked.tiedRealmYears),
		},
		dynasty: {
			realmYears: tracked.realmYears,
			sharingRealmYears: tracked.sharedDynastyRealmYears,
			sharingShare:
				tracked.sharedDynastyRealmYears / Math.max(1, tracked.realmYears),
			dynasties: engine.rulerSequence.nextDynasty,
		},
		unions: {
			formed: count("personal union formed"),
			ended: count("personal union ended"),
			merged: count("personal union merged"),
			juniorYears: tracked.unionJuniorYears,
			claimWars: engine.wars.filter(
				(war) =>
					war.goal === "claim" && war.startTime >= lo && war.startTime < hi,
			).length,
		},
	}
}

// Reports the window since the last call, then starts the next one.
function window(params: RulerWindowParams): RulersReport {
	const report = of(params)
	const { tracker: tracked } = params
	tracked.tieYears = 0
	tracked.tiedRealmYears = 0
	tracked.marryingRealmYears = 0
	tracked.realmYears = 0
	tracked.sharedDynastyRealmYears = 0
	tracked.unionJuniorYears = 0
	return report
}

export const RULERS_REPORT = { tracker, sample, window }
