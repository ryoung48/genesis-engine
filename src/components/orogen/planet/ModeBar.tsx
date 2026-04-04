import React from "react"
import type { PopulationMapMode } from "@/components/world/types"
import {
	ENABLE_PASTA_CLASSIFICATION,
	ENABLE_PROVINCES,
	ENABLE_WIND_FIELDS,
} from "@/model/orogen/features"
import type { ColorMode } from "../colors"

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
	isWindMode: boolean
	tempAnnual: boolean
	setTempAnnual: (v: boolean) => void
	rainAnnual: boolean
	setRainAnnual: (v: boolean) => void
	windAnnual: boolean
	setWindAnnual: (v: boolean) => void
	currentAnnual: boolean
	setCurrentAnnual: (v: boolean) => void
}

export const ModeBar: React.FC<ModeBarProps> = ({
	colorMode,
	setColorMode,
	nationMode,
	setNationMode,
	populationMode,
	setPopulationMode,
	isClimateMode,
	isSatelliteMode,
	isWindMode,
	tempAnnual,
	setTempAnnual,
	rainAnnual,
	setRainAnnual,
	windAnnual,
	setWindAnnual,
	currentAnnual,
	setCurrentAnnual,
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
	const subModeRow = (() => {
		if (isTerrainMode) {
			return (
				<div className="inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm">
					{(
						[
							["terrain", "Elevation"],
							["slope", "Slope"],
							["topography", "Topography"],
							["terrainFeatures", "Features"],
							["basins", "Basins"],
							["dangerZones", "Danger"],
							["hotspots", "Hotspots"],
						] as [ColorMode, string][]
					).map(([mode, label]) => (
						<button
							key={mode}
							onClick={() => setColorMode(mode)}
							className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
								colorMode === mode
									? "bg-white/15 text-white shadow-sm"
									: "text-slate-400 hover:text-slate-200"
							}`}
						>
							{label}
						</button>
					))}
				</div>
			)
		}
		if (isClimateFamilyMode) {
			const climateButtons = (
				[
					["climate", "Basic"],
					...(ENABLE_PASTA_CLASSIFICATION ? [["pastaClimate", "Pasta"]] : []),
					["koppenClimate", "Koppen"],
					["vegetation", "Veg"],
					...(ENABLE_PASTA_CLASSIFICATION ? [["satellite", "Satellite"]] : []),
					["moisture", "Moisture"],
					["oceanCurrents", "Currents"],
					["temperature", "Temp"],
					["precipitation", "Rain"],
				] as [ColorMode, string][]
			).map(([mode, label]) => {
				const isActive =
					mode === "satellite" ? isSatelliteMode : colorMode === mode
				return (
					<button
						key={mode}
						onClick={() => setColorMode(mode)}
						className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
							isActive
								? "bg-white/15 text-white shadow-sm"
								: "text-slate-400 hover:text-slate-200"
						}`}
					>
						{label}
					</button>
				)
			})
			const satelliteButtons = (
				[
					["satellite", "Pasta"],
					["satelliteKoppen", "Koppen"],
				] as [ColorMode, string][]
			).map(([mode, label]) => (
				<button
					key={mode}
					onClick={() => setColorMode(mode)}
					className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
						colorMode === mode
							? "bg-white/15 text-white shadow-sm"
							: "text-slate-400 hover:text-slate-200"
					}`}
				>
					{label}
				</button>
			))
			const satellitePanel = (
				<>
					<div className="mx-0.5 h-4 w-px bg-white/10" />
					{satelliteButtons}
				</>
			)

			if (colorMode === "temperature" || colorMode === "precipitation") {
				const active = colorMode === "temperature" ? tempAnnual : rainAnnual
				const setter =
					colorMode === "temperature" ? setTempAnnual : setRainAnnual
				return (
					<div className="inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm">
						{climateButtons}
						{isSatelliteMode && satellitePanel}
						<div
							key="climate-frequency-divider"
							className="mx-0.5 h-4 w-px bg-white/10"
						/>
						{([true, false] as const).map((isAnnual) => (
							<button
								key={isAnnual ? "annual" : "monthly"}
								onClick={() => setter(isAnnual)}
								className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
									active === isAnnual
										? "bg-white/15 text-white shadow-sm"
										: "text-slate-400 hover:text-slate-200"
								}`}
							>
								{isAnnual ? "Annual" : "Monthly"}
							</button>
						))}
					</div>
				)
			}
			if (colorMode === "oceanCurrents") {
				return (
					<div className="inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm">
						{climateButtons}
						{isSatelliteMode && satellitePanel}
						<div
							key="current-frequency-divider"
							className="mx-0.5 h-4 w-px bg-white/10"
						/>
						{([true, false] as const).map((isAnnual) => (
							<button
								key={isAnnual ? "annual" : "monthly"}
								onClick={() => setCurrentAnnual(isAnnual)}
								className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
									currentAnnual === isAnnual
										? "bg-white/15 text-white shadow-sm"
										: "text-slate-400 hover:text-slate-200"
								}`}
							>
								{isAnnual ? "Annual" : "Monthly"}
							</button>
						))}
					</div>
				)
			}

			return (
				<div className="inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm">
					{climateButtons}
					{isSatelliteMode && satellitePanel}
				</div>
			)
		}
		if (colorMode === "population") {
			return (
				<div className="inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm">
					{(
						[
							["density", "Density"],
							["gravity", "Gravity"],
							["culture", "Culture"],
							["heritage", "Heritage"],
							["faith", "Faith"],
							["religion", "Religion"],
						] as [PopulationMapMode, string][]
					).map(([mode, label]) => (
						<button
							key={mode}
							onClick={() => setPopulationMode(mode)}
							className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
								populationMode === mode
									? "bg-white/15 text-white shadow-sm"
									: "text-slate-400 hover:text-slate-200"
							}`}
						>
							{label}
						</button>
					))}
				</div>
			)
		}
		if (colorMode === "nations") {
			return (
				<div className="inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm">
					{(
						[
							["borders", "Borders"],
							["provinces", "Provinces"],
						] as [NationMapMode, string][]
					).map(([mode, label]) => (
						<button
							key={mode}
							onClick={() => setNationMode(mode)}
							className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
								nationMode === mode
									? "bg-white/15 text-white shadow-sm"
									: "text-slate-400 hover:text-slate-200"
							}`}
						>
							{label}
						</button>
					))}
				</div>
			)
		}
		return null
	})()

	return (
		<div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-3 pointer-events-none gap-1.5">
			{subModeRow && (
				<div className="pointer-events-auto inline-flex flex-col items-center rounded-xl border border-white/10 bg-slate-950/75 p-1 gap-1 backdrop-blur-sm">
					{subModeRow}
				</div>
			)}
			<div className="pointer-events-auto inline-flex items-center rounded-xl border border-white/10 bg-slate-950/75 p-1 gap-0.5 backdrop-blur-sm">
				{(
					[
						["terrain", "Terrain"],
						["climate", "Climate"],
						...(ENABLE_WIND_FIELDS ? [["windSpeed", "Wind"]] : []),
						...(ENABLE_PROVINCES
							? [
									["population", "Population"],
									["nations", "Nations"],
								]
							: []),
					] as [string, string][]
				).map(([mode, label]) => {
					const isActive =
						mode === "terrain"
							? isTerrainMode
							: mode === "climate"
								? isClimateFamilyMode
								: colorMode === mode
					return (
						<button
							key={mode}
							onClick={() => setColorMode(mode as ColorMode)}
							className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
								isActive
									? "bg-white/15 text-white shadow-sm"
									: "text-slate-400 hover:text-slate-200"
							}`}
						>
							{label}
						</button>
					)
				})}
				{(colorMode === "precipitation" || isWindMode) && (
					<>
						<div className="w-px h-4 bg-white/10 mx-0.5" />
						{([true, false] as const).map((isAnnual) => {
							const active =
								colorMode === "precipitation" ? rainAnnual : windAnnual
							const setter =
								colorMode === "precipitation" ? setRainAnnual : setWindAnnual
							return (
								<button
									key={isAnnual ? "annual" : "monthly"}
									onClick={() => setter(isAnnual)}
									className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
										active === isAnnual
											? "bg-white/15 text-white shadow-sm"
											: "text-slate-400 hover:text-slate-200"
									}`}
								>
									{isAnnual ? "Annual" : "Monthly"}
								</button>
							)
						})}
					</>
				)}
			</div>
		</div>
	)
}
