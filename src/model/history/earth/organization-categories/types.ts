import type { WorldFrame } from "@/model/history/world-frame/types"

export interface OrgCategory {
	id: string
	label: string
	/** 0-255 RGB, matching reference/organizations.json's convention. Omit to
	 * fall back to the org's own reference color -- for orgs with just one
	 * undistinguished member type (e.g. the Hanseatic League's plain
	 * "member" category, which should just look like the League's color). */
	color?: [number, number, number]
	/** Rendered as a diagonal stripe instead of a solid fill, both on the map
	 * and as a wiki swatch -- used for provinces/nations associated with the
	 * org without being a genuine member (HRE's foreign-held Imperial soil,
	 * HSA's Hanseatic kontors/trade posts). */
	striped?: boolean
	/** Plural name of the sub-faction this category belongs to, used to
	 * phrase join/leave timeline events (e.g. "joined the Guelphs" instead of
	 * the generic "joined the Guelphs and Ghibellines") for orgs whose
	 * categories split into rival sides rather than just estate/site types.
	 * Omit for orgs like HRE/HSA where categories are all part of the same
	 * single org, not opposing factions -- those fall back to the org's own
	 * name. */
	factionLabel?: string
}

export interface OrgProvinceCategory {
	categoryId: string
	striped: boolean
}

export interface OrgCategorySchema {
	categories: OrgCategory[]
	/** Builds a per-province categorizer for the given folded state -- lets
	 * each org precompute whatever it needs ONCE per tick (e.g. HRE's
	 * foreign-holder nation set, or HSA's active kontor province set) rather
	 * than repeating expensive per-nation/per-site lookups for every
	 * province. This matters because callers may invoke the returned
	 * categorizer once per REGION, and a world's region count can be two
	 * orders of magnitude larger than its province count (see
	 * GenesisView.tsx's resolveOrgProvinceColor, which learned this the hard
	 * way -- HRE map mode was visibly slow before categorization got
	 * precomputed once per province instead of once per region). */
	createCategorizer: (frame: WorldFrame) => OrgCategorizer
}

export type OrgCategorizer = (province: number) => OrgProvinceCategory | null

export interface ListOrgMembersParams {
	frame: WorldFrame
	categorize: (
		province: number,
	) => { categoryId: string; striped: boolean } | null
}

export interface CreateMembershipCategorizerParams {
	orgId: string
	siteRoles: readonly string[]
}
