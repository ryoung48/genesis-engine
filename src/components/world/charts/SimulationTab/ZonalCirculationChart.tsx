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
import { interpolateBlues, interpolateOranges, interpolateReds, rgb } from "d3"
import React from "react"
import { Line } from "react-chartjs-2"
import { RAIN } from "../../../../model/cells/rain"

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Legend,
	Filler,
)

interface ZonalCirculationChartProps {
	teqByDay: number[]
	dayLabels: string[]
	sampledDays: number[]
}

const ZonalCirculationChart: React.FC<ZonalCirculationChartProps> = ({
	teqByDay,
	dayLabels,
	sampledDays,
}) => {
	const scales = RAIN.SCALES

	// Helper to convert d3 scale value to rgba with opacity
	const getRgba = (
		colorFn: (t: number) => string,
		t: number,
		alpha: number,
	) => {
		const c = rgb(colorFn(t))
		return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
	}

	const datasets = [
		// --- ITCZ (Area Fills) ---
		// We'll create layers: 0-8, 8-18, 18-28
		...[28, 18, 8]
			.map((offset) => {
				const weight = scales.itcz(offset)
				return [
					{
						label: `ITCZ +${offset}°`,
						data: sampledDays.map((day) => teqByDay[day] + offset),
						borderColor: "transparent",
						pointRadius: 0,
						tension: 0.4,
						fill: "+1",
						backgroundColor: getRgba(interpolateReds, 0.3 + weight * 0.7, 0.15),
					},
					{
						label: `ITCZ -${offset}°`,
						data: sampledDays.map((day) => teqByDay[day] - offset),
						borderColor: "transparent",
						pointRadius: 0,
						tension: 0.4,
					},
				]
			})
			.flat(),
		{
			label: "ITCZ (Peak)",
			data: sampledDays.map((day) => teqByDay[day]),
			borderColor: interpolateReds(0.9),
			borderWidth: 2,
			pointRadius: 0,
			tension: 0.4,
		},

		// --- Subsidence (Area Fills) ---
		// Range 20-40, peak 30
		...[
			{ upper: 40, lower: 35, alpha: 0.1 },
			{ upper: 35, lower: 25, alpha: 0.2 },
			{ upper: 25, lower: 20, alpha: 0.1 },
		]
			.map((range, i) => [
				{
					label: `N. Sub Range ${i}`,
					data: sampledDays.map((day) => teqByDay[day] + range.upper),
					borderColor: "transparent",
					pointRadius: 0,
					tension: 0.4,
					fill: "+1",
					backgroundColor: getRgba(interpolateOranges, 0.6, range.alpha),
				},
				{
					label: `N. Sub Anchor ${i}`,
					data: sampledDays.map((day) => teqByDay[day] + range.lower),
					borderColor: "transparent",
					pointRadius: 0,
					tension: 0.4,
				},
				{
					label: `S. Sub Range ${i}`,
					data: sampledDays.map((day) => teqByDay[day] - range.upper),
					borderColor: "transparent",
					pointRadius: 0,
					tension: 0.4,
					fill: "+1",
					backgroundColor: getRgba(interpolateOranges, 0.6, range.alpha),
				},
				{
					label: `S. Sub Anchor ${i}`,
					data: sampledDays.map((day) => teqByDay[day] - range.lower),
					borderColor: "transparent",
					pointRadius: 0,
					tension: 0.4,
				},
			])
			.flat(),
		{
			label: "N. Subsidence (Peak)",
			data: sampledDays.map((day) => teqByDay[day] + 30),
			borderColor: interpolateOranges(0.7),
			borderWidth: 1.5,
			borderDash: [5, 5],
			pointRadius: 0,
			tension: 0.4,
		},
		{
			label: "S. Subsidence (Peak)",
			data: sampledDays.map((day) => teqByDay[day] - 30),
			borderColor: interpolateOranges(0.7),
			borderWidth: 1.5,
			borderDash: [5, 5],
			pointRadius: 0,
			tension: 0.4,
		},

		// --- Westerlies (Area Fills) ---
		// Range 40-90, peak 50
		...[
			{ upper: 90, lower: 50, alpha: 0.1 },
			{ upper: 50, lower: 40, alpha: 0.15 },
		]
			.map((range, i) => [
				{
					label: `N. West Range ${i}`,
					data: sampledDays.map((day) => teqByDay[day] + range.upper),
					borderColor: "transparent",
					pointRadius: 0,
					tension: 0.4,
					fill: "+1",
					backgroundColor: getRgba(interpolateBlues, 0.6, range.alpha),
				},
				{
					label: `N. West Anchor ${i}`,
					data: sampledDays.map((day) => teqByDay[day] + range.lower),
					borderColor: "transparent",
					pointRadius: 0,
					tension: 0.4,
				},
				{
					label: `S. West Range ${i}`,
					data: sampledDays.map((day) => teqByDay[day] - range.upper),
					borderColor: "transparent",
					pointRadius: 0,
					tension: 0.4,
					fill: "+1",
					backgroundColor: getRgba(interpolateBlues, 0.6, range.alpha),
				},
				{
					label: `S. West Anchor ${i}`,
					data: sampledDays.map((day) => teqByDay[day] - range.lower),
					borderColor: "transparent",
					pointRadius: 0,
					tension: 0.4,
				},
			])
			.flat(),
		{
			label: "N. Westerlies (Peak)",
			data: sampledDays.map((day) => teqByDay[day] + 50),
			borderColor: interpolateBlues(0.7),
			borderWidth: 1.5,
			borderDash: [2, 2],
			pointRadius: 0,
			tension: 0.4,
		},
		{
			label: "S. Westerlies (Peak)",
			data: sampledDays.map((day) => teqByDay[day] - 50),
			borderColor: interpolateBlues(0.7),
			borderWidth: 1.5,
			borderDash: [2, 2],
			pointRadius: 0,
			tension: 0.4,
		},
	]

	return (
		<div className="mt-4 flex-1 min-h-0" style={{ height: "100%" }}>
			<Line
				data={{
					labels: dayLabels,
					datasets: datasets,
				}}
				options={{
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							display: false,
						},
						tooltip: {
							mode: "index",
							intersect: false,
							filter: (item) => item.dataset.label?.includes("Peak"),
							callbacks: {
								label: (ctx) => {
									const val = ctx.parsed.y
									const label = ctx.dataset.label || ""
									if (label.includes("ITCZ")) {
										return `ITCZ: ${(val - 28).toFixed(0)}° to ${(val + 28).toFixed(0)}°`
									}
									if (label.includes("Subsidence")) {
										return `${label.includes("N.") ? "N." : "S."} Subsidence: ${(val - 10).toFixed(0)}° to ${(val + 10).toFixed(0)}°`
									}
									if (label.includes("Westerlies")) {
										const isNorth = label.includes("N.")
										const min = isNorth ? val - 10 : val - 40
										const max = isNorth ? val + 40 : val + 10
										return `${isNorth ? "N." : "S."} Westerlies: ${min.toFixed(0)}° to ${max.toFixed(0)}°`
									}
									return `${label}: ${val.toFixed(0)}°`
								},
							},
						},
					},
					scales: {
						x: {
							ticks: {
								maxTicksLimit: 12,
								font: { size: 9, family: "monospace" },
							},
							grid: { color: "rgba(0,0,0,0.05)" },
						},
						y: {
							min: -90,
							max: 90,
							ticks: {
								stepSize: 30,
								callback: (val) => `${val}°`,
								font: { size: 9, family: "monospace" },
							},
							grid: { color: "rgba(0,0,0,0.1)" },
						},
					},
				}}
			/>
		</div>
	)
}

export default ZonalCirculationChart
