import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ContinuousLegend, SeriesBars } from "."
import { HeatmapChart } from "./composites/charts/HeatmapChart"

let capturedBarProps: Record<string, unknown> | null = null

vi.mock("react-chartjs-2", () => ({
	Bar: (props: Record<string, unknown>) => {
		capturedBarProps = props
		return React.createElement("div", { "data-chart": "heatmap" })
	},
}))

describe("shared chart components", () => {
	it("renders a generic continuous legend", () => {
		const markup = renderToStaticMarkup(
			<ContinuousLegend
				min={-5}
				max={25}
				title="Temperature"
				colorForValue={() => "#123456"}
				formatValue={(value) => `${value.toFixed(0)}°C`}
			/>,
		)

		expect(markup).toContain("Temperature")
		expect(markup).toContain("-5°C")
		expect(markup).toContain("25°C")
	})

	it("renders reusable series bars with labels and summaries", () => {
		const markup = renderToStaticMarkup(
			<SeriesBars
				values={[10, -5, 15]}
				labels={["J", "F", "M"]}
				label="Delta"
				summary="AVG 6.7"
				activeIndex={1}
				colorForValue={() => "#abcdef"}
				showValues
				formatValue={(value) => value.toFixed(1)}
			/>,
		)

		expect(markup).toContain("Delta")
		expect(markup).toContain("AVG 6.7")
		expect(markup).toContain("font-bold text-slate-200")
		expect(markup).toContain("10.0")
	})

	it("renders positive-only series bars with custom tooltips", () => {
		const tooltipLabel = vi.fn(
			({ label, value }: { label: string; value: number; index: number }) =>
				`${label} => ${value}`,
		)

		const markup = renderToStaticMarkup(
			<SeriesBars
				values={[2, 4]}
				labels={["A", "B"]}
				label="Rain"
				colorForValue={() => "#123456"}
				tooltipLabel={tooltipLabel}
			/>,
		)

		expect(markup).toContain("Rain")
		expect(markup).toContain('title="A =&gt; 2"')
		expect(markup).not.toContain("border-slate-500/30")
		expect(tooltipLabel).toHaveBeenCalledTimes(2)
	})

	it("builds a generic heatmap chart dataset and legend", () => {
		capturedBarProps = null

		const markup = renderToStaticMarkup(
			<HeatmapChart
				matrix={[
					[1, 2, 3],
					[4, 5, 6],
				]}
				rowValues={[-30, 30]}
				columnValues={[0, 2]}
				columnLabels={["0", "2"]}
				colorForValue={(value) => `rgb(${value}, ${value}, ${value})`}
				legendTitle="Intensity"
				xAxisTitle="Day"
				yAxisTitle="Latitude"
				fullHeight
			/>,
		)

		expect(markup).toContain('data-chart="heatmap"')
		expect(markup).toContain("Intensity")
		expect(capturedBarProps).toMatchObject({
			data: {
				labels: ["0", "2"],
			},
		})
		expect(
			(capturedBarProps?.data as { datasets: Array<{ label: string }> })
				.datasets,
		).toHaveLength(2)
	})
})
