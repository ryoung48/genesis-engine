import type { PeopleRecord } from "@/model/history/record/people/types"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import type { PeopleRowKind } from "@/model/history/sim/people/log/types"

export interface PeopleRecordTracker {
	record: PeopleRecord
	flushMs: number
	ingestionMs: number
	rows: Partial<Record<PeopleRowKind, number>>
	transferredBytes: number
}

export interface AttachedPeopleRecord {
	tracker: PeopleRecordTracker
	detach: () => void
}

export interface IngestParams {
	tracker: PeopleRecordTracker
	transactions: JournalTransaction[]
}

export interface PeopleRecordReport {
	people: number
	sha256: string
	flushMs: number
	ingestionMs: number
	// Rows carried by the journal, by kind.
	rows: Partial<Record<PeopleRowKind, number>>
	// Bytes in the typed columns of every people packet.
	transferredBytes: number
}
