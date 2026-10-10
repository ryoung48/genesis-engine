import React from "react"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { ModeButtonGroup } from "@/ui/genesis/controls/mode-controls"
import type {
	ModeBarProps,
	ResolveSubModeParams,
} from "@/ui/genesis/controls/types"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import { getBaseMapMode } from "@/ui/genesis/shared/data-variant"
import type {
	MapModePrimary,
	SocietyMapOption,
} from "@/ui/genesis/shared/map-modes"
import {
	DEFAULT_TITLES_MODE,
	getMapModePrimary,
	getVisibleGeographyModeOptions,
	getVisibleSocietyModeOptions,
	isTitlesNationMode,
	PRIMARY_MAP_MODE_OPTIONS,
} from "@/ui/genesis/shared/map-modes"

function resolveSubMode({
	baseMode,
	vegetationSubMode,
	climateSubMode,
	elevationSubMode,
	topographySubMode,
}: ResolveSubModeParams): ColorMode {
	if (baseMode === "vegetation") {
		if (vegetationSubMode === "maps") return "vegetationMaps"
		if (vegetationSubMode === "satellite") return "vegetationSatellite"
		return "vegetation"
	}
	if (baseMode === "climate") {
		if (climateSubMode === "pasta") return "pastaClimate"
		if (climateSubMode === "koppen") return "koppenClimate"
		return "climate"
	}
	if (baseMode === "terrain") {
		return elevationSubMode === "grayscale" ? "landHeightmap" : "terrain"
	}
	if (baseMode === "topography") {
		if (topographySubMode === "slope") return "slope"
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
	societyMode,
	setSocietyMode,
	debugMapModes,
	vegetationSubMode,
	climateSubMode,
	elevationSubMode,
	topographySubMode,
	isEarthImport = false,
	politicalOnly = false,
}) => {
	const activePrimary = getMapModePrimary(colorMode)
	const geographyOptions = getVisibleGeographyModeOptions(debugMapModes).filter(
		([mode]) =>
			mode !== "realTemperature" &&
			mode !== "temperatureDiff" &&
			mode !== "realDtr" &&
			mode !== "dtrDiff" &&
			mode !== "realPrecipitation" &&
			mode !== "precipitationDiff" &&
			mode !== "cloudCover" &&
			mode !== "realCloudCover" &&
			(!isEarthImport || (mode !== "dangerZones" && mode !== "trade_goods")),
	)
	const societyOptions = getVisibleSocietyModeOptions(
		debugMapModes,
		isEarthImport,
	).filter(
		([mode]) =>
			!politicalOnly ||
			[
				"borders",
				"provinces",
				"culture",
				"heritage",
				"religion",
				"timezone",
			].includes(mode),
	)

	const submodeControl =
		activePrimary === "geography" ? (
			<ModeButtonGroup
				options={geographyOptions}
				value={geographyMode}
				onChange={(mode) => {
					setColorMode(
						resolveSubMode({
							baseMode: mode,
							vegetationSubMode,
							climateSubMode,
							elevationSubMode,
							topographySubMode,
						}),
					)
					setGeographyMode(mode)
				}}
				buttonClassName="px-1.5"
			/>
		) : (
			<ModeButtonGroup<SocietyMapOption>
				options={societyOptions}
				value={
					getBaseMapMode(colorMode) === "population"
						? societyMode
						: colorMode === "timezone"
							? "timezone"
							: isTitlesNationMode(nationMode)
								? "titles"
								: nationMode
				}
				onChange={(mode) => {
					if (mode === "timezone") {
						setColorMode("timezone")
						return
					}
					if (
						mode === "density" ||
						mode === "urban" ||
						mode === "development" ||
						mode === "culture" ||
						mode === "heritage" ||
						mode === "religion" ||
						mode === "migration"
					) {
						setColorMode("population")
						setSocietyMode(mode)
						return
					}
					setColorMode("nations")
					if (mode === "titles") {
						setNationMode(
							isTitlesNationMode(nationMode) ? nationMode : DEFAULT_TITLES_MODE,
						)
						return
					}
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
								resolveSubMode({
									baseMode: geographyMode,
									vegetationSubMode,
									climateSubMode,
									elevationSubMode,
									topographySubMode,
								}),
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
