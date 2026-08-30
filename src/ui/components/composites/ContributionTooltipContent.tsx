import { Slider } from "@/ui/components/primitives/Slider"
import { uiChartPalette } from "@/ui/components/tokens"

interface ContributionTooltipItemEditor {
	value: number
	min: number
	max: number
	step: number
	set: (value: number) => void
}

interface ContributionTooltipItem {
	label: string
	value: string
	tone?: "neutral" | "warm" | "cool"
	editor?: ContributionTooltipItemEditor
}

interface ContributionTooltipContentProps {
	title?: string
	items: ContributionTooltipItem[]
}

export function ContributionTooltipContent({
	title,
	items,
}: ContributionTooltipContentProps) {
	return (
		<div className="w-52 space-y-3 px-1 pt-0.5 pb-2">
			{title ? (
				<div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
					{title}
				</div>
			) : null}
			<div className="space-y-2">
				{items.map((item) =>
					item.editor ? (
						<Slider
							key={item.label}
							label={item.label}
							value={item.value}
							min={item.editor.min}
							max={item.editor.max}
							step={item.editor.step}
							inputValue={item.editor.value}
							onChange={item.editor.set}
						/>
					) : (
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
					),
				)}
			</div>
		</div>
	)
}
