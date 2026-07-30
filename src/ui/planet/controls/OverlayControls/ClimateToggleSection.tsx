import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import type { ColorMode } from "@/ui/planet/colors"

export interface ClimateToggleSectionProps {
	colorMode: ColorMode
	baseColorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	climateExpanded: boolean
	setClimateExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
}

const VISIBLE_COLOR_MODES: ColorMode[] = [
	"temperature",
	"realTemperature",
	"temperatureDiff",
	"realDtr",
	"dtrDiff",
	"precipitation",
	"realPrecipitation",
	"precipitationDiff",
	"humidity",
	"realHumidity",
	"humidityDiff",
	"wind",
	"dtr",
]

/** Temperature/Rainfall/Wind toggle block shown above the "Temperature",
 * "Wind", or "Rainfall" colorMode header (also covers the "misery" base
 * mode). Distinct from ClimateModeSection, which handles the separate
 * "Climate" colorMode (basic/pasta/koppen + GDD/GInt/PET/AET). */
export const ClimateToggleSection: React.FC<ClimateToggleSectionProps> = ({
	colorMode,
	baseColorMode,
	setColorMode,
	climateExpanded,
	setClimateExpanded,
}) => {
	if (!VISIBLE_COLOR_MODES.includes(colorMode) && baseColorMode !== "misery") {
		return null
	}
	return (
		<div>
			<button
				type="button"
				onClick={() => setClimateExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>
					{colorMode === "temperature" ||
					colorMode === "realTemperature" ||
					colorMode === "temperatureDiff" ||
					colorMode === "dtr" ||
					colorMode === "realDtr" ||
					colorMode === "dtrDiff" ||
					baseColorMode === "misery"
						? "Temperature"
						: colorMode === "wind"
							? "Wind"
							: "Rainfall"}
				</span>
				<ChevronIcon
					direction={climateExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{climateExpanded && (
				<div className="mt-1.5 space-y-1.5">
					{(colorMode === "precipitation" ||
						colorMode === "realPrecipitation" ||
						colorMode === "precipitationDiff" ||
						colorMode === "humidity" ||
						colorMode === "realHumidity" ||
						colorMode === "humidityDiff") && (
						<div className="flex items-center gap-4 text-[11px] font-medium">
							<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
								<input
									type="radio"
									name="rain-sub"
									checked={baseColorMode === "precipitation"}
									onChange={() => setColorMode("precipitation")}
									className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
								Precipitation
							</label>
							<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
								<input
									type="radio"
									name="rain-sub"
									checked={baseColorMode === "humidity"}
									onChange={() => setColorMode("humidity")}
									className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
								Humidity
							</label>
						</div>
					)}
					{(colorMode === "temperature" ||
						colorMode === "realTemperature" ||
						colorMode === "temperatureDiff" ||
						colorMode === "dtr" ||
						colorMode === "realDtr" ||
						colorMode === "dtrDiff" ||
						baseColorMode === "misery") && (
						<div className="flex items-center gap-4 text-[11px] font-medium">
							<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
								<input
									type="radio"
									name="temp-sub"
									checked={baseColorMode === "temperature"}
									onChange={() => setColorMode("temperature")}
									className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
								Temp
							</label>
							<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
								<input
									type="radio"
									name="temp-sub"
									checked={baseColorMode === "dtr"}
									onChange={() => setColorMode("dtr")}
									className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
								DTR
							</label>
							<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
								<input
									type="radio"
									name="temp-sub"
									checked={baseColorMode === "misery"}
									onChange={() => setColorMode("misery")}
									className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
								MI
							</label>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
