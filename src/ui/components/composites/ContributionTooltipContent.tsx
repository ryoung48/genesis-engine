interface ContributionTooltipItem {
	label: string
	value: string
	tone?: "neutral" | "warm" | "cool"
}

interface ContributionTooltipContentProps {
	title: string
	items: ContributionTooltipItem[]
}

const toneClassName: Record<
	NonNullable<ContributionTooltipItem["tone"]>,
	string
> = {
	neutral: "bg-slate-500",
	warm: "bg-amber-500",
	cool: "bg-sky-500",
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
							className={`h-1.5 w-1.5 rounded-full ${toneClassName[item.tone ?? "neutral"]}`}
						/>
						<span className="font-medium">{item.label}</span>
						<span className="ml-auto font-mono">{item.value}</span>
					</div>
				))}
			</div>
		</div>
	)
}
