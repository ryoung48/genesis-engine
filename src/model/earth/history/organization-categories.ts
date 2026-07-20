import type { FoldedState } from "./fold"
import { collectOrgForeignHolderNations } from "./fold"

/** One visual/political classification an org's territory or membership can
 * fall into (HRE's Prince-Elector, HSA's Trade Post, ...). Display order
 * matches the order categories appear in an OrgCategorySchema.categories
 * array -- there's no separate "order" field to keep in sync. */
interface OrgCategory {
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

/** Resolves which category (if any) a single raw EU4 province belongs to,
 * for one org at one point in time. Returning null means the province isn't
 * part of the org at all (rendered white, not counted as a member). */
export type OrgCategorizer = (
	rawProvinceId: number,
) => OrgProvinceCategory | null

interface OrgCategorySchema {
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
	createCategorizer: (state: FoldedState) => OrgCategorizer
}

/** Derives a nation-level membership summary from a province-level
 * categorizer, for the wiki page's Members list -- groups every categorized
 * province by its owner, taking any one owned province's category as that
 * owner's own. This is safe because every category this can return is
 * intrinsically a property of the OWNER (an Estate type, or "holds enclave
 * territory") rather than of the specific province, so it doesn't matter
 * which of an owner's provinces gets checked first. */
export function listOrgMembers(
	state: FoldedState,
	categorize: OrgCategorizer,
): Map<string, OrgProvinceCategory> {
	const members = new Map<string, OrgProvinceCategory>()
	for (const [rawId, province] of state.provinces) {
		const owner = province.owner
		if (!owner || members.has(owner)) continue
		const category = categorize(Number(rawId))
		if (category) members.set(owner, category)
	}
	return members
}

// --- HRE ---------------------------------------------------------------

const HRE_CATEGORIES: OrgCategory[] = [
	{ id: "emperor", label: "Emperor", color: [250, 204, 21] },
	{ id: "princeElector", label: "Prince-Elector", color: [125, 211, 252] },
	{
		id: "archbishopElector",
		label: "Archbishop-Elector",
		color: [37, 99, 235],
	},
	{ id: "imperialPrelate", label: "Imperial Prelate", color: [30, 58, 138] },
	{
		id: "freeImperialCity",
		label: "Free Imperial City",
		color: [134, 239, 172],
	},
	{ id: "republic", label: "Republic", color: [22, 163, 74] },
	{
		id: "peasantRepublic",
		label: "Imperial Peasant Republic",
		color: [193, 122, 111],
	},
	{ id: "imperialPrince", label: "Imperial Prince", color: [156, 163, 175] },
	{
		id: "foreignHolder",
		label: "Holds Territory, Not a Member",
		color: [156, 163, 175],
		striped: true,
	},
]

/** Classifies a genuine Imperial Estate's type, inferred from
 * isEmperor/isElector/governmentType/governmentReform -- there's no single
 * EU4 field for this, so this combines them the same way a real Imperial
 * Estate's status was actually determined historically (ecclesiastical
 * electors were prince-bishops -- theocracy government -- while the secular
 * electors were monarchies; Free Imperial Cities and the rare peasant
 * republics are both "republic" government distinguished only by their
 * government reform id). Only meaningful for a nation that's already known
 * to be a genuine Estate (see createHreCategorizer's foreignHolder check) --
 * this never returns "foreignHolder" itself. */
function resolveHreEstateCategory(nation: {
	isEmperor: boolean
	isElector: boolean
	governmentType: string | null
	governmentReform: string | null
}): string {
	if (nation.isEmperor) return "emperor"
	if (nation.governmentType === "theocracy") {
		return nation.isElector ? "archbishopElector" : "imperialPrelate"
	}
	if (nation.governmentType === "republic") {
		if (nation.governmentReform === "free_city") return "freeImperialCity"
		if (nation.governmentReform === "peasants_republic")
			return "peasantRepublic"
		return "republic"
	}
	if (nation.isElector) return "princeElector"
	return "imperialPrince"
}

function createHreCategorizer(state: FoldedState): OrgCategorizer {
	const foreignHolderTags = collectOrgForeignHolderNations(state, "HRE")
	const categoryByOwner = new Map<string, string>()
	const categoryForOwner = (owner: string): string => {
		let category = categoryByOwner.get(owner)
		if (category) return category
		const ownerState = state.nations.get(owner)
		category = resolveHreEstateCategory({
			isEmperor: ownerState?.isEmperor ?? false,
			isElector: ownerState?.isElector ?? false,
			governmentType: ownerState?.governmentType ?? null,
			governmentReform: ownerState?.governmentReform ?? null,
		})
		categoryByOwner.set(owner, category)
		return category
	}
	return (rawProvinceId: number): OrgProvinceCategory | null => {
		const province = state.provinces.get(String(rawProvinceId))
		if (!province?.isHre) return null
		const owner = province.owner
		// Foreign-held provinces (e.g. Venice's Terraferma) count as HRE
		// territory but not as a genuine Estate -- see
		// collectOrgForeignHolderNations' doc comment.
		if (!owner || foreignHolderTags.has(owner)) {
			return { categoryId: "foreignHolder", striped: true }
		}
		return { categoryId: categoryForOwner(owner), striped: false }
	}
}

const HRE_CATEGORY_SCHEMA: OrgCategorySchema = {
	categories: HRE_CATEGORIES,
	createCategorizer: createHreCategorizer,
}

// --- Generic membership + site orgs (HSA, and any future lookalikes) ---

const HSA_CATEGORIES: OrgCategory[] = [
	{ id: "member", label: "Member" },
	// No explicit color -- falls back to the org's own reference color, same
	// as "member", so a trade post reads as "League-associated" via the same
	// hue, with the stripe (not a different color) marking it as not a full
	// member.
	{ id: "tradePost", label: "Trade Post", striped: true },
]

/** Categorizer factory for organizations that have exactly one real member
 * type (color falls back to the org's own reference color) plus a striped
 * site type hosted in provinces that often AREN'T owned by any member --
 * e.g. the Hanseatic League's kontors/trade posts, hosted in cities like
 * Novgorod, Bruges, and London that were never League members themselves. A
 * province counts as the site category if it currently hosts an active
 * FoldedState.organizationSites entry with one of the given striped roles.
 * `member_seat` sites are solid member-color pins for named civic seats such
 * as Danzig, which should remain visible when country-level ownership hides
 * the local member tag. Otherwise a province counts as a plain member province
 * if its owner holds discrete membership (FoldedNationState.organizations). */
function createMembershipCategorizer(
	orgId: string,
	siteRoles: readonly string[],
): (state: FoldedState) => OrgCategorizer {
	return (state: FoldedState): OrgCategorizer => {
		const memberTags = new Set<string>()
		for (const [tag, nation] of state.nations) {
			if (nation.organizations.has(orgId)) memberTags.add(tag)
		}
		const siteProvinceIds = new Set<number>()
		const seatProvinceIds = new Set<number>()
		for (const site of state.organizationSites.values()) {
			if (site.orgId === orgId && siteRoles.includes(site.role)) {
				siteProvinceIds.add(Number(site.provinceId))
			} else if (site.orgId === orgId && site.role === "member_seat") {
				seatProvinceIds.add(Number(site.provinceId))
			}
		}
		return (rawProvinceId: number): OrgProvinceCategory | null => {
			if (seatProvinceIds.has(rawProvinceId)) {
				return { categoryId: "member", striped: false }
			}
			if (siteProvinceIds.has(rawProvinceId)) {
				return { categoryId: "tradePost", striped: true }
			}
			const province = state.provinces.get(String(rawProvinceId))
			const owner = province?.owner
			if (owner && memberTags.has(owner)) {
				return { categoryId: "member", striped: false }
			}
			return null
		}
	}
}

const HSA_CATEGORY_SCHEMA: OrgCategorySchema = {
	categories: HSA_CATEGORIES,
	createCategorizer: createMembershipCategorizer("HSA", [
		"kontor",
		"trade_branch",
	]),
}

// --- Guelphs and Ghibellines ---------------------------------------------

/** Unlike HSA (one undistinguished member type) or HRE (category inferred
 * live from government fields), the Guelphs and Ghibellines org has no EU4
 * source data at all -- it's entirely curated (see
 * scripts/earth_history_organization_membership.py's GG rows and their cited
 * sources). Each curated membership row already carries its exact category
 * id as its `role` (folded onto FoldedNationState.organizations), so this
 * categorizer just looks that role up directly instead of re-deriving it. */
const GG_CATEGORIES: OrgCategory[] = [
	{
		id: "guelphLeader",
		label: "Guelph Leader",
		color: [153, 27, 27],
		factionLabel: "Guelphs",
	},
	{
		id: "guelphMember",
		label: "Guelph",
		color: [252, 165, 165],
		factionLabel: "Guelphs",
	},
	{
		id: "ghibellineLeader",
		label: "Ghibelline Leader",
		color: [67, 56, 202],
		factionLabel: "Ghibellines",
	},
	{
		id: "ghibellineMember",
		label: "Ghibelline",
		color: [165, 180, 252],
		factionLabel: "Ghibellines",
	},
]

/** The reigning HRE Emperor is always counted as the Ghibelline (pro-
 * Imperial) faction's leader, without needing a curated membership row --
 * unlike the curated Italian city-states, the Emperor's identity rotates
 * across dynasties over the org's 200+ year span (see
 * earth_history_organization_membership.py's sourcing note), and
 * FoldedNationState.isEmperor already tracks who holds the title at any
 * given time from HRE's own emperorStart/emperorEnd events. A curated `role`
 * on a GG membership row still wins if a nation has one (e.g. Milan's
 * curated ghibellineLeader status doesn't depend on ever holding the
 * Imperial title). */
function createGuelphGhibellineCategorizer(state: FoldedState): OrgCategorizer {
	return (rawProvinceId: number): OrgProvinceCategory | null => {
		const province = state.provinces.get(String(rawProvinceId))
		const owner = province?.owner
		if (!owner) return null
		const ownerState = state.nations.get(owner)
		const role = ownerState?.organizations.get("GG")
		if (role) return { categoryId: role, striped: false }
		if (ownerState?.isEmperor)
			return { categoryId: "ghibellineLeader", striped: false }
		return null
	}
}

const GG_CATEGORY_SCHEMA: OrgCategorySchema = {
	categories: GG_CATEGORIES,
	createCategorizer: createGuelphGhibellineCategorizer,
}

/** Every org that has a category schema registered -- an org id missing
 * here (there currently aren't any) falls back to GenesisView's plain
 * solid-member-color/white-elsewhere rendering with no category breakdown,
 * so a brand new org still renders reasonably before anyone gets around to
 * giving it a real schema. */
export const ORG_CATEGORY_SCHEMAS: Record<string, OrgCategorySchema> = {
	HRE: HRE_CATEGORY_SCHEMA,
	HSA: HSA_CATEGORY_SCHEMA,
	GG: GG_CATEGORY_SCHEMA,
}
