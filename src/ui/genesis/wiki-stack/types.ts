import type { HistoryRecord } from "@/model/history/record/types"

export type WikiRef =
	| { kind: "nation"; id: number; title: string }
	| { kind: "organization"; id: string; title: string }
	| { kind: "war"; id: number; title: string }
	| { kind: "person"; id: number; title: string }

export interface WikiSelection {
	nationId: number | null
	organizationId: string | null
	warId: number | null
	personId: number | null
}

export interface OpenWikiParams {
	stack: WikiRef[]
	ref: WikiRef
}

export interface WikiStackParams {
	stack: WikiRef[]
}

export interface BackTitleParams {
	stack: WikiRef[]
	planetTitle: string
}

export interface WikiNavigation {
	openWikiPage: (ref: WikiRef) => void
	backWikiPage: () => void
	backTitle: string
}

export interface RecordRefParams {
	record: HistoryRecord
	id: number
}
