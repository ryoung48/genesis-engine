import { PriorityQueue } from "@datastructures-js/priority-queue"
import { Culture } from "./actors/culture/types"
import { Faith } from "./actors/faith/types"
import { Heritage } from "./actors/heritage/types"
import { Religion } from "./actors/religion/types"
import { Cell } from "./cells/types"
import { FutureEvent, HistoryNote } from "./history/types"
import { Dynasty } from "./provinces/leader/types"
import { War } from "./nations/wars/types"
import { Province } from "./provinces/types"
import { Display } from "./shapers/display/types"
import { GeoVoronoiDiagram } from "./utilities/voronoi/types"

export interface CoastalEdge {
	water: number
	land: number
	edge: [number, number][]
}

export interface World {
	id: string
	time: number
	diagram?: GeoVoronoiDiagram
	resolution: number
	cells: Cell[]
	cell: { length: number; area: number; count: number }
	scale: number
	display: Display
	// geography
	radius: number
	coasts: CoastalEdge[]
	landmarks: Record<
		number,
		{
			name?: string
			type: "ocean" | "lake" | "sea" | "continent" | "island" | "isle"
			water: boolean
			size: number
			cell: number
			parent?: number
			depth?: number
		}
	>
	mountains: { size: number; cell: number; name?: string }[]
	provinces: Province[]
	cultures: Culture[]
	heritages: Heritage[]
	faiths: Faith[]
	religions: Religion[]
	future: PriorityQueue<FutureEvent>
	dynasties: Dynasty[]
	wars: War[]
	past: HistoryNote[]
	// EBM Configuration (Persisted)
	obliquity: number
	eccentricity: number
	perihelion: number
	tSun: number
	landFraction: number
}

export type WorldSpawn = {
	seed: string
	obliquity?: number
	eccentricity?: number
	perihelion?: number
	tSun?: number
	landFraction?: number
}

export type WorldPlacementParams = {
	count: number // the number of cities to place
	spacing: number // how far apart each city should be
	whitelist: Cell[] // a of cells where the cities can be placed
	blacklist?: Cell[] // a list of cities that have already been placed
}

export type MergeLakeParams = { lakes: Cell[]; lake: number }
export type RemoveLakeParams = { lakes: Cell[]; lake: number }
