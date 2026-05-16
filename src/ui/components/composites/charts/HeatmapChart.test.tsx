import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { HeatmapChart } from "./HeatmapChart"

let capturedBarProps: Record<string, unknown> | null = null
let capturedLegendProps: Record<string, unknown> | null = null

vi.mock("react-chartjs-2", () => ({
	Bar: (props: Record<string, unknown>) => {
		capturedBarProps = props
		return React.createElement("div", { "data-chart": "heatmap" })
	},
}))

vi.mock("../../primitives/charts/ContinuousLegend", () => ({
	ContinuousLegend: (props: Record<string, unknown>) => {
		capturedLegendProps = props
		return React.createElement("div", {
			"data-legend": props.title ?? "legend",
		})
	},
}))

describe("HeatmapChart", () => {
	it("builds stacked datasets, legend bounds, and fallback tooltip labels", () => {
		capturedBarProps = null
		capturedLegendProps = null

		renderToStaticMarkup(
			<HeatmapChart
				matrix={[
					[1, 2, 3],
					[4, 5, 6],
				]}
				rowValues={[-10, 20]}
				columnValues={[0, 2]}
				columnLabels={["Jan", "Mar"]}
				colorForValue={(value) => `rgb(${value},${value},${value})`}
				legendTitle="Heat"
				xAxisTitle="Month"
				yAxisTitle="Latitude"
			/>,
		)

		const data = capturedBarProps?.data as
			| {
					labels: string[]
					datasets: Array<{
						label: string
						backgroundColor: string[]
						data: number[]
					}>
			  }
			| undefined
		const options = capturedBarProps?.options as
			| {
					plugins: {
						tooltip: {
							callbacks: {
								label: (ctx: {
									datasetIndex: number
									dataIndex: number
								}) => string
							}
						}
					}
					scales: {
						x: { title: { display: boolean; text?: string } }
						y: {
							title: { display: boolean; text?: string }
							ticks: { callback: (_: number, index: number) => string }
						}
					}
			  }
			| undefined

		expect(data?.labels).toEqual(["Jan", "Mar"])
		expect(data?.datasets[0]).toMatchObject({
			label: "-10°",
			data: [1, 1],
			backgroundColor: ["rgb(1,1,1)", "rgb(3,3,3)"],
		})
		expect(data?.datasets[1]).toMatchObject({
			label: "20°",
			backgroundColor: ["rgb(4,4,4)", "rgb(6,6,6)"],
		})
		expect(
			options?.plugins.tooltip.callbacks.label({
				datasetIndex: 1,
				dataIndex: 1,
			}),
		).toBe("20°, Mar: 6")
		expect(options?.scales.x.title).toMatchObject({
			display: true,
			text: "Month",
		})
		expect(options?.scales.y.title).toMatchObject({
			display: true,
			text: "Latitude",
		})
		expect(options?.scales.y.ticks.callback(0, 1)).toBe("20°")
		expect(capturedLegendProps).toMatchObject({
			min: 1,
			max: 6,
			title: "Heat",
		})
	})

	it("supports custom tooltip formatting, hidden axes, full height, and disabled legends", () => {
		capturedBarProps = null
		capturedLegendProps = null

		const markup = renderToStaticMarkup(
			<HeatmapChart
				matrix={[[Number.NaN]]}
				rowValues={[5]}
				columnValues={[0]}
				columnLabels={["Only"]}
				colorForValue={() => "#000"}
				datasetLabel={(rowValue, rowIndex) => `Row ${rowIndex}:${rowValue}`}
				rowTickLabel={(rowValue, rowIndex) => `Tick ${rowIndex}:${rowValue}`}
				tooltipLabel={({ value }) => `Value ${value}`}
				showLegend={false}
				showXAxis={false}
				fullHeight={true}
			/>,
		)

		const options = capturedBarProps?.options as
			| {
					plugins: {
						tooltip: {
							callbacks: {
								label: (ctx: {
									datasetIndex: number
									dataIndex: number
								}) => string
							}
						}
					}
					scales: {
						x: { ticks: { display: boolean }; border: { display: boolean } }
						y: { ticks: { callback: (_: number, index: number) => string } }
					}
			  }
			| undefined

		expect(markup).toContain("flex h-full min-h-0 flex-col")
		expect(
			options?.plugins.tooltip.callbacks.label({
				datasetIndex: 0,
				dataIndex: 0,
			}),
		).toBe("Value NaN")
		expect(options?.scales.x.ticks.display).toBe(false)
		expect(options?.scales.x.border.display).toBe(false)
		expect(options?.scales.y.ticks.callback(0, 0)).toBe("Tick 0:5")
		expect(capturedLegendProps).toBeNull()
	})
})
