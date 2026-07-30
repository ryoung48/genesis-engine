import { COLOR } from "@/model/history/earth/color"
import { ORGANIZATION_CATEGORIES } from "@/model/history/earth/organization-categories"
import type { EarthHistoryTimeline } from "@/ui/planet/GenesisView/types"
import { rgbToCss } from "@/ui/planet/screen/shared/ui-format"
import { paletteColorForDynasty } from "@/ui/wiki/nation/timeline-formatting"
import type { WikiTimelineEvent as NationTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

/**
 * Mention-object builders used by useNationWikiData's timeline-event
 * builder -- each turns an id (war, org, culture, religion, dynasty) plus
 * the earth-history reference data into the small { id, name, color }
 * shape WikiTimeline events attach to a description. Split out of that file
 * (see plans/split-large-files.md #3); earthHistory is passed explicitly
 * instead of captured by closure.
 */

export function warMention(war: {
	warId: string
	name: string
}): NationTimelineEvent["wars"][number] {
	return {
		id: war.warId,
		name: war.name,
		color: "#b91c1c",
	}
}

export function organizationMention(
	earthHistory: EarthHistoryTimeline,
	orgId: string,
	categoryId?: string,
): NationTimelineEvent["organizations"][number] {
	const ref = earthHistory.organizationReference?.get(orgId)
	const category = categoryId
		? ORGANIZATION_CATEGORIES.orgCategorySchemas[orgId]?.categories.find(
				(c) => c.id === categoryId,
			)
		: undefined
	const color = category?.color ?? ref?.color
	return {
		id: orgId,
		name: category?.factionLabel ?? ref?.name ?? orgId,
		color: color
			? COLOR.rgb01ToCss([color[0] / 255, color[1] / 255, color[2] / 255])
			: COLOR.rgb01ToCss([0.5, 0.5, 0.5]),
	}
}

export function cultureMention(
	earthHistory: EarthHistoryTimeline,
	cultureId: string,
): NationTimelineEvent["cultures"][number] {
	return {
		id: cultureId,
		name:
			earthHistory.cultureNameById?.get(cultureId) ??
			cultureId.replace(/_/g, " "),
		color: rgbToCss(
			earthHistory.cultureColorById?.get(cultureId) ??
				COLOR.hashColorForKey(`culture:${cultureId}`),
		),
	}
}

export function religionMention(
	earthHistory: EarthHistoryTimeline,
	religionId: string,
): NationTimelineEvent["religions"][number] {
	return {
		id: religionId,
		name:
			earthHistory.religionNameById?.get(religionId) ??
			religionId.replace(/_/g, " "),
		color: rgbToCss(
			earthHistory.religionColorById?.get(religionId) ??
				COLOR.hashColorForKey(`religion:${religionId}`),
		),
	}
}

export function dynastyMention(
	dynasty: string,
): NationTimelineEvent["dynasties"][number] {
	return {
		id: dynasty,
		name: dynasty,
		color: paletteColorForDynasty(dynasty),
	}
}

export function personDisplay(payload: Record<string, unknown>): {
	description: string
	dynasties: NationTimelineEvent["dynasties"]
} {
	const name = String(payload.name ?? payload.monarchName ?? "unknown")
	const dynasty =
		typeof payload.dynasty === "string" && payload.dynasty.trim()
			? payload.dynasty
			: null
	return {
		description: dynasty ? `${name} ${dynasty}` : name,
		dynasties: dynasty ? [dynastyMention(dynasty)] : [],
	}
}
