import { COLOR } from "@/model/history/earth/color"
import { ORGANIZATION_CATEGORIES } from "@/model/history/earth/organization-categories"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_NAMES } from "@/model/history/record/people/names"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { uiPalette } from "@/ui/components/tokens"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { HistoryTimeline } from "@/ui/genesis/view/types"
import type {
	NoblePopularityParams,
	PersonDisplayParams,
	RecordPersonMentionParams,
	RegentRoleParams,
} from "@/ui/genesis/wiki-bridge/types"
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

export function recordPersonMention({
	people,
	person,
}: RecordPersonMentionParams): NationTimelineEvent["people"][number] | null {
	const row = PERSON_NAMES.person({ people, person })
	return row
		? {
				id: person,
				name: row.name,
				color: row.house
					? paletteColorForDynasty(row.house)
					: uiPalette.person.noHouse,
			}
		: null
}

// The ruler's standing among the holders of the realm's districts.
export function noblePopularityStat(params: NoblePopularityParams): StatEntry {
	const popularity = PERSON_QUERY.popularity(params)
	return {
		label: "Noble popularity (religion excluded)",
		value:
			popularity.count > 0
				? `${popularity.value > 0 ? "+" : ""}${popularity.value.toFixed(1)} · ${popularity.count} ${popularity.count === 1 ? "holder" : "holders"}`
				: "No district opinions",
	}
}

// How a regent stands to the child they govern for, read from the recorded
// family: parent, sibling, parent's sibling, else a kinsman or a protector.
export function regentRole({
	people,
	regent,
	ward,
	kind,
}: RegentRoleParams): string | null {
	if (!people) return null
	const regentRow = PEOPLE_RECORD.person({ people, id: regent })
	const wardRow = PEOPLE_RECORD.person({ people, id: ward })
	if (!regentRow || !wardRow) return null
	const female = regentRow.sex === 1
	if (kind === "spouse") return female ? "wife" : "husband"
	const parents = [wardRow.father, wardRow.mother].filter((id) => id >= 0)
	if (parents.includes(regent)) return female ? "mother" : "father"
	if ([regentRow.father, regentRow.mother].some((id) => parents.includes(id)))
		return female ? "sister" : "brother"
	const grandparents = parents.flatMap((id) => {
		const parent = PEOPLE_RECORD.person({ people, id })
		return parent ? [parent.father, parent.mother] : []
	})
	if (
		[regentRow.father, regentRow.mother].some(
			(id) => id >= 0 && grandparents.includes(id),
		)
	)
		return female ? "aunt" : "uncle"
	if (kind === "relative") return female ? "kinswoman" : "kinsman"
	if (kind === "protector") return female ? "lady protector" : "lord protector"
	return null
}

export function personDisplay({
	people,
	payload: rawPayload,
}: PersonDisplayParams): {
	description: string
	dynasties: NationTimelineEvent["dynasties"]
	people: NationTimelineEvent["people"]
} {
	const payload = PERSON_NAMES.payload({ people, payload: rawPayload })
	const name = String(payload.name ?? payload.monarchName ?? "unknown")
	const dynasty =
		typeof payload.dynasty === "string" && payload.dynasty.trim()
			? payload.dynasty
			: null
	// Simulated rulers carry their person id and link to their wiki page.
	const person = typeof payload.person === "number" ? payload.person : -1
	return {
		description: dynasty ? `${name} ${dynasty}` : name,
		dynasties: dynasty ? [dynastyMention(dynasty)] : [],
		people:
			person >= 0
				? [
						{
							id: person,
							name,
							color: dynasty
								? paletteColorForDynasty(dynasty)
								: uiPalette.person.noHouse,
						},
					]
				: [],
	}
}
