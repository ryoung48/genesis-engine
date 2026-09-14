export interface TraceTooltipEntry {
	value: number
	description: string
}

export interface TraceTooltipFooterEntry {
	colorValue: number
	description: string
	valueLabel: string
}

interface TraceTooltipContentProps {
	title: string
	trace: TraceTooltipEntry[]
	/** Formats each entry's signed value (and the final total) -- e.g.
	 * `(v) => \`${v > 0 ? "+" : ""}${v}\`` for a plain DM, or with a "°C"
	 * suffix for a temperature delta. Defaults to a plain signed integer. */
	formatValue?: (value: number) => string
	finalLabel: string
	finalValue: number
	/** [JUSTIFICATION] Only temperature ranges need high/low values between
	 * their factor breakdown and final delta; other trace tooltips do not. */
	footerEntries?: TraceTooltipFooterEntry[]
	emptyMessage?: string
	/** "signed" (default): positive is good (green), negative is bad (red) --
	 * for game modifiers like tidal-lock DM. "temperature": positive is hot
	 * (red), negative is cold (blue) -- for temperature deltas, where the
	 * good/bad polarity doesn't apply. */
	colorScheme?: "signed" | "temperature"
}

const dotColorBySchemeAndSign: Record<
	NonNullable<TraceTooltipContentProps["colorScheme"]>,
	{ positive: string; negative: string; zero: string }
> = {
	signed: {
		positive: "bg-emerald-500",
		negative: "bg-rose-500",
		zero: "bg-slate-300",
	},
	temperature: {
		positive: "bg-rose-500",
		negative: "bg-sky-500",
		zero: "bg-slate-300",
	},
}

const dotColor = (value: number, colorScheme: "signed" | "temperature") => {
	const colors = dotColorBySchemeAndSign[colorScheme]
	return value > 0 ? colors.positive : value < 0 ? colors.negative : colors.zero
}

const defaultFormatValue = (value: number) => `${value > 0 ? "+" : ""}${value}`

export function TraceTooltipContent({
	title,
	trace,
	formatValue = defaultFormatValue,
	finalLabel,
	finalValue,
	footerEntries = [],
	emptyMessage = "No adjustments applied",
	colorScheme = "signed",
}: TraceTooltipContentProps) {
	const sorted = [...trace].sort((a, b) => b.value - a.value)
	return (
		<div className="w-52 space-y-2">
			<div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
				{title}
			</div>
			{sorted.length > 0 ? (
				<div className="space-y-1">
					{sorted.map((entry, idx) => (
						<div
							key={`${entry.description}:${idx}`}
							className="flex items-center gap-1.5 text-[10px] text-slate-600"
						>
							<span
								className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(entry.value, colorScheme)}`}
							/>
							<span className="flex-1">{entry.description}</span>
							<span className="font-mono">{formatValue(entry.value)}</span>
						</div>
					))}
				</div>
			) : (
				<div className="text-[10px] text-slate-400">{emptyMessage}</div>
			)}
			{footerEntries.length > 0 ? (
				<div className="space-y-1 border-t border-slate-100 pt-1.5">
					{footerEntries.map((entry) => (
						<div
							key={entry.description}
							className="flex items-center gap-1.5 text-[10px] text-slate-600"
						>
							<span
								className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(entry.colorValue, colorScheme)}`}
							/>
							<span className="flex-1">{entry.description}</span>
							<span className="font-mono">{entry.valueLabel}</span>
						</div>
					))}
				</div>
			) : null}
			<div className="flex items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[10px] font-medium text-slate-700">
				<span
					className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(finalValue, colorScheme)}`}
				/>
				<span className="flex-1">{finalLabel}</span>
				<span className="font-mono">{formatValue(finalValue)}</span>
			</div>
		</div>
	)
}
