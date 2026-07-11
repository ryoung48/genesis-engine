import React from "react"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import type { ColorMode } from "../colors"
import type {
	MapModePrimary,
	NationMapMode,
	PopulationMapMode,
	SocietyMapMode,
} from "../screen/shared/map-modes"
import {
	getMapModePrimary,
	getVisibleGeographyModeOptions,
	getVisibleSocietyModeOptions,
	PRIMARY_MAP_MODE_OPTIONS,
} from "../screen/shared/map-modes"
import { ModeButtonGroup } from "./mode-controls"
import type {
	ClimateSubMode,
	TopographySubMode,
	VegetationSubMode,
} from "./OverlayControls"

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
	vegetationSubMode: VegetationSubMode
	climateSubMode: ClimateSubMode
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: TopographySubMode
}

function resolveSubMode(
	baseMode: ColorMode,
	vegetationSubMode: VegetationSubMode,
	climateSubMode: ClimateSubMode,
	elevationSubMode: "colored" | "grayscale",
	topographySubMode: TopographySubMode,
): ColorMode {
	if (baseMode === "vegetation") {
		if (vegetationSubMode === "maps") return "vegetationMaps"
		if (vegetationSubMode === "satellite") return "vegetationSatellite"
		if (vegetationSubMode === "eu5") return "eu5Vegetation"
		return "vegetation"
	}
	if (baseMode === "climate") {
		if (climateSubMode === "pasta") return "pastaClimate"
		if (climateSubMode === "koppen") return "koppenClimate"
		if (climateSubMode === "eu5") return "eu5Climate"
		return "climate"
	}
	if (baseMode === "terrain") {
		return elevationSubMode === "grayscale" ? "landHeightmap" : "terrain"
	}
	if (baseMode === "topography") {
		if (topographySubMode === "slope") return "slope"
		if (topographySubMode === "eu5") return "eu5Topography"
		return "topography"
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
	vegetationSubMode,
	climateSubMode,
	elevationSubMode,
	topographySubMode,
}) => {
	const activePrimary = getMapModePrimary(colorMode)
	const geographyOptions = getVisibleGeographyModeOptions(debugMapModes).filter(
		([mode]) =>
			mode !== "realTemperature" &&
			mode !== "temperatureDiff" &&
			mode !== "realDtr" &&
			mode !== "dtrDiff" &&
			mode !== "realPrecipitation" &&
			mode !== "precipitationDiff",
	)
	const societyOptions = getVisibleSocietyModeOptions(debugMapModes)

	const submodeControl =
		activePrimary === "geography" ? (
			<ModeButtonGroup
				options={geographyOptions}
				value={geographyMode}
				onChange={(mode) => {
					setColorMode(
						resolveSubMode(
							mode,
							vegetationSubMode,
							climateSubMode,
							elevationSubMode,
							topographySubMode,
						),
					)
					setGeographyMode(mode)
				}}
				buttonClassName="px-1.5"
			/>
		) : (
			<ModeButtonGroup<SocietyMapMode>
				options={societyOptions}
				value={
					colorMode === "population"
						? populationMode
						: colorMode === "timezone"
							? "timezone"
							: nationMode
				}
				onChange={(mode) => {
					if (mode === "timezone") {
						setColorMode("timezone")
						return
					}
					if (
						mode === "density" ||
						mode === "development" ||
						mode === "culture" ||
						mode === "heritage" ||
						mode === "religion" ||
						mode === "migration"
					) {
						setColorMode("population")
						setPopulationMode(mode)
						return
					}
					setColorMode("nations")
					setNationMode(mode)
				}}
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
									vegetationSubMode,
									climateSubMode,
									elevationSubMode,
									topographySubMode,
								),
							)
							return
						}
						if (primary === "society") {
							setColorMode("nations")
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
