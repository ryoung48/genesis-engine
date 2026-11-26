import type { LatLonGrid } from "@/model/climatev2/vendor/grid.js"

export interface SstNoiseParams {
	grid: Pick<LatLonGrid, "w" | "h" | "size" | "lat" | "lon">
	seed: number
}
