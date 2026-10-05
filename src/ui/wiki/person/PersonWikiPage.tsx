import type { OpinionBreakdown } from "@/model/history/sim/people/opinion/types"
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
	metaLabel: string
	planetTitle: string
	stats: StatEntry[]
	attributes: StatEntry[]
	traits: string[]
	opinions: PersonWikiOpinion[]
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

export interface PersonWikiOpinion {
	label: string
	breakdown: OpinionBreakdown | null
	memories: PersonWikiMemory[]
}

// A remembered interaction and what it still adds to the opinion.
export interface PersonWikiMemory {
	label: string
	dateLabel: string
	strength: number
}

function signed(value: number): string {
	const rounded = Math.round(value * 10) / 10
	return `${rounded > 0 ? "+" : ""}${rounded}`
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

			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<ChipGroup label="Attributes" count={person.attributes.length}>
					<div className="grid grid-cols-2 gap-x-3 gap-y-1">
						{renderStatGrid(person.attributes)}
					</div>
				</ChipGroup>
				<ChipGroup label="Traits" count={person.traits.length}>
					{person.traits.map((trait) => (
						<EntityChip
							key={trait}
							name={trait}
							color={person.houseColor}
							dimmed={false}
							title={trait}
						/>
					))}
				</ChipGroup>
			</Surface>

			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<ChipGroup label="Opinions" count={person.opinions.length}>
					<div className="space-y-2">
						{person.opinions.map(({ label, breakdown, memories }) => (
							<div key={label}>
								<div>
									{label}: {breakdown ? signed(breakdown.total) : "Unavailable"}
								</div>
								{breakdown && (
									<div className="text-slate-500">
										{Object.entries(breakdown)
											.filter(([key]) => key !== "total")
											.map(([key, value]) => `${key}: ${signed(value)}`)
											.join(" · ")}
									</div>
								)}
								{memories.map((memory) => (
									<div
										key={`${memory.label}:${memory.dateLabel}`}
										className="text-slate-500"
									>
										{`${memory.label} (${memory.dateLabel}): ${signed(memory.strength)}`}
									</div>
								))}
							</div>
						))}
					</div>
				</ChipGroup>
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
