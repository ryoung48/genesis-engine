export type TitleTier = "county" | "duchy" | "kingdom" | "empire" | "hegemony"

export interface TierForSizeParams {
	size: number
}

export interface MinSizeForTierParams {
	tier: TitleTier
}

export interface TitleTierRange {
	tier: TitleTier
	minSize: number
	maxSize: number
}
