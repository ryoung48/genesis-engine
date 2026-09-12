import type { GenesisClimate } from "@/model/climate/types"

export type LaggedSeaLevelTempsParams = {
	climate: Pick<GenesisClimate, "temperature_monthly_nolapse">
	elevation_km: Float32Array
	month: number
	monthSeconds: number
}
