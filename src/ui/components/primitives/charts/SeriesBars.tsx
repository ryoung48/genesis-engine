import React from "react"
import { uiTokens } from "@/ui/components/tokens"

interface SeriesBarsProps {
	values: readonly number[]
	labels: readonly string[]
	subLabels?: readonly string[]
	label: string
	colorForValue: (value: number, index: number) => string
	activeIndex?: number
	summary?: string
	formatValue?: (value: number) => string
	tooltipLabel?: (params: {
		label: string
		value: number
		index: number
	}) => string
	showValues?: boolean
	// [JUSTIFICATION] Most charts sit on the dark hover panel; light wiki cards opt in.
	surface?: SeriesBarsSurface
}

type SeriesBarsSurface = "overlay" | "panel"

const surfaceClassName: Record<
	SeriesBarsSurface,
	{
		value: string
		activeValue: string
		label: string
		activeLabel: string
		subLabel: string
		activeBar: string
	}
> = {
	overlay: {
		value: "text-slate-500",
		activeValue: "text-white",
		label: "text-slate-600",
		activeLabel: "font-bold text-slate-200",
		subLabel: "text-slate-500",
		activeBar: "",
	},
	panel: {
		value: "text-slate-400",
		activeValue: "font-bold text-slate-900",
		label: "text-slate-400",
		activeLabel: "font-bold text-slate-900",
		subLabel: "text-slate-400",
		activeBar: "ring-1 ring-slate-900/60",
	},
}

function defaultFormatValue(value: number): string {
	return value.toFixed(0)
}

export const SeriesBars: React.FC<SeriesBarsProps> = ({
	values,
	labels,
	subLabels,
	label,
	colorForValue,
	activeIndex = -1,
	summary,
	formatValue = defaultFormatValue,
	tooltipLabel,
	showValues = false,
	surface = "overlay",
}) => {
	const tone = surfaceClassName[surface]
	const maxPositive = Math.max(...values, 0.001)
	const maxNegative = Math.max(...values.map((v) => -v), 0)
	const hasNegativeValues = maxNegative > 0
	const range = maxPositive + maxNegative
	const zeroY = hasNegativeValues ? maxPositive / range : 1

	return (
		<div>
			<div className="mb-2 flex items-baseline justify-between">
				<span className={`${uiTokens.type.labelWide} text-slate-400`}>
					{label}
				</span>
				<span className="font-mono text-[9px] text-slate-500">{summary}</span>
			</div>
			<div className="relative flex h-7 gap-px">
				{hasNegativeValues && (
					<div
						className="absolute right-0 left-0 border-t border-slate-500/30"
						style={{ top: `${zeroY * 100}%` }}
					/>
				)}
				{values.map((value, index) => {
					const barHeight = Math.abs(value) / range
					const isActive = index === activeIndex
					const valueLabel = formatValue(value)
					const labelBottom =
						value >= 0
							? `calc(${(1 - zeroY) * 100 + barHeight * 100}% + 2px)`
							: `calc(${(1 - zeroY) * 100}% + 2px)`
					const itemLabel = labels[index] ?? `${index + 1}`

					return (
						<div
							key={`${itemLabel}-${index}`}
							className="relative h-full flex-1"
							title={
								tooltipLabel
									? tooltipLabel({ label: itemLabel, value, index })
									: `${itemLabel}: ${valueLabel}`
							}
						>
							{showValues && (
								<span
									className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-mono text-[6px] leading-none ${isActive ? tone.activeValue : tone.value}`}
									style={{ bottom: labelBottom }}
								>
									{valueLabel}
								</span>
							)}
							{value >= 0 ? (
								<div
									className={`absolute right-0 left-0 rounded-t-[1px] transition-all ${isActive ? `opacity-100 ${tone.activeBar}` : "opacity-70"}`}
									style={{
										height: `${barHeight * 100}%`,
										bottom: `${(1 - zeroY) * 100}%`,
										backgroundColor: colorForValue(value, index),
									}}
								/>
							) : (
								<div
									className={`absolute right-0 left-0 rounded-b-[1px] transition-all ${isActive ? `opacity-100 ${tone.activeBar}` : "opacity-70"}`}
									style={{
										height: `${barHeight * 100}%`,
										top: `${zeroY * 100}%`,
										backgroundColor: colorForValue(value, index),
									}}
								/>
							)}
						</div>
					)
				})}
			</div>
			<div className="mt-px flex gap-px">
				{labels.map((itemLabel, index) => (
					<span
						key={`${itemLabel}-${index}`}
						className={`flex-1 text-center text-[7px] leading-none ${index === activeIndex ? tone.activeLabel : tone.label}`}
					>
						{itemLabel}
					</span>
				))}
			</div>
			{subLabels && (
				<div className="mt-px flex gap-px">
					{subLabels.map((subLabel, index) => (
						<span
							key={`sub-${subLabel}-${index}`}
							className={`flex-1 text-center text-[7px] leading-none ${index === activeIndex ? tone.activeLabel : tone.subLabel}`}
						>
							{subLabel}
						</span>
					))}
				</div>
			)}
		</div>
	)
}
