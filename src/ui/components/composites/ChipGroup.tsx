import React from "react"
import { Swatch } from "@/ui/components/primitives/Swatch"

interface ChipGroupProps {
	label: string
	count: number
	color?: string | null
	striped?: boolean
	children: React.ReactNode
}

/** "Label (count)" small-caps header + wrapped list of chips -- shared shape
 * for organization member groups and war participant sides. */
export const ChipGroup: React.FC<ChipGroupProps> = ({
	label,
	count,
	color,
	striped,
	children,
}) => (
	<div className="py-1.5 first:pt-0 last:pb-0">
		<div className="mb-0.5 flex items-center gap-1">
			{color ? (
				<Swatch color={color} striped={striped} stripeBackground="transparent" />
			) : null}
			<span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-500">
				{label} ({count})
			</span>
		</div>
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-slate-700">
			{children}
		</div>
	</div>
)
