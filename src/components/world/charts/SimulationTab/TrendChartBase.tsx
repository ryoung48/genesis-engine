import {
	ActiveElement,
	ChartData,
	ChartEvent,
	Chart as ChartJS,
	ChartOptions,
} from "chart.js"
import React, { useEffect, useMemo, useRef } from "react"
import { Line } from "react-chartjs-2"

interface FooterItem {
	label: string
	color: string
	value: number | string
}

interface TrendChartBaseProps {
	yearRange: string
	data: ChartData<"line">
	options: ChartOptions<"line">
	footerItems: FooterItem[]
	totalValue?: number | string
	totalLabel?: string
	isEmpty: boolean
	activeLineIdx: number | null
	onIdxSelect?: (idx: number) => void
}

export const TrendChartBase: React.FC<TrendChartBaseProps> = ({
	yearRange,
	data,
	options,
	footerItems,
	totalValue,
	totalLabel = "Total",
	isEmpty,
	activeLineIdx,
	onIdxSelect,
}) => {
	const chartRef = useRef<ChartJS<"line">>(null)
	const activeIdxRef = useRef(activeLineIdx)
	activeIdxRef.current = activeLineIdx

	// Force a visual update when the line index changes
	useEffect(() => {
		const chart = chartRef.current
		if (chart && activeLineIdx !== null) {
			chart.update("none")
		}
	}, [activeLineIdx])

	const chartPlugins = useMemo(
		() => [
			{
				id: "verticalLine",
				afterDatasetsDraw: (chart: ChartJS<"line">) => {
					const lineIdx = activeIdxRef.current

					if (
						lineIdx !== null &&
						lineIdx >= 0 &&
						lineIdx < chart.data.labels!.length
					) {
						const { ctx, chartArea, scales } = chart
						const x = scales.x.getPixelForValue(lineIdx)

						if (Number.isFinite(x)) {
							ctx.save()
							ctx.setLineDash([5, 5])
							ctx.lineWidth = 1.5
							ctx.strokeStyle = "#4f46e5"

							ctx.beginPath()
							ctx.moveTo(x, chartArea.top)
							ctx.lineTo(x, chartArea.bottom)
							ctx.stroke()

							// Triangle indicator at the top
							ctx.fillStyle = "#4f46e5"
							ctx.beginPath()
							ctx.moveTo(x - 4, chartArea.top)
							ctx.lineTo(x + 4, chartArea.top)
							ctx.lineTo(x, chartArea.top + 6)
							ctx.fill()
							ctx.restore()
						}
					}
				},
			},
		],
		[],
	)

	const mergedOptions: ChartOptions<"line"> = {
		...options,
		onClick: (event: ChartEvent, elements: ActiveElement[]) => {
			if (elements.length > 0 && onIdxSelect) {
				onIdxSelect(elements[0].index)
			}
			if (options.onClick) {
				options.onClick(event, elements, chartRef.current!)
			}
		},
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex justify-end mb-2">
				<span className="text-[9px] text-gray-500 font-mono italic">
					{yearRange}
				</span>
			</div>

			<div
				className={`bg-gray-50 rounded-none border border-gray-200 relative p-2 flex-grow min-h-[160px] ${isEmpty ? "flex items-center justify-center" : ""}`}
			>
				{!isEmpty ? (
					<Line
						ref={chartRef}
						data={data}
						options={mergedOptions}
						plugins={chartPlugins}
					/>
				) : (
					<div className="text-[10px] text-gray-400 text-center py-4">
						Start simulation to see trends
					</div>
				)}
			</div>

			<div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-2 pt-2 border-t border-gray-100 px-1">
				{footerItems.map((item, idx) => (
					<div key={idx} className="text-center">
						<div className="flex items-center justify-center gap-1">
							<div
								className="w-1.5 h-1.5 rounded-none"
								style={{ backgroundColor: item.color }}
							/>
							<div className="text-[9px] text-gray-400 whitespace-nowrap">
								{item.label}
							</div>
						</div>
						<div
							className="text-[10px] font-bold"
							style={{ color: item.color }}
						>
							{item.value}
						</div>
					</div>
				))}
				{totalValue !== undefined && (
					<div className="text-center border-l border-gray-100 pl-4 ml-1">
						<div className="text-[9px] text-gray-400 uppercase tracking-tight">
							{totalLabel}
						</div>
						<div className="text-[10px] font-bold text-gray-900">
							{totalValue}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
