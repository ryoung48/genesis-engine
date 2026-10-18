export type PersonKey = string

export type ParsedKey =
	| { tag: "R"; rulerId: number }
	| { tag: "S"; owner: PersonKey; index: number }
	| { tag: "C"; marriage: string; index: number }
	| { tag: "A"; anchor: string; role: string }
	| { tag: "P"; child: PersonKey; side: "f" | "m" }
	| { tag: "V"; seat: string; bucket: number }

export interface HolderKeyParams {
	seat: string
	bucket: number
}

export interface SpouseKeyParams {
	owner: PersonKey
	index: number
}

export interface ChildKeyParams {
	marriage: string
	index: number
}

export interface InjectedKeyParams {
	anchor: string
	role: string
}

export interface ParentKeyParams {
	child: PersonKey
	side: "f" | "m"
}

export interface MarriageKeyParams {
	husband: PersonKey
	wife: PersonKey
	startMs: number
}

export interface PersonSeedParams {
	worldSeed: number
	key: string
}

export interface ParsedMarriage {
	husband: PersonKey
	wife: PersonKey
	startMs: number
}
