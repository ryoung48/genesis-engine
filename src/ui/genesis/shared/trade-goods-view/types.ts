export type TradeGoodsView = "all" | `good:${string}`

export interface TradeGoodsViewOption {
	value: TradeGoodsView
	label: string
	rgb: [number, number, number] | null
}

export interface TradeGoodsPaintParams {
	filter: number | null
	good: number
	color: [number, number, number]
	base: [number, number, number]
}
