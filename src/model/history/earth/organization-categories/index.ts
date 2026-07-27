import { FOLD } from "@/model/history/earth/fold"
import type { FoldedState } from "@/model/history/earth/fold/types"
import type {
	CreateMembershipCategorizerParams,
	ListOrgMembersParams,
	OrgCategorizer,
	OrgCategory,
	OrgCategorySchema,
	OrgProvinceCategory,
} from "@/model/history/earth/organization-categories/types"

function listOrgMembers({
	state,
	categorize,
}: ListOrgMembersParams): Map<string, OrgProvinceCategory> {
	const members = new Map<string, OrgProvinceCategory>()
	for (const [rawId, province] of state.provinces) {
		const owner = province.owner
		if (!owner || members.has(owner)) continue
		const category = categorize(Number(rawId))
		if (category) members.set(owner, category)
	}
	return members
}

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
	const foreignHolderTags = FOLD.collectOrgForeignHolderNations({
		state,
		orgId: "HRE",
	})
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

const HSA_CATEGORIES: OrgCategory[] = [
	{ id: "member", label: "Member" },
	// No explicit color -- falls back to the org's own reference color, same
	// as "member", so a trade post reads as "League-associated" via the same
	// hue, with the stripe (not a different color) marking it as not a full
	// member.
	{ id: "tradePost", label: "Trade Post", striped: true },
]

function createMembershipCategorizer({
	orgId,
	siteRoles,
}: CreateMembershipCategorizerParams): (state: FoldedState) => OrgCategorizer {
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
	createCategorizer: createMembershipCategorizer({
		orgId: "HSA",
		siteRoles: ["kontor", "trade_branch"],
	}),
}

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

const orgCategorySchemas: Record<string, OrgCategorySchema> = {
	HRE: HRE_CATEGORY_SCHEMA,
	HSA: HSA_CATEGORY_SCHEMA,
	GG: GG_CATEGORY_SCHEMA,
}

export const ORGANIZATION_CATEGORIES = {
	orgCategorySchemas,
	listOrgMembers,
}
