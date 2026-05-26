import React from "react"
import { cx } from "../lib"

type TooltipPosition = "top" | "bottom"
type TooltipAlign = "start" | "center" | "end"

const positionClassName: Record<
	TooltipPosition,
	Record<TooltipAlign, string>
> = {
	top: {
		start: "bottom-full left-0 mb-1.5",
		center: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
		end: "bottom-full right-0 mb-1.5",
	},
	bottom: {
		start: "top-full left-0 mt-1.5",
		center: "top-full left-1/2 -translate-x-1/2 mt-1.5",
		end: "top-full right-0 mt-1.5",
	},
}

interface TooltipProps {
	content: string
	position?: TooltipPosition
	align?: TooltipAlign
	className?: string
	children: React.ReactNode
}

export const Tooltip: React.FC<TooltipProps> = ({
	content,
	position = "bottom",
	align = "start",
	className,
	children,
}) => (
	<div className="group relative inline-flex items-center">
		{children}
		<div
			className={cx(
				"pointer-events-none absolute z-20 w-max max-w-44 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] normal-case leading-[1.35] text-slate-500 opacity-0 shadow-lg transition-opacity group-hover:opacity-100",
				positionClassName[position][align],
				className,
			)}
		>
			{content}
		</div>
	</div>
)
