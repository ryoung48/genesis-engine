import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import {
	isTemperatureColorMode,
	isWeatherColorMode,
	TEMPERATURE_MAP_MODE_OPTIONS,
	WEATHER_MAP_MODE_OPTIONS,
} from "@/ui/genesis/shared/map-modes"

export interface ClimateToggleSectionProps {
	colorMode: ColorMode
	baseColorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	climateExpanded: boolean
	setClimateExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
}

export const ClimateToggleSection: React.FC<ClimateToggleSectionProps> = ({
	colorMode,
	baseColorMode,
	setColorMode,
	climateExpanded,
	setClimateExpanded,
}) => {
	if (!isTemperatureColorMode(colorMode) && !isWeatherColorMode(colorMode)) {
		return null
	}
	return (
		<div>
			<CollapsibleSectionHeader
				title={isWeatherColorMode(colorMode) ? "Weather" : "Temperature"}
				expanded={climateExpanded}
				onToggle={() => setClimateExpanded((v) => !v)}
			/>
			{climateExpanded && (
				<div className="mt-1.5 space-y-1.5">
					{isWeatherColorMode(colorMode) && (
						<RadioGroup
							label="Weather mode"
							orientation="horizontal"
							options={WEATHER_MAP_MODE_OPTIONS.map(([value, label]) => ({
								value,
								label,
							}))}
							value={baseColorMode}
							onChange={setColorMode}
						/>
					)}
					{isTemperatureColorMode(colorMode) && (
						<RadioGroup
							label="Temperature mode"
							orientation="horizontal"
							options={TEMPERATURE_MAP_MODE_OPTIONS.map(([value, label]) => ({
								value,
								label,
							}))}
							value={baseColorMode}
							onChange={setColorMode}
						/>
					)}
				</div>
			)}
		</div>
	)
}
