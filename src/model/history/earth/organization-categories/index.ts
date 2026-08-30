import type {
	CreateMembershipCategorizerParams,
	ListOrgMembersParams,
	OrgCategorizer,
	OrgCategory,
	OrgCategorySchema,
	OrgProvinceCategory,
} from "@/model/history/earth/organization-categories/types"
import { FRAME } from "@/model/history/world-frame"
import type { WorldFrame } from "@/model/history/world-frame/types"

function listOrgMembers({
	frame,
	categorize,
}: ListOrgMembersParams): Map<number, OrgProvinceCategory> {
	const members = new Map<number, OrgProvinceCategory>()
	for (let province = 0; province < frame.provinceCount; province++) {
		const owner = frame.provinceNation[province]
		if (owner < 0 || members.has(owner)) continue
		const category = categorize(province)
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
	government: string
	governmentReform: string
}): string {
	if (nation.isEmperor) return "emperor"
	if (nation.government === "theocracy") {
		return nation.isElector ? "archbishopElector" : "imperialPrelate"
	}
	if (nation.government === "republic") {
		if (nation.governmentReform === "free_city") return "freeImperialCity"
		if (nation.governmentReform === "peasants_republic")
			return "peasantRepublic"
		return "republic"
	}
	if (nation.isElector) return "princeElector"
	return "imperialPrince"
}

function createHreCategorizer(frame: WorldFrame): OrgCategorizer {
	const foreignHolderNations = FRAME.orgForeignHolders({
		frame,
		orgId: "HRE",
	})
	const categoryByOwner = new Map<number, string>()
	const categoryForOwner = (owner: number): string => {
		let category = categoryByOwner.get(owner)
		if (category) return category
		const ownerState = frame.nations.get(owner)
		category = resolveHreEstateCategory({
			isEmperor: ownerState?.isEmperor ?? false,
			isElector: ownerState?.isElector ?? false,
			government: ownerState?.government ?? "",
			governmentReform: ownerState?.governmentReform ?? "",
		})
		categoryByOwner.set(owner, category)
		return category
	}
	return (province: number): OrgProvinceCategory | null => {
		if (!frame.provinceHre[province]) return null
		const owner = frame.provinceNation[province]
		// Foreign-held provinces (e.g. Venice's Terraferma) count as HRE
		// territory but not as a genuine Estate -- see
		// collectOrgForeignHolderNations' doc comment.
		if (owner < 0 || foreignHolderNations.has(owner)) {
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
}: CreateMembershipCategorizerParams): (frame: WorldFrame) => OrgCategorizer {
	return (frame: WorldFrame): OrgCategorizer => {
		const memberIds = new Set<number>()
		for (const nation of frame.nations.values()) {
			if (
				nation.organizations.some(
					(organization) => organization.orgId === orgId,
				)
			)
				memberIds.add(nation.id)
		}
		const siteProvinceIds = new Set<number>()
		const seatProvinceIds = new Set<number>()
		for (const site of frame.organizations) {
			if (site.orgId === orgId && siteRoles.includes(site.role)) {
				siteProvinceIds.add(site.province)
			} else if (site.orgId === orgId && site.role === "member_seat") {
				seatProvinceIds.add(site.province)
			}
		}
		return (province: number): OrgProvinceCategory | null => {
			if (seatProvinceIds.has(province)) {
				return { categoryId: "member", striped: false }
			}
			if (siteProvinceIds.has(province)) {
				return { categoryId: "tradePost", striped: true }
			}
			const owner = frame.provinceNation[province]
			if (owner >= 0 && memberIds.has(owner)) {
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

function createGuelphGhibellineCategorizer(frame: WorldFrame): OrgCategorizer {
	return (province: number): OrgProvinceCategory | null => {
		const owner = frame.provinceNation[province]
		if (owner < 0) return null
		const ownerState = frame.nations.get(owner)
		const role = ownerState?.organizations.find(
			(organization) => organization.orgId === "GG",
		)?.role
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
