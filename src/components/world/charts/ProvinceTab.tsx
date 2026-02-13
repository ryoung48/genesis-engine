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
import { PROVINCE } from "@/model/provinces"
import { Tabs } from "./Tabs"
import { WEATHER } from "@/model/cells/weather"

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

interface ProvinceTabProps {
	selectedProvince: number | null
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

export const ProvinceTab: React.FC<ProvinceTabProps> = ({
	selectedProvince,
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

	// Temperature chart data & options
	const tempData: ChartData<"bar"> = {
		labels: MONTH_LABELS,
		datasets: [
			{
				data: monthlyTemps,
				backgroundColor: monthlyTemps.map((t) => TEMPERATURE.color(t)),
				borderRadius: 2,
			},
		],
	}

	const tempOptions: ChartOptions<"bar"> = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (ctx) => `${Math.round(ctx.raw as number)}°C`,
				},
			},
		},
		scales: {
			x: {
				grid: { display: false },
				ticks: { font: { size: 9, family: "monospace" } },
			},
			y: {
				grid: { color: "#e5e5e5" },
				ticks: {
					font: { size: 9, family: "monospace" },
					callback: (v) => `${v}°`,
				},
			},
		},
	}

	// Rain chart data & options
	const rainData: ChartData<"bar"> = {
		labels: MONTH_LABELS,
		datasets: [
			{
				data: monthlyRain,
				backgroundColor: monthlyRain.map((r) => RAIN.monthly.color(r)),
				borderRadius: 2,
			},
		],
	}

	const rainOptions: ChartOptions<"bar"> = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (ctx) => `${Math.round(ctx.raw as number)} mm`,
				},
			},
		},
		scales: {
			x: {
				grid: { display: false },
				ticks: { font: { size: 9, family: "monospace" } },
			},
			y: {
				grid: { color: "#e5e5e5" },
				ticks: {
					font: { size: 9, family: "monospace" },
					callback: (v) => `${v}mm`,
				},
			},
		},
	}

	// Daylight chart data & options
	const daylightData: ChartData<"bar"> = {
		labels: MONTH_LABELS,
		datasets: [
			{
				data: monthlyDaylight,
				backgroundColor: monthlyDaylight.map((d) => DAYLIGHT.color(d)),
				borderRadius: 2,
			},
		],
	}

	const daylightOptions: ChartOptions<"bar"> = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (ctx) => `${(ctx.raw as number).toFixed(1)} hrs`,
				},
			},
		},
		scales: {
			x: {
				grid: { display: false },
				ticks: { font: { size: 9, family: "monospace" } },
			},
			y: {
				grid: { color: "#e5e5e5" },
				min: 0,
				max: 24,
				ticks: {
					font: { size: 9, family: "monospace" },
					callback: (v) => `${v}h`,
				},
			},
		},
	}

	const annualRain = monthlyRain.reduce((sum, r) => sum + r, 0)
	const avgRain = annualRain / 12
	const avgDaylight =
		monthlyDaylight.reduce((sum, d) => sum + d, 0) / monthlyDaylight.length

	// Temperature stats from monthly means (which are averaged from daily means)
	const avgTemp =
		monthlyTemps.length > 0
			? monthlyTemps.reduce((sum, t) => sum + t, 0) / monthlyTemps.length
			: 0
	const minTemp = monthlyTemps.length > 0 ? Math.min(...monthlyTemps) : 0
	const maxTemp = monthlyTemps.length > 0 ? Math.max(...monthlyTemps) : 0
	const spreadTemp = maxTemp - minTemp

	const renderChart = () => {
		switch (chartTab) {
			case "temperature":
				return <Bar ref={chartRef} data={tempData} options={tempOptions} />
			case "rain":
				return <Bar ref={chartRef} data={rainData} options={rainOptions} />
			case "daylight":
				return (
					<Bar ref={chartRef} data={daylightData} options={daylightOptions} />
				)
		}
	}

	const renderStats = () => {
		switch (chartTab) {
			case "temperature":
				return (
					<div className="flex justify-center gap-6 text-[10px]">
						<div className="text-center">
							<div className="text-gray-400">Avg</div>
							<div className="font-bold">{Math.round(avgTemp)}°C</div>
						</div>
						<div className="text-center">
							<div className="text-gray-400">Min</div>
							<div className="font-bold">{Math.round(minTemp)}°C</div>
						</div>
						<div className="text-center">
							<div className="text-gray-400">Max</div>
							<div className="font-bold">{Math.round(maxTemp)}°C</div>
						</div>
						<div className="text-center">
							<div className="text-gray-400">Spread</div>
							<div className="font-bold">{Math.round(spreadTemp)}°C</div>
						</div>
					</div>
				)
			case "rain":
				return (
					<div className="flex justify-center gap-6 text-[10px]">
						<div className="text-center">
							<div className="text-gray-400">Avg</div>
							<div className="font-bold">{Math.round(avgRain)} mm</div>
						</div>
						<div className="text-center">
							<div className="text-gray-400">Min</div>
							<div className="font-bold">
								{Math.round(Math.min(...monthlyRain))} mm
							</div>
						</div>
						<div className="text-center">
							<div className="text-gray-400">Max</div>
							<div className="font-bold">
								{Math.round(Math.max(...monthlyRain))} mm
							</div>
						</div>
					</div>
				)
			case "daylight":
				return (
					<div className="flex justify-center gap-6 text-[10px]">
						<div className="text-center">
							<div className="text-gray-400">Avg</div>
							<div className="font-bold">{avgDaylight.toFixed(1)} hrs</div>
						</div>
						<div className="text-center">
							<div className="text-gray-400">Min</div>
							<div className="font-bold">
								{Math.min(...monthlyDaylight).toFixed(1)} hrs
							</div>
						</div>
						<div className="text-center">
							<div className="text-gray-400">Max</div>
							<div className="font-bold">
								{Math.max(...monthlyDaylight).toFixed(1)} hrs
							</div>
						</div>
					</div>
				)
		}
	}

	return (
		<div className="h-full overflow-hidden">
			{/* Top-level Stats Row */}
			<div className="grid grid-cols-4 gap-4 mb-4 px-1">
				<div>
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
						Avg Temp
					</div>
					<div className="text-xl font-bold text-gray-900 leading-none">
						{Math.round(avgTemp)}
						<span className="text-xs text-gray-500 font-normal ml-1">°C</span>
					</div>
				</div>
				<div>
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
						Annual Rain
					</div>
					<div className="text-xl font-bold text-gray-900 leading-none">
						{Math.round(annualRain)}
						<span className="text-xs text-gray-500 font-normal ml-1">mm</span>
					</div>
				</div>
				<div>
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
						Elevation
					</div>
					<div className="text-xl font-bold text-gray-900 leading-none">
						{Math.round(cell.elevation * 1000)}
						<span className="text-xs text-gray-500 font-normal ml-1">m</span>
					</div>
				</div>
				<div>
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
						Climate
					</div>
					<div className="text-sm font-bold text-gray-900 leading-none capitalize">
						{cell.climate || "N/A"}
					</div>
				</div>
			</div>

			{/* Chart Tab Selector */}
			<Tabs
				tabs={[
					{ id: "temperature", label: "Temperature" },
					{ id: "rain", label: "Rain" },
					{ id: "daylight", label: "Daylight" },
				]}
				activeTab={chartTab}
				onTabSelect={(id) => setChartTab(id as ChartTabID)}
			/>

			{/* Chart */}
			<div className="h-[160px] bg-gray-50 border border-gray-200 p-2 mb-3">
				{renderChart()}
			</div>

			{/* Stats for selected chart type */}
			{renderStats()}
		</div>
	)
}
