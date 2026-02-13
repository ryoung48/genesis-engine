import { Culture } from "../../actors/culture/types"

export type Faith = {
	idx: number
	cultures: Set<number>
	color: string
	neighbors: Set<number>
	religion: number
}

export type FaithSpawnParams = {
	culture: Culture
}
