import { Faith } from "../../actors/faith/types"

export type Religion = {
	idx: number
	faiths: Set<number>
	color: string
	hue: number
	neighbors: Set<number>
}

export type ReligionSpawnParams = {
	faith: Faith
}
