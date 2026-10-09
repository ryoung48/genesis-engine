import { Fragment, type ReactNode, useState } from "react"
import { ChipGroup } from "@/ui/components/composites/ChipGroup"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
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

export interface PersonWikiChip {
	key: string
	name: string
	color: string
	dimmed: boolean
	title: string
	onClick: () => void
	// [JUSTIFICATION] Only person chips carry how the viewed person sees them.
	opinion?: PersonWikiOpinion
}

export interface PersonWikiGroup {
	label: string
	chips: PersonWikiChip[]
}

export interface PersonWikiData {
	name: string
	title: string
	life: string
	stats: StatEntry[]
	attributes: StatEntry[]
	personality: PersonTraitView[]
	physical: PersonTraitView[]
	groups: PersonWikiGroup[]
	timelineEvents: WikiTimelineEvent[]
	dateRangeStart: number
	dateRangeEnd: number
	currentDate: number
	currentDateLabel: string
	onSelectNation: (tag: string) => void
	onSelectProvince: (provinceId: number) => void
	onSelectPerson: (personId: number) => void
	onSelectDate: (date: number) => void
	onSelectOrganization: (orgId: string) => void
	onSelectWar: (warId: number) => void
}

function TraitChips({ traits }: { traits: PersonTraitView[] }) {
	return traits.map(({ name, tone }) => (
		<EntityChip
			key={name}
			name={name}
			color={uiPalette.person.trait[tone]}
			title={PERSON_TRAITS.toneLabels[tone]}
		/>
	))
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
		<CollapsibleCard label="Relations" defaultExpanded={false}>
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

function AttributesSection({ attributes }: { attributes: StatEntry[] }) {
	return (
		<CollapsibleCard label="Attributes" defaultExpanded={false}>
			<div className="grid grid-cols-2 gap-x-3 gap-y-1">
				{renderStatGrid(attributes)}
			</div>
		</CollapsibleCard>
	)
}

const NO_COUNT_HISTORY: WikiCountHistoryPoint[] = []

export function PersonWikiPage({ person }: { person: PersonWikiData }) {
	const groups = person.groups.filter((group) => group.chips.length > 0)
	const subtitle = [
		{ key: "title", node: <span>{person.title}</span> },
		{ key: "life", node: <span>{person.life}</span> },
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
					{person.personality.length > 0 ? (
						<>
							<span className="text-[9px] text-slate-400">Personality</span>
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-slate-700">
								<TraitChips traits={person.personality} />
							</div>
						</>
					) : null}
					{person.physical.length > 0 ? (
						<>
							<span className="text-[9px] text-slate-400">Physical</span>
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-slate-700">
								<TraitChips traits={person.physical} />
							</div>
						</>
					) : null}
				</div>
			</Surface>

			<AttributesSection attributes={person.attributes} />

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
					onSelectNation: person.onSelectNation,
					onSelectProvince: person.onSelectProvince,
					onSelectOrganization: person.onSelectOrganization,
					onSelectWar: person.onSelectWar,
					onSelectPerson: person.onSelectPerson,
					onSelectDate: person.onSelectDate,
				}}
			/>
		</div>
	)
}
