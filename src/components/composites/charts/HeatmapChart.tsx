import React from "react"
import { Bar } from "react-chartjs-2"
import { ContinuousLegend } from "../../primitives/charts/ContinuousLegend"

interface HeatmapChartProps {
	matrix: readonly (readonly number[])[]
	rowValues: readonly number[]
	columnValues: readonly number[]
	columnLabels: readonly string[]
	colorForValue: (value: number) => string
	datasetLabel?: (rowValue: number, rowIndex: number) => string
	rowTickLabel?: (rowValue: number, rowIndex: number) => string
	tooltipLabel?: (params: {
		rowValue: number
		columnValue: number
		value: number
		rowIndex: number
		columnIndex: number
	}) => string
	legendTitle?: string
	xAxisTitle?: string
	yAxisTitle?: string
	fullHeight?: boolean
	showLegend?: boolean
	showXAxis?: boolean
	formatLegendValue?: (value: number) => string
}

function fallbackRowLabel(rowValue: number): string {
	return `${rowValue.toFixed(0)}°`
}

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
	matrix,
	rowValues,
	columnValues,
	columnLabels,
	colorForValue,
	datasetLabel = (rowValue) => fallbackRowLabel(rowValue),
	rowTickLabel = (rowValue) => fallbackRowLabel(rowValue),
	tooltipLabel,
	legendTitle,
	xAxisTitle,
	yAxisTitle,
	fullHeight = false,
	showLegend = true,
	showXAxis = true,
	formatLegendValue,
}) => {
	const datasetRows = rowValues.map((rowValue, rowIndex) => {
		const backgroundColor: string[] = []
		for (const columnValue of columnValues) {
			backgroundColor.push(colorForValue(matrix[rowIndex][columnValue]))
		}

		return {
			label: datasetLabel(rowValue, rowIndex),
			data: columnValues.map(() => 1),
			backgroundColor,
			barThickness: "flex" as const,
			categoryPercentage: 1,
			barPercentage: 1,
			stack: "heat",
		}
	})

	let min = Infinity
	let max = -Infinity
	for (let rowIndex = 0; rowIndex < rowValues.length; rowIndex++) {
		for (const columnValue of columnValues) {
			const value = matrix[rowIndex][columnValue]
			if (value < min) min = value
			if (value > max) max = value
		}
	}
	if (!Number.isFinite(min) || !Number.isFinite(max)) {
		min = 0
		max = 0
	}

	return (
		<div className={`${fullHeight ? "flex h-full min-h-0 flex-col" : "mt-4"}`}>
			<div
				style={
					fullHeight
						? { flex: 1, minHeight: 0 }
						: { height: "400px", overflow: "hidden" }
				}
			>
				<Bar
					data={{
						labels: [...columnLabels],
						datasets: datasetRows,
					}}
					options={{
						responsive: true,
						maintainAspectRatio: false,
						plugins: {
							legend: { display: false },
							tooltip: {
								callbacks: {
									label: (ctx) => {
										const rowIndex = ctx.datasetIndex
										const columnIndex = ctx.dataIndex
										const rowValue = rowValues[rowIndex]
										const columnValue = columnValues[columnIndex]
										const value = matrix[rowIndex][columnValue]

										return tooltipLabel
											? tooltipLabel({
													rowValue,
													columnValue,
													value,
													rowIndex,
													columnIndex,
												})
											: `${datasetLabel(rowValue, rowIndex)}, ${columnLabels[columnIndex]}: ${value}`
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
									display: showXAxis && Boolean(xAxisTitle),
									text: xAxisTitle,
									font: { size: 10, family: "monospace", weight: "bold" },
								},
								grid: { display: false },
								border: { display: showXAxis },
							},
							y: {
								stacked: true,
								ticks: {
									callback: (_value, index) => {
										const rowValue = rowValues[index]
										return rowValue !== undefined
											? rowTickLabel(rowValue, index)
											: ""
									},
									autoSkip: false,
									stepSize: 1,
									font: { size: 8, family: "monospace" },
								},
								title: {
									display: Boolean(yAxisTitle),
									text: yAxisTitle,
									font: { size: 10, family: "monospace", weight: "bold" },
								},
								grid: { display: false },
							},
						},
					}}
				/>
			</div>
			{showLegend && (
				<ContinuousLegend
					min={min}
					max={max}
					title={legendTitle}
					colorForValue={colorForValue}
					formatValue={formatLegendValue}
				/>
			)}
		</div>
	)
}
