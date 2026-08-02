import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import type { ColorMode } from "@/ui/genesis/shared/colors"

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
	"cloudCover",
	"realCloudCover",
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
						colorMode === "cloudCover" ||
						colorMode === "realCloudCover" ||
						colorMode === "humidity" ||
						colorMode === "realHumidity" ||
						colorMode === "humidityDiff") && (
						<RadioGroup
							label="Precipitation mode"
							orientation="horizontal"
							options={[
								{ value: "precipitation" as const, label: "Precipitation" },
								{ value: "humidity" as const, label: "Humidity" },
								{ value: "cloudCover" as const, label: "Cloud" },
							]}
							value={
								baseColorMode === "humidity"
									? "humidity"
									: baseColorMode === "cloudCover"
										? "cloudCover"
										: "precipitation"
							}
							onChange={setColorMode}
						/>
					)}
					{(colorMode === "temperature" ||
						colorMode === "realTemperature" ||
						colorMode === "temperatureDiff" ||
						colorMode === "dtr" ||
						colorMode === "realDtr" ||
						colorMode === "dtrDiff" ||
						baseColorMode === "misery") && (
						<RadioGroup
							label="Temperature mode"
							orientation="horizontal"
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
						/>
					)}
				</div>
			)}
		</div>
	)
}
