import type React from "react"
import { cx } from "@/ui/components/lib"
import { uiTokens } from "@/ui/components/tokens"

interface ProgressBarProps {
	label: React.ReactNode
	percent: number
	className?: string
}

/** Label/percent row over a fill track -- the canonical "generating..."
 * indicator, used by any panel that reports worker progress. */
export const ProgressBar: React.FC<ProgressBarProps> = ({
	label,
	percent,
	className,
}) => {
	const clamped = Math.max(0, Math.min(100, percent))
	return (
		<div className={cx("space-y-1", className)}>
			<div
				className={`flex items-center justify-between ${uiTokens.type.label} ${uiTokens.text.subtle}`}
			>
				<span>{label}</span>
				<span>{Math.round(clamped)}%</span>
			</div>
			<div
				className={`h-1.5 overflow-hidden ${uiTokens.radius.pill} ${uiTokens.surface.panelMuted}`}
			>
				<div
					className={`h-full ${uiTokens.radius.pill} bg-slate-900 transition-all duration-200`}
					style={{ width: `${clamped}%` }}
				/>
			</div>
		</div>
	)
}
