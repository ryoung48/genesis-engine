import { Fragment, type ReactNode, useState } from "react"
import { ChipGroup } from "@/ui/components/composites/ChipGroup"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { DropIcon } from "@/ui/components/primitives/icons/DropIcon"
import { Surface } from "@/ui/components/primitives/Surface"
import { uiPalette } from "@/ui/components/tokens"
import {
	PERSON_TRAITS,
	type PersonTraitView,
} from "@/ui/genesis/shared/person-traits"
import { renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import {
	type WikiCountHistoryPoint,
	type WikiTimelineEvent,
	WikiTimelineSection,
} from "@/ui/wiki/shared/WikiTimeline"

export interface PersonWikiOpinion {
	label: string
	color: string
	detail: string
}

export interface PersonWikiKinship {
	label: string
	color: string
}

export interface PersonWikiChip {
	key: string
	name: string
	color: string
	dimmed: boolean
	title: string
	onClick: () => void
	opinion: PersonWikiOpinion | null
	kinship: PersonWikiKinship | null
}

export interface PersonWikiGroup {
	label: string
	chips: PersonWikiChip[]
}

export interface PersonWikiData {
	name: string
	title: string
	life: string
	planetTitle: string
	stats: StatEntry[]
	personality: PersonTraitView[]
	physical: PersonTraitView[]
	conditions: PersonTraitView[]
	groups: PersonWikiGroup[]
	timelineEvents: WikiTimelineEvent[]
	dateRangeStart: number
	dateRangeEnd: number
	currentDate: number
	currentDateLabel: string
	// Set when the person is not yet born at the selected date.
	emptyMessage: string | null
	onBack: () => void
	onSelectPerson: (key: string) => void
	onSelectDate: (date: number) => void
}

function TraitChips({ traits }: { traits: PersonTraitView[] }) {
	return (
		<>
			{traits.map(({ name, tone }) => (
				<EntityChip
					key={name}
					name={name}
					color={uiPalette.person.trait[tone]}
					title={PERSON_TRAITS.toneLabels[tone]}
				/>
			))}
		</>
	)
}

function TraitRow({
	label,
	traits,
}: {
	label: string
	traits: PersonTraitView[]
}) {
	if (traits.length === 0) return null
	return (
		<>
			<span className="text-[9px] text-slate-400">{label}</span>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-slate-700">
				<TraitChips traits={traits} />
			</div>
		</>
	)
}

function PersonChip({ chip }: { chip: PersonWikiChip }) {
	return (
		<span className="inline-flex items-baseline">
			<EntityChip
				name={chip.name}
				color={chip.color}
				dimmed={chip.dimmed}
				title={chip.title}
				onClick={chip.onClick}
			/>
			{chip.kinship ? (
				<sup
					className="ml-0.5 inline-flex leading-none"
					style={{ color: chip.kinship.color }}
					title={chip.kinship.label}
				>
					<DropIcon width={8} height={8} />
				</sup>
			) : null}
			{chip.opinion ? (
				<sup
					className="ml-0.5 text-[8px] font-semibold leading-none"
					style={{ color: chip.opinion.color }}
					title={chip.opinion.detail}
				>
					{chip.opinion.label}
				</sup>
			) : null}
		</span>
	)
}

function CollapsibleCard({
	label,
	defaultExpanded,
	children,
}: {
	label: string
	defaultExpanded: boolean
	children: ReactNode
}) {
	const [expanded, setExpanded] = useState(defaultExpanded)
	return (
		<div className="rounded-xl border border-t border-slate-200 bg-white px-3 py-2.5">
			<DisclosureButton
				label={label}
				expanded={expanded}
				onClick={() => setExpanded((open) => !open)}
			/>
			<div className={expanded ? "mt-1.5" : "hidden"}>{children}</div>
		</div>
	)
}

function RelationsSection({ groups }: { groups: PersonWikiGroup[] }) {
	return (
		<CollapsibleCard label="Family" defaultExpanded>
			<div className="divide-y divide-slate-200">
				{groups.map((group) => (
					<ChipGroup
						key={group.label}
						label={group.label}
						count={group.chips.length}
					>
						{group.chips.map((chip) => (
							<PersonChip key={chip.key} chip={chip} />
						))}
					</ChipGroup>
				))}
			</div>
		</CollapsibleCard>
	)
}

const NO_COUNT_HISTORY: WikiCountHistoryPoint[] = []
const IGNORE = (): void => undefined

export function PersonWikiPage({ person }: { person: PersonWikiData }) {
	const groups = person.groups.filter((group) => group.chips.length > 0)
	const subtitle = [
		{ key: "title", node: <span>{person.title}</span> },
		{ key: "life", node: <span>{person.life}</span> },
		{
			key: "back",
			node: (
				<InlineTextButton onClick={person.onBack} className="text-slate-500">
					{person.planetTitle}
				</InlineTextButton>
			),
		},
	]
	return (
		<div className="space-y-2 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<WikiPageHeader
					title={person.name}
					meta={subtitle.map((part, index) => (
						<Fragment key={part.key}>
							{index > 0 ? <span>·</span> : null}
							{part.node}
						</Fragment>
					))}
				/>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{renderStatGrid(person.stats)}
					<TraitRow label="Personality" traits={person.personality} />
					<TraitRow label="Physical" traits={person.physical} />
					<TraitRow label="Conditions" traits={person.conditions} />
				</div>
			</Surface>

			{person.emptyMessage ? (
				<EmptyState className="py-2" message={person.emptyMessage} />
			) : null}

			{groups.length > 0 ? <RelationsSection groups={groups} /> : null}

			<WikiTimelineSection
				countHistory={NO_COUNT_HISTORY}
				countChartLabel=""
				countUnitLabel=""
				dateRangeStart={person.dateRangeStart}
				dateRangeEnd={person.dateRangeEnd}
				currentDate={person.currentDate}
				currentDateLabel={person.currentDateLabel}
				timelineEvents={person.timelineEvents}
				refs={{
					onSelectNation: IGNORE,
					onSelectProvince: IGNORE,
					onSelectOrganization: IGNORE,
					onSelectWar: IGNORE,
					onSelectPerson: person.onSelectPerson,
					onSelectReligion: IGNORE,
					onSelectDate: person.onSelectDate,
				}}
			/>
		</div>
	)
}
