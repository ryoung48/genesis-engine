import { interpolateBlues, interpolateOranges, interpolateReds } from "d3"
import React from "react"
import type { useEbmPreview } from "@/hooks/useEbmPreview"
import type { HeightmapPreset } from "@/hooks/useWorldGeneration"
import { ConstellationBackground } from "../ui/ConstellationBackground"
import SeasonalTempByLat from "../world/charts/SimulationTab/SeasonalTempByLat"
import ZonalCirculationChart from "../world/charts/SimulationTab/ZonalCirculationChart"
import { LanguageLab } from "./LanguageLab"

type PreviewTab =
	| "temperature"
	| "gradient"
	| "insolation"
	| "daylight"
	| "circulation"
	| "wind"
	| "language"

interface EarthDefaults {
	obliquity: number
	eccentricity: number
	perihelion: number
	sunTempFactor: number
	hoursPerDay: number
	daysPerYear: number
	landFraction: number
	radiusFactor: number
}

interface GenesisEngineProps {
	isExiting: boolean
	seed: string
	setSeed: (seed: string) => void
	obliquity: number
	setObliquity: (v: number) => void
	eccentricity: number
	setEccentricity: (v: number) => void
	perihelion: number
	setPerihelion: (v: number) => void
	sunTempFactor: number
	setSunTempFactor: (v: number) => void
	hoursPerDay: number
	setHoursPerDay: (v: number) => void
	daysPerYear: number
	setDaysPerYear: (v: number) => void
	landFraction: number
	setLandFraction: (v: number) => void
	radiusFactor: number
	setRadiusFactor: (v: number) => void
	heightmap: HeightmapPreset | undefined
	setHeightmap: (v: HeightmapPreset | undefined) => void
	onLaunch: () => void
	onOrogenClick?: () => void
	ebmPreview: ReturnType<typeof useEbmPreview>
	previewTab: PreviewTab
	setPreviewTab: (tab: PreviewTab) => void
	earthDefaults: EarthDefaults
}

export const GenesisEngine = ({
	isExiting,
	seed,
	setSeed,
	obliquity,
	setObliquity,
	eccentricity,
	setEccentricity,
	perihelion,
	setPerihelion,
	sunTempFactor,
	setSunTempFactor,
	hoursPerDay,
	setHoursPerDay,
	daysPerYear,
	setDaysPerYear,
	landFraction,
	setLandFraction,
	radiusFactor,
	setRadiusFactor,
	heightmap,
	setHeightmap,
	onLaunch,
	onOrogenClick,
	ebmPreview,
	previewTab,
	setPreviewTab,
	earthDefaults,
}: GenesisEngineProps) => {
	return (
		<div
			className={`w-full h-full flex relative ${isExiting ? "animate-[cm-fade-out_500ms_ease-out_forwards]" : ""
				}`}
		>
			<ConstellationBackground />

			{/* Left Column — Controls */}
			<div className="relative z-10 w-[360px] shrink-0 h-full flex flex-col px-10 py-8 border-r border-slate-100 animate-[cm-slide-up_700ms_ease-out_both]">
				{/* Header */}
				<div className="flex items-center gap-3 mb-10">
					<div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center">
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							className="text-white"
						>
							<path
								d="M12 2L2 7l10 5 10-5-10-5z"
								fill="currentColor"
								opacity="0.9"
							/>
							<path
								d="M2 17l10 5 10-5"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<path
								d="M2 12l10 5 10-5"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</div>
					<span className="font-bold text-sm tracking-tight">GENESIS</span>
					<span className="font-mono text-[10px] text-slate-300 ml-auto">
						V.2.0
					</span>
				</div>

				{/* Title */}
				<div className="mb-8">
					<div className="flex items-center gap-3 mb-3">
						<div className="h-px w-8 bg-slate-300" />
						<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.3em]">
							World Forge
						</span>
					</div>
					<h1 className="text-5xl font-black tracking-tighter leading-[0.85] mb-3">
						<span className="text-slate-900">GENESIS</span>
						<br />
						<span className="text-slate-300">ENGINE</span>
					</h1>
					<p className="text-slate-400 text-sm leading-relaxed">
						Procedural world generation with dynamic terrain, climate systems,
						and emergent civilizations.
					</p>
				</div>

				{/* Parameters */}
				<div className="flex-1 min-h-0 space-y-4">
					<div className="flex items-baseline justify-between">
						<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
							Parameters
						</span>
						<button
							onClick={() => {
								setObliquity(earthDefaults.obliquity)
								setEccentricity(earthDefaults.eccentricity)
								setPerihelion(earthDefaults.perihelion)
								setSunTempFactor(earthDefaults.sunTempFactor)
								setHoursPerDay(earthDefaults.hoursPerDay)
								setDaysPerYear(earthDefaults.daysPerYear)
								setLandFraction(earthDefaults.landFraction)
								setRadiusFactor(earthDefaults.radiusFactor)
							}}
							className="font-mono text-[10px] text-slate-300 hover:text-slate-900 transition-colors uppercase tracking-wider"
						>
							Reset
						</button>
					</div>

					<div className="space-y-2.5">
						{(
							[
								{
									label: "Axial Tilt",
									value: obliquity,
									display: `${obliquity.toFixed(1)}\u00B0`,
									min: 0,
									max: 90,
									step: 0.5,
									set: setObliquity,
								},
								{
									label: "Eccentricity",
									value: eccentricity,
									display: eccentricity.toFixed(3),
									min: 0,
									max: 0.5,
									step: 0.001,
									set: setEccentricity,
								},
								{
									label: "Perihelion",
									value: perihelion,
									display: `${perihelion.toFixed(0)}\u00B0`,
									min: 0,
									max: 360,
									step: 1,
									set: setPerihelion,
								},
								{
									label: "Sun Temp",
									value: sunTempFactor,
									display: `${sunTempFactor.toFixed(1)}x`,
									min: 0.9,
									max: 1.1,
									step: 0.001,
									set: setSunTempFactor,
								},
								{
									label: "Hours / Day",
									value: hoursPerDay,
									display: `${hoursPerDay.toFixed(0)} h`,
									min: 8,
									max: 48,
									step: 1,
									set: setHoursPerDay,
								},
								{
									label: "Days / Year",
									value: daysPerYear,
									display: `${daysPerYear.toFixed(0)} d`,
									min: 100,
									max: 1000,
									step: 5,
									set: setDaysPerYear,
								},
								{
									label: "Land",
									value: landFraction,
									display: `${(landFraction * 100).toFixed(0)}%`,
									min: 0,
									max: 1,
									step: 0.05,
									set: setLandFraction,
								},
								{
									label: "Radius",
									value: radiusFactor,
									display: `${radiusFactor.toFixed(1)}x`,
									min: 0.5,
									max: 4,
									step: 0.1,
									set: setRadiusFactor,
								},
							] as {
								label: string
								value: number
								display: string
								min: number
								max: number
								step: number
								set: (v: number) => void
							}[]
						).map((p) => (
							<div key={p.label} className="space-y-0.5">
								<div className="flex justify-between items-baseline">
									<label className="text-[11px] font-medium text-slate-500">
										{p.label}
									</label>
									<span className="font-mono text-[11px] text-slate-400">
										{p.display}
									</span>
								</div>
								<input
									type="range"
									min={p.min}
									max={p.max}
									step={p.step}
									value={p.value}
									onChange={(e) => p.set(parseFloat(e.target.value))}
									className="w-full accent-slate-900 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
								/>
							</div>
						))}
					</div>
				</div>

				<div className="pt-4 mt-4 border-t border-slate-100">
					<button
						onClick={() =>
							setHeightmap(
								heightmap
									? undefined
									: {
										url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/World_elevation_map.png/3840px-World_elevation_map.png",
										seaLevel: 0.565,
										resolution: 4,
									},
							)
						}
						className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${heightmap
								? "bg-slate-900 text-white hover:bg-black"
								: "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
							}`}
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<circle cx="12" cy="12" r="10" />
							<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
						</svg>
						{heightmap ? "Using Earth Heightmap" : "Use Earth Heightmap"}
					</button>
				</div>

				{onOrogenClick && (
					<div className="pt-4 border-t border-slate-100">
						<button
							onClick={onOrogenClick}
							className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all flex items-center justify-center gap-2"
						>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<circle cx="12" cy="12" r="10" />
								<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
							</svg>
							Tectonic Lab
						</button>
					</div>
				)}

				{/* Seed + Launch */}
				<div className="space-y-3 pt-6 border-t border-slate-100 mt-auto">
					<div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-slate-900/10 transition-all">
						<input
							type="text"
							value={seed}
							onChange={(e) => setSeed(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && onLaunch()}
							placeholder="World seed..."
							className="flex-1 bg-transparent border-none font-mono text-sm text-slate-900 focus:ring-0 focus:outline-none placeholder:text-slate-300"
							autoFocus
						/>
						<button
							onClick={() => setSeed(crypto.randomUUID().slice(0, 8))}
							className="p-1 text-slate-300 hover:text-slate-900 transition-colors"
							title="Random seed"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
						</button>
					</div>

					<button
						onClick={() => onLaunch()}
						className="w-full bg-slate-900 text-white py-3 px-4 rounded-lg hover:bg-black transition-all flex justify-between items-center group text-sm font-semibold"
					>
						<span className="flex items-center gap-2">
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
							</svg>
							Launch Genesis
						</span>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="group-hover:translate-x-1 transition-transform"
						>
							<path d="M5 12h14m-7-7 7 7-7 7" />
						</svg>
					</button>
				</div>
			</div>

			{/* Right Column — Climate Preview */}
			<div
				className="relative z-10 flex-1 h-full flex flex-col p-8 animate-[cm-slide-up_700ms_ease-out_both]"
				style={{ animationDelay: "100ms" }}
			>
				<div className="flex items-center gap-2 mb-3">
					<div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
					<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
						{previewTab === "language" ? "Language lab" : "Climate Preview"}
					</span>

					{previewTab !== "language" && (
						<div className="flex items-baseline gap-2 ml-6">
							<span className="font-mono text-[10px] text-slate-300 uppercase tracking-widest">
								Global Avg
							</span>
							<span className="text-sm font-bold tracking-tighter text-slate-900">
								{ebmPreview.avgTemp.toFixed(1)}&deg;C
							</span>
						</div>
					)}

					<div className="ml-auto flex gap-1">
						{(
							[
								["temperature", "TEMP"],
								["gradient", "GRAD"],
								["insolation", "INSOL"],
								["daylight", "LIGHT"],
								["circulation", "CIRC"],
								["wind", "WIND"],
								["language", "LANG"],
							] as const
						).map(([key, label]) => (
							<button
								key={key}
								onClick={() => setPreviewTab(key)}
								className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors ${previewTab === key ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-600"}`}
							>
								{label}
							</button>
						))}
					</div>
				</div>

				<div className="flex-1 min-h-0 flex flex-col">
					{previewTab === "language" && <LanguageLab />}
					{previewTab === "temperature" && (
						<SeasonalTempByLat
							heat={ebmPreview.heat}
							latRange={ebmPreview.lats}
							sampledDays={ebmPreview.sampledDays}
							dayLabels={ebmPreview.dayLabels}
							fullHeight={true}
						/>
					)}
					{previewTab === "gradient" && (
						<SeasonalTempByLat
							heat={ebmPreview.gradient}
							latRange={ebmPreview.lats}
							sampledDays={ebmPreview.sampledDays}
							dayLabels={ebmPreview.dayLabels}
							colorFn={ebmPreview.gradientColorFn}
							unit=" °C/°lat"
							fullHeight={true}
						/>
					)}
					{previewTab === "insolation" && (
						<SeasonalTempByLat
							heat={ebmPreview.insolation}
							latRange={ebmPreview.lats}
							sampledDays={ebmPreview.sampledDays}
							dayLabels={ebmPreview.dayLabels}
							colorFn={ebmPreview.insolColorFn}
							unit=" W/m²"
							fullHeight={true}
						/>
					)}
					{previewTab === "daylight" && (
						<SeasonalTempByLat
							heat={ebmPreview.daylight}
							latRange={ebmPreview.lats}
							sampledDays={ebmPreview.sampledDays}
							dayLabels={ebmPreview.dayLabels}
							colorFn={ebmPreview.daylightColorFn}
							unit=" hrs"
							fullHeight={true}
						/>
					)}
					{previewTab === "circulation" && (
						<>
							<ZonalCirculationChart
								teqByDay={ebmPreview.teqByDay}
								dayLabels={ebmPreview.dayLabels}
								sampledDays={ebmPreview.sampledDays}
							/>
							<div className="mt-2 flex gap-4 justify-center">
								<span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
									<span
										className="w-3 h-3 rounded-sm"
										style={{ backgroundColor: interpolateReds(0.9) }}
									/>{" "}
									ITCZ
								</span>
								<span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
									<span
										className="w-3 h-3 rounded-sm"
										style={{ backgroundColor: interpolateOranges(0.7) }}
									/>{" "}
									Subsidence
								</span>
								<span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
									<span
										className="w-3 h-3 rounded-sm"
										style={{ backgroundColor: interpolateBlues(0.7) }}
									/>{" "}
									Westerlies
								</span>
							</div>
						</>
					)}
					{previewTab === "wind" && (
						<SeasonalTempByLat
							heat={ebmPreview.wind}
							latRange={ebmPreview.lats}
							sampledDays={ebmPreview.sampledDays}
							dayLabels={ebmPreview.dayLabels}
							colorFn={ebmPreview.windColorFn}
							unit=" m/s"
							fullHeight={true}
						/>
					)}
				</div>
			</div>
		</div >
	)
}
