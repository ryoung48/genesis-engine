import React from "react"
import type { OrogenViewMode } from "../renderer"
import type { ColorMode } from "../colors"
import { ENABLE_PASTA_CLASSIFICATION, ENABLE_PROVINCES, ENABLE_WIND_FIELDS } from "@/model/orogen/features"

interface ModeBarProps {
	viewMode: OrogenViewMode
	setViewMode: (v: OrogenViewMode) => void
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	isClimateMode: boolean
	isTemperatureMode: boolean
	isSatelliteMode: boolean
	isWindMode: boolean
	isMeasuring: boolean
	setIsMeasuring: (v: boolean) => void
	tempAnnual: boolean
	setTempAnnual: (v: boolean) => void
	rainAnnual: boolean
	setRainAnnual: (v: boolean) => void
	windAnnual: boolean
	setWindAnnual: (v: boolean) => void
	showPastaDebug: boolean
}

export const ModeBar: React.FC<ModeBarProps> = ({
	viewMode, setViewMode,
	colorMode, setColorMode,
	isClimateMode, isTemperatureMode, isSatelliteMode, isWindMode,
	isMeasuring, setIsMeasuring,
	tempAnnual, setTempAnnual,
	rainAnnual, setRainAnnual,
	windAnnual, setWindAnnual,
	showPastaDebug,
}) => (
	<div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-3 pointer-events-none gap-1.5">
		{showPastaDebug && (
			<div className="pointer-events-auto inline-flex items-center rounded-xl border border-white/10 bg-slate-950/75 p-1 gap-0.5 backdrop-blur-sm">
				{([
					["debugGdd", "GDD"],
					["debugGddz", "GDDz"],
					["debugGint", "GInt"],
					["debugAr", "AR"],
					["debugGar", "GAR"],
					["debugGrs", "GrS"],
					["debugEvr", "EvR"],
					["debugMinT", "MinT"],
					["debugMaxT", "MaxT"],
				] as [ColorMode, string][]).map(([mode, label]) => (
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
		)}
		<div className="pointer-events-auto inline-flex items-center rounded-xl border border-white/10 bg-slate-950/75 p-1 gap-0.5 backdrop-blur-sm">
			{([
				["globe", "Globe"],
				["map", "Map"],
			] as const).map(([mode, label]) => (
				<button
					key={mode}
					onClick={() => setViewMode(mode)}
					className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
						viewMode === mode
							? "bg-white/15 text-white shadow-sm"
							: "text-slate-400 hover:text-slate-200"
					}`}
				>
					{label}
				</button>
			))}
			<div className="w-px h-4 bg-white/10 mx-0.5" />
			<button
				onClick={() => setIsMeasuring(!isMeasuring)}
				title="Measure Distance"
				className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
					isMeasuring
						? "bg-white/15 text-white shadow-sm"
						: "text-slate-400 hover:text-slate-200"
				}`}
			>
				Measure
			</button>
			<div className="w-px h-4 bg-white/10 mx-0.5" />
			{([
				["terrain", "Terrain"],
				...(ENABLE_PASTA_CLASSIFICATION ? [["satellite", "Satellite"]] : []),
				["temperature", "Temp"],
				["precipitation", "Rain"],
				["vegetation", "Veg"],
				["climate", "Climate"],
				["oceanCurrents", "Currents"],
				...(ENABLE_WIND_FIELDS ? [["windSpeed", "Wind"]] : []),
				...(ENABLE_PROVINCES ? [["provinces", "Provinces"], ["population", "Pop"]] : []),
			] as [string, string][]).map(([mode, label]) => {
				const isActive = mode === "temperature" ? isTemperatureMode
					: mode === "climate" ? isClimateMode
					: mode === "satellite" ? isSatelliteMode
					: colorMode === mode
				return (
					<button
						key={mode}
						onClick={() => setColorMode((mode === "satellite" ? "satellite" : mode) as ColorMode)}
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
			{isClimateMode && (
				<>
					<div className="w-px h-4 bg-white/10 mx-0.5" />
					{([
						["climate", "Basic"],
						["koppenClimate", "Koppen"],
						...(ENABLE_PASTA_CLASSIFICATION ? [["pastaClimate", "Pasta"]] : []),
					] as [string, string][]).map(([mode, label]) => (
						<button
							key={mode}
							onClick={() => setColorMode(mode as ColorMode)}
							className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
								colorMode === mode
									? "bg-white/15 text-white shadow-sm"
									: "text-slate-400 hover:text-slate-200"
							}`}
						>
							{label}
						</button>
					))}
				</>
			)}
			{isTemperatureMode && (
				<>
					<div className="w-px h-4 bg-white/10 mx-0.5" />
					{([
						["temperature", "Mean"],
						["temperatureDelta", "Delta"],
					] as [ColorMode, string][]).map(([mode, label]) => (
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
				</>
			)}
			{isSatelliteMode && (
				<>
					<div className="w-px h-4 bg-white/10 mx-0.5" />
					{([
						["satellite", "Pasta"],
						["satelliteKoppen", "Koppen"],
					] as [string, string][]).map(([mode, label]) => (
						<button
							key={mode}
							onClick={() => setColorMode(mode as ColorMode)}
							className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
								colorMode === mode
									? "bg-white/15 text-white shadow-sm"
									: "text-slate-400 hover:text-slate-200"
							}`}
						>
							{label}
						</button>
					))}
				</>
			)}
			{((isTemperatureMode && colorMode !== "temperatureDelta") || colorMode === "precipitation" || isWindMode) && (
				<>
					<div className="w-px h-4 bg-white/10 mx-0.5" />
					{([true, false] as const).map((isAnnual) => {
						const active = isTemperatureMode ? tempAnnual
							: colorMode === "precipitation" ? rainAnnual
							: windAnnual
						const setter = isTemperatureMode ? setTempAnnual
							: colorMode === "precipitation" ? setRainAnnual
							: setWindAnnual
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
