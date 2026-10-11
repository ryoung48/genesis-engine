import React from "react"
import type { DistributionChartBucket } from "@/ui/components/composites/DistributionChart"
import { DistributionChart } from "@/ui/components/composites/DistributionChart"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { uiPalette } from "@/ui/components/tokens"
import { GpsFocusButton, renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import {
	type WikiCountHistoryPoint,
	WikiSection,
	type WikiTimelineEvent,
	WikiTimelineSection,
} from "@/ui/wiki/shared/WikiTimeline"

export interface NationWikiData {
	title: string
	territoryBasis: "owned" | "controlled"
	tierLabel: string
	/** Same deterministic per-tag color the map fill/hover swatches use. */
	color: string
	planetTitle: string
	stats: StatEntry[]
	/** Political ties (overlord/vassals/union/allies) -- one row per
	 * relation type, each a comma-separated list of clickable nation
	 * links. Omitted entirely (empty array) when a nation has none. */
	dependencies: Array<{
		label: string
		nations: Array<{ tag: string; name: string; color: string }>
	}>
	/** International organizations (e.g. HRE, Hanseatic League) this nation
	 * currently belongs to -- clicking one navigates to that organization's
	 * wiki page via onSelectOrganization. Empty when the nation belongs to
	 * none. `striped` marks a nation that merely holds enclave territory of
	 * the org without being genuinely part of it (e.g. Venice's Terraferma,
	 * still formally inside the HRE after Venice -- never an Imperial
	 * Estate -- conquered it) -- see collectOrgForeignHolderNations. */
	organizations: Array<{
		id: string
		name: string
		color: string
		striped?: boolean
	}>
	cultureDistribution: DistributionChartBucket[]
	religionDistribution: DistributionChartBucket[]
	climateDistribution: DistributionChartBucket[]
	topographyDistribution: DistributionChartBucket[]
	vegetationDistribution: DistributionChartBucket[]
	showObservedDistributions: boolean
	/** Owned-province count at each ownership change, sorted by date; the
	 * first entry carries the count at dateRangeStart. Empty when the
	 * history source has no ownership data for this nation. */
	provinceHistory: WikiCountHistoryPoint[]
	/** Full simulation date range the timeline/chart spans. */
	dateRangeStart: number
	dateRangeEnd: number
	currentDate: number
	currentDateLabel: string
	timelineEvents: WikiTimelineEvent[]
	regions: Array<{
		province: number
		provinceName: string
		tier: string
		color: string
	}>
	onBack: () => void
	/** Zooms the 3D view to this nation without changing wiki selection. */
	onFocusNation: () => void
	/** Switches the page to another nation and zooms the 3D view to it. */
	onSelectNation: (tag: string) => void
	/** Zooms the 3D view to a province without changing wiki selection. */
	onSelectProvince: (provinceId: number) => void
	/** Sets the Earth-history simulation control to the selected event date. */
	onSelectDate: (date: number) => void
	/** Switches the page to an organization's wiki page. */
	onSelectOrganization: (orgId: string) => void
	/** Switches the page to a war's wiki page. */
	onSelectWar: (warId: number) => void
}

export function NationWikiPage({ nation }: { nation: NationWikiData }) {
	return (
		<div className="space-y-2 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<WikiPageHeader
					title={nation.title}
					meta={
						<>
							<Swatch
								color={
									nation.territoryBasis === "controlled"
										? uiPalette.rebel
										: nation.color
								}
								striped={nation.territoryBasis === "controlled"}
								stripeBackground="transparent"
							/>
							<span>{nation.tierLabel}</span>
							<span>·</span>
							<InlineTextButton
								onClick={nation.onBack}
								className="text-slate-500"
							>
								{nation.planetTitle}
							</InlineTextButton>
						</>
					}
					metaAction={<GpsFocusButton onClick={nation.onFocusNation} />}
				/>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{renderStatGrid(nation.stats)}
					{nation.dependencies.map((group) => (
						<React.Fragment key={group.label}>
							<span className="text-[9px] text-slate-400">{group.label}</span>
							<div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-[9px] text-slate-700">
								{group.nations.map((entry, index) => (
									<React.Fragment key={entry.tag}>
										<EntityChip
											name={entry.name}
											color={entry.color}
											onClick={() => nation.onSelectNation(entry.tag)}
										/>
										{index < group.nations.length - 1 ? (
											<span className="text-slate-400">,&nbsp;</span>
										) : null}
									</React.Fragment>
								))}
							</div>
						</React.Fragment>
					))}
					{nation.organizations.length > 0 ? (
						<React.Fragment>
							<span className="text-[9px] text-slate-400">Organizations</span>
							<div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-[9px] text-slate-700">
								{nation.organizations.map((org, index) => (
									<React.Fragment key={org.id}>
										<EntityChip
											name={org.name}
											color={org.striped ? nation.color : org.color}
											striped={org.striped}
											title={
												org.striped
													? `Holds ${org.name} territory, but isn't a member`
													: undefined
											}
											onClick={() => nation.onSelectOrganization(org.id)}
										/>
										{index < nation.organizations.length - 1 ? (
											<span className="text-slate-400">,&nbsp;</span>
										) : null}
									</React.Fragment>
								))}
							</div>
						</React.Fragment>
					) : null}
				</div>
			</Surface>

			<WikiSection
				title="Environmental"
				meta={nation.showObservedDistributions ? "Observed" : null}
			>
				<div className="space-y-1">
					<DistributionChart
						title="Climate"
						buckets={nation.climateDistribution}
						variant="compact"
						showTotal={false}
					/>
					<DistributionChart
						title="Vegetation"
						buckets={nation.vegetationDistribution}
						variant="compact"
						showTotal={false}
					/>
					<DistributionChart
						title="Topography"
						buckets={nation.topographyDistribution}
						variant="compact"
						showTotal={false}
					/>
				</div>
			</WikiSection>

			<WikiSection title="Demographics">
				<div className="space-y-1">
					<DistributionChart
						title="Culture"
						buckets={nation.cultureDistribution}
						variant="compact"
						showTotal={false}
					/>
					<DistributionChart
						title="Religion"
						buckets={nation.religionDistribution}
						variant="compact"
						showTotal={false}
					/>
				</div>
			</WikiSection>

			<WikiTimelineSection
				countHistory={nation.provinceHistory}
				countChartLabel={
					nation.territoryBasis === "controlled"
						? "Owned provinces over time"
						: "Provinces over time"
				}
				countUnitLabel="provinces"
				dateRangeStart={nation.dateRangeStart}
				dateRangeEnd={nation.dateRangeEnd}
				currentDate={nation.currentDate}
				currentDateLabel={nation.currentDateLabel}
				timelineEvents={nation.timelineEvents}
				refs={{
					onSelectNation: nation.onSelectNation,
					onSelectProvince: nation.onSelectProvince,
					onSelectOrganization: nation.onSelectOrganization,
					onSelectWar: nation.onSelectWar,
					onSelectDate: nation.onSelectDate,
				}}
			/>

			{nation.regions.length > 0 ? (
				<WikiSection title="Administrative Regions">
					<div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-[9px] text-slate-700">
						{nation.regions.map((region, index) => (
							<React.Fragment key={region.province}>
								<EntityChip
									name={region.provinceName}
									color={region.color}
									onClick={() => nation.onSelectProvince(region.province)}
									trailing={
										<span className="text-slate-400">({region.tier})</span>
									}
								/>
								{index < nation.regions.length - 1 ? (
									<span className="text-slate-400">,&nbsp;</span>
								) : null}
							</React.Fragment>
						))}
					</div>
				</WikiSection>
			) : null}
		</div>
	)
}
