import * as d3 from "d3"
import { Fragment, useEffect, useMemo, useState } from "react"
import SeasonalTempByLat from "@/components/world/charts/SimulationTab/SeasonalTempByLat"
import { EBM, EnergyBalanceModel } from "@/model/cells/ebm"

type EbmViewMode = "temperature" | "gradient"

const GradientHeatmap = ({
	gradient,
	latRange,
	sampledDays,
	dayLabels,
}: {
	gradient: number[][]
	latRange: number[]
	sampledDays: number[]
	dayLabels: string[]
}) => {
	const gradientValues = gradient.flatMap((row) => sampledDays.map((day) => row[day] ?? 0))
	const maxAbsGradient = Math.max(
		0.1,
		...gradientValues.map((value) => Math.abs(value)),
	)
	const gradientColor = d3
		.scaleDiverging((t) => d3.interpolateRdBu(1 - t))
		.domain([-maxAbsGradient, 0, maxAbsGradient])

	return (
		<div className="mt-4 h-full flex flex-col min-h-0">
			<div className="flex-1 min-h-0 overflow-auto rounded-lg border border-slate-100">
				<div
					className="grid min-w-max"
					style={{
						gridTemplateColumns: `72px repeat(${sampledDays.length}, minmax(22px, 1fr))`,
					}}
				>
					<div className="sticky left-0 top-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
						Lat
					</div>
					{dayLabels.map((label, idx) => (
						<div
							key={`day-${sampledDays[idx]}`}
							className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-1 py-2 text-center text-[10px] font-mono text-slate-500"
							title={`Day ${sampledDays[idx] + 1}`}
						>
							{label}
						</div>
					))}

					{latRange.map((lat, latIdx) => (
						<Fragment key={`lat-row-${latIdx}`}>
							<div
								key={`lat-label-${lat}`}
								className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-1 text-xs font-mono text-slate-500"
							>
								{lat.toFixed(0)}°
							</div>
							{sampledDays.map((day) => {
								const value = gradient[latIdx]?.[day] ?? 0
								return (
									<div
										key={`grad-${latIdx}-${day}`}
										className="h-5 border-b border-r border-slate-100"
										style={{ backgroundColor: gradientColor(value) }}
										title={`Lat ${lat.toFixed(1)}°, Day ${day + 1}: ${value.toFixed(2)} °C/°lat`}
									/>
								)
							})}
						</Fragment>
					))}
				</div>
			</div>

			<div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
				<span className="font-mono">dT/dlat (°C/°lat)</span>
				<div
					className="h-3 flex-1 rounded-full border border-slate-200"
					style={{
						background: `linear-gradient(90deg, ${gradientColor(-maxAbsGradient)} 0%, ${gradientColor(0)} 50%, ${gradientColor(maxAbsGradient)} 100%)`,
					}}
				/>
				<span className="font-mono">{(-maxAbsGradient).toFixed(2)}</span>
				<span className="font-mono">0</span>
				<span className="font-mono">{maxAbsGradient.toFixed(2)}</span>
			</div>
		</div>
	)
}

const EbmLab = ({ onClose }: { onClose: () => void }) => {
	const [obliquity, setObliquity] = useState(23.5)
	const [eccentricity, setEccentricity] = useState(0.017)
	const [landFraction, setLandFraction] = useState(0.3)
	const [viewMode, setViewMode] = useState<EbmViewMode>("temperature")
	const [modelInstance, setModelInstance] = useState<EnergyBalanceModel | null>(
		null,
	)

	useEffect(() => {
		const config = {
			orbital: {
				OBLIQUITY: obliquity,
				ECCENTRICITY: eccentricity,
				PERIHELION: 102,
			},
			landFraction: new Array(36).fill(landFraction),
		}

		const model = new EnergyBalanceModel(config)
		model.runModel(30, 0.5)
		setModelInstance(model)
	}, [obliquity, eccentricity, landFraction])

	const { heat, lats, sampledDays, dayLabels, gradient } = useMemo(() => {
		if (!modelInstance) {
			return {
				heat: [],
				lats: [],
				sampledDays: [],
				dayLabels: [],
				gradient: [],
			}
		}

		const heat = modelInstance.temperature
		const lats = modelInstance.lats_deg
		const time = EBM.constants.time

		const sampledDays = []
		const dayLabels = []
		for (let i = 0; i < time.DAYS_PER_YEAR; i += 10) {
			sampledDays.push(i)
			dayLabels.push(`${i + 1}`)
		}

		const gradient = heat.map((row, latIdx) => {
			const prevIdx = Math.max(0, latIdx - 1)
			const nextIdx = Math.min(heat.length - 1, latIdx + 1)
			const latSpan = lats[nextIdx] - lats[prevIdx] || 1

			return row.map((_, dayIdx) => {
				const dT = heat[nextIdx][dayIdx] - heat[prevIdx][dayIdx]
				return dT / latSpan
			})
		})

		return { heat, lats, sampledDays, dayLabels, gradient }
	}, [modelInstance])

	const colorFn = useMemo(() => {
		return d3.scaleSequential(d3.interpolateSpectral).domain([35, -10])
	}, [])

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm animate-[cm-fade-in_300ms_ease-out]">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-[cm-slide-up_400ms_ease-out]">
				<div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
					<div>
						<h2 className="text-2xl font-bold text-slate-900 tracking-tight">
							Climate Lab
						</h2>
						<p className="text-slate-500 text-sm font-mono mt-1">
							REAL-TIME EBM SIMULATION
						</p>
					</div>
					<button
						onClick={onClose}
						className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500 hover:text-slate-900"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				<div className="flex-1 flex min-h-0">
					<div className="w-80 bg-slate-50 border-r border-slate-100 p-8 flex flex-col gap-8 overflow-y-auto">
						<div className="space-y-4">
							<div className="flex justify-between items-baseline">
								<label className="text-sm font-bold text-slate-700">
									Axial Tilt
								</label>
								<span className="font-mono text-xs text-slate-500">
									{obliquity.toFixed(1)}°
								</span>
							</div>
							<input
								type="range"
								min="0"
								max="90"
								step="0.5"
								value={obliquity}
								onChange={(e) => setObliquity(parseFloat(e.target.value))}
								className="w-full accent-slate-900 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
							/>
							<p className="text-xs text-slate-400 leading-relaxed">
								Obliquity determines the severity of seasons. <br />
								Earth: 23.5°
							</p>
						</div>

						<div className="space-y-4">
							<div className="flex justify-between items-baseline">
								<label className="text-sm font-bold text-slate-700">
									Eccentricity
								</label>
								<span className="font-mono text-xs text-slate-500">
									{eccentricity.toFixed(3)}
								</span>
							</div>
							<input
								type="range"
								min="0"
								max="0.2"
								step="0.001"
								value={eccentricity}
								onChange={(e) => setEccentricity(parseFloat(e.target.value))}
								className="w-full accent-slate-900 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
							/>
							<p className="text-xs text-slate-400 leading-relaxed">
								Orbital shape deviation from a circle. <br />
								Earth: ~0.017
							</p>
						</div>

						<div className="space-y-4">
							<div className="flex justify-between items-baseline">
								<label className="text-sm font-bold text-slate-700">
									Land Fraction
								</label>
								<span className="font-mono text-xs text-slate-500">
									{(landFraction * 100).toFixed(0)}%
								</span>
							</div>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={landFraction}
								onChange={(e) => setLandFraction(parseFloat(e.target.value))}
								className="w-full accent-slate-900 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
							/>
							<p className="text-xs text-slate-400 leading-relaxed">
								Global ratio of land to ocean surface area.
							</p>
						</div>

						<div className="space-y-3">
							<div className="flex justify-between items-baseline">
								<label className="text-sm font-bold text-slate-700">
									Display
								</label>
								<span className="font-mono text-xs text-slate-500">
									{viewMode === "temperature" ? "TEMP" : "DT/DLAT"}
								</span>
							</div>
							<div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-1 border border-slate-200">
								<button
									type="button"
									onClick={() => setViewMode("temperature")}
									className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
										viewMode === "temperature"
											? "bg-slate-900 text-white"
											: "text-slate-600 hover:bg-slate-100"
									}`}
								>
									Temperature
								</button>
								<button
									type="button"
									onClick={() => setViewMode("gradient")}
									className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
										viewMode === "gradient"
											? "bg-slate-900 text-white"
											: "text-slate-600 hover:bg-slate-100"
									}`}
								>
									Gradient
								</button>
							</div>
							<p className="text-xs text-slate-400 leading-relaxed">
								Gradient shows signed northward temperature change by latitude band and sampled day.
							</p>
						</div>
					</div>

					<div className="flex-1 p-8 overflow-hidden flex flex-col">
						<div className="mb-4 flex items-center justify-between gap-4">
							<div>
								<h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
									{viewMode === "temperature"
										? "Temperature By Latitude"
										: "Temperature Gradient By Day"}
								</h3>
								<p className="mt-1 text-sm text-slate-400">
									{viewMode === "temperature"
										? "Sampled zonal temperatures across the year."
										: "Signed meridional gradient using adjacent latitude bands."}
								</p>
							</div>
						</div>
						<div className="flex-1 relative min-h-0 bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
							{heat.length > 0 && viewMode === "temperature" && (
								<SeasonalTempByLat
									heat={heat}
									latRange={lats}
									sampledDays={sampledDays}
									dayLabels={dayLabels}
									colorFn={colorFn}
									fullHeight
								/>
							)}
							{gradient.length > 0 && viewMode === "gradient" && (
								<GradientHeatmap
									gradient={gradient}
									latRange={lats}
									sampledDays={sampledDays}
									dayLabels={dayLabels}
								/>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default EbmLab
