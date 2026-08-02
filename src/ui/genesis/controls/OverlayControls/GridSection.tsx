import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import { LabeledSlider } from "@/ui/components/primitives/LabeledSlider"
import { gridSpacingOptions } from "@/ui/genesis/shared/constants"

export interface GridSectionProps {
	gridSpacingExpanded: boolean
	setGridSpacingExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	showGrid: boolean
	setShowGrid: (v: boolean) => void
	gridSpacing: number
	setGridSpacing: (v: number) => void
}

export const GridSection: React.FC<GridSectionProps> = ({
	gridSpacingExpanded,
	setGridSpacingExpanded,
	showGrid,
	setShowGrid,
	gridSpacing,
	setGridSpacing,
}) => {
	return (
		<>
			<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
				<span>Grid Lines</span>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setGridSpacingExpanded((v) => !v)}
						className="flex items-center justify-center w-4 h-4 rounded hover:bg-white/10 transition-colors"
					>
						<ChevronIcon
							direction={gridSpacingExpanded ? "up" : "down"}
							className="h-3 w-3 text-slate-400"
						/>
					</button>
					<input
						type="checkbox"
						checked={showGrid}
						onChange={(e) => setShowGrid(e.target.checked)}
						className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
					/>
				</div>
			</label>
			{gridSpacingExpanded && (
				<div className={showGrid ? "space-y-1.5" : "space-y-1.5 opacity-50"}>
					<LabeledSlider
						label="Grid Spacing"
						value={`${gridSpacing}°`}
						min={0}
						max={gridSpacingOptions.length - 1}
						step={1}
						numericValue={Math.max(0, gridSpacingOptions.indexOf(gridSpacing))}
						onChange={(v) =>
							setGridSpacing(gridSpacingOptions[v] ?? gridSpacingOptions[0])
						}
						disabled={!showGrid}
					/>
				</div>
			)}
		</>
	)
}
