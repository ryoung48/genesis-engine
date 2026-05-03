import React from "react"
import { SegmentedControl } from "@/components"
import type { ColorMode } from "../colors"
import type {
	NationMapMode,
	PopulationMapMode,
} from "../screen/shared/map-modes"
import { BinaryToggle, ModeButtonGroup } from "./mode-controls"

interface ModeBarProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	nationMode: NationMapMode
	setNationMode: (v: NationMapMode) => void
	populationMode: PopulationMapMode
	setPopulationMode: (v: PopulationMapMode) => void
	isClimateMode: boolean
	tempAnnual: boolean
	setTempAnnual: (v: boolean) => void
	rainAnnual: boolean
	setRainAnnual: (v: boolean) => void
	currentAnnual: boolean
	setCurrentAnnual: (v: boolean) => void
	dtrAnnual: boolean
	setDtrAnnual: (v: boolean) => void
}

const FAMILY_PILL =
	"inline-flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm"
const TRAY =
	"inline-flex max-w-[min(44rem,calc(100vw-2rem))] flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/75 px-2 py-1.5 backdrop-blur-sm"
const TRAY_ROW = "flex flex-wrap items-center justify-center gap-1"

const TERRAIN_MODES = [
	["terrain", "Elev"],
	["slope", "Slope"],
	["topography", "Topo"],
	["terrainFeatures", "Feat"],
	["basins", "Basins"],
	["dangerZones", "Danger"],
	["hotspots", "Hot"],
] as [ColorMode, string][]

const CLIMATE_CLASS_MODES = [
	["climate", "Basic"],
	["pastaClimate", "Pasta"],
	["koppenClimate", "Koppen"],
	["vegetation", "Veg"],
] as [ColorMode, string][]

const CLIMATE_DATA_MODES = [
	["moisture", "Moist"],
	["oceanCurrents", "Current"],
	["temperature", "Temp"],
	["precipitation", "Rain"],
	["dtr", "DTR"],
] as [ColorMode, string][]

const POPULATION_MODES = [
	["density", "Density"],
	["development", "Dev"],
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
	{ value: "terrain", label: "Terrain" },
	{ value: "climate", label: "Climate" },
	{ value: "population", label: "Population" },
	{ value: "nations", label: "Nations" },
] as const

type ModeFamily = (typeof TOP_MODES)[number]["value"]

export const ModeBar: React.FC<ModeBarProps> = ({
	colorMode,
	setColorMode,
	nationMode,
	setNationMode,
	populationMode,
	setPopulationMode,
	isClimateMode,
	tempAnnual,
	setTempAnnual,
	rainAnnual,
	setRainAnnual,
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
	const activeFamily: ModeFamily = isTerrainMode
		? "terrain"
		: isClimateMode
			? "climate"
			: colorMode === "population"
				? "population"
				: "nations"

	const metricToggle =
		colorMode === "temperature" ? (
			<BinaryToggle
				value={tempAnnual}
				onChange={setTempAnnual}
				falseLabel="Sim"
				className="px-1.5"
			/>
		) : colorMode === "precipitation" ? (
			<BinaryToggle
				value={rainAnnual}
				onChange={setRainAnnual}
				falseLabel="Sim"
				className="px-1.5"
			/>
		) : colorMode === "dtr" ? (
			<BinaryToggle
				value={dtrAnnual}
				onChange={setDtrAnnual}
				falseLabel="Sim"
				className="px-1.5"
			/>
		) : colorMode === "oceanCurrents" ? (
			<BinaryToggle
				value={currentAnnual}
				onChange={setCurrentAnnual}
				falseLabel="Sim"
				className="px-1.5"
			/>
		) : null

	const tray = (() => {
		if (activeFamily === "terrain") {
			return (
				<div className={TRAY}>
					<div className={TRAY_ROW}>
						<ModeButtonGroup
							options={TERRAIN_MODES}
							value={colorMode}
							onChange={setColorMode}
							buttonClassName="px-1.5"
						/>
					</div>
				</div>
			)
		}

		if (activeFamily === "climate") {
			return (
				<div className={TRAY}>
					<div className={TRAY_ROW}>
						<ModeButtonGroup
							options={CLIMATE_CLASS_MODES}
							value={colorMode}
							onChange={setColorMode}
							buttonClassName="px-1.5"
						/>
					</div>
					<div className={TRAY_ROW}>
						<ModeButtonGroup
							options={CLIMATE_DATA_MODES}
							value={colorMode}
							onChange={setColorMode}
							buttonClassName="px-1.5"
						/>
						{metricToggle && (
							<div className="ml-1 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/10 p-0.5">
								{metricToggle}
							</div>
						)}
					</div>
				</div>
			)
		}

		if (activeFamily === "population") {
			return (
				<div className={TRAY}>
					<div className={TRAY_ROW}>
						<ModeButtonGroup
							options={POPULATION_MODES}
							value={populationMode}
							onChange={setPopulationMode}
							buttonClassName="px-1.5"
						/>
					</div>
				</div>
			)
		}

		return (
			<div className={TRAY}>
				<div className={TRAY_ROW}>
					<ModeButtonGroup
						options={NATION_MODES}
						value={nationMode}
						onChange={setNationMode}
						buttonClassName="px-1.5"
					/>
				</div>
			</div>
		)
	})()

	return (
		<div className="flex flex-col items-center gap-1.5">
			{tray}
			<div className={FAMILY_PILL}>
				<SegmentedControl
					options={TOP_MODES}
					value={activeFamily}
					onChange={(family) => {
						if (family === "terrain") {
							setColorMode(isTerrainMode ? colorMode : "terrain")
							return
						}
						if (family === "climate") {
							setColorMode(isClimateMode ? colorMode : "climate")
							return
						}
						if (family === "population") {
							setColorMode("population")
							return
						}
						setColorMode("nations")
					}}
					tone="overlay"
					size="sm"
					buttonClassName="px-1.5"
				/>
			</div>
		</div>
	)
}
