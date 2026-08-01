import React from "react"
import { cx } from "@/ui/components/lib"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"

interface CollapsibleSectionHeaderProps {
	title: React.ReactNode
	expanded: boolean
	onToggle: () => void
	extraControl?: React.ReactNode
	className?: string
}

export const CollapsibleSectionHeader: React.FC<
	CollapsibleSectionHeaderProps
> = ({ title, expanded, onToggle, extraControl, className }) => (
	<div className={cx("flex items-center justify-between gap-3", className)}>
		<button
			type="button"
			onClick={onToggle}
			className="flex flex-1 items-center justify-between gap-3 text-[11px] font-medium text-slate-200 transition-colors hover:text-slate-100"
		>
			<span>{title}</span>
			{!extraControl && (
				<ChevronIcon
					direction={expanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			)}
		</button>
		{extraControl}
	</div>
)
