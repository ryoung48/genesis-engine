import { Language } from "../language/languages/types"
import { Province } from "../../provinces/types"

export type Ethos =
	| "bellicose"
	| "bureaucratic"
	| "ceremonious"
	| "communal"
	| "egalitarian"
	| "spiritual"
	| "stoic"

export type TraditionCategory = "realm" | "warfare" | "social" | "ritual"

export type Culture = {
	idx: number
	provinces: Set<number>
	color: string
	neighbors: Set<number>
	heritage: number
	faith: number
	language: Language
	name: string
	ethos: Ethos
	traditions: string[]
}

export type CultureSpawnParams = {
	province: Province
}
