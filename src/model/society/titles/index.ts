import type {
	MinSizeForTierParams,
	TierForSizeParams,
	TitleTier,
	TitleTierRange,
} from "@/model/society/titles/types"

const tierOrder: readonly TitleTier[] = [
	"county",
	"duchy",
	"kingdom",
	"empire",
	"hegemony",
]

const minSize: Record<TitleTier, number> = {
	county: 1,
	duchy: 2,
	kingdom: 8,
	empire: 40,
	hegemony: 251,
}

function tierForSize({ size }: TierForSizeParams): TitleTier {
	for (let index = tierOrder.length - 1; index > 0; index--) {
		const tier = tierOrder[index]
		if (size >= minSize[tier]) return tier
	}
	return "county"
}

function minSizeForTier({ tier }: MinSizeForTierParams): number {
	return minSize[tier]
}

function ranges(): TitleTierRange[] {
	return tierOrder.map((tier, index) => ({
		tier,
		minSize: minSize[tier],
		maxSize:
			index === tierOrder.length - 1
				? Number.POSITIVE_INFINITY
				: minSize[tierOrder[index + 1]] - 1,
	}))
}

export const TITLES = { tierOrder, tierForSize, minSizeForTier, ranges }
