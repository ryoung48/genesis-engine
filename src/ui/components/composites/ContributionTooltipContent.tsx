import { uiChartPalette } from "@/ui/components/tokens"

interface ContributionTooltipItem {
	label: string
	value: string
	tone?: "neutral" | "warm" | "cool"
}

interface ContributionTooltipContentProps {
	title: string
	items: ContributionTooltipItem[]
}

export function ContributionTooltipContent({
	title,
	items,
}: ContributionTooltipContentProps) {
	return (
		<div className="w-52 space-y-2">
			<div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
				{title}
			</div>
			<div className="space-y-1">
				{items.map((item) => (
					<div
						key={`${item.label}:${item.value}`}
						className="flex items-center gap-1.5 text-[10px] text-slate-600"
					>
						<span
							className={`h-1.5 w-1.5 rounded-full ${uiChartPalette.tone[item.tone ?? "neutral"]}`}
						/>
						<span className="font-medium">{item.label}</span>
						<span className="ml-auto font-mono">{item.value}</span>
					</div>
				))}
			</div>
		</div>
	)
}
