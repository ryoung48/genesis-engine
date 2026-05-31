import React from "react"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import type { ColorMode } from "../colors"
import type {
	MapModePrimary,
	NationMapMode,
	PopulationMapMode,
} from "../screen/shared/map-modes"
import {
	getMapModePrimary,
	getVisibleDemographicModeOptions,
	getVisibleGeographyModeOptions,
	getVisiblePoliticalModeOptions,
	PRIMARY_MAP_MODE_OPTIONS,
} from "../screen/shared/map-modes"
import { ModeButtonGroup } from "./mode-controls"

interface ModeBarProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	geographyMode: ColorMode
	setGeographyMode: (v: ColorMode) => void
	nationMode: NationMapMode
	setNationMode: (v: NationMapMode) => void
	populationMode: PopulationMapMode
	setPopulationMode: (v: PopulationMapMode) => void
	debugMapModes: boolean
	climateSubMode: "basic" | "pasta" | "koppen"
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: "classification" | "slope"
}

function resolveSubMode(
	baseMode: ColorMode,
	climateSubMode: "basic" | "pasta" | "koppen",
	elevationSubMode: "colored" | "grayscale",
	topographySubMode: "classification" | "slope",
): ColorMode {
	if (baseMode === "climate") {
		if (climateSubMode === "pasta") return "pastaClimate"
		if (climateSubMode === "koppen") return "koppenClimate"
		return "climate"
	}
	if (baseMode === "terrain") {
		return elevationSubMode === "grayscale" ? "landHeightmap" : "terrain"
	}
	if (baseMode === "topography") {
		return topographySubMode === "slope" ? "slope" : "topography"
	}
	return baseMode
}

const TRAY =
	"inline-flex max-w-[min(56rem,calc(100vw-2rem))] flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 px-2 py-1.5 backdrop-blur-sm"

export const ModeBar: React.FC<ModeBarProps> = ({
	colorMode,
	setColorMode,
	geographyMode,
	setGeographyMode,
	nationMode,
	setNationMode,
	populationMode,
	setPopulationMode,
	debugMapModes,
	climateSubMode,
	elevationSubMode,
	topographySubMode,
}) => {
	const activePrimary = getMapModePrimary(colorMode)
	const geographyOptions = getVisibleGeographyModeOptions(debugMapModes)
	const demographicOptions = getVisibleDemographicModeOptions(debugMapModes)
	const politicalOptions = getVisiblePoliticalModeOptions(debugMapModes)

	const submodeControl =
		activePrimary === "geography" ? (
			<ModeButtonGroup
				options={geographyOptions}
				value={geographyMode}
				onChange={(mode) => {
					setColorMode(
						resolveSubMode(
							mode,
							climateSubMode,
							elevationSubMode,
							topographySubMode,
						),
					)
					setGeographyMode(mode)
				}}
				buttonClassName="px-1.5"
			/>
		) : activePrimary === "political" ? (
			<ModeButtonGroup<NationMapMode | "timezone">
				options={[...politicalOptions, ["timezone", "Timezones"]]}
				value={colorMode === "timezone" ? "timezone" : nationMode}
				onChange={(mode) => {
					if (mode === "timezone") {
						setColorMode("timezone")
						return
					}
					setColorMode("nations")
					setNationMode(mode)
				}}
				buttonClassName="px-1.5"
			/>
		) : (
			<ModeButtonGroup
				options={demographicOptions}
				value={populationMode}
				onChange={setPopulationMode}
				buttonClassName="px-1.5"
			/>
		)

	return (
		<div className="flex flex-col items-center gap-1.5">
			<div className={TRAY}>{submodeControl}</div>
			<div className="inline-flex">
				<SegmentedControl
					options={PRIMARY_MAP_MODE_OPTIONS.map(([value, label]) => ({
						value,
						label,
					}))}
					value={activePrimary}
					onChange={(primary: MapModePrimary) => {
						if (primary === "geography") {
							setColorMode(
								resolveSubMode(
									geographyMode,
									climateSubMode,
									elevationSubMode,
									topographySubMode,
								),
							)
							return
						}
						if (primary === "political") {
							setColorMode("nations")
							return
						}
						if (primary === "demographics") {
							setColorMode("population")
						}
					}}
					tone="overlay"
					size="sm"
					buttonClassName="px-2"
				/>
			</div>
		</div>
	)
}
