import type { MarineWaves } from "@/model/climate/weather/local/marine/waves/types"

export interface MarineShore {
	region: number
	latitudeDeg: number
	xyz: [number, number, number]
	springRangeM: number
	lagDraw: number
}

export interface MarineSnapshot {
	shore: MarineShore
	waves: MarineWaves | null
}
