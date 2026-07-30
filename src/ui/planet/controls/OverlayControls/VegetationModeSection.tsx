import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import type { ColorMode } from "@/ui/planet/colors"
import type { VegetationSubMode } from "./types"

export interface VegetationModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	vegetationExpanded: boolean
	setVegetationExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	vegetationSubMode: VegetationSubMode
	setVegetationSubMode: (v: VegetationSubMode) => void
}

export const VegetationModeSection: React.FC<VegetationModeSectionProps> = ({
	colorMode,
	setColorMode,
	vegetationExpanded,
	setVegetationExpanded,
	vegetationSubMode,
	setVegetationSubMode,
}) => {
	if (
		colorMode !== "vegetation" &&
		colorMode !== "vegetationMaps" &&
		colorMode !== "vegetationSatellite" &&
		colorMode !== "eu5Vegetation"
	) {
		return null
	}
	return (
		<div>
			<button
				type="button"
				onClick={() => setVegetationExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>Vegetation</span>
				<ChevronIcon
					direction={vegetationExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{vegetationExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Base</span>
						<input
							type="radio"
							name="vegetation-sub"
							checked={vegetationSubMode === "base"}
							onChange={() => {
								setVegetationSubMode("base")
								setColorMode("vegetation")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Maps</span>
						<input
							type="radio"
							name="vegetation-sub"
							checked={vegetationSubMode === "maps"}
							onChange={() => {
								setVegetationSubMode("maps")
								setColorMode("vegetationMaps")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Satellite</span>
						<input
							type="radio"
							name="vegetation-sub"
							checked={vegetationSubMode === "satellite"}
							onChange={() => {
								setVegetationSubMode("satellite")
								setColorMode("vegetationSatellite")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
				</div>
			)}
		</div>
	)
}
