import React from "react"

interface SeriesBarsProps {
	values: readonly number[]
	labels: readonly string[]
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
}

function defaultFormatValue(value: number): string {
	return value.toFixed(0)
}

export const SeriesBars: React.FC<SeriesBarsProps> = ({
	values,
	labels,
	label,
	colorForValue,
	activeIndex = -1,
	summary,
	formatValue = defaultFormatValue,
	tooltipLabel,
	showValues = false,
}) => {
	const max = Math.max(...values.map(Math.abs), 0.001)
	const min = Math.min(...values, 0)
	const hasNegativeValues = min < 0
	const range = hasNegativeValues ? max - min : max
	const zeroY = hasNegativeValues ? max / range : 1

	return (
		<div>
			<div className="mb-2 flex items-baseline justify-between">
				<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
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
							? `calc(${(1 - zeroY) * 100 + barHeight * zeroY * 100}% + 2px)`
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
									className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-mono text-[6px] leading-none ${isActive ? "text-white" : "text-slate-500"}`}
									style={{ bottom: labelBottom }}
								>
									{valueLabel}
								</span>
							)}
							{value >= 0 ? (
								<div
									className={`absolute right-0 left-0 rounded-t-[1px] transition-all ${isActive ? "opacity-100" : "opacity-70"}`}
									style={{
										height: `${barHeight * zeroY * 100}%`,
										bottom: `${(1 - zeroY) * 100}%`,
										backgroundColor: colorForValue(value, index),
									}}
								/>
							) : (
								<div
									className={`absolute right-0 left-0 rounded-b-[1px] transition-all ${isActive ? "opacity-100" : "opacity-70"}`}
									style={{
										height: `${barHeight * (1 - zeroY) * 100}%`,
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
						className={`flex-1 text-center text-[7px] leading-none ${index === activeIndex ? "font-bold text-slate-200" : "text-slate-600"}`}
					>
						{itemLabel}
					</span>
				))}
			</div>
		</div>
	)
}
