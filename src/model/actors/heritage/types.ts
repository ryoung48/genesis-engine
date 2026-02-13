import { Culture } from "../../actors/culture/types"

export type Heritage = {
	idx: number
	cultures: Set<number>
	color: string
	hue: number
	neighbors: Set<number>
}

export type HeritageSpawnParams = {
	culture: Culture
}
