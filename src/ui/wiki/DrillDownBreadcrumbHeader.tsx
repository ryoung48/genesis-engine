import React from "react"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
import { uiTokens } from "@/ui/components/tokens"

interface DrillDownBreadcrumbHeaderProps {
	title: string
	trailingValue: React.ReactNode
	onBack: () => void
}

/** Back button + title + trailing mono value -- the drill-down breadcrumb
 * header repeated by GenerationPanel's Timing breakdown panels (post,
 * compute-routes, "other items"). */
export const DrillDownBreadcrumbHeader: React.FC<
	DrillDownBreadcrumbHeaderProps
> = ({ title, trailingValue, onBack }) => (
	<div className="flex items-center gap-2">
		<DisclosureButton label="Back" direction="back" onClick={onBack} />
		<div className={`${uiTokens.type.controlWide} text-slate-500`}>
			{title}
		</div>
		<span className="ml-auto font-mono text-[10px] text-slate-400">
			{trailingValue}
		</span>
	</div>
)
