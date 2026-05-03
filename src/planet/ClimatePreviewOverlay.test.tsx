import type { ComponentProps } from "react"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { IconButton, SegmentedControl } from "@/components"
import { temperatureColor } from "@/planet/colors"
import { rgbToCss } from "@/planet/screen/shared/ui-format"
import { ClimatePreviewOverlay } from "./ClimatePreviewOverlay"

let capturedHeatmapProps: Record<string, unknown> | null = null

vi.mock("@/components/composites/charts/HeatmapChart", () => ({
	HeatmapChart: (props: Record<string, unknown>) => {
		capturedHeatmapProps = props
		return React.createElement("div", {
			"data-heatmap-title": props.legendTitle ?? "Temperature",
		})
	},
}))

type ClimatePreviewOverlayProps = ComponentProps<typeof ClimatePreviewOverlay>

function createProps(
	overrides: Partial<ClimatePreviewOverlayProps> = {},
): ClimatePreviewOverlayProps {
	return {
		preview: {
			heat: [[1, 2]],
			avgTemp: 12.3,
			insolation: [[3, 4]],
			insolColorFn: vi.fn(),
			daylight: [[5, 6]],
			daylightColorFn: vi.fn(),
			lats: [0],
			sampledDays: [0, 10],
			dayLabels: ["0", "10"],
		},
		activeTab: "temperature",
		unitSystem: "metric",
		onSelectTab: vi.fn(),
		onClose: vi.fn(),
		...overrides,
	}
}

describe("ClimatePreviewOverlay", () => {
	it("renders tabs, average temperature, and close action in the top control row", () => {
		capturedHeatmapProps = null

		const markup = renderToStaticMarkup(
			<ClimatePreviewOverlay {...createProps()} />,
		)

		expect(markup).toContain("TEMP")
		expect(markup).toContain("INSOL")
		expect(markup).toContain("LIGHT")
		expect(markup).toContain("Close climate preview")
		expect(markup).toContain("Avg Temp")
		expect(markup).toContain("12.3°C")
		expect(markup).not.toContain("Climate Preview")
	})

	it("routes the insolation tab through the generalized heatmap chart", () => {
		capturedHeatmapProps = null
		const props = createProps({ activeTab: "insolation" })

		renderToStaticMarkup(<ClimatePreviewOverlay {...props} />)

		expect(capturedHeatmapProps).toMatchObject({
			matrix: props.preview.insolation,
			colorForValue: props.preview.insolColorFn,
			legendTitle: "Insolation",
			fullHeight: true,
		})
		expect(
			(
				capturedHeatmapProps?.formatLegendValue as
					| ((value: number) => string)
					| undefined
			)?.(321.4),
		).toBe("321 W/m²")
		expect(
			(
				capturedHeatmapProps?.tooltipLabel as
					| ((args: {
							rowValue: number
							columnValue: number
							value: number
					  }) => string)
					| undefined
			)?.({
				rowValue: 10,
				columnValue: 2,
				value: 123.4,
			}),
		).toBe("Lat 10.0°, Day 3: 123.4 W/m²")
	})

	it("routes daylight and temperature tabs through the expected chart formatting", () => {
		capturedHeatmapProps = null
		const daylightProps = createProps({ activeTab: "daylight" })
		renderToStaticMarkup(<ClimatePreviewOverlay {...daylightProps} />)

		expect(capturedHeatmapProps).toMatchObject({
			matrix: daylightProps.preview.daylight,
			colorForValue: daylightProps.preview.daylightColorFn,
			legendTitle: "Daylight",
			xAxisTitle: "Day of Year",
			yAxisTitle: "Latitude",
		})
		expect(
			(
				capturedHeatmapProps?.tooltipLabel as
					| ((args: {
							rowValue: number
							columnValue: number
							value: number
					  }) => string)
					| undefined
			)?.({
				rowValue: 15,
				columnValue: 4,
				value: 9.5,
			}),
		).toBe("Lat 15.0°, Day 5: 9.5 hrs")
		expect(
			(
				capturedHeatmapProps?.formatLegendValue as
					| ((value: number) => string)
					| undefined
			)?.(9.5),
		).toBe("9.5 hrs")

		capturedHeatmapProps = null
		const temperatureProps = createProps({
			activeTab: "temperature",
			unitSystem: "imperial",
		})
		renderToStaticMarkup(<ClimatePreviewOverlay {...temperatureProps} />)

		expect(capturedHeatmapProps).toMatchObject({
			matrix: temperatureProps.preview.heat,
			legendTitle: "Temperature",
		})
		expect(
			(
				capturedHeatmapProps?.colorForValue as
					| ((value: number) => string)
					| undefined
			)?.(12.5),
		).toBe(rgbToCss(temperatureColor(12.5)))
		expect(
			(
				capturedHeatmapProps?.formatLegendValue as
					| ((value: number) => string)
					| undefined
			)?.(11.25),
		).toBe("52.3°F")
		expect(
			(
				capturedHeatmapProps?.datasetLabel as
					| ((value: number) => string)
					| undefined
			)?.(-42.4),
		).toBe("Lat -42.4°")
		expect(
			(
				capturedHeatmapProps?.rowTickLabel as
					| ((value: number) => string)
					| undefined
			)?.(-42.4),
		).toBe("-42°")
	})

	it("wires the tab selector and close button callbacks", () => {
		const onSelectTab = vi.fn()
		const onClose = vi.fn()
		const tree = ClimatePreviewOverlay(
			createProps({ onSelectTab, onClose }),
		) as React.ReactElement<{ children?: React.ReactNode }>
		const rootChildren = React.Children.toArray(
			tree.props.children,
		) as React.ReactElement[]
		const header = rootChildren[0] as React.ReactElement<{
			children?: React.ReactNode
		}>
		const headerChildren = React.Children.toArray(
			header.props.children,
		) as React.ReactElement[]
		const tabs = headerChildren[0] as React.ReactElement<
			React.ComponentProps<typeof SegmentedControl>
		>
		const actionRow = headerChildren[1] as React.ReactElement<{
			children?: React.ReactNode
		}>
		const actionChildren = React.Children.toArray(
			actionRow.props.children,
		) as React.ReactElement[]
		const closeButton = actionChildren[1] as React.ReactElement<
			React.ComponentProps<typeof IconButton>
		>

		tabs.props.onChange("insolation")
		closeButton.props.onClick?.(undefined as never)

		expect(onSelectTab).toHaveBeenCalledWith("insolation")
		expect(onClose).toHaveBeenCalledTimes(1)
	})
})
