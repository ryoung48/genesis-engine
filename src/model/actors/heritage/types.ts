import { Culture } from "../../actors/culture/types"
import { Language } from "../language/languages/types"

export type Heritage = {
	idx: number
	cultures: Set<number>
	color: string
	hue: number
	neighbors: Set<number>
	language: Language
	name: string
}

export type HeritageSpawnParams = {
	culture: Culture
}
