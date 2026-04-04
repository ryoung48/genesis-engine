import React from "react"
import { Bar } from "react-chartjs-2"
import { TEMPERATURE } from "@/model/cells/temperature"
import { TemperatureScale } from "./TemperatureScale"

interface SeasonalTempByLatProps {
	heat: number[][]
	latRange: number[]
	sampledDays: number[]
	dayLabels: string[]
	colorFn?: (temp: number) => string
	unit?: string
	fullHeight?: boolean
	showScale?: boolean
	showXAxis?: boolean
	tooltipLabel?: (params: { lat: number; day: number; temp: number }) => string
}

const SeasonalTempByLat: React.FC<SeasonalTempByLatProps> = ({
	heat,
	latRange,
	sampledDays,
	dayLabels,
	colorFn,
	unit,
	fullHeight = false,
	showScale = true,
	showXAxis = true,
	tooltipLabel,
}) => {
	const numLatitudes = latRange.length
	const datasetsTemp = []

	let tempMin = Infinity
	let tempMax = -Infinity

	for (let latIdx = 0; latIdx < numLatitudes; latIdx++) {
		const data: number[] = []
		const backgroundColor: string[] = []

		for (const step of sampledDays) {
			const temp = heat[latIdx][step]
			data.push(1)
			backgroundColor.push(colorFn ? colorFn(temp) : TEMPERATURE.color(temp))
			if (temp > tempMax) tempMax = temp
			if (temp < tempMin) tempMin = temp
		}

		datasetsTemp.push({
			label: `Lat ${latRange[latIdx].toFixed(1)}\u00B0`,
			data,
			backgroundColor,
			barThickness: "flex" as const,
			categoryPercentage: 1.0,
			barPercentage: 1.0,
			stack: "heat",
		})
	}

	const dataTemp = {
		labels: dayLabels,
		datasets: datasetsTemp,
	}

	return (
		<div className={`${fullHeight ? "h-full flex flex-col min-h-0" : "mt-4"}`}>
			<div
				style={
					fullHeight
						? { flex: 1, minHeight: 0 }
						: { height: "400px", overflow: "hidden" }
				}
			>
				<Bar
					data={dataTemp}
					options={{
						responsive: true,
						maintainAspectRatio: false,
						plugins: {
							legend: {
								display: false,
							},
							tooltip: {
								callbacks: {
									label: (ctx) => {
										const day = sampledDays[ctx.dataIndex] + 1
										const lat = latRange[ctx.datasetIndex]
										const temp =
											heat[ctx.datasetIndex][sampledDays[ctx.dataIndex]]
										return tooltipLabel
											? tooltipLabel({ lat, day, temp })
											: `${ctx.dataset.label}, Day ${day}: ${temp.toFixed(1)}${unit || "\u00B0C"}`
									},
								},
							},
						},
						scales: {
							x: {
								stacked: true,
								ticks: {
									display: showXAxis,
									maxTicksLimit: 12,
									autoSkip: true,
									font: { size: 9, family: "monospace" },
								},
								title: {
									display: showXAxis,
									text: "Day of Year",
									font: { size: 10, family: "monospace", weight: "bold" },
								},
								grid: { display: false },
								border: { display: showXAxis },
							},
							y: {
								stacked: true,
								ticks: {
									callback: (_val, index) => {
										const lat = latRange[index]
										return lat !== undefined ? `${lat.toFixed(0)}\u00B0` : ""
									},
									autoSkip: false,
									stepSize: 1,
									font: { size: 8, family: "monospace" },
								},
								title: {
									display: true,
									text: "Latitude",
									font: { size: 10, family: "monospace", weight: "bold" },
								},
								grid: { display: false },
							},
						},
					}}
				/>
			</div>
			{showScale && (
				<TemperatureScale
					tempMin={tempMin}
					tempMax={tempMax}
					colorFn={colorFn}
				/>
			)}
		</div>
	)
}

export default SeasonalTempByLat
