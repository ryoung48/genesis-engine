import type { CommodityId } from "@/model/geography/terrain/deposits/commodities/types"
import type { SystemId } from "@/model/geography/terrain/deposits/systems/types"

export type DepositsView = "commodities" | `commodity:${CommodityId}`

export type DepositsViewKind = "commodities" | "commodity"

export type Rgb01 = [number, number, number]

export interface DepositsRegionParams {
	rows: Uint8Array
	numRegions: number
	region: number
	view: DepositsView
}

export interface DepositsPaintParams extends DepositsRegionParams {
	base: Rgb01
	isLand: boolean
}

export interface DepositsHoverRow {
	label: string
	value: string
	rgb: Rgb01
}

export interface DepositsViewOption {
	value: DepositsView
	label: string
	rgb: Rgb01 | null
}

export interface DepositsTintParams {
	base: Rgb01
	rgb: readonly [number, number, number]
	richness: number
}

export interface SystemRichnessParams {
	rows: Uint8Array
	numRegions: number
	region: number
	system: SystemId
}
