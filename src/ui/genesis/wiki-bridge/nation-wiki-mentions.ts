import { COLOR } from "@/model/history/earth/color"
import { ORGANIZATION_CATEGORIES } from "@/model/history/earth/organization-categories"
import { RULER_NAMES } from "@/model/history/record/rulers"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { HistoryTimeline } from "@/ui/genesis/view/types"
import type { RulerDisplayParams } from "@/ui/genesis/wiki-bridge/types"
import { paletteColorForDynasty } from "@/ui/wiki/nation/timeline-formatting"
import type { WikiTimelineEvent as NationTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

export function warMention(war: {
	id: number
	name: string
}): NationTimelineEvent["wars"][number] {
	return {
		id: war.id,
		name: war.name,
		color: "#b91c1c",
	}
}

export function organizationMention(
	history: HistoryTimeline,
	orgId: string,
	categoryId?: string,
): NationTimelineEvent["organizations"][number] {
	const ref = history.organizationReference?.get(orgId)
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
	history: HistoryTimeline,
	cultureId: string,
): NationTimelineEvent["cultures"][number] {
	return {
		id: cultureId,
		name:
			history.cultureNameById?.get(cultureId) ?? cultureId.replace(/_/g, " "),
		color: rgbToCss(
			history.cultureColorById?.get(cultureId) ??
				COLOR.hashColorForKey(`culture:${cultureId}`),
		),
	}
}

export function religionMention(
	history: HistoryTimeline,
	religionId: string,
): NationTimelineEvent["religions"][number] {
	return {
		id: religionId,
		name:
			history.religionNameById?.get(religionId) ??
			religionId.replace(/_/g, " "),
		color: rgbToCss(
			history.religionColorById?.get(religionId) ??
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

// A ruler's name and house as plain text, from a simulated ruler's recorded
// naming inputs or an Earth ruler's recorded strings.
export function rulerDisplay({ record, payload }: RulerDisplayParams): {
	description: string
	dynasties: NationTimelineEvent["dynasties"]
} {
	const ref = RULER_NAMES.refOf(payload)
	const named = ref ? RULER_NAMES.names({ record, ref }) : null
	const name = named
		? named.name
		: String(payload.name ?? payload.monarchName ?? "unknown")
	const dynasty = named
		? named.house
		: typeof payload.dynasty === "string" && payload.dynasty.trim()
			? payload.dynasty
			: null
	return {
		description: dynasty ? `${name} ${dynasty}` : name,
		dynasties: dynasty ? [dynastyMention(dynasty)] : [],
	}
}
