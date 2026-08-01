import React from "react"
import { cx } from "@/ui/components/lib"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import { uiTokens } from "@/ui/components/tokens"

interface DisclosureButtonProps {
	label: React.ReactNode
	expanded?: boolean
	direction?: "down" | "back"
	trailing?: React.ReactNode
	onClick: () => void
	className?: string
}

/** Chevron-header disclosure toggle ("down" = rotating chevron that flips
 * open/closed) or a back-navigation button ("back" = static left chevron,
 * `expanded`/rotation ignored) -- shared by every collapsible section header
 * and drill-down "Back" button across the wiki/preview UI. */
export const DisclosureButton: React.FC<DisclosureButtonProps> = ({
	label,
	expanded = false,
	direction = "down",
	trailing,
	onClick,
	className,
}) => {
	if (direction === "back") {
		return (
			<button
				type="button"
				onClick={onClick}
				className={cx(
					"flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700",
					uiTokens.type.control,
					className,
				)}
			>
				<ChevronIcon
					direction="up"
					className="h-2.5 w-2.5 -rotate-90"
					width={10}
					height={10}
				/>
				{label}
			</button>
		)
	}
	return (
		<button
			type="button"
			onClick={onClick}
			className={cx(
				"flex w-full items-center justify-between gap-3 text-left",
				className,
			)}
		>
			<span className={cx(uiTokens.type.control, "text-slate-500")}>
				{label}
			</span>
			<div className="flex items-center gap-2">
				{trailing}
				<ChevronIcon
					width={12}
					height={12}
					className={cx(
						"text-slate-400 transition-transform",
						expanded ? "rotate-180" : "",
					)}
				/>
			</div>
		</button>
	)
}
