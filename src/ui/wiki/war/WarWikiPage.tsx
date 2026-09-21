import { ChipGroup } from "@/ui/components/composites/ChipGroup"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { uiPalette } from "@/ui/components/tokens"
import { renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import {
	type WikiCountHistoryPoint,
	type WikiTimelineEvent,
	WikiTimelineSection,
} from "@/ui/wiki/shared/WikiTimeline"

interface WarWikiNationMention {
	tag: string
	name: string
	color: string
	/** Whether this nation is currently a war participant at the wiki's
	 * selected date -- false for a nation that hasn't joined yet or has
	 * already left/made peace, which the Participants panel grays out
	 * instead of hiding (its side membership doesn't change). */
	active?: boolean
}

interface WarWikiParticipant {
	side: "attacker" | "defender"
	nations: WarWikiNationMention[]
}

export interface WarWikiData {
	id: number
	name: string
	backTitle: string
	/** Human-readable date range, e.g. "1618.5.23 – 1648.10.24" -- always
	 * day-precise since wars.json's own warStart/warEnd events always carry
	 * a real date (no year-only fallback needed here, unlike a merged
	 * conflicts.json record). */
	dateRangeLabel: string
	stats: StatEntry[]
	participants: WarWikiParticipant[]
	/** warStart/warEnd (join/leave) plus territory-exchange events between
	 * participants, in chronological order -- see WikiTimelineSection. */
	timelineEvents: WikiTimelineEvent[]
	dateRangeStart: number
	dateRangeEnd: number
	currentDate: number
	currentDateLabel: string
	onBack: () => void
	onSelectNation: (tag: string) => void
	onSelectProvince: (provinceId: number) => void
	onSelectDate: (date: number) => void
	onSelectOrganization: (orgId: string) => void
}

function NationLink({
	nation,
	onSelectNation,
}: {
	nation: WarWikiNationMention
	onSelectNation: (tag: string) => void
}) {
	const active = nation.active ?? true
	return (
		<EntityChip
			name={nation.name}
			color={nation.color}
			dimmed={!active}
			title={active ? undefined : "Not a participant at the selected date"}
			onClick={() => onSelectNation(nation.tag)}
		/>
	)
}

const SIDE_LABELS: Record<WarWikiParticipant["side"], string> = {
	attacker: "Attackers",
	defender: "Defenders",
}

function ParticipantGroup({
	group,
	onSelectNation,
}: {
	group: WarWikiParticipant
	onSelectNation: (tag: string) => void
}) {
	if (group.nations.length === 0) return null
	return (
		<ChipGroup label={SIDE_LABELS[group.side]} count={group.nations.length}>
			{group.nations.map((nation) => (
				<NationLink
					key={nation.tag}
					nation={nation}
					onSelectNation={onSelectNation}
				/>
			))}
		</ChipGroup>
	)
}

// No count-over-time series makes sense for a single war (unlike a
// nation's province count or an org's member territory), so the shared
// chart is skipped by passing an empty countHistory -- WikiTimelineSection's
// CountHistoryChart already no-ops on an empty series.
const NO_COUNT_HISTORY: WikiCountHistoryPoint[] = []

export function WarWikiPage({ war }: { war: WarWikiData }) {
	return (
		<div className="space-y-2 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<WikiPageHeader
					title={war.name}
					meta={
						<>
							<Swatch color={uiPalette.war} />
							<span>{war.dateRangeLabel}</span>
							<span>·</span>
							<InlineTextButton onClick={war.onBack} className="text-slate-500">
								{war.backTitle}
							</InlineTextButton>
						</>
					}
				/>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{renderStatGrid(war.stats)}
				</div>
			</Surface>

			{war.participants.some((group) => group.nations.length > 0) ? (
				<div className="rounded-xl border border-t border-slate-200 divide-y divide-slate-200 bg-white px-3 py-2.5">
					{war.participants.map((group) => (
						<ParticipantGroup
							key={group.side}
							group={group}
							onSelectNation={war.onSelectNation}
						/>
					))}
				</div>
			) : null}

			<WikiTimelineSection
				countHistory={NO_COUNT_HISTORY}
				countChartLabel=""
				countUnitLabel=""
				dateRangeStart={war.dateRangeStart}
				dateRangeEnd={war.dateRangeEnd}
				currentDate={war.currentDate}
				currentDateLabel={war.currentDateLabel}
				timelineEvents={war.timelineEvents}
				refs={{
					onSelectNation: war.onSelectNation,
					onSelectProvince: war.onSelectProvince,
					onSelectOrganization: war.onSelectOrganization,
					onSelectWar: () => undefined,
					onSelectDate: war.onSelectDate,
				}}
			/>
		</div>
	)
}
