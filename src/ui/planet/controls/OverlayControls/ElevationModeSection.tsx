import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import type { ColorMode } from "@/ui/planet/colors"

export interface ElevationModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	elevationExpanded: boolean
	setElevationExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	elevationSubMode: "colored" | "grayscale"
	setElevationSubMode: (v: "colored" | "grayscale") => void
}

export const ElevationModeSection: React.FC<ElevationModeSectionProps> = ({
	colorMode,
	setColorMode,
	elevationExpanded,
	setElevationExpanded,
	elevationSubMode,
	setElevationSubMode,
}) => {
	if (colorMode !== "terrain" && colorMode !== "landHeightmap") return null
	return (
		<div>
			<button
				type="button"
				onClick={() => setElevationExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>Elevation</span>
				<ChevronIcon
					direction={elevationExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{elevationExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Colored</span>
						<input
							type="radio"
							name="elevation-sub"
							checked={elevationSubMode === "colored"}
							onChange={() => {
								setElevationSubMode("colored")
								setColorMode("terrain")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Grayscale</span>
						<input
							type="radio"
							name="elevation-sub"
							checked={elevationSubMode === "grayscale"}
							onChange={() => {
								setElevationSubMode("grayscale")
								setColorMode("landHeightmap")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
				</div>
			)}
		</div>
	)
}
