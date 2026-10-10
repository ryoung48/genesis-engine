import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_NAMES } from "@/model/history/record/people/names"
import { PROCEDURAL_RECORD } from "@/model/history/record/procedural"
import { TRANSLATOR } from "@/model/history/sim/record/translator"
import type { AppendJournalParams } from "@/model/history/sim/record/translator/types"
import type { BuildProceduralStateParams } from "@/model/history/sim/record/types"
import { NAMES } from "@/model/society/language/names"

function buildProceduralState(params: BuildProceduralStateParams) {
	const state = PROCEDURAL_RECORD.buildProceduralState({
		...params,
		startTimeMs: TRANSLATOR.recordTime(params.startTimeMs),
		pipeline: "simulation",
	})
	state.record.people = PEOPLE_RECORD.create()
	PERSON_NAMES.initialize({
		people: state.record.people,
		generator: NAMES.createWorldNames(params.world),
	})
	return state
}
function buildProceduralRecord(params: BuildProceduralStateParams) {
	return buildProceduralState(params).record
}
function consumeJournal(params: AppendJournalParams): void {
	TRANSLATOR.appendJournal(params)
	params.transactions.length = 0
}
export const SIM_RECORD = {
	buildProceduralRecord,
	buildProceduralState,
	createTranslator: TRANSLATOR.createTranslator,
	appendJournal: TRANSLATOR.appendJournal,
	consumeJournal,
}
