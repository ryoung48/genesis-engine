import {
	BarElement,
	CategoryScale,
	type ChartData,
	Chart as ChartJS,
	type ChartOptions,
	Legend,
	LinearScale,
	Tooltip,
} from "chart.js"
import React, { useMemo, useRef, useState } from "react"
import { Bar } from "react-chartjs-2"
import type { StageTiming } from "@/model/orogen/types"
import type { SliderDef } from "../model/sliders"

ChartJS.register(CategoryScale, LinearScale, BarElement, Legend, Tooltip)

interface GenerationPanelProps {
	worldTab: "planet" | "terrain"
	setWorldTab: (tab: "planet" | "terrain") => void
	resetWorldDefaults: () => void
	tidallyLocked: boolean
	setTidallyLocked: (v: boolean) => void
	setObliquity: (v: number) => void
	planetSliders: SliderDef[]
	terrainSliders: SliderDef[]
	planetCode: string
	codeInput: string
	setCodeInput: (v: string) => void
	onApplyCode: () => void
	codeError: boolean
	recentCodes: string[]
	onSelectRecentCode: (code: string) => void
	onRandomizeCode: () => void
	generating: boolean
	generationLabel: string
	generationProgress: number
	generationTimings?: StageTiming[] | null
	handleGenerate: () => void
	handleFileImport: (file: File) => void
	handleEarthImport: () => void
	onClose?: () => void
}

function renderSliderGroup(
	items: SliderDef[],
	columns: "single" | "double" = "double",
) {
	return (
		<div
			className={
				columns === "double"
					? "grid grid-cols-1 xl:grid-cols-2 gap-1.5"
					: "space-y-1.5"
			}
		>
			{items.map((p) => (
				<div
					key={p.label}
					className={`rounded-lg border border-slate-200/80 bg-white/85 px-2.5 py-2 shadow-sm shadow-slate-200/20${p.disabled ? " opacity-40 pointer-events-none" : ""}`}
				>
					<div className="flex justify-between items-baseline gap-3">
						<div className="group relative flex items-center min-w-0">
							<label className="cursor-help border-b border-dotted border-slate-300 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
								{p.label}
							</label>
							<div className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-44 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] normal-case leading-[1.35] text-slate-500 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
								{p.help}
							</div>
						</div>
						<span className="font-mono text-[10px] text-slate-400">
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
						disabled={!!p.disabled}
						className="mt-1.5 w-full accent-slate-900 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
					/>
				</div>
			))}
		</div>
	)
}

function formatTimingSeconds(ms: number): string {
	return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 2)} s`
}

function stripTimingPrefix(stage: string): string {
	return stage.startsWith("orogen:") ? stage.slice("orogen:".length) : stage
}

const GenerationTimingChart: React.FC<{
	timings?: StageTiming[] | null
}> = ({ timings }) => {
	const chartState = useMemo(() => {
		if (!timings?.length) return null

		const orderedEntries = timings
			.map((entry) => {
				const ms = Number.parseFloat(entry.ms)
				return Number.isFinite(ms)
					? { label: stripTimingPrefix(entry.Stage), ms }
					: null
			})
			.filter((entry): entry is { label: string; ms: number } => entry !== null)
			.sort((a, b) => b.ms - a.ms)

		if (!orderedEntries.length) return null

		const largeEntries = orderedEntries.filter((entry) => entry.ms >= 100)
		const otherMs = orderedEntries
			.filter((entry) => entry.ms < 100)
			.reduce((sum, entry) => sum + entry.ms, 0)
		const entries =
			otherMs > 0
				? [...largeEntries, { label: "Other", ms: otherMs }]
				: largeEntries
		entries.sort((a, b) => b.ms - a.ms)

		if (!entries.length) return null

		const labels = entries.map((entry) => entry.label)
		const values = entries.map((entry) => entry.ms)
		const backgroundColor = entries.map((_, idx) =>
			idx === 0 ? "#0f172a" : idx < 4 ? "#1e293b" : "#334155",
		)

		const data: ChartData<"bar"> = {
			labels,
			datasets: [
				{
					label: "ms",
					data: values,
					backgroundColor,
					borderSkipped: false,
					borderRadius: 6,
					maxBarThickness: 18,
				},
			],
		}

		const options: ChartOptions<"bar"> = {
			indexAxis: "y",
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						title: (items) => {
							const idx = items[0]?.dataIndex ?? 0
							return entries[idx]?.label ?? ""
						},
						label: (item) => `${formatTimingSeconds(Number(item.raw))}`,
					},
				},
			},
			scales: {
				x: {
					beginAtZero: true,
					grid: { color: "rgba(148, 163, 184, 0.18)" },
					ticks: {
						font: { size: 9, family: "monospace" },
						callback: (value) => formatTimingSeconds(Number(value)),
					},
				},
				y: {
					grid: { display: false },
					ticks: {
						font: { size: 9, family: "monospace" },
					},
				},
			},
		}

		return {
			data,
			options,
			height: Math.max(180, Math.min(420, entries.length * 24 + 56)),
		}
	}, [timings])

	if (!chartState) {
		return (
			<div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
				<p className="text-[11px] leading-relaxed text-slate-400">
					Run a generation or import to collect stage timings.
				</p>
			</div>
		)
	}

	return (
		<div style={{ height: chartState.height }}>
			<Bar data={chartState.data} options={chartState.options} />
		</div>
	)
}

export const GenerationPanel: React.FC<GenerationPanelProps> = ({
	worldTab,
	setWorldTab,
	resetWorldDefaults,
	tidallyLocked,
	setTidallyLocked,
	setObliquity,
	planetSliders,
	terrainSliders,
	planetCode,
	codeInput,
	setCodeInput,
	onApplyCode,
	codeError,
	recentCodes,
	onSelectRecentCode,
	onRandomizeCode,
	generating,
	generationLabel,
	generationProgress,
	generationTimings,
	handleGenerate,
	handleFileImport,
	handleEarthImport,
	onClose,
}) => {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [showRecentCodes, setShowRecentCodes] = useState(false)
	const [showGenerationTimings, setShowGenerationTimings] = useState(false)

	return (
		<div className="w-full xl:w-[460px] xl:max-w-[36vw] shrink-0 h-auto xl:h-full flex flex-col px-4 py-4 lg:px-5 lg:py-5 border-b xl:border-b-0 xl:border-r border-slate-200 bg-white/95 backdrop-blur-sm">
			{/* Header */}
			<div className="flex items-center gap-3 mb-5">
				<div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						className="text-white"
					>
						<circle
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							strokeWidth="2"
						/>
						<path
							d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
							stroke="currentColor"
							strokeWidth="1.5"
						/>
					</svg>
				</div>
				<span className="font-bold text-sm tracking-tight">GENESIS ENGINE</span>
				<button
					onClick={onClose}
					className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
					title="Hide generation panel"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
				<div className="flex items-center justify-between gap-2">
					<div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1">
						{(
							[
								["planet", "Planet"],
								["terrain", "Terrain"],
							] as const
						).map(([tab, label]) => (
							<button
								key={tab}
								onClick={() => setWorldTab(tab)}
								className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all ${
									worldTab === tab
										? "bg-white text-slate-900 shadow-sm"
										: "text-slate-500 hover:text-slate-700"
								}`}
							>
								{label}
							</button>
						))}
					</div>
					<button
						type="button"
						onClick={resetWorldDefaults}
						className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
					>
						Reset
					</button>
				</div>

				{worldTab === "planet" && (
					<div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
						<label className="flex items-center gap-2 mb-2 px-1 cursor-pointer select-none">
							<input
								type="checkbox"
								checked={tidallyLocked}
								onChange={(e) => {
									setTidallyLocked(e.target.checked)
									if (e.target.checked) setObliquity(0)
								}}
								className="accent-slate-900 h-3.5 w-3.5"
							/>
							<span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
								Tidally Locked
							</span>
							<span className="text-[9px] text-slate-400 ml-auto">
								One side always faces the star
							</span>
						</label>
						{renderSliderGroup(planetSliders)}
					</div>
				)}

				{worldTab === "terrain" && (
					<div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
						{renderSliderGroup(terrainSliders)}
					</div>
				)}

				<div className="space-y-2.5 pt-3 mt-1 border-t border-slate-100">
					<div className="space-y-2">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/png,image/jpeg,image/webp"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0]
								if (file) handleFileImport(file)
								e.target.value = ""
							}}
						/>
						<div className="flex items-stretch gap-2">
							<div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
								<div className="flex items-center gap-2">
									<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
										Code
									</span>
									<input
										type="text"
										value={codeInput}
										onChange={(e) => setCodeInput(e.target.value)}
										onBlur={onApplyCode}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault()
												onApplyCode()
											}
										}}
										disabled={generating}
										placeholder="Planet code"
										className={`min-w-0 flex-1 bg-transparent border-none font-mono text-[11px] focus:ring-0 focus:outline-none placeholder:text-slate-300 disabled:opacity-50 ${
											codeError ? "text-red-500" : "text-slate-700"
										}`}
									/>
									{recentCodes.length > 0 && (
										<button
											type="button"
											onClick={() => setShowRecentCodes((current) => !current)}
											disabled={generating}
											className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{showRecentCodes ? "Hide Recent" : "Recent"}
										</button>
									)}
									<button
										onClick={onRandomizeCode}
										disabled={generating}
										className="p-1 text-slate-300 hover:text-slate-900 transition-colors disabled:opacity-50"
										title="New code"
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<path d="M1 4v6h6M23 20v-6h-6" />
											<path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
										</svg>
									</button>
								</div>
							</div>
						</div>
						{codeError && (
							<p className="mt-1 border-t border-slate-200 pt-2 text-[11px] font-medium text-red-500">
								Invalid code
							</p>
						)}
						{showRecentCodes && recentCodes.length > 0 && (
							<div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2">
								{recentCodes.map((recentCode) => (
									<button
										key={recentCode}
										type="button"
										onClick={() => onSelectRecentCode(recentCode)}
										disabled={generating}
										className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
											recentCode === codeInput || recentCode === planetCode
												? "border-slate-900 bg-slate-900 text-white"
												: "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
										} disabled:opacity-50 disabled:cursor-not-allowed`}
										title="Use recent code"
									>
										{recentCode}
									</button>
								))}
							</div>
						)}
					</div>

					<div className="flex gap-2">
						<button
							onClick={() => {
								setShowRecentCodes(false)
								handleGenerate()
							}}
							disabled={generating}
							className="flex-1 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2.5 text-[11px] font-semibold text-white transition-all hover:bg-slate-800 hover:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
								{generating ? "Generating..." : "Generate"}
							</span>
						</button>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={generating}
							className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
							title="Import an equirectangular B&W heightmap (PNG, JPEG, WebP)"
						>
							Import
						</button>
						<button
							type="button"
							onClick={handleEarthImport}
							disabled={generating}
							className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
							title="Load Earth's heightmap"
						>
							Earth
						</button>
					</div>

					<div className="space-y-1">
						<div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400">
							<span>{generating ? generationLabel : "Generation"}</span>
							<span>{Math.round(generationProgress)}%</span>
						</div>
						<div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
							<div
								className="h-full rounded-full bg-slate-900 transition-all duration-200"
								style={{
									width: `${Math.max(0, Math.min(100, generationProgress))}%`,
								}}
							/>
						</div>
					</div>

					<div className="pt-1">
						<div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/20">
							<button
								type="button"
								onClick={() => setShowGenerationTimings((current) => !current)}
								className="flex w-full items-center justify-between gap-3 text-left"
							>
								<div>
									<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
										Timing
									</div>
								</div>
								<div className="flex items-center gap-2">
									<span className="font-mono text-[10px] text-slate-400">
										{generationTimings?.length
											? formatTimingSeconds(
													generationTimings.reduce(
														(sum, entry) =>
															sum + (Number.parseFloat(entry.ms) || 0),
														0,
													),
												)
											: "--"}
									</span>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										className={`text-slate-400 transition-transform ${showGenerationTimings ? "rotate-180" : ""}`}
									>
										<polyline points="6 9 12 15 18 9" />
									</svg>
								</div>
							</button>
							{showGenerationTimings && (
								<div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
									<GenerationTimingChart timings={generationTimings} />
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
