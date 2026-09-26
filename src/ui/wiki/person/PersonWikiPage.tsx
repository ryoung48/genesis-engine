import { ChipGroup } from "@/ui/components/composites/ChipGroup"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import {
	type WikiCountHistoryPoint,
	type WikiTimelineEvent,
	WikiTimelineSection,
} from "@/ui/wiki/shared/WikiTimeline"

export interface PersonWikiChip {
	key: string
	name: string
	color: string
	/** Dead, or no longer holding the seat, at the selected date. */
	dimmed: boolean
	title: string
	onClick: () => void
}

export interface PersonWikiGroup {
	label: string
	chips: PersonWikiChip[]
}

export interface PersonWikiData {
	name: string
	houseColor: string
	/** House and life span, e.g. "House Aral · 822 – 870". */
	metaLabel: string
	planetTitle: string
	stats: StatEntry[]
	/** Seats held, parents, siblings, spouses and children; empty groups are
	 * skipped. */
	groups: PersonWikiGroup[]
	timelineEvents: WikiTimelineEvent[]
	dateRangeStart: number
	dateRangeEnd: number
	currentDate: number
	currentDateLabel: string
	onBack: () => void
	onSelectNation: (tag: string) => void
	onSelectProvince: (provinceId: number) => void
	onSelectPerson: (personId: number) => void
	onSelectDate: (date: number) => void
	onSelectOrganization: (orgId: string) => void
	onSelectWar: (warId: number) => void
}

const NO_COUNT_HISTORY: WikiCountHistoryPoint[] = []

export function PersonWikiPage({ person }: { person: PersonWikiData }) {
	const groups = person.groups.filter((group) => group.chips.length > 0)
	return (
		<div className="space-y-2 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<WikiPageHeader
					title={person.name}
					meta={
						<>
							<Swatch color={person.houseColor} />
							<span>{person.metaLabel}</span>
							<span>·</span>
							<InlineTextButton
								onClick={person.onBack}
								className="text-slate-500"
							>
								{person.planetTitle}
							</InlineTextButton>
						</>
					}
				/>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{renderStatGrid(person.stats)}
				</div>
			</Surface>

			{groups.length > 0 ? (
				<div className="rounded-xl border border-t border-slate-200 divide-y divide-slate-200 bg-white px-3 py-2.5">
					{groups.map((group) => (
						<ChipGroup
							key={group.label}
							label={group.label}
							count={group.chips.length}
						>
							{group.chips.map((chip) => (
								<EntityChip
									key={chip.key}
									name={chip.name}
									color={chip.color}
									dimmed={chip.dimmed}
									title={chip.title}
									onClick={chip.onClick}
								/>
							))}
						</ChipGroup>
					))}
				</div>
			) : null}

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
