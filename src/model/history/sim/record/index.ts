import { PROCEDURAL_RECORD } from "@/model/history/record/procedural"
import { TRANSLATOR } from "@/model/history/sim/record/translator"
import type { AppendJournalParams } from "@/model/history/sim/record/translator/types"
import type { BuildProceduralStateParams } from "@/model/history/sim/record/types"

function buildProceduralState(params: BuildProceduralStateParams) {
	return PROCEDURAL_RECORD.buildProceduralState({
		...params,
		startTimeMs: TRANSLATOR.recordTime(params.startTimeMs),
		pipeline: "simulation",
	})
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
