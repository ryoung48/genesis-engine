import { Faith } from "../../actors/faith/types"

export type Religion = {
	idx: number
	faiths: Set<number>
	color: string
	hue: number
	neighbors: Set<number>
	name: string
}

export type ReligionSpawnParams = {
	faith: Faith
}
