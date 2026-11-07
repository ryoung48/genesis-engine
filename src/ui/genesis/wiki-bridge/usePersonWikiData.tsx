import { useMemo } from "react"
import { DATE } from "@/model/history/earth/date"
import type { OpinionBreakdown } from "@/model/people/opinion/types"
import { PERSON_QUERY } from "@/model/people/query"
import type {
	FamilyGroup,
	FamilyMember,
	PersonPage,
} from "@/model/people/query/types"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { GraveStoneIcon } from "@/ui/components/primitives/icons/GraveStoneIcon"
import { HeartIcon } from "@/ui/components/primitives/icons/HeartIcon"
import { uiPalette } from "@/ui/components/tokens"
import { PEOPLE_CONTEXT } from "@/ui/genesis/shared/people-context"
import {
	PERSON_TRAITS,
	type PersonTraitView,
} from "@/ui/genesis/shared/person-traits"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import {
	paletteColorForDynasty,
	pushTimelineEvent,
} from "@/ui/wiki/nation/timeline-formatting"
import type {
	PersonWikiChip,
	PersonWikiData,
	PersonWikiGroup,
	PersonWikiOpinion,
} from "@/ui/wiki/person/PersonWikiPage"
import type { WikiTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

const MS_PER_DAY = 86_400_000

const KINSHIP_LABELS = {
	cousin: "Married first cousin",
	"uncle-niece": "Married aunt, uncle, niece or nephew",
	"half-sibling": "Married half-sibling",
	sibling: "Married sibling",
} as const

interface PartitionColors {
	culture: (key: string | null) => string
	religion: (key: string | null) => string
}

function lifeLabel(page: PersonPage): string {
	const born = DATE.formatHistoryDays(page.birthMs / MS_PER_DAY)
	if (page.deathMs === Infinity) return `Born ${born}`
	return `${born} – ${DATE.formatHistoryDays(page.deathMs / MS_PER_DAY)}`
}

function opinionOf(opinion: OpinionBreakdown | null): PersonWikiOpinion | null {
	if (!opinion) return null
	const parts = [
		["Personality", opinion.personality],
		["Culture", opinion.culture],
		["Religion", opinion.religion],
		["Reputation", opinion.reputation],
		["Kin", opinion.kin],
		["Spouse", opinion.spouse],
	]
		.filter(([, value]) => value !== 0)
		.map(([label, value]) => `${label} ${Number(value) > 0 ? "+" : ""}${value}`)
	return {
		label: `${opinion.total > 0 ? "+" : ""}${opinion.total}`,
		color:
			opinion.total > 0
				? uiPalette.person.opinion.positive
				: opinion.total < 0
					? uiPalette.person.opinion.negative
					: uiPalette.person.opinion.neutral,
		detail: parts.length > 0 ? parts.join(", ") : "No modifiers",
	}
}

function chipOf(
	member: FamilyMember,
	select: (key: string) => void,
): PersonWikiChip {
	const dead = member.status === "Dead"
	return {
		key: member.key,
		name: member.house ? `${member.name} ${member.house}` : member.name,
		color: dead
			? uiPalette.person.deceased
			: member.house
				? paletteColorForDynasty(member.house)
				: uiPalette.person.noHouse,
		dimmed: dead,
		title: `${member.female ? "Female" : "Male"}, age ${Math.floor(member.ageYears)} · ${member.house ?? "Lowborn"} · ${member.status}`,
		onClick: () => select(member.key),
		opinion: opinionOf(member.opinion),
		kinship: member.kinship
			? {
					label: KINSHIP_LABELS[member.kinship],
					color: uiPalette.person.kinship[member.kinship],
				}
			: null,
	}
}

interface StatsParams {
	page: PersonPage
	colors: PartitionColors
	selectReligion: ((id: number) => void) | null
	residence: string | null
}

function statsOf({
	page,
	colors,
	selectReligion,
	residence,
}: StatsParams): StatEntry[] {
	const healthColor =
		page.status === "Dead"
			? uiPalette.person.deceased
			: uiPalette.person.health[page.status]
	const Icon = page.status === "Dead" ? GraveStoneIcon : HeartIcon
	const stats: StatEntry[] = [
		{
			label: "Sex",
			value: page.orientation
				? `${page.female ? "Female" : "Male"} · ${page.orientation}`
				: page.female
					? "Female"
					: "Male",
		},
		{
			label: "Age",
			value: "",
			valueAction: (
				<span
					className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-700"
					title={page.status}
				>
					{Math.floor(page.ageYears)}
					<Icon width={10} height={10} style={{ color: healthColor }} />
				</span>
			),
		},
		{ label: "Rank", value: page.rank },
		{
			label: "House",
			value: page.house ?? "Lowborn",
			swatchColor: page.house
				? paletteColorForDynasty(page.house)
				: uiPalette.person.noHouse,
		},
	]
	if (page.culture)
		stats.push({
			label: "Culture",
			value: page.culture,
			swatchColor: colors.culture(page.cultureKey),
		})
	if (page.religion) {
		const select = selectReligion
		stats.push(
			select && page.religionId >= 0
				? {
						label: "Religion",
						value: "",
						valueAction: (
							<EntityChip
								name={page.religion}
								color={colors.religion(page.religionKey)}
								onClick={() => select(page.religionId)}
							/>
						),
					}
				: {
						label: "Religion",
						value: page.religion,
						swatchColor: colors.religion(page.religionKey),
					},
		)
	}
	if (residence) stats.push({ label: "Residence", value: residence })
	return stats
}

function timelineOf(page: PersonPage): WikiTimelineEvent[] {
	const colors = new Map<string, string>()
	for (const group of page.groups)
		for (const member of group.members)
			colors.set(
				member.key,
				member.house
					? paletteColorForDynasty(member.house)
					: uiPalette.person.noHouse,
			)
	const events: WikiTimelineEvent[] = []
	for (const [index, row] of page.timeline.entries())
		pushTimelineEvent(events, {
			id: `person:${page.key}:${index}`,
			date: row.timeMs / MS_PER_DAY,
			type: row.type,
			description: row.revealed ? `${row.text} (revealed later)` : row.text,
			people: row.people.map((person) => ({
				id: person.key,
				name: person.name,
				color: colors.get(person.key) ?? uiPalette.person.noHouse,
			})),
		})
	return events
}

function traitViews(page: PersonPage): {
	personality: PersonTraitView[]
	physical: PersonTraitView[]
	conditions: PersonTraitView[]
} {
	return {
		personality: page.personality.map(PERSON_TRAITS.personality),
		physical: [
			...page.grades.map(PERSON_TRAITS.grade),
			...page.congenital.map(PERSON_TRAITS.congenital),
		],
		conditions: page.conditions.map((condition) => ({
			name: `${condition.name} ${condition.level}`,
			tone: "defect" as const,
		})),
	}
}

function groupsOf(
	groups: FamilyGroup[],
	select: (key: string) => void,
): PersonWikiGroup[] {
	return groups.map((group) => ({
		label: group.label,
		chips: group.members.map((member) => chipOf(member, select)),
	}))
}

export function usePersonWikiData(
	input: PersonWikiDataInput,
): PersonWikiData | null {
	const {
		selectedWikiPerson,
		world,
		history,
		planetName,
		setSelectedWikiPerson,
		setSelectedWikiReligionId,
	} = input
	const state = history.state
	const timeMs = history.selectedTimeMs
	const context = useMemo(
		() => (state ? PEOPLE_CONTEXT.of({ world, state }) : null),
		[world, state],
	)
	return useMemo<PersonWikiData | null>(() => {
		if (selectedWikiPerson === null || !state || !context) return null
		const record = state.record
		if (record.origin !== "procedural") return null
		const base = {
			planetTitle: planetName,
			currentDate: timeMs / MS_PER_DAY,
			currentDateLabel: DATE.formatHistoryTimeMs(timeMs),
			onBack: () => setSelectedWikiPerson(null),
			onSelectPerson: (key: string) => setSelectedWikiPerson(key),
			onSelectDate: (day: number) =>
				history.setSelectedTimeMs(day * MS_PER_DAY),
		}
		const outcome = PERSON_QUERY.page({
			record,
			context,
			key: selectedWikiPerson,
			timeMs,
		})
		if (!outcome) return null
		if (outcome.kind !== "page") {
			const header = outcome.header
			const born = DATE.formatHistoryDays(header.birthMs / MS_PER_DAY)
			return {
				...base,
				name: header.name,
				title: outcome.kind === "pending" ? "Pending" : "Not yet born",
				life: `Born ${born}`,
				stats: [],
				personality: [],
				physical: [],
				conditions: [],
				groups: [],
				timelineEvents: [],
				dateRangeStart: header.birthMs / MS_PER_DAY,
				dateRangeEnd: record.maxTimeMs / MS_PER_DAY,
				emptyMessage:
					outcome.kind === "pending"
						? "Waiting for the history to reach this date"
						: `Born ${born}, after the selected date`,
			}
		}
		const page = outcome.page
		const colors: PartitionColors = {
			culture: (key) => {
				const color = key ? history.cultureColorById?.get(key) : null
				return color ? rgbToCss(color) : uiPalette.person.noHouse
			},
			religion: (key) => {
				const color = key ? history.religionColorById?.get(key) : null
				return color ? rgbToCss(color) : uiPalette.person.noHouse
			},
		}
		const groups = groupsOf(page.groups, setSelectedWikiPerson)
		const timelineEvents = timelineOf(page)
		return {
			...base,
			name: page.house ? `${page.name} ${page.house}` : page.name,
			title: page.title ?? (page.house ? "Noble" : "Lowborn"),
			life: lifeLabel(page),
			stats: statsOf({
				page,
				colors,
				selectReligion: world?.religionTypes ? setSelectedWikiReligionId : null,
				residence: history.provinceMeta?.[page.seatProvince]?.name ?? null,
			}),
			...traitViews(page),
			groups,
			timelineEvents,
			dateRangeStart: page.birthMs / MS_PER_DAY,
			dateRangeEnd: record.maxTimeMs / MS_PER_DAY,
			emptyMessage: null,
		}
	}, [
		selectedWikiPerson,
		world,
		setSelectedWikiReligionId,
		state,
		context,
		timeMs,
		history.setSelectedTimeMs,
		history.cultureColorById,
		history.religionColorById,
		history.provinceMeta,
		planetName,
		setSelectedWikiPerson,
	])
}
