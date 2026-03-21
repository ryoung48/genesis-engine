import React, { useMemo, useState } from "react"
import { NAMES } from "@/model/actors/language/names"
import type { HistoryNote } from "@/model/history/types"
import { NATION } from "@/model/nations"
import { RELATIONS } from "@/model/nations/relations"
import { Relation } from "@/model/nations/relations/types"
import { WAR } from "@/model/nations/wars"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { MATH } from "@/model/utilities/math"
import { TEXT } from "@/model/utilities/text"
import { TIME } from "@/model/utilities/time"
import { MAP_METRICS } from "../../shapes/metrics"
import { Column, SortableTable } from "../SortableTable"
import { Tabs } from "../Tabs"
import { DistributionChart } from "./DistributionChart"
import { getDisplayTags, getEventDescription, getEventDotColor } from "./EventDetails"
import { NationLink } from "./NationLink"
import { LEADER } from "@/model/provinces/leader"

interface NationTabProps {
	selectedNation: number | null
	renderTime: number
	currentTime: number
	onTimeSelect?: (time: number) => void
	onZoomToProvince?: (provinceIdx: number) => void
	onWarSelect?: (warIdx: number) => void
}

type NationTabID = "history" | "demographics" | "relations"

export const NationTab: React.FC<NationTabProps> = ({
	selectedNation,
	renderTime,
	onTimeSelect,
	onZoomToProvince,
	onWarSelect,
}) => {
	const province =
		selectedNation !== null ? window.world.provinces[selectedNation] : null
	const nationProvinces = useMemo(
		() => (province ? NATION.provinces(province, renderTime) : []),
		[province, renderTime],
	)

	const [tab, setTab] = useState<NationTabID>("history")
	const [selectedTag, setSelectedTag] = useState<string | null>(null)

	// get latest leader from the province acting as the capital
	const capital = window.world.provinces[selectedNation ?? -1]
	const leaderName = NAMES.leader(selectedNation ?? -1, renderTime)
	const dynastyIdx = capital ? LEADER.dynasty.get(capital, renderTime) : -1
	const dynastyName = dynastyIdx >= 0 ? NAMES.dynasty(dynastyIdx) : ""
	const leaderEntry = capital?._leader.find(
		(e) => e.time <= renderTime && e.end > renderTime,
	) ?? capital?._leader[capital._leader.length - 1]
	const leaderAge = leaderEntry?.birthTime !== undefined
		? Math.max(0, Math.round(TIME.date.diffYears(renderTime, leaderEntry.birthTime)))
		: null
	const formattedLeader = dynastyName ? `${leaderName} ${dynastyName}` : leaderName

	if (selectedNation === null || !province) {
		return (
			<div className="text-[10px] text-gray-400 text-center py-6">
				Click on a province to track its nation
			</div>
		)
	}

	const totalPopulation = nationProvinces.reduce(
		(sum, p) => sum + PROVINCE.population.total(p, renderTime),
		0,
	)

	const totalArea = nationProvinces.reduce(
		(sum, p) => sum + p.land * window.world.cell.area,
		0,
	)

	const getDistribution = (
		getter: (p: Province) => { label: string; color: string } | null,
	) => {
		const counts: Record<
			string,
			{ count: number; color: string; label: string }
		> = {}
		nationProvinces.forEach((p: Province) => {
			const res = getter(p)
			if (!res) return
			if (!counts[res.label]) {
				counts[res.label] = { count: 0, color: res.color, label: res.label }
			}
			counts[res.label].count++
		})
		return Object.values(counts).sort((a, b) => b.count - a.count)
	}

	const renderContent = () => {
		switch (tab) {
			case "history": {
				// All events for this nation, sorted by time
				let allEvents = (window.world?.past || [])
					.filter((e: HistoryNote) => e.agents.includes(selectedNation))
					.sort((a: HistoryNote, b: HistoryNote) => a.time - b.time) as HistoryNote[]

				// Group related tags for filters
				const TAG_GROUPS: Record<string, string> = {
					"war started": "wars",
					"war ended": "wars",
					"regency started": "regency",
					"regency ended": "regency",
				}
				const getGroup = (tag: string) => TAG_GROUPS[tag] || tag

				// Unique groups for filter chips
				const availableTags = Array.from(new Set(allEvents.map((e) => getGroup(e.tag))))

				// Apply filter if selected
				const allRawEvents = allEvents
				if (selectedTag) {
					allEvents = allEvents.filter(e => getGroup(e.tag) === selectedTag)
				}

				// Find the split point: events at, before, and after renderTime
				const before: HistoryNote[] = []
				const atCurrent: HistoryNote[] = []
				const after: HistoryNote[] = []

				const currentYear = TIME.date.toYear(renderTime)
				allEvents.forEach((e) => {
					const year = TIME.date.toYear(e.time)
					if (year < currentYear) before.push(e)
					else if (year === currentYear) atCurrent.push(e)
					else after.push(e)
				})

				const beforeSlice = before.slice(-3)
				const afterSlice = after.slice(0, 3)

				const renderEvent = (event: HistoryNote) => {
					const dotColor = getEventDotColor(event, selectedNation)
					const tags = getDisplayTags(event, selectedNation)
					const dateStr = TIME.date.format(event.time)

					return (
						<div
							className="border-l-2 pl-2 py-1.5"
							style={{ borderColor: dotColor }}
						>
							<div className="flex items-center gap-2 mb-0.5">
								<button
									className="text-[8px] font-mono px-1.5 py-0.5 bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700 cursor-pointer transition-colors"
									onClick={() => onTimeSelect?.(event.time)}
								>
									{dateStr}
								</button>
								{tags.secondary ? (
									<div className="flex truncate border rounded-sm overflow-hidden" style={{ borderColor: dotColor }}>
										<span className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-gray-100 text-gray-600">
											{tags.primary}
										</span>
										<span className="text-[8px] font-bold uppercase px-1.5 py-0.5 text-white" style={{ backgroundColor: dotColor }}>
											{tags.secondary}
										</span>
									</div>
								) : (
									<span
										className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm text-white"
										style={{ backgroundColor: dotColor }}
									>
										{tags.primary}
									</span>
								)}
								{tags.title && (
									<span className="text-[9px] font-bold text-gray-800 ml-1">
										— {tags.title}
									</span>
								)}
							</div>
							<div
								className="text-[9px] text-gray-600 leading-tight break-words"
								style={{ overflowWrap: "anywhere" }}
							>
								{getEventDescription(
									event,
									selectedNation,
									onZoomToProvince,
									onWarSelect,
								)}
							</div>
						</div>
					)
				}

				return (
					<div className="space-y-0 relative">
						{availableTags.length > 0 && (
							<div className="flex flex-wrap gap-1 mb-3 pt-1">
								<button
									className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${selectedTag === null
										? "bg-indigo-100 border-indigo-200 text-indigo-800 font-bold"
										: "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
										}`}
									onClick={() => setSelectedTag(null)}
								>
									All Events ({allRawEvents.length})
								</button>
								{availableTags.map((t) => (
									<button
										key={t}
										className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors uppercase ${selectedTag === t
											? "bg-indigo-100 border-indigo-200 text-indigo-800 font-bold"
											: "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
											}`}
										onClick={() => setSelectedTag(t)}
									>
										{t} ({allRawEvents.filter((e) => getGroup(e.tag) === t).length})
									</button>
								))}
							</div>
						)}

						{/* Past events */}
						{beforeSlice.map((e, i) => (
							<React.Fragment key={`before-${i}`}>
								{renderEvent(e)}
							</React.Fragment>
						))}

						{/* Current date marker */}
						<div className="flex items-center gap-2 py-2">
							<div className="flex-grow h-px bg-indigo-400" />
							<span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider whitespace-nowrap">
								Current: Y{currentYear}
							</span>
							<div className="flex-grow h-px bg-indigo-400" />
						</div>

						{/* Events at current time */}
						{atCurrent.map((e, i) => (
							<React.Fragment key={`current-${i}`}>
								{renderEvent(e)}
							</React.Fragment>
						))}

						{atCurrent.length === 0 && (
							<div className="text-[9px] text-gray-400 italic py-1 pl-3">
								No events this year
							</div>
						)}

						{/* Divider before future */}
						{afterSlice.length > 0 && (
							<div className="flex items-center gap-2 py-2">
								<div className="flex-grow h-px bg-gray-300" />
							</div>
						)}

						{/* Future events */}
						{afterSlice.map((e, i) => (
							<React.Fragment key={`after-${i}`}>
								{renderEvent(e)}
							</React.Fragment>
						))}

						{allEvents.length === 0 && (
							<div className="text-[10px] text-gray-400 text-center py-4">
								No events recorded
							</div>
						)}
					</div>
				)
			}
			case "demographics":
				return (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<DistributionChart
								title="Culture"
								data={getDistribution((p) => {
									const c = window.world.cultures[p.culture]
									return c
										? { label: c.name || `Culture ${c.idx}`, color: c.color }
										: null
								})}
							/>
							<DistributionChart
								title="Faith"
								data={getDistribution((p) => {
									const f = window.world.faiths[p.faith]
									return f ? { label: f.name || `Faith ${f.idx}`, color: f.color } : null
								})}
							/>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<DistributionChart
								title="Heritage"
								data={getDistribution((p) => {
									const h = window.world.heritages[p.heritage]
									return h
										? { label: h.name || `Heritage ${h.idx}`, color: h.color }
										: null
								})}
							/>
							<DistributionChart
								title="Religion"
								data={getDistribution((p) => {
									const r = window.world.religions[p.religion]
									return r
										? { label: r.name || `Religion ${r.idx}`, color: r.color }
										: null
								})}
							/>
						</div>
						<DistributionChart
							title="Settlements"
							data={getDistribution((p) => {
								const population = PROVINCE.population.urban.get(p, renderTime)
								if (population > 200e3)
									return { label: "Metropolis", color: "#4c1d95" }
								if (population > 50e3)
									return { label: "Huge City", color: "#7c2d12" }
								if (population > 20e3)
									return { label: "Large City", color: "#9a3412" }
								if (population > 8e3)
									return { label: "Small City", color: "#c2410c" }
								if (population > 5e3)
									return { label: "Large Town", color: "#1e40af" }
								if (population > 1e3)
									return { label: "Small Town", color: "#3b82f6" }
								return { label: "Village", color: "#9ca3af" }
							})}
						/>
					</div>
				)
			case "relations":
				return (
					<div className="min-h-[100px]">
						{(() => {
							const nation = PROVINCE.nation(province, renderTime)
							const neighbors = NATION.neighbors({ nation, time: renderTime })
							const activeWars = WAR.nation.get(nation, renderTime)

							const RELATION_BADGE: Record<
								Relation,
								{ bg: string; text: string; border: string; order: number }
							> = {
								war: {
									bg: "bg-red-200",
									text: "text-red-900",
									border: "border-red-400",
									order: -1,
								},
								rival: {
									bg: "bg-red-100",
									text: "text-red-700",
									border: "border-red-300",
									order: 0,
								},
								suspicious: {
									bg: "bg-amber-100",
									text: "text-amber-700",
									border: "border-amber-300",
									order: 1,
								},
								neutral: {
									bg: "bg-gray-100",
									text: "text-gray-600",
									border: "border-gray-300",
									order: 2,
								},
								friendly: {
									bg: "bg-green-100",
									text: "text-green-700",
									border: "border-green-300",
									order: 3,
								},
								ally: {
									bg: "bg-blue-100",
									text: "text-blue-700",
									border: "border-blue-300",
									order: 4,
								},
								vassal: {
									bg: "bg-purple-100",
									text: "text-purple-700",
									border: "border-purple-300",
									order: 5,
								},
								overlord: {
									bg: "bg-violet-100",
									text: "text-violet-700",
									border: "border-violet-300",
									order: 6,
								},
								personal_union_junior: {
									bg: "bg-indigo-100",
									text: "text-indigo-700",
									border: "border-indigo-300",
									order: 7,
								},
								personal_union_senior: {
									bg: "bg-indigo-200",
									text: "text-indigo-800",
									border: "border-indigo-400",
									order: 8,
								},
							}

							const relations = neighbors.map((n) => {
								const war = activeWars.find(
									(w) => w.attacker === n.idx || w.defender === n.idx,
								)
								const threat = WAR.threat({
									attacker: nation,
									defender: n,
									time: renderTime,
								})
								const relation = RELATIONS.get({
									nation: n,
									other: nation,
									time: renderTime,
								})
								return { n, war, threat, relation }
							})

							const rel = RELATIONS.all(nation, renderTime).map(rels => ({
								...rels,
								threat: WAR.threat({
									attacker: nation,
									defender: rels.nation,
									time: renderTime,
								})
							}))

							const columns: Column<(typeof rel)[number]>[] = [
								{
									header: "Nation",
									accessor: ({ nation: n }) => (
										<div className="flex items-center gap-2">
											<NationLink
												id={n.idx}
												color={n.color}
												onZoomToProvince={onZoomToProvince}
											/>
										</div>
									),
									sortValue: ({ nation: n }) => n.idx,
								},
								{
									header: "Relation",
									accessor: ({ relation }) => {
										const badge = RELATION_BADGE[relation]
										return (
											<span
												className={`px-1 py-0.5 rounded-none text-[8px] font-bold uppercase border ${badge.bg} ${badge.text} ${badge.border}`}
											>
												{relation === "war"
													? "at war"
													: relation === "personal_union_junior"
														? "PU junior"
														: relation === "personal_union_senior"
															? "PU senior"
															: relation}
											</span>
										)
									},
									sortValue: ({ relation }) => RELATION_BADGE[relation].order,
								},
								{
									header: "Threat",
									accessor: ({ threat }) => (
										<span className="text-gray-400 font-mono">
											{Math.round(threat * 100)}%
										</span>
									),
									sortValue: ({ threat }) => threat,
								},
							]

							return relations.length > 0 ? (
								<SortableTable
									data={rel}
									columns={columns}
									pageSize={10}
									initialSort={{ key: 2, direction: "desc" }}
								/>
							) : (
								<div className="text-[10px] text-gray-400 italic py-4 text-center">
									No direct neighbors found
								</div>
							)
						})()}
					</div>
				)
		}
	}

	return (
		<div className="h-full flex flex-col overflow-hidden min-h-0">
			{/* Top-level Stats Row */}
			{(() => {
				const urbanPop = nationProvinces.reduce(
					(sum, p) => sum + PROVINCE.population.urban.get(p, renderTime),
					0,
				)

				return (
					<>
						<div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 px-1">
							<div className="flex gap-1.5 items-baseline">
								<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
									Leader
								</div>
								<div className="text-sm font-bold text-gray-900 leading-none flex items-center gap-2">
									{dynastyIdx >= 0 && (
										<div
											className="w-2 h-2 border border-black/10"
											style={{ backgroundColor: window.world.dynasties[dynastyIdx]?.color || "#bcbcbc" }}
										/>
									)}
									{formattedLeader}
									{leaderAge !== null && (
										<span className="text-[10px] text-gray-500 font-normal">
											age {leaderAge}
											{leaderAge < 16 && (
												<span className="text-purple-500 font-semibold ml-1">(regency)</span>
											)}
										</span>
									)}
								</div>
							</div>
							<div className="flex gap-1.5 items-baseline">
								<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
									Citizens
								</div>
								<div className="text-sm font-bold text-gray-900 leading-none">
									{new Intl.NumberFormat("en-US", {
										notation: "compact",
										maximumFractionDigits: 1,
									}).format(totalPopulation)}
									<span className="text-[10px] text-gray-500 font-normal ml-0.5">
										ppl
									</span>
								</div>
							</div>
							<div className="flex gap-1.5 items-baseline">
								<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
									Urbanization
								</div>
								<div className="text-sm font-bold text-gray-900 leading-none">
									{new Intl.NumberFormat("en-US", {
										style: "percent",
										maximumFractionDigits: 1,
									}).format(
										totalPopulation > 0 ? urbanPop / totalPopulation : 0,
									)}
								</div>
							</div>
							<div className="flex gap-1.5 items-baseline">
								<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
									Area
								</div>
								<div className="text-sm font-bold text-gray-900 leading-none">
									{new Intl.NumberFormat("en-US", {
										notation: "compact",
										maximumFractionDigits: 1,
									}).format(totalArea)}
									<span className="text-[10px] text-gray-500 font-normal ml-0.5">
										km²
									</span>
								</div>
							</div>
							<div className="flex gap-1.5 items-baseline">
								<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
									Provinces
								</div>
								<div className="text-sm font-bold text-gray-900 leading-none">
									{nationProvinces.length}
								</div>
							</div>
						</div>

						{/* Geography Charts (Always visible) */}
						<div className="grid grid-cols-3 gap-4 mb-4">
							<DistributionChart
								title="Climate"
								data={getDistribution((p) => {
									const c = PROVINCE.cell(p)
									return c.climate
										? {
											label: TEXT.titleCase(c.climate),
											color: MAP_METRICS.climate.colors[c.climate] || "#ccc",
										}
										: null
								})}
							/>
							<DistributionChart
								title="Vegetation"
								data={getDistribution((p) => {
									const c = PROVINCE.cell(p)
									return c.vegetation
										? {
											label: TEXT.titleCase(c.vegetation),
											color:
												MAP_METRICS.vegetation.color[
												c.vegetation as keyof typeof MAP_METRICS.vegetation.color
												] || "#ccc",
										}
										: null
								})}
							/>
							<DistributionChart
								title="Topography"
								data={getDistribution((p) => {
									const c = PROVINCE.cell(p)
									return c.topography
										? {
											label: TEXT.titleCase(c.topography),
											color:
												MAP_METRICS.terrain.categorical[
												c.topography as keyof typeof MAP_METRICS.terrain.categorical
												] || "#ccc",
										}
										: null
								})}
							/>
						</div>
					</>
				)
			})()}

			<Tabs
				tabs={[
					{ id: "history", label: "History" },
					{ id: "demographics", label: "Demographics" },
					{ id: "relations", label: "Relations" },
				]}
				activeTab={tab}
				onTabSelect={(id) => setTab(id as NationTabID)}
			/>

			{/* Dynamic Content Area */}
			<div className="flex-grow overflow-y-auto no-scrollbar pr-1">
				{renderContent()}
			</div>
		</div>
	)
}
