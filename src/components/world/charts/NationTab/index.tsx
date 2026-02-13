import React, { useMemo, useState } from "react"
import { WAR } from "@/model/history/wars"
import { NATION } from "@/model/nations"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { MATH } from "@/model/utilities/math"
import { TEXT } from "@/model/utilities/text"
import { MAP_METRICS } from "../../shapes/metrics"
import { Tabs } from "../Tabs"
import { DistributionChart } from "./DistributionChart"
import { NationHistory } from "./NationHistory"
import { NationLink } from "./NationLink"

interface NationTabProps {
	selectedNation: number | null
	renderTime: number
	currentTime: number
	onTimeSelect?: (time: number) => void
	onZoomToProvince?: (provinceIdx: number) => void
	onWarSelect?: (warIdx: number) => void
}

type NationTabID = "events" | "demographics" | "relations"

export const NationTab: React.FC<NationTabProps> = ({
	selectedNation,
	renderTime,
	currentTime,
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

	const [tab, setTab] = useState<NationTabID>("events")
	const [selectedYearIdx, setSelectedYearIdx] = useState<number | null>(null)

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
			case "events":
				return (
					<NationHistory
						selectedNation={selectedNation}
						renderTime={renderTime}
						currentTime={currentTime}
						onTimeSelect={onTimeSelect}
						onZoomToProvince={onZoomToProvince}
						selectedYearIdx={selectedYearIdx}
						setSelectedYearIdx={setSelectedYearIdx}
						onWarSelect={onWarSelect}
						compact={false}
						hideChart={true}
					/>
				)
			case "demographics":
				return (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<DistributionChart
								title="Culture"
								data={getDistribution((p) => {
									const c = window.world.cultures[p.culture]
									return c
										? { label: `Culture ${c.idx}`, color: c.color }
										: null
								})}
							/>
							<DistributionChart
								title="Faith"
								data={getDistribution((p) => {
									const f = window.world.faiths[p.faith]
									return f ? { label: `Faith ${f.idx}`, color: f.color } : null
								})}
							/>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<DistributionChart
								title="Heritage"
								data={getDistribution((p) => {
									const h = window.world.heritages[p.heritage]
									return h
										? { label: `Heritage ${h.idx}`, color: h.color }
										: null
								})}
							/>
							<DistributionChart
								title="Religion"
								data={getDistribution((p) => {
									const r = window.world.religions[p.religion]
									return r
										? { label: `Religion ${r.idx}`, color: r.color }
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
							const activeWars = PROVINCE.wars.active(nation, renderTime)

							const relations = neighbors
								.map((n) => {
									const war = activeWars.find(
										(w) => w.attacker === n.idx || w.defender === n.idx,
									)
									const threat = WAR.stats.threat({
										attacker: nation,
										defender: n,
										time: renderTime,
									})
									return { n, war, threat }
								})
								.sort((a, b) => b.threat - a.threat)

							return relations.length > 0 ? (
								<div className="grid grid-cols-2 gap-2">
									{relations.map(({ n, war, threat }) => (
										<div
											key={n.idx}
											className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-none border text-[10px] ${
												war
													? "bg-red-50 border-red-200"
													: "bg-gray-50 border-gray-200"
											}`}
										>
											<div className="flex items-center gap-2 overflow-hidden">
												<NationLink
													id={n.idx}
													color={n.color}
													onZoomToProvince={onZoomToProvince}
												/>
											</div>
											<div className="flex items-center gap-1.5 shrink-0">
												<span className="text-gray-400 font-mono">
													{Math.round(threat * 100)}%
												</span>
												{war && (
													<span title={war.rebel ? "Civil War" : "At War"}>
														{war.rebel ? "🏴" : "⚔️"}
													</span>
												)}
											</div>
										</div>
									))}
								</div>
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
		<div className="h-full overflow-hidden">
			{/* Top-level Stats Row */}
			{(() => {
				const urbanPop = nationProvinces.reduce(
					(sum, p) => sum + PROVINCE.population.urban.get(p, renderTime),
					0,
				)

				return (
					<>
						<div className="grid grid-cols-4 gap-4 mb-4 px-1">
							<div>
								<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
									Citizens
								</div>
								<div className="text-xl font-bold text-gray-900 leading-none">
									{new Intl.NumberFormat("en-US", {
										notation: "compact",
										maximumFractionDigits: 1,
									}).format(totalPopulation)}
									<span className="text-xs text-gray-500 font-normal ml-1">
										ppl
									</span>
								</div>
							</div>
							<div>
								<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
									Urbanization
								</div>
								<div className="text-xl font-bold text-gray-900 leading-none">
									{new Intl.NumberFormat("en-US", {
										style: "percent",
										maximumFractionDigits: 1,
									}).format(
										totalPopulation > 0 ? urbanPop / totalPopulation : 0,
									)}
								</div>
							</div>
							<div>
								<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
									Area
								</div>
								<div className="text-xl font-bold text-gray-900 leading-none">
									{new Intl.NumberFormat("en-US", {
										notation: "compact",
										maximumFractionDigits: 1,
									}).format(MATH.conversion.area.sqMi.sqKm(totalArea))}
									<span className="text-xs text-gray-500 font-normal ml-1">
										km²
									</span>
								</div>
							</div>
							<div>
								<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
									Provinces
								</div>
								<div className="text-xl font-bold text-gray-900 leading-none">
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

			{/* Wealth & Events Chart (Always visible) */}
			<div className="mb-4">
				<NationHistory
					selectedNation={selectedNation}
					renderTime={renderTime}
					currentTime={currentTime}
					onTimeSelect={onTimeSelect}
					onZoomToProvince={onZoomToProvince}
					selectedYearIdx={selectedYearIdx}
					setSelectedYearIdx={setSelectedYearIdx}
					onWarSelect={onWarSelect}
					compact={true}
				/>
			</div>

			<Tabs
				tabs={[
					{ id: "events", label: "Events" },
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
