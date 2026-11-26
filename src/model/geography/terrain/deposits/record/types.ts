import type { CrustRaster } from "@/model/geography/tectonics/crust/types"

export type RecordField =
	| "porphyry"
	| "epithermal"
	| "orogenicGold"
	| "vms"
	| "skarn"
	| "mvt"
	| "sedex"
	| "tin"
	| "iocg"
	| "ioa"
	| "ironVein"
	| "magmatic"
	| "nativeCopper"
	| "kimberlite"
	| "greenstone"
	| "bif"
	| "reef"
	| "oil"
	| "shelfOil"
	| "shelfGas"
	| "gas"
	| "bitumen"
	| "oilShale"
	| "coal"
	| "ironstone"
	| "shale"
	| "pegmatite"
	| "marble"
	| "hotspot"
	| "lip"
	| "foldShale"
	| "coverNow"
	| "craton"

export type RecordFields = Record<RecordField, Float32Array>

export interface RecordParams {
	crust: CrustRaster
	seed: number
	granite: Float32Array
}

export interface WindowParams {
	wear: number
	top: number
	bottom: number
	width: number
}

export interface KeepParams {
	age: number
	half: number
}
