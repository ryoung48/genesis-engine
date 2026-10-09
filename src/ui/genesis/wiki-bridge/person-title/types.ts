import type { TitleTier } from "@/model/society/titles/types"

export interface PersonTitleParams {
	female: boolean
	hasHouse: boolean
	// [JUSTIFICATION] A person who holds no seat has no title tier.
	tier: TitleTier | null
	// [JUSTIFICATION] Only a king's or emperor's child has a royal parent.
	royalParent: TitleTier | null
	// [JUSTIFICATION] Only a person governing for a child ruler has a regency.
	regency: RegencyView | null
	crown: boolean
}

export interface RegencyView {
	tier: TitleTier
	mother: boolean
}

export interface CrownParams {
	person: number
	children: readonly CrownChild[]
}

export interface CrownChild {
	id: number
	female: boolean
	birthTimeMs: number
}
