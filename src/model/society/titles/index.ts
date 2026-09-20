import type {
	MinSizeForTierParams,
	TitleTier,
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
	hegemony: 180,
}

function minSizeForTier({ tier }: MinSizeForTierParams): number {
	return minSize[tier]
}

export const TITLES = { tierOrder, minSizeForTier }
