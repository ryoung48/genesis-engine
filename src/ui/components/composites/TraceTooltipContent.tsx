import type { ReactNode } from "react"

export interface TraceTooltipEntry {
	value: number
	description: string
	// [JUSTIFICATION] Only entries that flag a special condition replace their dot with an icon.
	icon?: ReactNode
}

export interface TraceTooltipFooterEntry {
	colorValue: number
	description: string
	valueLabel: string
}

interface TraceTooltipContentProps {
	title: string
	trace: TraceTooltipEntry[]
	// [JUSTIFICATION] Callers can use the default signed integer formatter.
	formatValue?: (value: number) => string
	finalLabel: string
	finalValue: number
	// [JUSTIFICATION] Only temperature ranges need extra footer rows.
	footerEntries?: TraceTooltipFooterEntry[]
	// [JUSTIFICATION] Empty traces normally use the shared default message.
	emptyMessage?: string
	// [JUSTIFICATION] Temperature traces reverse the default good/bad polarity.
	colorScheme?: "signed" | "temperature"
	// [JUSTIFICATION] Treasury traces group accounting rows in supplied order; other traces rank values.
	order?: "value" | "provided"
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

interface MarkerProps {
	value: number
	colorScheme: "signed" | "temperature"
	// [JUSTIFICATION] Rows without a special condition show the plain dot.
	icon?: ReactNode
}

function Marker({ value, colorScheme, icon }: MarkerProps) {
	return (
		<span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center">
			{icon ?? (
				<span
					className={`h-1.5 w-1.5 rounded-full ${dotColor(value, colorScheme)}`}
				/>
			)}
		</span>
	)
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
	order = "value",
}: TraceTooltipContentProps) {
	const sorted =
		order === "provided" ? trace : [...trace].sort((a, b) => b.value - a.value)
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
							<Marker
								value={entry.value}
								colorScheme={colorScheme}
								icon={entry.icon}
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
							<Marker value={entry.colorValue} colorScheme={colorScheme} />
							<span className="flex-1">{entry.description}</span>
							<span className="font-mono">{entry.valueLabel}</span>
						</div>
					))}
				</div>
			) : null}
			<div className="flex items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[10px] font-medium text-slate-700">
				<Marker value={finalValue} colorScheme={colorScheme} />
				<span className="flex-1">{finalLabel}</span>
				<span className="font-mono">{formatValue(finalValue)}</span>
			</div>
		</div>
	)
}
