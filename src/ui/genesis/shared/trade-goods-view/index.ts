import { TRADE_GOODS } from "@/model/society/infrastructure/trade/trade-goods"
import { TRADE_GOODS_TABLE } from "@/model/society/infrastructure/trade/trade-goods-table"
import type {
	TradeGoodsPaintParams,
	TradeGoodsView,
	TradeGoodsViewOption,
} from "@/ui/genesis/shared/trade-goods-view/types"

const LABELS = TRADE_GOODS_TABLE.tradeGoodLabels
const PREFIX = "good:"
const SELECTABLE_LABELS = LABELS.filter((label) => label !== "none")

function isView(value: unknown): value is TradeGoodsView {
	if (value === "all") return true
	return (
		typeof value === "string" &&
		value.startsWith(PREFIX) &&
		SELECTABLE_LABELS.includes(value.slice(PREFIX.length))
	)
}

function filterIndex(view: TradeGoodsView): number | null {
	if (view === "all") return null
	return LABELS.indexOf(view.slice(PREFIX.length))
}

function paint({
	filter,
	good,
	color,
	base,
}: TradeGoodsPaintParams): [number, number, number] {
	return filter === null || filter === good ? color : base
}

function options(): TradeGoodsViewOption[] {
	return [
		{ value: "all", label: "All", rgb: null },
		...SELECTABLE_LABELS.map((label) => ({
			value: `${PREFIX}${label}` as const,
			label: TRADE_GOODS.tradeGoodDisplayName(label),
			rgb: TRADE_GOODS.tradeGoodColor(LABELS.indexOf(label)),
		})),
	]
}

export const TRADE_GOODS_VIEW = {
	defaultView: "all" as TradeGoodsView,
	isView,
	filterIndex,
	paint,
	options,
}
