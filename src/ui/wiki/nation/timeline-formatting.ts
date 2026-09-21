import { COLOR } from "@/model/history/earth/color"
import { DATE } from "@/model/history/earth/date"
import type { WikiTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

// EU4's own "no real value" sentinels, shared by the nation- and
// organization-timeline builders below.
export function normalizeTimelineTag(value: unknown): string | null {
	return typeof value === "string" && value !== "---" && value !== "XXX"
		? value
		: null
}

// Cleans an EU4 identifier like "cb_civil_war" or "take_capital_imperial"
// into a readable label ("Civil War", "Take Capital Imperial") for display
// on WarWikiPage -- strips the "cb_" casus-belli prefix (war_goal `type`
// values never have it, so the strip is a no-op there) and title-cases the
// remaining underscore-separated words.
export function cleanEu4Identifier(id: string): string {
	return id
		.replace(/^cb_/, "")
		.split("_")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ")
}

export function timelineTypeColor(type: string): string {
	switch (type.replace(/\s+\([+-]\)$/, "")) {
		case "Territory":
			return "#16a34a"
		case "Province":
			return "#0891b2"
		case "Culture":
			return "#c026d3"
		case "Religion":
			return "#ca8a04"
		case "Diplomacy":
			return "#0d9488"
		case "War":
			return "#ea580c"
		case "Battle":
			return "#b91c1c"
		case "Government":
			return "#7c3aed"
		case "Capital":
			return "#2563eb"
		case "Title":
			return "#0e7490"
		case "Ruler":
			return "#db2777"
		case "Heir":
		case "Queen":
		case "Leader":
			return "#be185d"
		case "Name":
			return "#4f46e5"
		case "Tech":
			return "#475569"
		case "Decision":
			return "#9333ea"
		case "Flag":
			return "#64748b"
		case "Economy":
			return "#059669"
		case "Revolution":
			return "#dc2626"
		case "HRE":
			return "#78716c"
		case "Emperor":
			return "#b45309"
		case "Elector":
			return "#a16207"
		case "Organization":
			return "#0e7490"
		case "Site":
			return "#0284c7"
		default:
			return "#64748b"
	}
}

export function eventComment(comment: unknown): string | undefined {
	return typeof comment === "string" && comment.trim() ? comment : undefined
}

export function isRebelTag(tag: string | null | undefined): boolean {
	return tag === "REB"
}

export function formatRebelTypeLabel(rebelType: unknown): string | null {
	if (typeof rebelType !== "string" || !rebelType.trim()) return null
	const normalized = rebelType.trim().toLowerCase()
	return cleanEu4Identifier(normalized.replace(/_rebels$/, ""))
}

export function formatRebelName(rebelType?: unknown): string {
	const rebelTypeLabel = formatRebelTypeLabel(rebelType)
	return rebelTypeLabel ? `Rebels (${rebelTypeLabel})` : "Rebels"
}

export function paletteColorForDynasty(dynasty: string): string {
	return COLOR.rgb01ToCss(COLOR.dynastyColor(dynasty))
}

export function formatRulerAgeLabel(
	birthDate: unknown,
	deathDate: unknown,
	selectedTimeMs: number,
): string | null {
	if (
		typeof deathDate === "string" &&
		DATE.eu4DateToTimeMs(deathDate) <= selectedTimeMs
	) {
		return "Deceased"
	}
	if (typeof birthDate !== "string") return null
	const age = Math.floor(
		(selectedTimeMs - DATE.eu4DateToTimeMs(birthDate)) / (365 * 86_400_000),
	)
	return Number.isFinite(age) && age >= 0 ? String(age) : null
}

export function formatRulerStatLabel(
	payload: Record<string, unknown> | null,
	fallbackName: string,
	selectedTimeMs: number,
): string {
	const rulerName = String(payload?.name ?? fallbackName)
	const parts: string[] = []
	const ageLabel = formatRulerAgeLabel(
		payload?.birthDate,
		payload?.deathDate,
		selectedTimeMs,
	)
	if (ageLabel) parts.push(ageLabel)
	if (
		payload?.regent === true ||
		/^(regency council|interregnum)$/i.test(rulerName.trim())
	) {
		if (payload?.regent === true) parts.push("Regent")
		return parts.join(" · ")
	}
	parts.push(payload?.female === true ? "♀" : "♂")
	return parts.join(" · ")
}

export function indefiniteArticle(label: string): "a" | "an" {
	return /^[aeiou]/i.test(label) ? "an" : "a"
}

export function subjectTypeLabel(subjectType: unknown): string {
	if (subjectType === "vassal") return "vassal"
	return typeof subjectType === "string" && subjectType.trim()
		? cleanEu4Identifier(subjectType).toLowerCase()
		: "subject"
}

export function pluralizeSubjectTypeLabel(label: string): string {
	const words = label.split(" ")
	const lastWord = words[words.length - 1]
	words[words.length - 1] =
		lastWord.endsWith("y") && !/[aeiou]y$/i.test(lastWord)
			? `${lastWord.slice(0, -1)}ies`
			: lastWord.endsWith("s")
				? `${lastWord}es`
				: `${lastWord}s`
	return words.join(" ")
}

export function subjectTypeGroupLabel(subjectType: unknown): string {
	const label = cleanEu4Identifier(subjectTypeLabel(subjectType))
	return pluralizeSubjectTypeLabel(label)
}

export function subjectRelationDescription(params: {
	title: string
	otherName: string
	isStart: boolean
	isOverlordPage: boolean
	subjectType: unknown
}): string {
	const relation = subjectTypeLabel(params.subjectType)
	const article = indefiniteArticle(relation)
	if (params.isStart) {
		return params.isOverlordPage
			? `${params.title} gained ${params.otherName} as ${article} ${relation}.`
			: `${params.title} became ${article} ${relation} of ${params.otherName}.`
	}
	return params.isOverlordPage
		? `${params.title} lost ${params.otherName} as ${article} ${relation}.`
		: `${params.title} stopped being ${article} ${relation} of ${params.otherName}.`
}

// "A", "A and B", "A, B, and C" -- used to merge same-date war join/leave
// events (multiple nations joining/leaving on the same day, e.g. a shared
// peace treaty) into one WarWikiPage timeline entry instead of one per
// nation.
export function joinWithAnd(names: string[]): string {
	if (names.length <= 1) return names[0] ?? ""
	if (names.length === 2) return `${names[0]} and ${names[1]}`
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

export function pushTimelineEvent(
	events: WikiTimelineEvent[],
	params: {
		id: string
		date: number
		type: string
		description: string
		comment?: string
		plainTextRanges?: WikiTimelineEvent["plainTextRanges"]
		nations?: WikiTimelineEvent["nations"]
		provinces?: WikiTimelineEvent["provinces"]
		cultures?: WikiTimelineEvent["cultures"]
		religions?: WikiTimelineEvent["religions"]
		dynasties?: WikiTimelineEvent["dynasties"]
		organizations?: WikiTimelineEvent["organizations"]
		wars?: WikiTimelineEvent["wars"]
	},
) {
	events.push({
		id: params.id,
		date: params.date,
		dateLabel: DATE.formatHistoryDays(params.date),
		type: params.type,
		typeColor: timelineTypeColor(params.type),
		description: params.description,
		comment: params.comment,
		plainTextRanges: params.plainTextRanges,
		nations: params.nations ?? [],
		provinces: params.provinces ?? [],
		cultures: params.cultures ?? [],
		religions: params.religions ?? [],
		dynasties: params.dynasties ?? [],
		organizations: params.organizations ?? [],
		wars: params.wars ?? [],
	})
}

// organization-categories.ts's colors are 0-255 (organizations.json
// convention); rgb01ToCss expects 0-1.
export function rgb255ToCss(rgb: [number, number, number]): string {
	return COLOR.rgb01ToCss([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255])
}

function warEndRank(event: { type: string }): number {
	return event.type === "War (-)" ? 1 : 0
}

export function compareTimelineDateThenWarEnd(
	a: { date: number; type: string },
	b: { date: number; type: string },
): number {
	return a.date - b.date || warEndRank(a) - warEndRank(b)
}
