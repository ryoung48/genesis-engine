import React from "react"
import { uiTokens } from "@/ui/components/tokens"

interface WikiPageHeaderProps {
	title: React.ReactNode
	meta: React.ReactNode
	action?: React.ReactNode
	/** Optional trailing content on the meta row, opposite `meta` (e.g. the
	 * planet navigator's reset/seed/focus button cluster). */
	metaAction?: React.ReactNode
}

/** Hero `<h1>` + type/breadcrumb meta row shared by the nation/organization
 * /war/planet-navigator wiki page headers. */
export const WikiPageHeader: React.FC<WikiPageHeaderProps> = ({
	title,
	meta,
	action,
	metaAction,
}) => (
	<div className="border-b border-slate-200 pb-3">
		<div className="flex items-start gap-2">
			<h1 className={`min-w-0 flex-1 text-slate-950 ${uiTokens.type.hero}`}>
				{title}
			</h1>
			{action ? <div className="flex items-center gap-1 pt-1">{action}</div> : null}
		</div>
		<div className="mt-0.5 flex items-center justify-between gap-3">
			<div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
				{meta}
			</div>
			{metaAction ? (
				<div className="flex shrink-0 items-center gap-1.5">{metaAction}</div>
			) : null}
		</div>
	</div>
)
