import {
	BarElement,
	CategoryScale,
	ChartData,
	Chart as ChartJS,
	ChartOptions,
	LinearScale,
	Tooltip,
} from "chart.js"
import React, { useMemo, useRef, useState } from "react"
import { Bar } from "react-chartjs-2"
import { DAYLIGHT } from "@/model/cells/daylight"
import { RAIN } from "@/model/cells/rain"
import { TEMPERATURE } from "@/model/cells/temperature"
import { WEATHER } from "@/model/cells/weather"
import { PROVINCE } from "@/model/provinces"
import { TEXT } from "@/model/utilities/text"
import { MAP_METRICS } from "../shapes/metrics"
import { NAMES } from "@/model/actors/language/names"
import { Tabs } from "./Tabs"

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

interface ProvinceTabProps {
	selectedProvince: number | null
	renderTime: number
	onHeritageSelect?: (heritageIdx: number) => void
	onCultureSelect?: (cultureIdx: number) => void
}

const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
]

type ChartTabID = "temperature" | "rain" | "daylight"

const fmt = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
})

const fmtPct = new Intl.NumberFormat("en-US", {
	style: "percent",
	maximumFractionDigits: 1,
})

export const ProvinceTab: React.FC<ProvinceTabProps> = ({
	selectedProvince,
	renderTime,
	onHeritageSelect,
	onCultureSelect,
}) => {
	const [chartTab, setChartTab] = useState<ChartTabID>("temperature")
	const chartRef = useRef<ChartJS<"bar">>(null)

	const province =
		selectedProvince !== null ? window.world.provinces[selectedProvince] : null

	const { monthlyTemps, monthlyRain, monthlyDaylight } = useMemo(() => {
		if (!province)
			return { monthlyTemps: [], monthlyRain: [], monthlyDaylight: [] }
		const cell = PROVINCE.cell(province)
		return {
			monthlyTemps: MONTH_LABELS.map((_, month) =>
				TEMPERATURE.monthly.mean({ cell, month }),
			),
			monthlyRain: MONTH_LABELS.map((_, month) =>
				WEATHER.rain.month({ cell, month }),
			),
			monthlyDaylight: MONTH_LABELS.map((_, month) =>
				DAYLIGHT.monthly.mean({ cell, month }),
			),
		}
	}, [province])

	if (selectedProvince === null || !province) {
		return (
			<div className="text-[10px] text-gray-400 text-center py-6">
				Click on a province to view its stats
			</div>
		)
	}

	const cell = PROVINCE.cell(province)
	const totalPop = PROVINCE.population.total(province, renderTime)
	const urbanPop = PROVINCE.population.urban.get(province, renderTime)
	const dev = PROVINCE.development.get(province, renderTime)

	const leaderName = NAMES.leader(province.idx, renderTime)
	const dynastyIdx = province._leader[province._leader.length - 1]?.dynasty
	const dynastyName = dynastyIdx != null ? NAMES.dynasty(dynastyIdx) : ""
	const formattedLeader = dynastyName ? `${leaderName} ${dynastyName}` : leaderName

	const culture = window.world.cultures?.[province.culture]
	const faith = window.world.faiths?.[province.faith]
	const heritage = window.world.heritages?.[province.heritage]
	const religion = window.world.religions?.[province.religion]

	const identity = [
		culture && { type: "Culture", label: culture.name || `Culture ${culture.idx}`, color: culture.color, clickable: !!onCultureSelect, onClick: () => onCultureSelect?.(province.culture) },
		faith && { type: "Faith", label: faith.name || `Faith ${faith.idx}`, color: faith.color, clickable: false, onClick: undefined },
		heritage && { type: "Heritage", label: heritage.name || `Heritage ${heritage.idx}`, color: heritage.color, clickable: !!onHeritageSelect, onClick: () => onHeritageSelect?.(province.heritage) },
		religion && { type: "Religion", label: religion.name || `Religion ${religion.idx}`, color: religion.color, clickable: false, onClick: undefined },
	].filter(Boolean) as { type: string; label: string; color: string; clickable: boolean; onClick?: () => void }[]

	const geography = [
		cell.climate && {
			type: "Climate",
			label: TEXT.titleCase(cell.climate),
			color: MAP_METRICS.climate.colors[cell.climate] || "#ccc",
		},
		cell.vegetation && {
			type: "Vegetation",
			label: TEXT.titleCase(cell.vegetation),
			color: MAP_METRICS.vegetation.color[cell.vegetation as keyof typeof MAP_METRICS.vegetation.color] || "#ccc",
		},
		cell.topography && {
			type: "Topography",
			label: TEXT.titleCase(cell.topography),
			color: MAP_METRICS.terrain.categorical[cell.topography as keyof typeof MAP_METRICS.terrain.categorical] || "#ccc",
		},
	].filter(Boolean) as { type: string; label: string; color: string }[]

	// Temperature stats
	const avgTemp = monthlyTemps.length > 0
		? monthlyTemps.reduce((s, t) => s + t, 0) / monthlyTemps.length : 0
	const minTemp = monthlyTemps.length > 0 ? Math.min(...monthlyTemps) : 0
	const maxTemp = monthlyTemps.length > 0 ? Math.max(...monthlyTemps) : 0
	const spreadTemp = maxTemp - minTemp

	// Rain stats
	const annualRain = cell.rain.annual
	const avgRain = monthlyRain.reduce((s, r) => s + r, 0) / 12

	// Daylight stats
	const avgDaylight = monthlyDaylight.reduce((s, d) => s + d, 0) / (monthlyDaylight.length || 1)

	// Temperature chart
	const tempData: ChartData<"bar"> = {
		labels: MONTH_LABELS,
		datasets: [{
			data: monthlyTemps,
			backgroundColor: monthlyTemps.map((t) => TEMPERATURE.color(t)),
			borderRadius: 2,
		}],
	}
	const tempOptions: ChartOptions<"bar"> = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: { callbacks: { label: (ctx) => `${Math.round(ctx.raw as number)}°C` } },
		},
		scales: {
			x: { grid: { display: false }, ticks: { font: { size: 9, family: "monospace" } } },
			y: { grid: { color: "#e5e5e5" }, ticks: { font: { size: 9, family: "monospace" }, callback: (v) => `${v}°` } },
		},
	}

	// Rain chart
	const rainData: ChartData<"bar"> = {
		labels: MONTH_LABELS,
		datasets: [{
			data: monthlyRain,
			backgroundColor: monthlyRain.map((r) => RAIN.monthly.color(r)),
			borderRadius: 2,
		}],
	}
	const rainOptions: ChartOptions<"bar"> = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: { callbacks: { label: (ctx) => `${Math.round(ctx.raw as number)} mm` } },
		},
		scales: {
			x: { grid: { display: false }, ticks: { font: { size: 9, family: "monospace" } } },
			y: { grid: { color: "#e5e5e5" }, ticks: { font: { size: 9, family: "monospace" }, callback: (v) => `${v}mm` } },
		},
	}

	// Daylight chart
	const daylightData: ChartData<"bar"> = {
		labels: MONTH_LABELS,
		datasets: [{
			data: monthlyDaylight,
			backgroundColor: monthlyDaylight.map((d) => DAYLIGHT.color(d)),
			borderRadius: 2,
		}],
	}
	const daylightOptions: ChartOptions<"bar"> = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: { callbacks: { label: (ctx) => `${(ctx.raw as number).toFixed(1)} hrs` } },
		},
		scales: {
			x: { grid: { display: false }, ticks: { font: { size: 9, family: "monospace" } } },
			y: { grid: { color: "#e5e5e5" }, min: 0, max: 24, ticks: { font: { size: 9, family: "monospace" }, callback: (v) => `${v}h` } },
		},
	}

	const renderChart = () => {
		switch (chartTab) {
			case "temperature": return <Bar ref={chartRef} data={tempData} options={tempOptions} />
			case "rain": return <Bar ref={chartRef} data={rainData} options={rainOptions} />
			case "daylight": return <Bar ref={chartRef} data={daylightData} options={daylightOptions} />
		}
	}

	const renderChartStats = () => {
		switch (chartTab) {
			case "temperature":
				return (
					<div className="flex justify-center gap-6 text-[10px]">
						<div className="text-center"><div className="text-gray-400">Avg</div><div className="font-bold">{Math.round(avgTemp)}°C</div></div>
						<div className="text-center"><div className="text-gray-400">Min</div><div className="font-bold">{Math.round(minTemp)}°C</div></div>
						<div className="text-center"><div className="text-gray-400">Max</div><div className="font-bold">{Math.round(maxTemp)}°C</div></div>
						<div className="text-center"><div className="text-gray-400">Spread</div><div className="font-bold">{Math.round(spreadTemp)}°C</div></div>
					</div>
				)
			case "rain":
				return (
					<div className="flex justify-center gap-6 text-[10px]">
						<div className="text-center"><div className="text-gray-400">Annual</div><div className="font-bold">{Math.round(annualRain)} mm</div></div>
						<div className="text-center"><div className="text-gray-400">Avg</div><div className="font-bold">{Math.round(avgRain)} mm</div></div>
						<div className="text-center"><div className="text-gray-400">Min</div><div className="font-bold">{Math.round(Math.min(...monthlyRain))} mm</div></div>
						<div className="text-center"><div className="text-gray-400">Max</div><div className="font-bold">{Math.round(Math.max(...monthlyRain))} mm</div></div>
					</div>
				)
			case "daylight":
				return (
					<div className="flex justify-center gap-6 text-[10px]">
						<div className="text-center"><div className="text-gray-400">Avg</div><div className="font-bold">{avgDaylight.toFixed(1)} hrs</div></div>
						<div className="text-center"><div className="text-gray-400">Min</div><div className="font-bold">{Math.min(...monthlyDaylight).toFixed(1)} hrs</div></div>
						<div className="text-center"><div className="text-gray-400">Max</div><div className="font-bold">{Math.max(...monthlyDaylight).toFixed(1)} hrs</div></div>
					</div>
				)
		}
	}

	return (
		<div className="h-full overflow-hidden">
			{/* Stats: Leader | Population | Urbanization | Development | Elevation */}
			<div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3 px-1">
				<div className="flex gap-1.5 items-baseline">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Leader</div>
					<div className="text-sm font-bold text-gray-900 leading-none">
						{formattedLeader}
					</div>
				</div>
				<div className="flex gap-1.5 items-baseline">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Population</div>
					<div className="text-sm font-bold text-gray-900 leading-none">
						{fmt.format(totalPop)}
					</div>
				</div>
				<div className="flex gap-1.5 items-baseline">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Urban</div>
					<div className="text-sm font-bold text-gray-900 leading-none">
						{fmtPct.format(totalPop > 0 ? urbanPop / totalPop : 0)}
					</div>
				</div>
				<div className="flex gap-1.5 items-baseline">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dev</div>
					<div className="text-sm font-bold text-gray-900 leading-none">
						{dev.toFixed(2)}
					</div>
				</div>
				<div className="flex gap-1.5 items-baseline">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Elevation</div>
					<div className="text-sm font-bold text-gray-900 leading-none">
						{Math.round(cell.elevation * 1000)}
						<span className="text-[10px] text-gray-500 font-normal ml-0.5">m</span>
					</div>
				</div>
			</div>

			{/* Cultural identity */}
			{identity.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mb-3 px-1">
					{identity.map(({ type, label, color, clickable, onClick }) => {
						const Tag: React.ElementType = clickable ? "button" : "span"
						return (
							<Tag
								key={type}
								{...(clickable ? { onClick, type: "button" } : {})}
								className={`flex items-center gap-1 text-[9px] font-mono text-gray-700 bg-gray-50 border border-gray-200 px-1.5 py-0.5 ${clickable ? "cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors" : ""
									}`}
							>
								<span className="text-[8px] text-gray-400 uppercase tracking-wide">{type}</span>
								<span
									className="w-2 h-2 flex-shrink-0 border border-black/10"
									style={{ backgroundColor: color }}
								/>
								{label}
							</Tag>
						)
					})}
				</div>
			)}

			{/* Geography */}
			{geography.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mb-3 px-1">
					{geography.map(({ type, label, color }) => (
						<span
							key={type}
							className="flex items-center gap-1 text-[9px] font-mono text-gray-700 bg-gray-50 border border-gray-200 px-1.5 py-0.5"
						>
							<span className="text-[8px] text-gray-400 uppercase tracking-wide">{type}</span>
							<span
								className="w-2 h-2 flex-shrink-0 border border-black/10"
								style={{ backgroundColor: color }}
							/>
							{label}
						</span>
					))}
				</div>
			)}

			<Tabs
				tabs={[
					{ id: "temperature", label: "Temperature" },
					{ id: "rain", label: "Rain" },
					{ id: "daylight", label: "Daylight" },
				]}
				activeTab={chartTab}
				onTabSelect={(id) => setChartTab(id as ChartTabID)}
			/>

			<div className="h-[140px] bg-gray-50 border border-gray-200 p-2 mb-3">
				{renderChart()}
			</div>

			{renderChartStats()}
		</div>
	)
}
