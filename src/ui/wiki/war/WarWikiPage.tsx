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
import { formatCount } from "@/ui/wiki/stats/nation/nation-stats"

interface WarWikiNationMention {
	tag: string
	name: string
	color: string
	striped: boolean
	// The side's first belligerent, emphasized in the participant list.
	lead: boolean
	// Relation to the side's lead at the selected date, e.g. "ally" or "vassal".
	role: string | null
	// Deployed troops after the latest battle at the selected date; null
	// before any battle, for Earth wars, or when absent from that battle.
	troops: number | null
}

interface WarWikiParticipant {
	side: "attacker" | "defender"
	nations: WarWikiNationMention[]
	totalStrength: number | null
}

export interface WarWikiData {
	id: number
	name: string
	planetTitle: string
	/** Human-readable date range, e.g. "1618.5.23 – 1648.10.24" -- always
	 * day-precise since wars.json's own warStart/warEnd events always carry
	 * a real date (no year-only fallback needed here, unlike a merged
	 * conflicts.json record). */
	dateRangeLabel: string
	stats: StatEntry[]
	participants: WarWikiParticipant[]
	// Set when the selected date is outside the war, so the panel shows the
	// war's opening or closing line-up as of this date instead.
	participantsAsOf: string | null
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
	onSelectPerson: (personId: number) => void
}

function NationLink({
	nation,
	onSelectNation,
}: {
	nation: WarWikiNationMention
	onSelectNation: (tag: string) => void
}) {
	return (
		<EntityChip
			name={nation.name}
			color={nation.color}
			striped={nation.striped}
			emphasized={nation.lead}
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
	return (
		<ChipGroup
			label={`${SIDE_LABELS[group.side]}${group.totalStrength === null ? "" : ` · ${formatCount(group.totalStrength)} men`}`}
			count={group.nations.length}
		>
			{group.nations.map((nation) => (
				<div
					key={nation.tag}
					className="flex w-full min-w-0 items-center justify-between gap-2"
				>
					<span className="flex min-w-0 items-center gap-1">
						<NationLink nation={nation} onSelectNation={onSelectNation} />
						{nation.role === null ? null : (
							<span className="text-slate-400">({nation.role})</span>
						)}
					</span>
					{nation.troops === null ? null : (
						<span className="shrink-0 text-slate-500">
							{formatCount(nation.troops)}
						</span>
					)}
				</div>
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
								{war.planetTitle}
							</InlineTextButton>
						</>
					}
				/>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{renderStatGrid(war.stats)}
				</div>
			</Surface>

			{war.participants.some((group) => group.nations.length > 0) ? (
				<div className="rounded-xl border border-slate-200 bg-white py-2.5">
					{war.participantsAsOf === null ? null : (
						<div className="mb-1.5 px-3 text-[8px] uppercase tracking-[0.1em] text-slate-400">
							As of {war.participantsAsOf}
						</div>
					)}
					<div className="grid grid-cols-2 divide-x divide-slate-200 [&>*]:px-3">
						{war.participants.map((group) => (
							<div key={group.side}>
								<ParticipantGroup
									group={group}
									onSelectNation={war.onSelectNation}
								/>
							</div>
						))}
					</div>
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
					onSelectPerson: war.onSelectPerson,
					onSelectDate: war.onSelectDate,
				}}
			/>
		</div>
	)
}
