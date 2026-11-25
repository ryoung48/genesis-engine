import type { HydraulicKey } from "@/model/geography/terrain/groundwater-config/types"

export interface RockKeyCodesParams {
	rock: Uint8Array
	youngKind: Uint8Array
}

export interface RockKeyTableParams {
	values: Record<HydraulicKey, number>
}

export interface RockKeyFlagsParams {
	members: readonly HydraulicKey[]
}
