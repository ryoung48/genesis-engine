import type { TitleTier } from "@/model/society/titles/types"
import type {
	CrownChild,
	CrownParams,
	PersonTitleParams,
} from "@/ui/genesis/wiki-bridge/person-title/types"

const TIER_TITLES: Record<TitleTier, readonly [string, string]> = {
	county: ["Count", "Countess"],
	duchy: ["Duke", "Duchess"],
	kingdom: ["King", "Queen"],
	empire: ["Emperor", "Empress"],
	hegemony: ["Emperor", "Empress"],
}

const ROYAL_TIERS: readonly TitleTier[] = ["kingdom", "empire", "hegemony"]

function royal(tier: TitleTier | null): tier is TitleTier {
	return tier !== null && ROYAL_TIERS.includes(tier)
}

function isCrown({ person, children }: CrownParams): boolean {
	const sons = children.filter((child) => !child.female)
	const line = sons.length > 0 ? sons : children
	const eldest = line.reduce<CrownChild | null>(
		(first, child) =>
			first === null || child.birthTimeMs < first.birthTimeMs ? child : first,
		null,
	)
	return eldest?.id === person
}

function of({
	female,
	hasHouse,
	tier,
	royalParent,
	crown,
}: PersonTitleParams): string {
	if (royal(tier)) return TIER_TITLES[tier][female ? 1 : 0]
	if (royal(royalParent)) {
		const prince = female ? "Princess" : "Prince"
		return crown ? `Crown ${prince}` : prince
	}
	if (tier) return TIER_TITLES[tier][female ? 1 : 0]
	return hasHouse ? "Noble" : "Low born"
}

export const PERSON_TITLE = { of, isCrown, royal }
