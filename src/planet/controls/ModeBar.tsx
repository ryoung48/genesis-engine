import React from "react"
import { SegmentedControl } from "@/components"
import type { ColorMode } from "../colors"
import type {
	MapModePrimary,
	NationMapMode,
	PopulationMapMode,
} from "../screen/shared/map-modes"
import {
	DEFAULT_GEOGRAPHY_MODE,
	getMapModePrimary,
	getVisibleDemographicModeOptions,
	getVisibleGeographyModeOptions,
	POLITICAL_MODE_OPTIONS,
	PRIMARY_MAP_MODE_OPTIONS,
} from "../screen/shared/map-modes"
import { ModeButtonGroup } from "./mode-controls"

interface ModeBarProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	nationMode: NationMapMode
	setNationMode: (v: NationMapMode) => void
	populationMode: PopulationMapMode
	setPopulationMode: (v: PopulationMapMode) => void
	debugMapModes: boolean
}

const TRAY =
	"inline-flex max-w-[min(56rem,calc(100vw-2rem))] flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 px-2 py-1.5 backdrop-blur-sm"

export const ModeBar: React.FC<ModeBarProps> = ({
	colorMode,
	setColorMode,
	nationMode,
	setNationMode,
	populationMode,
	setPopulationMode,
	debugMapModes,
}) => {
	const activePrimary = getMapModePrimary(colorMode)
	const geographyOptions = getVisibleGeographyModeOptions(debugMapModes)
	const demographicOptions = getVisibleDemographicModeOptions(debugMapModes)

	const submodeControl =
		activePrimary === "geography" ? (
			<ModeButtonGroup
				options={geographyOptions}
				value={colorMode}
				onChange={setColorMode}
				buttonClassName="px-1.5"
			/>
		) : activePrimary === "political" ? (
			<ModeButtonGroup
				options={POLITICAL_MODE_OPTIONS}
				value={nationMode}
				onChange={setNationMode}
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
								getMapModePrimary(colorMode) === "geography"
									? colorMode
									: DEFAULT_GEOGRAPHY_MODE,
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
