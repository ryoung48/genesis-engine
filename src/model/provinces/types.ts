export type Relation = "ally" | "friendly" | "neutral" | "suspicious"

export interface Province {
	idx: number
	cell: number
	cells: { land: number[] }
	islands: Record<number, number>
	lakes: Record<number, number>
	land: number
	ocean: number
	neighbors: Set<number>
	production: number
	desolate?: boolean
	pressure?: number
	// citizens
	habitability?: number
	culture: number
	heritage: number
	faith: number
	religion: number
	color: string
	// history
	_population: {
		rural: { time: number; population: number }[]
		urban: { time: number; population: number }[]
		targetUrban: number
	}
	_development: { time: number; development: number }[]
	_leader: { time: number; end: number; idx: number }[]
	_occupations: { time: number; occupier: number }[]
	_wars: number[]
	_consumption: { time: number; consumption: number }[]
	_relations: Record<number, { time: number; relation: Relation }[]>
	// settlement hierarchy
	_children: { time: number; children: Set<number> }[]
	_parent: { time: number; parent: number }[]
}

export type ProvinceNeighborParams = {
	province: Province
	type?: "local" | "foreign"
	time?: number
}
