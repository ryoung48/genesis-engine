import React from "react"
import { cx } from "@/ui/components/lib"

interface ToggleChipProps {
	active: boolean
	onClick: () => void
	children: React.ReactNode
	className?: string
}

/** Single selectable chip button -- shares the active/idle tone treatment
 * used by SegmentedControl's own buttons, for standalone (non-grouped)
 * selectable chips like tide-lock options or era presets. */
export const ToggleChip: React.FC<ToggleChipProps> = ({
	active,
	onClick,
	children,
	className,
}) => (
	<button
		type="button"
		onClick={onClick}
		className={cx(
			"rounded-lg border px-2.5 py-2 text-left transition-all",
			active
				? "border-slate-900 bg-slate-900 text-white"
				: "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
			className,
		)}
	>
		{children}
	</button>
)
