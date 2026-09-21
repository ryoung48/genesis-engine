import { ChipGroup } from "@/ui/components/composites/ChipGroup"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
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
	id: number
	name: string
	color: string
	sexGlyph: string
	dimmed: boolean
	note: string | null
	tooltip: string | null
}

export interface PersonWikiLink {
	key: string
	label: string
	// [JUSTIFICATION] A title whose seat belongs to no nation has no page to open.
	onSelect: (() => void) | null
}

export interface PersonWikiMessage {
	kind: "message"
	message: string
	backTitle: string
	onBack: () => void
}

export interface PersonWikiReady {
	kind: "ready"
	name: string
	sexGlyph: string
	backTitle: string
	dynastyName: string
	dynastyColor: string
	// [JUSTIFICATION] Only a person not yet born at the date carries a notice.
	notice: string | null
	stats: StatEntry[]
	titles: PersonWikiLink[]
	parents: PersonWikiChip[]
	spouses: PersonWikiChip[]
	children: PersonWikiChip[]
	siblings: PersonWikiChip[]
	timelineEvents: WikiTimelineEvent[]
	countHistory: WikiCountHistoryPoint[]
	formatValue: (value: number) => string
	dateRangeStart: number
	dateRangeEnd: number
	currentDate: number
	currentDateLabel: string
	onBack: () => void
	onSelectPerson: (personId: number, name: string) => void
	onSelectNation: (tag: string) => void
	onSelectProvince: (provinceId: number) => void
	onSelectDate: (date: number) => void
}

export type PersonWikiData = PersonWikiReady | PersonWikiMessage

function BackLink({
	backTitle,
	onBack,
}: {
	backTitle: string
	onBack: () => void
}) {
	return (
		<InlineTextButton onClick={onBack} className="text-slate-500">
			{backTitle}
		</InlineTextButton>
	)
}

function KinGroup({
	label,
	chips,
	onSelectPerson,
}: {
	label: string
	chips: PersonWikiChip[]
	onSelectPerson: (personId: number, name: string) => void
}) {
	if (chips.length === 0) return null
	return (
		<ChipGroup label={label} count={chips.length}>
			{chips.map((chip) => (
				<EntityChip
					key={chip.key}
					name={chip.name}
					color={chip.color}
					dimmed={chip.dimmed}
					title={chip.tooltip ?? undefined}
					onClick={() => onSelectPerson(chip.id, chip.name)}
					trailing={
						<span className="text-slate-400">
							{chip.sexGlyph}
							{chip.note ? ` ${chip.note}` : ""}
						</span>
					}
				/>
			))}
		</ChipGroup>
	)
}

function LinkGroup({
	label,
	links,
}: {
	label: string
	links: PersonWikiLink[]
}) {
	if (links.length === 0) return null
	return (
		<ChipGroup label={label} count={links.length}>
			{links.map((link) =>
				link.onSelect ? (
					<InlineTextButton key={link.key} onClick={link.onSelect}>
						{link.label}
					</InlineTextButton>
				) : (
					<span key={link.key}>{link.label}</span>
				),
			)}
		</ChipGroup>
	)
}

export function PersonWikiPage({ person }: { person: PersonWikiData }) {
	if (person.kind === "message")
		return (
			<div className="space-y-2 overflow-x-hidden">
				<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
					<WikiPageHeader
						title={person.message}
						meta={
							<BackLink backTitle={person.backTitle} onBack={person.onBack} />
						}
					/>
				</Surface>
			</div>
		)
	return (
		<div className="space-y-2 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<WikiPageHeader
					title={person.name}
					meta={
						<>
							<Swatch color={person.dynastyColor} />
							<span>{person.dynastyName}</span>
							<span>·</span>
							<BackLink backTitle={person.backTitle} onBack={person.onBack} />
						</>
					}
				/>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{renderStatGrid(person.stats)}
				</div>
				{person.notice ? (
					<EmptyState className="mt-2 py-0.5" message={person.notice} />
				) : null}
			</Surface>

			{person.titles.length > 0 ||
			person.parents.length > 0 ||
			person.spouses.length > 0 ||
			person.children.length > 0 ||
			person.siblings.length > 0 ? (
				<div className="rounded-xl border border-t border-slate-200 divide-y divide-slate-200 bg-white px-3 py-2.5">
					<LinkGroup label="Titles" links={person.titles} />
					<KinGroup
						label="Parents"
						chips={person.parents}
						onSelectPerson={person.onSelectPerson}
					/>
					<KinGroup
						label="Spouses"
						chips={person.spouses}
						onSelectPerson={person.onSelectPerson}
					/>
					<KinGroup
						label="Children"
						chips={person.children}
						onSelectPerson={person.onSelectPerson}
					/>
					<KinGroup
						label="Siblings"
						chips={person.siblings}
						onSelectPerson={person.onSelectPerson}
					/>
				</div>
			) : null}

			<WikiTimelineSection
				countHistory={person.countHistory}
				countChartLabel="Health over time"
				countUnitLabel="health"
				formatValue={person.formatValue}
				dateRangeStart={person.dateRangeStart}
				dateRangeEnd={person.dateRangeEnd}
				currentDate={person.currentDate}
				currentDateLabel={person.currentDateLabel}
				timelineEvents={person.timelineEvents}
				refs={{
					onSelectNation: person.onSelectNation,
					onSelectProvince: person.onSelectProvince,
					onSelectOrganization: () => undefined,
					onSelectWar: () => undefined,
					onSelectPerson: person.onSelectPerson,
					onSelectDate: person.onSelectDate,
				}}
			/>
		</div>
	)
}
