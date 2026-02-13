import { Province } from "../../provinces/types"

export type Culture = {
	idx: number
	provinces: Set<number>
	color: string
	neighbors: Set<number>
	heritage: number
	faith: number
}

export type CultureSpawnParams = {
	province: Province
}
