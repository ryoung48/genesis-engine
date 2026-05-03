import React from "react"
import { IconButton, SegmentedControl, Surface, uiTokens } from "@/components"
import { HeatmapChart } from "@/components/composites/charts/HeatmapChart"
import type { useEbmPreview } from "@/hooks/useEbmPreview"
import { temperatureColor } from "@/planet/colors"
import {
	formatTemperature,
	rgbToCss,
	type UnitSystem,
} from "@/planet/screen/shared/ui-format"
import {
	GENERATION_PREVIEW_TABS,
	type GenerationPreviewTab,
} from "./screen/generation/generation-preview"

type GenerationPreview = ReturnType<typeof useEbmPreview>

interface ClimatePreviewOverlayProps {
	preview: GenerationPreview
	activeTab: GenerationPreviewTab
	unitSystem: UnitSystem
	onSelectTab: (tab: GenerationPreviewTab) => void
	onClose: () => void
}

function buildPreviewChartProps(
	preview: GenerationPreview,
	activeTab: GenerationPreviewTab,
	unitSystem: UnitSystem,
) {
	switch (activeTab) {
		case "insolation":
			return {
				matrix: preview.insolation,
				colorForValue: preview.insolColorFn,
				legendTitle: "Insolation",
				formatLegendValue: (value: number) => `${value.toFixed(0)} W/m²`,
				tooltipLabel: ({
					rowValue,
					columnValue,
					value,
				}: {
					rowValue: number
					columnValue: number
					value: number
				}) =>
					`Lat ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${value.toFixed(1)} W/m²`,
			}
		case "daylight":
			return {
				matrix: preview.daylight,
				colorForValue: preview.daylightColorFn,
				legendTitle: "Daylight",
				formatLegendValue: (value: number) => `${value.toFixed(1)} hrs`,
				tooltipLabel: ({
					rowValue,
					columnValue,
					value,
				}: {
					rowValue: number
					columnValue: number
					value: number
				}) =>
					`Lat ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${value.toFixed(1)} hrs`,
			}
		default:
			return {
				matrix: preview.heat,
				colorForValue: (value: number) => rgbToCss(temperatureColor(value)),
				legendTitle: "Temperature",
				formatLegendValue: (value: number) =>
					formatTemperature(value, unitSystem, 1, { compact: true }),
				tooltipLabel: ({
					rowValue,
					columnValue,
					value,
				}: {
					rowValue: number
					columnValue: number
					value: number
				}) =>
					`Lat ${rowValue.toFixed(1)}°, Day ${columnValue + 1}: ${formatTemperature(value, unitSystem, 1, { compact: true })}`,
			}
	}
}

export const ClimatePreviewOverlay: React.FC<ClimatePreviewOverlayProps> = ({
	preview,
	activeTab,
	unitSystem,
	onSelectTab,
	onClose,
}) => {
	const chartProps = buildPreviewChartProps(preview, activeTab, unitSystem)

	return (
		<div className="absolute inset-0 z-20 flex h-full flex-col bg-slate-50 text-slate-900">
			<div className="flex items-center gap-3 border-b border-slate-200 bg-white/70 px-5 py-3">
				<SegmentedControl
					options={GENERATION_PREVIEW_TABS.map(([value, label]) => ({
						value,
						label,
					}))}
					value={activeTab}
					onChange={onSelectTab}
					tone="panel"
					size="md"
				/>
				<div className="ml-auto flex items-center gap-3">
					<Surface
						tone="panelAccent"
						borderTone="default"
						radius="md"
						shadow="sm"
						padding="md"
						className="flex items-center gap-2 px-3 py-2 text-right"
					>
						<div className={`${uiTokens.type.control} text-slate-500`}>
							Avg Temp
						</div>
						<div className="font-mono text-sm text-slate-900">
							{formatTemperature(preview.avgTemp, unitSystem, 1, {
								compact: true,
							})}
						</div>
					</Surface>
					<IconButton
						type="button"
						onClick={onClose}
						tone="panel"
						shape="rounded"
						title="Close climate preview"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</IconButton>
				</div>
			</div>
			<div className="min-h-0 flex-1 px-5 py-5">
				<HeatmapChart
					matrix={chartProps.matrix}
					rowValues={preview.lats}
					columnValues={preview.sampledDays}
					columnLabels={preview.dayLabels}
					colorForValue={chartProps.colorForValue}
					datasetLabel={(lat: number) => `Lat ${lat.toFixed(1)}°`}
					rowTickLabel={(lat: number) => `${lat.toFixed(0)}°`}
					tooltipLabel={chartProps.tooltipLabel}
					legendTitle={chartProps.legendTitle}
					formatLegendValue={chartProps.formatLegendValue}
					xAxisTitle="Day of Year"
					yAxisTitle="Latitude"
					fullHeight={true}
				/>
			</div>
		</div>
	)
}
