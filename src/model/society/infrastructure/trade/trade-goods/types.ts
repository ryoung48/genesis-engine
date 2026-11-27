export interface LocationTradeGoods {
	material: Uint8Array
}

export interface TradeGoodsParams {
	seed: number
	locations: {
		count: number
		regionLocation: Int32Array
		locationProvince: Int32Array
		seeds: Int32Array
	}
	provinces: { desolate: Uint8Array }
	climateZones: Uint8Array
	vegetation: Uint8Array
	topography: Uint8Array
	coastal: Uint8Array
	pastaClimate: Uint8Array
	numRegions: number
	r_xyz: Float32Array
	regionLandmark: Int32Array
	leaderTechLevel: number
	// [JUSTIFICATION] null where the world has no farming clock (imported
	// heightmaps and the distribution history pipeline): no farmland or
	// livelihood gates then.
	wayOfLife: {
		farm: Float32Array
		herd: Float32Array
		density: Float32Array
		herdAdoptionYear: Int32Array
		startYear: number
	} | null
}

export interface LocationClass {
	climate: string
	vegetation: string
	topography: string
	coast: "coastal" | "inland"
}

export interface DominantClassParams {
	regions: number[]
	params: TradeGoodsParams
}

export interface FarmlandParams {
	classes: (LocationClass | null)[]
	params: TradeGoodsParams
}

export type TableRow = readonly (readonly [number, number])[]

export type GateKind = "crop" | "animal" | "wild" | "free"

export interface LocationGates {
	farm: number
	settled: number
	herdArrived: boolean
	forager: number
}

export interface GateRowParams {
	row: TableRow
	gates: LocationGates
	options: LocationOptions
	at: number
}

export interface LocationOptions {
	start: Int32Array
	goods: Uint8Array
	weights: Float64Array
}

export interface DrawParams {
	seed: number
	options: LocationOptions
	pick: Uint8Array
}
