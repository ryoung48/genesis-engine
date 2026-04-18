import React from "react"
import type { PopulationMapMode } from "@/components/world/types"
import type { ColorMode } from "../../colors"
import { BinaryToggle, ModeButtonGroup } from "./mode-controls"

export type NationMapMode = "borders" | "provinces"

interface ModeBarProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	nationMode: NationMapMode
	setNationMode: (v: NationMapMode) => void
	populationMode: PopulationMapMode
	setPopulationMode: (v: PopulationMapMode) => void
	isClimateMode: boolean
	isSatelliteMode: boolean
	tempAnnual: boolean
	setTempAnnual: (v: boolean) => void
	rainAnnual: boolean
	setRainAnnual: (v: boolean) => void
	windAnnual: boolean
	setWindAnnual: (v: boolean) => void
	currentAnnual: boolean
	setCurrentAnnual: (v: boolean) => void
	dtrAnnual: boolean
	setDtrAnnual: (v: boolean) => void
}

const PILL =
	"inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm"
const DIVIDER = <div className="mx-0.5 h-4 w-px bg-white/10" />

const TERRAIN_MODES = [
	["terrain", "Elevation"],
	["slope", "Slope"],
	["topography", "Topography"],
	["terrainFeatures", "Features"],
	["basins", "Basins"],
	["dangerZones", "Danger"],
	["hotspots", "Hotspots"],
] as [ColorMode, string][]

const CLIMATE_MODES = [
	["climate", "Basic"],
	["pastaClimate", "Pasta"],
	["koppenClimate", "Koppen"],
	["vegetation", "Veg"],
	["satellite", "Satellite"],
	["moisture", "Moisture"],
	["oceanCurrents", "Currents"],
	["temperature", "Temp"],
	["precipitation", "Rain"],
	["dtr", "DTR"],
] as [ColorMode, string][]

const SATELLITE_MODES = [
	["satellite", "Pasta"],
	["satelliteKoppen", "Koppen"],
] as [ColorMode, string][]

const POPULATION_MODES = [
	["density", "Density"],
	["development", "Development"],
	["gravity", "Gravity"],
	["culture", "Culture"],
	["heritage", "Heritage"],
	["faith", "Faith"],
	["religion", "Religion"],
] as [PopulationMapMode, string][]

const NATION_MODES = [
	["borders", "Borders"],
	["provinces", "Provinces"],
] as [NationMapMode, string][]

const TOP_MODES = [
	["terrain", "Terrain"],
	["climate", "Climate"],
	["population", "Population"],
	["nations", "Nations"],
] as [string, string][]

export const ModeBar: React.FC<ModeBarProps> = ({
	colorMode,
	setColorMode,
	nationMode,
	setNationMode,
	populationMode,
	setPopulationMode,
	isClimateMode,
	isSatelliteMode,
	tempAnnual,
	setTempAnnual,
	rainAnnual,
	setRainAnnual,
	windAnnual,
	setWindAnnual,
	currentAnnual,
	setCurrentAnnual,
	dtrAnnual,
	setDtrAnnual,
}) => {
	const isTerrainMode =
		colorMode === "terrain" ||
		colorMode === "slope" ||
		colorMode === "topography" ||
		colorMode === "basins" ||
		colorMode === "dangerZones" ||
		colorMode === "hotspots" ||
		colorMode === "terrainFeatures"
	const isClimateFamilyMode = isClimateMode || isSatelliteMode

	const climateIsActive = (mode: ColorMode) =>
		mode === "satellite" ? isSatelliteMode : colorMode === mode

	const subModeRow = (() => {
		if (isTerrainMode) {
			return (
				<div className={PILL}>
					<ModeButtonGroup
						options={TERRAIN_MODES}
						value={colorMode}
						onChange={setColorMode}
					/>
				</div>
			)
		}

		if (isClimateFamilyMode) {
			const climatePart = (
				<ModeButtonGroup
					options={CLIMATE_MODES}
					value={colorMode}
					isActive={climateIsActive}
					onChange={setColorMode}
				/>
			)
			const satellitePart = isSatelliteMode && (
				<>
					{DIVIDER}
					<ModeButtonGroup
						options={SATELLITE_MODES}
						value={colorMode}
						onChange={setColorMode}
					/>
				</>
			)

			if (
				colorMode === "temperature" ||
				colorMode === "precipitation" ||
				colorMode === "windSpeed" ||
				colorMode === "dtr"
			) {
				const annualValue =
					colorMode === "temperature"
						? tempAnnual
						: colorMode === "precipitation"
							? rainAnnual
							: colorMode === "windSpeed"
								? windAnnual
								: dtrAnnual
				const annualSetter =
					colorMode === "temperature"
						? setTempAnnual
						: colorMode === "precipitation"
							? setRainAnnual
							: colorMode === "windSpeed"
								? setWindAnnual
								: setDtrAnnual
				return (
					<div className={PILL}>
						{climatePart}
						{satellitePart}
						{DIVIDER}
						<BinaryToggle value={annualValue} onChange={annualSetter} />
					</div>
				)
			}

			if (colorMode === "oceanCurrents") {
				return (
					<div className={PILL}>
						{climatePart}
						{satellitePart}
						{DIVIDER}
						<BinaryToggle value={currentAnnual} onChange={setCurrentAnnual} />
					</div>
				)
			}

			return (
				<div className={PILL}>
					{climatePart}
					{satellitePart}
				</div>
			)
		}

		if (colorMode === "population") {
			return (
				<div className={PILL}>
					<ModeButtonGroup
						options={POPULATION_MODES}
						value={populationMode}
						onChange={setPopulationMode}
					/>
				</div>
			)
		}

		if (colorMode === "nations") {
			return (
				<div className={PILL}>
					<ModeButtonGroup
						options={NATION_MODES}
						value={nationMode}
						onChange={setNationMode}
					/>
				</div>
			)
		}

		return null
	})()

	return (
		<div className="flex flex-col items-center gap-1.5">
			{subModeRow && (
				<div className="inline-flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm">
					{subModeRow}
				</div>
			)}
			<div className={PILL}>
				<ModeButtonGroup
					options={TOP_MODES}
					value={colorMode}
					isActive={(mode) =>
						mode === "terrain"
							? isTerrainMode
							: mode === "climate"
								? isClimateFamilyMode
								: colorMode === mode
					}
					onChange={(mode) => setColorMode(mode as ColorMode)}
				/>
			</div>
		</div>
	)
}
