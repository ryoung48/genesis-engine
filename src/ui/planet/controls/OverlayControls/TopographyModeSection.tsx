import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import type { ColorMode } from "@/ui/planet/colors"
import type { TopographySubMode } from "./types"

export interface TopographyModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	topographyExpanded: boolean
	setTopographyExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	topographySubMode: TopographySubMode
	setTopographySubMode: (v: TopographySubMode) => void
}

export const TopographyModeSection: React.FC<TopographyModeSectionProps> = ({
	colorMode,
	setColorMode,
	topographyExpanded,
	setTopographyExpanded,
	topographySubMode,
	setTopographySubMode,
}) => {
	if (
		colorMode !== "topography" &&
		colorMode !== "slope" &&
		colorMode !== "eu5Topography"
	) {
		return null
	}
	return (
		<div>
			<button
				type="button"
				onClick={() => setTopographyExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>Topography</span>
				<ChevronIcon
					direction={topographyExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{topographyExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Classification</span>
						<input
							type="radio"
							name="topography-sub"
							checked={topographySubMode === "classification"}
							onChange={() => {
								setTopographySubMode("classification")
								setColorMode("topography")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Slope</span>
						<input
							type="radio"
							name="topography-sub"
							checked={topographySubMode === "slope"}
							onChange={() => {
								setTopographySubMode("slope")
								setColorMode("slope")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
				</div>
			)}
		</div>
	)
}
