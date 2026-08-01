import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
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
			<CollapsibleSectionHeader
				title={
					colorMode === "temperature" ||
					colorMode === "realTemperature" ||
					colorMode === "temperatureDiff" ||
					colorMode === "dtr" ||
					colorMode === "realDtr" ||
					colorMode === "dtrDiff" ||
					baseColorMode === "misery"
						? "Temperature"
						: colorMode === "wind"
							? "Wind"
							: "Rainfall"
				}
				expanded={climateExpanded}
				onToggle={() => setClimateExpanded((v) => !v)}
			/>
			{climateExpanded && (
				<div className="mt-1.5 space-y-1.5">
					{(colorMode === "precipitation" ||
						colorMode === "realPrecipitation" ||
						colorMode === "precipitationDiff" ||
						colorMode === "humidity" ||
						colorMode === "realHumidity" ||
						colorMode === "humidityDiff") && (
						<SegmentedControl
							options={[
								{ value: "precipitation" as const, label: "Precipitation" },
								{ value: "humidity" as const, label: "Humidity" },
							]}
							value={
								baseColorMode === "humidity" ? "humidity" : "precipitation"
							}
							onChange={setColorMode}
							tone="overlay"
						/>
					)}
					{(colorMode === "temperature" ||
						colorMode === "realTemperature" ||
						colorMode === "temperatureDiff" ||
						colorMode === "dtr" ||
						colorMode === "realDtr" ||
						colorMode === "dtrDiff" ||
						baseColorMode === "misery") && (
						<SegmentedControl
							options={[
								{ value: "temperature" as const, label: "Temp" },
								{ value: "dtr" as const, label: "DTR" },
								{ value: "misery" as const, label: "MI" },
							]}
							value={
								baseColorMode === "dtr" || baseColorMode === "misery"
									? baseColorMode
									: "temperature"
							}
							onChange={setColorMode}
							tone="overlay"
						/>
					)}
				</div>
			)}
		</div>
	)
}
