import type { GenesisClimate } from "@/model/climate/types"

export interface CloudCoverTemperatureModifierParams {
	climate: Pick<
		GenesisClimate,
		| "temperature_monthly"
		| "temperature_avg"
		| "temperature_min"
		| "temperature_max"
		| "pet_monthly"
		| "cloud_cover_monthly"
	>
	rainfall: {
		monthly: Float32Array
	}
	hydrology: {
		aet_monthly: Float32Array
	}
	dtrMonthly: Float32Array
	oceanDist: Float32Array
	isLand: Uint8Array
	isTidallyLocked?: boolean
}
