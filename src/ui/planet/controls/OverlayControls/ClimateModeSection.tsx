import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import type { ColorMode } from "@/ui/planet/colors"
import type { ClimateSubMode } from "./types"

export interface ClimateModeSectionProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	climateExpanded: boolean
	setClimateExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	climateSubMode: ClimateSubMode
	setClimateSubMode: (v: ClimateSubMode) => void
	showGdd: boolean
	setShowGdd: (v: boolean) => void
	showGint: boolean
	setShowGint: (v: boolean) => void
	showPet: boolean
	setShowPet: (v: boolean) => void
	showAet: boolean
	setShowAet: (v: boolean) => void
}

/** "Climate" colorMode block (basic/pasta/koppen submodes + GDD/GInt/PET/AET
 * overlay toggles). Distinct from ClimateToggleSection, which handles the
 * separate temperature/rainfall/wind colorMode header block. */
export const ClimateModeSection: React.FC<ClimateModeSectionProps> = ({
	colorMode,
	setColorMode,
	climateExpanded,
	setClimateExpanded,
	climateSubMode,
	setClimateSubMode,
	showGdd,
	setShowGdd,
	showGint,
	setShowGint,
	showPet,
	setShowPet,
	showAet,
	setShowAet,
}) => {
	if (
		colorMode !== "climate" &&
		colorMode !== "pastaClimate" &&
		colorMode !== "koppenClimate" &&
		colorMode !== "realPastaClimate" &&
		colorMode !== "realKoppenClimate" &&
		colorMode !== "eu5Climate"
	) {
		return null
	}
	return (
		<div>
			<button
				type="button"
				onClick={() => setClimateExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>Climate</span>
				<ChevronIcon
					direction={climateExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{climateExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Basic</span>
						<input
							type="radio"
							name="climate-sub"
							checked={climateSubMode === "basic"}
							onChange={() => {
								setClimateSubMode("basic")
								setColorMode("climate")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Pasta</span>
						<input
							type="radio"
							name="climate-sub"
							checked={climateSubMode === "pasta"}
							onChange={() => {
								setClimateSubMode("pasta")
								setColorMode("pastaClimate")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Koppen</span>
						<input
							type="radio"
							name="climate-sub"
							checked={climateSubMode === "koppen"}
							onChange={() => {
								setClimateSubMode("koppen")
								setColorMode("koppenClimate")
							}}
							className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<div className="border-t border-white/10" />
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>GDD</span>
						<input
							type="checkbox"
							checked={showGdd}
							onChange={(e) => setShowGdd(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>GInt</span>
						<input
							type="checkbox"
							checked={showGint}
							onChange={(e) => setShowGint(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>PET</span>
						<input
							type="checkbox"
							checked={showPet}
							onChange={(e) => setShowPet(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>AET</span>
						<input
							type="checkbox"
							checked={showAet}
							onChange={(e) => setShowAet(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
				</div>
			)}
		</div>
	)
}
