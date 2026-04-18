import React from "react"
import type { PopulationMapMode } from "@/components/world/types"
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
					["pastaClimate", "Pasta"],
					["koppenClimate", "Koppen"],
					["vegetation", "Veg"],
					["satellite", "Satellite"],
					["moisture", "Moisture"],
					["oceanCurrents", "Currents"],
					["temperature", "Temp"],
					["precipitation", "Rain"],
					["dtr", "DTR"],
					// ["windSpeed", "Wind"],
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

			if (
				colorMode === "temperature" ||
				colorMode === "precipitation" ||
				colorMode === "windSpeed" ||
				colorMode === "dtr"
			) {
				const active =
					colorMode === "temperature"
						? tempAnnual
						: colorMode === "precipitation"
							? rainAnnual
							: colorMode === "windSpeed"
								? windAnnual
								: dtrAnnual
				const setter =
					colorMode === "temperature"
						? setTempAnnual
						: colorMode === "precipitation"
							? setRainAnnual
							: colorMode === "windSpeed"
								? setWindAnnual
								: setDtrAnnual
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
							["development", "Development"],
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
		<div className="flex flex-col items-center gap-1.5">
			{subModeRow && (
				<div className="inline-flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm">
					{subModeRow}
				</div>
			)}
			<div className="inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/75 p-1 backdrop-blur-sm">
				{(
					[
						["terrain", "Terrain"],
						["climate", "Climate"],
						["population", "Population"],
						["nations", "Nations"],
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
			</div>
		</div>
	)
}
