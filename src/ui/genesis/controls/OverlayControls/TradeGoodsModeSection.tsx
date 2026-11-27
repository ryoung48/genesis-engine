import React, { useMemo } from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import { TRADE_GOODS_VIEW } from "@/ui/genesis/shared/trade-goods-view"
import type { TradeGoodsView } from "@/ui/genesis/shared/trade-goods-view/types"
import { SwatchDropdown } from "./SwatchDropdown"

export interface TradeGoodsModeSectionProps {
	colorMode: ColorMode
	tradeGoodsExpanded: boolean
	setTradeGoodsExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	tradeGoodsView: TradeGoodsView
	setTradeGoodsView: (v: TradeGoodsView) => void
}

export const TradeGoodsModeSection: React.FC<TradeGoodsModeSectionProps> = ({
	colorMode,
	tradeGoodsExpanded,
	setTradeGoodsExpanded,
	tradeGoodsView,
	setTradeGoodsView,
}) => {
	const options = useMemo(() => TRADE_GOODS_VIEW.options(), [])
	if (colorMode !== "trade_goods") return null
	return (
		<div>
			<CollapsibleSectionHeader
				title="Trade Goods"
				expanded={tradeGoodsExpanded}
				onToggle={() => setTradeGoodsExpanded((v) => !v)}
			/>
			{tradeGoodsExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<SwatchDropdown
						label="Trade goods"
						options={options}
						value={tradeGoodsView}
						onChange={setTradeGoodsView}
					/>
				</div>
			)}
		</div>
	)
}
