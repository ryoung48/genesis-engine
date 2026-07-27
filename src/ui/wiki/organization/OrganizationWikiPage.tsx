import type { DistributionChartBucket } from "@/ui/components/composites/DistributionChart"
import { DistributionChart } from "@/ui/components/composites/DistributionChart"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import {
	type WikiCountHistoryPoint,
	WikiSection,
	type WikiTimelineEvent,
	WikiTimelineSection,
} from "@/ui/wiki/shared/WikiTimeline"

interface OrganizationWikiNationMention {
	tag: string
	name: string
	color: string
	/** True when this nation is associated with the org without being a
	 * genuine member -- e.g. Venice's Terraferma, still formally inside the
	 * HRE after Venice (never an Imperial Estate) conquered it, or a city
	 * merely hosting a Hanseatic trade post rather than holding League
	 * membership. See organization-categories.ts's OrgCategory.striped.
	 * Shown as a two-tone striped swatch instead of a plain solid one. */
	striped?: boolean
	/** This member's category (Prince-Elector, Trade Post, ...) -- see
	 * organization-categories.ts's OrgCategory. Undefined only for an org
	 * with no registered category schema at all. When present, the Members
	 * section groups by this instead of one flat list. */
	category?: {
		label: string
		color: string
		/** Fixed display order across categories (Emperor first, Imperial
		 * Princes last, ...) -- resolved by GenesisView so this component
		 * doesn't need to know the category list itself. */
		order: number
		/** Same meaning as the mention's own `striped` above, just carried on
		 * the category so its group header swatch (not just each member's
		 * own swatch) can render striped too -- e.g. HRE's "Holds Territory,
		 * Not a Member" and HSA's "Trade Post" headers. */
		striped?: boolean
	}
}

export interface OrganizationWikiData {
	id: string
	name: string
	/** Same swatch color as the map/nation-wiki convention -- from
	 * reference/organizations.json's `color`. */
	color: string
	planetTitle: string
	stats: StatEntry[]
	/** Current members as of currentDate, alphabetized -- includes striped
	 * associate categories like HRE's foreign holders and HSA's trade posts
	 * (organization-categories.ts), which used to be listed separately as
	 * "sites" instead of appearing here. */
	members: OrganizationWikiNationMention[]
	cultureDistribution: DistributionChartBucket[]
	religionDistribution: DistributionChartBucket[]
	climateDistribution: DistributionChartBucket[]
	topographyDistribution: DistributionChartBucket[]
	vegetationDistribution: DistributionChartBucket[]
	showObservedDistributions: boolean
	/** Member-territory province count at each membership/territory change,
	 * sorted by date; the first entry carries the count at dateRangeStart. */
	countHistory: WikiCountHistoryPoint[]
	/** Full simulation date range the timeline/chart spans. */
	dateRangeStart: number
	dateRangeEnd: number
	currentDate: number
	currentDateLabel: string
	/** Every timeline event that mentions this organization -- join/leave
	 * (or leadership) history, built the same way as a nation's timeline. */
	timelineEvents: WikiTimelineEvent[]
	onBack: () => void
	onSelectNation: (tag: string) => void
	/** Zooms the 3D view to a province without changing wiki selection. */
	onSelectProvince: (provinceId: number) => void
	onSelectDate: (date: number) => void
	/** Switches the page to a war's wiki page. Organizations' own timelines
	 * don't currently mention wars, but WikiTimelineSection's refs are shared
	 * with NationWikiPage, so this needs a real (if unused) handler. */
	onSelectWar: (warId: string) => void
}

function NationLink({
	nation,
	onSelectNation,
}: {
	nation: OrganizationWikiNationMention
	onSelectNation: (tag: string) => void
}) {
	return (
		<span className="inline-flex items-center gap-1">
			<Swatch
				color={nation.color}
				striped={nation.striped}
				stripeBackground="transparent"
				title={
					nation.striped ? "Holds territory, but isn't a member" : undefined
				}
			/>
			<InlineTextButton onClick={() => onSelectNation(nation.tag)}>
				{nation.name}
			</InlineTextButton>
		</span>
	)
}

interface MemberCategoryGroup {
	label: string
	color: string
	order: number
	striped?: boolean
	members: OrganizationWikiNationMention[]
}

/** Splits members into category groups (Emperor, Prince-Elector, Trade
 * Post, ...) plus a trailing uncategorized bucket -- every org with a
 * registered category schema (organization-categories.ts) now assigns a
 * category to every member it returns (including striped ones like foreign
 * holders/trade posts), so `uncategorized` is only ever non-empty for an
 * org with no schema at all. `groups` is empty in that case, so callers
 * fall back to one flat list. */
function groupMembersByCategory(members: OrganizationWikiNationMention[]): {
	groups: MemberCategoryGroup[]
	uncategorized: OrganizationWikiNationMention[]
} {
	const byLabel = new Map<string, MemberCategoryGroup>()
	const uncategorized: OrganizationWikiNationMention[] = []
	for (const member of members) {
		if (!member.category) {
			uncategorized.push(member)
			continue
		}
		const group = byLabel.get(member.category.label) ?? {
			label: member.category.label,
			color: member.category.color,
			order: member.category.order,
			striped: member.category.striped,
			members: [],
		}
		group.members.push(member)
		byLabel.set(member.category.label, group)
	}
	return {
		groups: Array.from(byLabel.values()).sort((a, b) => a.order - b.order),
		uncategorized,
	}
}

function MemberList({
	members,
	onSelectNation,
}: {
	members: OrganizationWikiNationMention[]
	onSelectNation: (tag: string) => void
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-slate-700">
			{members.map((member) => (
				<NationLink
					key={member.tag}
					nation={member}
					onSelectNation={onSelectNation}
				/>
			))}
		</div>
	)
}

export function OrganizationWikiPage({
	organization,
}: {
	organization: OrganizationWikiData
}) {
	const { groups, uncategorized } = groupMembersByCategory(organization.members)
	return (
		<div className="space-y-2 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<div className="border-b border-slate-200 pb-3">
					<h1
						className="text-[30px] leading-snug text-slate-950"
						style={{ fontFamily: "var(--font-jedar)" }}
					>
						{organization.name}
					</h1>
					<div className="mt-0.5 flex items-center gap-2 text-[12px] text-slate-500">
						<Swatch color={organization.color} />
						<span>Organization</span>
						<span>·</span>
						<InlineTextButton
							onClick={organization.onBack}
							className="text-slate-500"
						>
							{organization.planetTitle}
						</InlineTextButton>
					</div>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{renderStatGrid(organization.stats)}
				</div>
			</Surface>

			<WikiSection title={`Members (${organization.members.length})`}>
				{organization.members.length === 0 ? (
					<div className="text-[10px] text-slate-400">
						No current members as of {organization.currentDateLabel}.
					</div>
				) : groups.length === 0 ? (
					<MemberList
						members={organization.members}
						onSelectNation={organization.onSelectNation}
					/>
				) : (
					<div className="divide-y divide-slate-200">
						{groups.map((group) => (
							<div key={group.label} className="py-1.5 first:pt-0 last:pb-0">
								<div className="mb-0.5 flex items-center gap-1">
									<Swatch
										color={group.color}
										striped={group.striped}
										stripeBackground="transparent"
									/>
									<span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-500">
										{group.label} ({group.members.length})
									</span>
								</div>
								<MemberList
									members={group.members}
									onSelectNation={organization.onSelectNation}
								/>
							</div>
						))}
						{uncategorized.length > 0 ? (
							<div className="py-1.5 first:pt-0 last:pb-0">
								<div className="mb-0.5 flex items-center gap-1">
									<span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-500">
										Holds Territory, Not a Member ({uncategorized.length})
									</span>
								</div>
								<MemberList
									members={uncategorized}
									onSelectNation={organization.onSelectNation}
								/>
							</div>
						) : null}
					</div>
				)}
			</WikiSection>

			<WikiSection
				title="Environmental"
				meta={organization.showObservedDistributions ? "Observed" : null}
			>
				<div className="space-y-1.5">
					<DistributionChart
						title="Climate"
						buckets={organization.climateDistribution}
						variant="compact"
						showTotal={false}
					/>
					<DistributionChart
						title="Vegetation"
						buckets={organization.vegetationDistribution}
						variant="compact"
						showTotal={false}
					/>
					<DistributionChart
						title="Topography"
						buckets={organization.topographyDistribution}
						variant="compact"
						showTotal={false}
					/>
				</div>
			</WikiSection>

			<WikiSection title="Demographics">
				<div className="space-y-1.5">
					<DistributionChart
						title="Culture"
						buckets={organization.cultureDistribution}
						variant="compact"
						showTotal={false}
					/>
					<DistributionChart
						title="Religion"
						buckets={organization.religionDistribution}
						variant="compact"
						showTotal={false}
					/>
				</div>
			</WikiSection>

			<WikiTimelineSection
				countHistory={organization.countHistory}
				countChartLabel="Member territory over time"
				countUnitLabel="provinces"
				dateRangeStart={organization.dateRangeStart}
				dateRangeEnd={organization.dateRangeEnd}
				currentDate={organization.currentDate}
				currentDateLabel={organization.currentDateLabel}
				timelineEvents={organization.timelineEvents}
				refs={{
					onSelectNation: organization.onSelectNation,
					onSelectProvince: organization.onSelectProvince,
					onSelectOrganization: () => undefined,
					onSelectWar: organization.onSelectWar,
					onSelectDate: organization.onSelectDate,
				}}
			/>
		</div>
	)
}
