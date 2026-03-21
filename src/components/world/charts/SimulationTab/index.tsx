import {
	CategoryScale,
	Chart as ChartJS,
	Filler,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
} from "chart.js"
import React from "react"
import { TEMPERATURE } from "@/model/cells/temperature"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { TEXT } from "@/model/utilities/text"
import { START_DATE, TIME } from "@/model/utilities/time"
import { MAP_METRICS } from "../../shapes/metrics"
import {
	EventCounts,
	RebellionOutcomeCounts,
	RelationCounts,
	WarOutcomeCounts,
} from "../index"
import { DistributionChart } from "../NationTab/DistributionChart"
import { ActiveTrendsChart, SIZE_BUCKETS } from "./ActiveTrendsChart"
import { WORLD } from "@/model"

export { SIZE_BUCKETS }

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Filler,
	Legend,
)

const WINDOW_YEARS = 50

interface SimulationTabProps {
	distributionHistory: {
		time: number
		dist: number[]
		devDist: number[]
		nationDevDist: number[]
		nationAvgDev: number
		avgDev: number
		activeWars: number
		activeCivilWars: number
		eventCounts: EventCounts
		warOutcomes: WarOutcomeCounts
		rebellionOutcomes: RebellionOutcomeCounts
		relationCounts: RelationCounts
	}[]
	nationDistribution: number[]
	renderTime: number
	currentTime: number // "modern day" - the latest simulation time
	onTimeSelect?: (time: number) => void
}

export const SimulationTab: React.FC<SimulationTabProps> = ({
	distributionHistory,
	renderTime,
	currentTime,
	onTimeSelect,
}) => {
	const halfWindow = TIME.delta.year(WINDOW_YEARS / 2)
	const startBoundary = START_DATE

	let windowStart = renderTime - halfWindow
	let windowEnd = renderTime + halfWindow

	if (windowStart < startBoundary) {
		windowStart = startBoundary
		windowEnd = startBoundary + TIME.delta.year(WINDOW_YEARS)
	}

	if (windowEnd > currentTime) {
		windowEnd = currentTime
		windowStart = Math.max(
			startBoundary,
			currentTime - TIME.delta.year(WINDOW_YEARS),
		)
	}

	const windowedHistory = distributionHistory.filter(
		(entry) => entry.time >= windowStart && entry.time <= windowEnd,
	)

	const labels = windowedHistory.map(
		(entry) => `Y${TIME.date.toYear(entry.time)}`,
	)

	const rangeStartLabel = `Y${TIME.date.toYear(windowStart)}`
	const rangeEndLabel = `Y${TIME.date.toYear(windowEnd)}`

	const getDistribution = (
		getter: (p: Province) => { label: string; color: string } | null,
	) => {
		const counts: Record<
			string,
			{ count: number; color: string; label: string }
		> = {}
		window.world.provinces.forEach((p: Province) => {
			const res = getter(p)
			if (!res) return
			if (!counts[res.label]) {
				counts[res.label] = { count: 0, color: res.color, label: res.label }
			}
			counts[res.label].count++
		})
		return Object.values(counts).sort((a, b) => b.count - a.count)
	}

	return (
		<>
			{(() => {
				const habitableProvinces = window.world.provinces.filter((p) => !p.desolate)
				const worldTotalPopulation = window.world.provinces.reduce(
					(sum, p) => sum + (PROVINCE.population.total(p, renderTime) || 0),
					0,
				)
				const habitabilityScore = WORLD.habitability()
				const worldTotalUrban = window.world.provinces.reduce(
					(sum, p) => sum + (PROVINCE.population.urban.get(p, renderTime) || 0),
					0,
				)
				const landAreaSqKm = window.world.provinces.reduce(
						(sum, p) => sum + p.land * window.world.cell.area,
						0,
					)
				const avgProvinceAreaSqKm =
					habitableProvinces.length > 0
						? habitableProvinces.reduce(
								(sum, p) => sum + p.land * window.world.cell.area,
								0,
							) / habitableProvinces.length
						: 0
				const worldSurfaceAreaSqKm = 4 * Math.PI * window.world.radius ** 2
				const landPercent =
					worldSurfaceAreaSqKm > 0 ? landAreaSqKm / worldSurfaceAreaSqKm : 0
				const sunStrengthSol = window.world.tSun / 5778

				return (
					<div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 px-1">
						<div className="flex gap-1.5 items-baseline">
							<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
								Population
							</div>
							<div className="text-sm font-bold text-gray-900 leading-none">
								{new Intl.NumberFormat("en-US", {
									notation: "compact",
									maximumFractionDigits: 2,
								}).format(worldTotalPopulation)}
								<span className="text-[10px] text-gray-500 font-normal ml-0.5">
									people
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
									worldTotalPopulation > 0
										? worldTotalUrban / worldTotalPopulation
										: 0,
								)}
							</div>
						</div>
						<div className="flex gap-1.5 items-baseline">
							<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
								Habitability
							</div>
							<div className="text-sm font-bold text-gray-900 leading-none">
								{new Intl.NumberFormat("en-US", {
									notation: "compact",
									maximumFractionDigits: 2,
								}).format(habitabilityScore)}
							</div>
						</div>
						<div className="flex gap-1.5 items-baseline">
							<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
								Land Area
							</div>
							<div className="text-sm font-bold text-gray-900 leading-none">
								{new Intl.NumberFormat("en-US", {
									notation: "compact",
									maximumFractionDigits: 2,
								}).format(landAreaSqKm)}
								<span className="text-[10px] text-gray-500 font-normal ml-0.5">
									km²
								</span>
								<span className="text-[10px] text-gray-500 font-normal ml-1">
									({new Intl.NumberFormat("en-US", {
										style: "percent",
										maximumFractionDigits: 1,
									}).format(landPercent)})
								</span>
							</div>
						</div>
						<div className="flex gap-1.5 items-baseline">
							<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
								Avg Province Area
							</div>
							<div className="text-sm font-bold text-gray-900 leading-none">
								{new Intl.NumberFormat("en-US", {
									notation: "compact",
									maximumFractionDigits: 2,
								}).format(avgProvinceAreaSqKm)}
								<span className="text-[10px] text-gray-500 font-normal ml-0.5">
									km²
								</span>
							</div>
						</div>
						<div className="flex gap-1.5 items-baseline">
							<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
								Tilt
							</div>
							<div className="text-sm font-bold text-gray-900 leading-none">
								{window.world.obliquity.toFixed(1)}°
							</div>
						</div>
						<div className="flex gap-1.5 items-baseline">
							<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
								Eccentricity
							</div>
							<div className="text-sm font-bold text-gray-900 leading-none">
								{window.world.eccentricity.toFixed(3)}
							</div>
						</div>
						<div className="flex gap-1.5 items-baseline">
							<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
								Sun Strength
							</div>
							<div className="text-sm font-bold text-gray-900 leading-none">
								{sunStrengthSol.toFixed(3)}
								<span className="text-[10px] text-gray-500 font-normal ml-0.5">
									Sol
								</span>
							</div>
						</div>
					</div>
				)
			})()}

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

			{(() => {
				const avgTemp = TEMPERATURE.global.mean()
				const maxTemp = TEMPERATURE.global.max()
				const minTemp = TEMPERATURE.global.min()
				return (
					<div className="flex gap-4 mb-4 pl-1 text-[10px] font-mono">
						<span className="flex items-center gap-1">
							<span className="text-gray-400 uppercase">Avg Temp</span>
							<span
								className="w-2.5 h-2.5 border border-gray-400"
								style={{ backgroundColor: TEMPERATURE.color(avgTemp) }}
							/>
							<span className="text-gray-700">{avgTemp.toFixed(1)}° C</span>
						</span>
						<span className="flex items-center gap-1">
							<span className="text-gray-400 uppercase">Max</span>
							<span
								className="w-2.5 h-2.5 border border-gray-400"
								style={{ backgroundColor: TEMPERATURE.color(maxTemp) }}
							/>
							<span className="text-gray-700">{maxTemp.toFixed(1)}° C</span>
						</span>
						<span className="flex items-center gap-1">
							<span className="text-gray-400 uppercase">Min</span>
							<span
								className="w-2.5 h-2.5 border border-gray-400"
								style={{ backgroundColor: TEMPERATURE.color(minTemp) }}
							/>
							<span className="text-gray-700">{minTemp.toFixed(1)}° C</span>
						</span>
					</div>
				)
			})()}

			<ActiveTrendsChart
				windowedHistory={windowedHistory}
				labels={labels}
				rangeStartLabel={rangeStartLabel}
				rangeEndLabel={rangeEndLabel}
				renderTime={renderTime}
				onTimeSelect={onTimeSelect}
			/>
		</>
	)
}
