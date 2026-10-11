import { DERIVE } from "@/model/history/sim/engine/derive"
import type { InterregnumNoteData } from "@/model/history/sim/engine/events/succession/interregnum/types"
import { STATE } from "@/model/history/sim/engine/state"
import { REPORT_DISTRIBUTION } from "@/test/history-run/report/distribution/index"
import type {
	InterregnumReport,
	InterregnumTracker,
	ObserveInterregnumParams,
	SummarizeInterregnumParams,
} from "@/test/history-run/report/interregnum/types"

function tracker(): InterregnumTracker {
	return { cursor: 0, events: [], withoutDistricts: [] }
}

// Reads the engine notes written since the last call. Call once a year.
function observe({ engine, tracker: tracked }: ObserveInterregnumParams): void {
	for (; tracked.cursor < engine.events.length; tracked.cursor++) {
		const note = engine.events[tracked.cursor]
		const year = note.time / STATE.yearMs
		if (note.tag === "interregnum")
			tracked.events.push({ year, data: note.data as InterregnumNoteData })
		else if (
			note.tag === "succession" &&
			note.data.system === "single_heir" &&
			note.data.claim === 0 &&
			(note.data.dying as number) >= 0 &&
			!note.data.interregnum
		)
			tracked.withoutDistricts.push(year)
	}
}

function summarize({
	engine,
	tracker: tracked,
	from,
	to,
}: SummarizeInterregnumParams): InterregnumReport {
	DERIVE.ensureHierarchyClean(engine)
	const within = (year: number) => year >= from && year < to
	const notes = tracked.events
		.filter((entry) => within(entry.year))
		.map((entry) => entry.data)
	let freedRealms = 0
	let freedStillSovereign = 0
	for (const note of notes)
		for (const seat of note.freed) {
			freedRealms++
			if (STATE.isSovereign({ state: engine, p: seat })) freedStillSovereign++
		}
	return {
		events: notes.length,
		freedPerEvent: REPORT_DISTRIBUTION.summarize(
			notes.map((note) => note.freed.length),
		),
		skippedSeats: notes.reduce((sum, note) => sum + note.skipped.length, 0),
		warsDeclared: notes.reduce(
			(sum, note) => sum + note.warAttackers.length,
			0,
		),
		cutOffProvinces: notes.reduce((sum, note) => sum + note.cutOff.length, 0),
		titlesLost: notes.reduce((sum, note) => sum + note.titlesLost.length, 0),
		freedRealms,
		freedStillSovereign,
		withoutDistricts: tracked.withoutDistricts.filter(within).length,
	}
}

export const INTERREGNUM_REPORT = { tracker, observe, summarize }
