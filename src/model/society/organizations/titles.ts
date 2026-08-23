import type { OrganizationTitle } from "@/model/society/types"

/** Display label, swatch color (0-255 RGB, matching the HRE category
 * palette convention in src/model/history/earth/organization-categories),
 * and fixed display order for each OrganizationTitle. */
export const ORGANIZATION_TITLE_LABELS: Record<OrganizationTitle, string> = {
	emperor: "Emperor",
	princeElector: "Prince-Elector",
	archbishopElector: "Archbishop-Elector",
	imperialPrelate: "Imperial Prelate",
	republic: "Republic",
	freeCity: "Free City",
	peasantRepublic: "Peasant Republic",
	imperialPrince: "Imperial Prince",
	member: "Member",
}

export const ORGANIZATION_TITLE_COLORS: Record<
	OrganizationTitle,
	[number, number, number]
> = {
	emperor: [250, 204, 21],
	princeElector: [125, 211, 252],
	archbishopElector: [37, 99, 235],
	imperialPrelate: [30, 58, 138],
	republic: [22, 163, 74],
	freeCity: [134, 239, 172],
	peasantRepublic: [193, 122, 111],
	imperialPrince: [156, 163, 175],
	member: [56, 189, 248],
}

export const ORGANIZATION_TITLE_ORDER: Record<OrganizationTitle, number> = {
	emperor: 0,
	princeElector: 1,
	archbishopElector: 2,
	imperialPrelate: 3,
	republic: 4,
	freeCity: 5,
	peasantRepublic: 6,
	imperialPrince: 7,
	member: 0,
}

export const ORGANIZATION_TITLES = {
	labels: ORGANIZATION_TITLE_LABELS,
	colors: ORGANIZATION_TITLE_COLORS,
	order: ORGANIZATION_TITLE_ORDER,
}
