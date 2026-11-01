import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export type MarineHumidityWorld = Pick<
	SerializedGenesisWorld,
	| "mesh"
	| "isLand"
	| "climate"
	| "rainfall"
	| "hydrology"
	| "oceanDist"
	| "dtr_annual"
	| "dtr_monthly"
	| "params"
>

export interface MarineHumidityFields {
	annual: Float32Array
	monthly: Float32Array
}

export interface MarineHumidityCache {
	signature: readonly unknown[]
	fields: MarineHumidityFields
}

export interface CoastalHumiditySources {
	region: Int32Array
	distanceKm: Float64Array
}
