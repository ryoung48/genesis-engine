import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"

export interface PoliticalSectionProps {
	politicalExpanded: boolean
	setPoliticalExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	showNationHierarchy: boolean
	setShowNationHierarchy: (v: boolean) => void
	showLandBorders: boolean
	setShowLandBorders: (v: boolean) => void
	showNationBorders: boolean
	setShowNationBorders: (v: boolean) => void
}

export const PoliticalSection: React.FC<PoliticalSectionProps> = ({
	politicalExpanded,
	setPoliticalExpanded,
	showNationHierarchy,
	setShowNationHierarchy,
	showLandBorders,
	setShowLandBorders,
	showNationBorders,
	setShowNationBorders,
}) => {
	return (
		<div>
			<button
				type="button"
				onClick={() => setPoliticalExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>Political</span>
				<ChevronIcon
					direction={politicalExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{politicalExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Hierarchy</span>
						<input
							type="checkbox"
							checked={showNationHierarchy}
							onChange={(e) => setShowNationHierarchy(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Land Borders</span>
						<input
							type="checkbox"
							checked={showLandBorders}
							onChange={(e) => setShowLandBorders(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Borders</span>
						<input
							type="checkbox"
							checked={showNationBorders}
							onChange={(e) => setShowNationBorders(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
				</div>
			)}
		</div>
	)
}
