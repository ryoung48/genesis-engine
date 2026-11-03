import type { PersonKey } from "@/model/people/query/types"

export type WikiSelection =
	| { kind: "nation"; id: number }
	| { kind: "organization"; id: string }
	| { kind: "war"; id: number }
	| { kind: "person"; id: PersonKey }
	| { kind: "religion"; id: number }
	| { kind: "province"; id: number; originNation: number | null }
	| null
