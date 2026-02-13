import { useState } from "react"
import WorldMap from "./components/world"
import { WORLD } from "./model"
import { HISTORY } from "./model/history"
import { SHAPER_CLIMATES } from "./model/shapers/climate"
import { SHAPER_CONTINENTS } from "./model/shapers/continents"
import { SHAPER_DISPLAY } from "./model/shapers/display"
import { SHAPER_PARTITIONS } from "./model/shapers/partitions"
import { SHAPER_MOUNTAINS } from "./model/shapers/topagraphy"
import { TIME } from "./model/utilities/time"

type ViewState = "start" | "loading" | "complete"

interface LoadingStep {
	name: string
	progress: number
}

const LOADING_STEPS: LoadingStep[] = [
	{ name: "Generating Continents", progress: 15 },
	{ name: "Raising Mountains", progress: 35 },
	{ name: "Simulating Climate", progress: 55 },
	{ name: "Dividing Territories", progress: 70 },
	{ name: "Writing History", progress: 90 },
	{ name: "Rendering World", progress: 100 },
]

const catchupDelay = 300

// Segmented Progress Bar
const ProgressBar = ({ progress }: { progress: number }) => {
	const segments = 40
	const filled = Math.floor((progress / 100) * segments)
	return (
		<div className="flex gap-0.5 w-full overflow-hidden">
			{Array.from({ length: segments }).map((_, i) => (
				<div
					key={i}
					className={`h-2 flex-1 transition-all duration-300 ${i < filled ? "bg-slate-900 scale-y-100" : "bg-slate-100 scale-y-75"
						}`}
				/>
			))}
		</div>
	)
}

// Animated constellation background with floating particles
const ConstellationBackground = () => (
	<div className="absolute inset-0 overflow-hidden pointer-events-none">
		{/* Grid pattern */}
		<div
			className="absolute inset-0 opacity-[0.03]"
			style={{
				backgroundImage: `
					linear-gradient(to right, #0f172a 1px, transparent 1px),
					linear-gradient(to bottom, #0f172a 1px, transparent 1px)
				`,
				backgroundSize: "60px 60px",
			}}
		/>

		{/* Radial gradient overlay */}
		<div
			className="absolute inset-0"
			style={{
				background:
					"radial-gradient(ellipse at 70% 50%, rgba(100, 116, 139, 0.06) 0%, transparent 50%)",
			}}
		/>

		{/* Floating particles */}
		{Array.from({ length: 20 }).map((_, i) => (
			<div
				key={i}
				className="absolute w-1 h-1 bg-slate-400/20 rounded-full"
				style={{
					left: `${Math.random() * 100}%`,
					top: `${Math.random() * 100}%`,
					animation: `cm-float ${8 + Math.random() * 12}s ease-in-out infinite`,
					animationDelay: `${Math.random() * 5}s`,
				}}
			/>
		))}
	</div>
)

// Glowing genesis orb - central visual element
const GenesisOrb = ({ className }: { className?: string }) => (
	<div className={`relative flex items-center justify-center ${className}`}>
		{/* Outer glow */}
		<div className="absolute w-80 h-80 bg-slate-300/10 rounded-full blur-3xl animate-pulse" />

		{/* Orbital rings */}
		<svg
			width="280"
			height="280"
			viewBox="0 0 280 280"
			fill="none"
			className="absolute animate-[spin_30s_linear_infinite]"
		>
			<ellipse
				cx="140"
				cy="140"
				rx="130"
				ry="50"
				stroke="currentColor"
				strokeWidth="0.5"
				className="text-slate-400 opacity-40"
			/>
		</svg>

		<svg
			width="280"
			height="280"
			viewBox="0 0 280 280"
			fill="none"
			className="absolute animate-[spin_25s_linear_infinite_reverse]"
			style={{ transform: "rotateX(70deg) rotateZ(30deg)" }}
		>
			<ellipse
				cx="140"
				cy="140"
				rx="110"
				ry="40"
				stroke="currentColor"
				strokeWidth="0.5"
				className="text-slate-300 opacity-30"
			/>
		</svg>

		{/* Rotating outer ring */}
		<svg
			width="180"
			height="180"
			viewBox="0 0 180 180"
			fill="none"
			className="absolute animate-[spin_20s_linear_infinite]"
		>
			<circle
				cx="90"
				cy="90"
				r="85"
				stroke="currentColor"
				strokeWidth="0.5"
				strokeDasharray="2 8"
				className="text-slate-300"
			/>
			<circle
				cx="90"
				cy="90"
				r="85"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray="40 200"
				strokeLinecap="round"
				className="text-slate-900"
			/>
		</svg>

		{/* Inner rotating ring */}
		<svg
			width="120"
			height="120"
			viewBox="0 0 120 120"
			fill="none"
			className="absolute animate-[spin_12s_linear_infinite_reverse]"
		>
			<circle
				cx="60"
				cy="60"
				r="55"
				stroke="currentColor"
				strokeWidth="0.5"
				className="text-slate-200"
			/>
			<circle
				cx="60"
				cy="60"
				r="55"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeDasharray="30 150"
				strokeLinecap="round"
				className="text-slate-700"
			/>
		</svg>

		{/* Core sphere */}
		<div className="relative w-16 h-16">
			<div
				className="absolute inset-0 rounded-full"
				style={{
					background:
						"radial-gradient(circle at 35% 35%, #f8fafc, #94a3b8 40%, #0f172a 100%)",
					boxShadow:
						"0 0 60px rgba(15, 23, 42, 0.3), inset -4px -4px 20px rgba(0,0,0,0.5)",
				}}
			/>
			<div
				className="absolute inset-0 rounded-full bg-white/20"
				style={{ clipPath: "ellipse(40% 30% at 35% 35%)" }}
			/>
		</div>

		{/* Orbiting dots */}
		<div className="absolute w-[180px] h-[180px] animate-[spin_8s_linear_infinite]">
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-slate-900 rounded-full shadow-[0_0_10px_rgba(15,23,42,0.6)]" />
		</div>
		<div className="absolute w-[140px] h-[140px] animate-[spin_6s_linear_infinite_reverse]">
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-slate-500 rounded-full shadow-[0_0_8px_rgba(100,116,139,0.6)]" />
		</div>
	</div>
)

import EbmLab from "./components/landing/EbmLab"

function App() {
	const [view, setView] = useState<ViewState>("start")
	const [showLab, setShowLab] = useState(false)
	const [seed, setSeed] = useState(
		() => localStorage.getItem("chaos-machine-last-seed") || "",
	)
	const [loadingProgress, setLoadingProgress] = useState(0)
	const [currentStep, setCurrentStep] = useState<string>("")
	const [logs, setLogs] = useState<string[]>([])
	const [isExiting, setIsExiting] = useState(false)
	const [activeStepIndex, setActiveStepIndex] = useState(-1)
	const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

	const addLog = (message: string) => {
		setLogs((prev) =>
			[
				...prev,
				`[${new Date().toISOString().split("T")[1].slice(0, 12)}] ${message}`,
			].slice(-8),
		)
	}

	const handleStartClick = async (manualSeed?: string) => {
		const worldSeed =
			(manualSeed ?? seed).trim() || crypto.randomUUID().slice(0, 8)
		localStorage.setItem("chaos-machine-last-seed", worldSeed)

		// Fade out the landing page
		setIsExiting(true)
		await TIME.delay(500)

		setView("loading")
		setIsExiting(false)
		setLogs([])
		setCompletedSteps(new Set())
		setActiveStepIndex(-1)
		setLoadingProgress(0)
		addLog("INIT_SYSTEM_SEQUENCE_START")
		addLog(`SEED_HASH: ${worldSeed}`)
		await TIME.delay(200)

		const runStep = async (step: LoadingStep, index: number) => {
			setCurrentStep(step.name)
			setActiveStepIndex(index)
			addLog(`EXEC_MODULE: ${step.name.toUpperCase().replace(/ /g, "_")}`)
			setLoadingProgress(step.progress)
			// Yield to allow React to render the "Active" state before blocking the main thread
			await TIME.delay(50)
		}

		const completeStep = (index: number) => {
			setCompletedSteps((prev) => new Set(prev).add(index))
		}

		console.time("Continents")
		await runStep(LOADING_STEPS[0], 0)
		window.world = WORLD.spawn({ seed: worldSeed })
		SHAPER_CONTINENTS.build()
		completeStep(0)
		console.timeEnd("Continents")
		await TIME.delay(catchupDelay)

		console.time("Mountains")
		await runStep(LOADING_STEPS[1], 1)
		SHAPER_MOUNTAINS.build()
		completeStep(1)
		console.timeEnd("Mountains")
		await TIME.delay(catchupDelay)

		console.time("Climate")
		await runStep(LOADING_STEPS[2], 2)
		SHAPER_CLIMATES.build()
		completeStep(2)
		console.timeEnd("Climate")
		await TIME.delay(catchupDelay)

		console.time("Partitions")
		await runStep(LOADING_STEPS[3], 3)
		SHAPER_PARTITIONS.build()
		completeStep(3)
		console.timeEnd("Partitions")
		await TIME.delay(catchupDelay)

		console.time("History")
		await runStep(LOADING_STEPS[4], 4)
		HISTORY.init()
		completeStep(4)
		console.timeEnd("History")
		await TIME.delay(catchupDelay)

		console.time("Display")
		await runStep(LOADING_STEPS[5], 5)
		SHAPER_DISPLAY.build()
		completeStep(5)
		console.timeEnd("Display")
		await TIME.delay(catchupDelay)

		addLog("SYSTEM_READY")

		// Fade out loading screen
		setIsExiting(true)
		await TIME.delay(600)
		setView("complete")
		setIsExiting(false)
	}

	return (
		<div className="w-screen h-screen bg-white text-slate-900 font-sans overflow-hidden relative selection:bg-slate-900 selection:text-white">
			{view === "start" && (
				<div
					className={`w-full h-full flex flex-col relative ${isExiting ? "animate-[cm-fade-out_500ms_ease-out_forwards]" : ""
						}`}
				>
					{/* Animated Background */}
					<ConstellationBackground />

					{/* Top Navigation Bar */}
					<div className="relative z-10 flex justify-between items-center px-8 md:px-12 lg:px-16 py-6 animate-[cm-slide-up_700ms_ease-out_both]">
						<div className="flex items-center gap-6">
							<div className="flex items-center gap-3">
								<div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
									<svg
										width="16"
										height="16"
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
								<span className="font-bold text-sm tracking-tight">
									GENESIS
								</span>
							</div>
							<div className="hidden md:flex items-center gap-2 font-mono text-[10px] text-slate-400">
								<div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
								<span>SYSTEMS NOMINAL</span>
							</div>
						</div>
						<div className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
							V.2.0.0
						</div>
					</div>

					{/* Main Hero Section */}
					<div
						className="relative z-10 flex-1 flex items-center px-8 md:px-12 lg:px-16 animate-[cm-slide-up_700ms_ease-out_both]"
						style={{ animationDelay: "100ms" }}
					>
						<div className="w-full grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
							{/* Left Column - Title & Controls */}
							<div className="space-y-10">
								{/* Main Title Block */}
								<div className="space-y-4">
									<div className="flex items-center gap-3">
										<div className="h-px flex-1 max-w-12 bg-slate-300" />
										<span className="font-mono text-[10px] text-slate-500 uppercase tracking-[0.3em]">
											World Forge
										</span>
									</div>

									<h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[7rem] font-black tracking-tighter leading-[0.85]">
										<span className="text-slate-900">GENESIS</span>
										<br />
										<span className="text-slate-300">ENGINE</span>
									</h1>

									<p className="text-slate-500 text-lg max-w-md leading-relaxed">
										Procedural world generation with dynamic terrain, climate
										systems, and emergent civilizations.
									</p>
								</div>

								{/* Seed Input & Launch */}
								<div className="space-y-4 max-w-md">
									<div className="relative">
										<div className="relative flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-2 focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/5 transition-all shadow-sm">
											<div className="pl-3 text-slate-300">
												<svg
													width="18"
													height="18"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
												>
													<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
												</svg>
											</div>
											<input
												type="text"
												value={seed}
												onChange={(e) => setSeed(e.target.value)}
												onKeyDown={(e) =>
													e.key === "Enter" && handleStartClick()
												}
												placeholder="Enter world seed..."
												className="flex-1 bg-transparent border-none p-2 font-mono text-sm text-slate-900 focus:ring-0 focus:outline-none placeholder:text-slate-300"
												autoFocus
											/>
											<button
												onClick={() => setSeed(crypto.randomUUID().slice(0, 8))}
												className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
												title="Generate random seed"
											>
												<svg
													width="18"
													height="18"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
												>
													<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
												</svg>
											</button>
										</div>
									</div>

									<button
										onClick={() => handleStartClick()}
										className="w-full bg-slate-900 text-white p-4 rounded-xl hover:bg-black hover:shadow-xl hover:-translate-y-0.5 transition-all flex justify-between items-center group font-semibold"
									>
										<span className="flex items-center gap-3">
											<svg
												width="20"
												height="20"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
											>
												<polygon
													points="5 3 19 12 5 21 5 3"
													fill="currentColor"
												/>
											</svg>
											Launch Genesis
										</span>
										<svg
											width="20"
											height="20"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											className="group-hover:translate-x-1 transition-transform"
										>
											<path d="M5 12h14m-7-7 7 7-7 7" />
										</svg>
									</button>

									<button
										onClick={() => setShowLab(true)}
										className="w-full bg-white text-slate-600 border border-slate-200 p-4 rounded-xl hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all flex justify-between items-center group font-medium mt-3"
									>
										<span className="flex items-center gap-3">
											<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
												<path d="M2 12h20M12 2v20" opacity="0.5" />
												<circle cx="12" cy="12" r="10" />
												<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
											</svg>
											Climate Lab
										</span>
										<span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded font-mono uppercase">
											Interactive
										</span>
									</button>
								</div>
							</div>

							{/* Right Column — Genesis Orb */}
							<div className="hidden lg:flex items-center justify-center">
								<GenesisOrb className="w-80 h-80" />
							</div>
						</div>
					</div>

					{/* Bottom Module Strip */}
					<div
						className="relative z-10 px-8 md:px-12 lg:px-16 pb-6 animate-[cm-slide-up_700ms_ease-out_both]"
						style={{ animationDelay: "250ms" }}
					>
						<div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
							{[
								{
									num: "01",
									title: "Continents",
									desc: "Realistic landmass generation with coastal features",
								},
								{
									num: "02",
									title: "Topography",
									desc: "Mountain ranges and elevation modeling",
								},
								{
									num: "03",
									title: "Climate",
									desc: "Weather patterns and biome distribution",
								},
								{
									num: "04",
									title: "History",
									desc: "Simulated civilizations and events",
								},
							].map((item, i) => (
								<div
									key={i}
									className="bg-white px-5 py-4 hover:bg-slate-50 transition-colors group animate-[cm-slide-up_700ms_ease-out_both]"
									style={{ animationDelay: `${350 + i * 80}ms` }}
								>
									<div className="flex items-baseline gap-3">
										<span className="font-mono text-[10px] text-slate-300">
											{item.num}
										</span>
										<h3 className="text-sm font-bold tracking-tight group-hover:text-slate-900 transition-colors">
											{item.title}
										</h3>
									</div>
									<p className="font-mono text-[10px] text-slate-400 uppercase tracking-wide mt-1 hidden md:block">
										{item.desc}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{view === "loading" && (
				<div
					className={`w-full h-full flex flex-col p-24 bg-white relative ${isExiting
						? "animate-[cm-fade-out_600ms_ease-out_forwards]"
						: "animate-[cm-fade-in_400ms_ease-out]"
						}`}
				>
					{/* Loading Header */}
					<div className="w-full border-b-2 border-slate-900 pb-6 mb-12 flex justify-between items-end animate-[cm-slide-up_500ms_ease-out_both]">
						<div>
							<div className="font-mono text-[10px] text-slate-400 mb-2 uppercase">
								System Status
							</div>
							<h1 className="text-6xl font-bold tracking-tighter">
								BOOT_SEQUENCE
							</h1>
						</div>
						<div className="text-right">
							<span className="font-mono text-6xl tabular-nums font-bold block">
								{loadingProgress.toString().padStart(3, "0")}
								<span className="text-2xl text-slate-300">%</span>
							</span>
						</div>
					</div>

					{/* Main Content: Step Checklist + Gyroscope */}
					<div className="flex-1 flex gap-16 min-h-0">
						{/* Step Checklist */}
						<div className="flex-1 flex flex-col justify-center space-y-4">
							{LOADING_STEPS.map((step, i) => {
								const isCompleted = completedSteps.has(i)
								const isActive = activeStepIndex === i && !isCompleted

								return (
									<div
										key={i}
										className={`group flex items-center gap-4 font-mono text-sm transition-all duration-300 ${isActive
											? "text-slate-900 translate-x-2"
											: isCompleted
												? "text-slate-400"
												: "text-slate-200"
											}`}
									>
										<div
											className={`w-6 h-6 flex items-center justify-center border transition-all duration-300 shrink-0 ${isCompleted
												? "bg-slate-900 border-slate-900"
												: isActive
													? "border-slate-900 bg-slate-50 shadow-[0_0_15px_rgba(15,23,42,0.1)]"
													: "border-slate-200"
												}`}
										>
											{isCompleted && (
												<svg
													width="12"
													height="12"
													viewBox="0 0 12 12"
													fill="none"
												>
													<path
														d="M2 6l3 3 5-5"
														stroke="white"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
													/>
												</svg>
											)}
											{isActive && (
												<div className="w-2 h-2 bg-slate-900 animate-ping" />
											)}
										</div>
										<div className="flex flex-col">
											<span
												className={`uppercase tracking-wider text-xs ${isActive ? "font-black" : ""}`}
											>
												{step.name}
											</span>
											{isActive && (
												<span className="text-[9px] text-slate-500 font-bold animate-pulse">
													RUNNING_PROCESS...
												</span>
											)}
										</div>
										{isActive && (
											<span className="text-[10px] text-slate-400 ml-auto tabular-nums bg-slate-100 px-2 py-0.5 rounded">
												{step.progress}%
											</span>
										)}
										{isCompleted && (
											<span className="text-[10px] text-slate-300 ml-auto font-mono">
												COMPLETE
											</span>
										)}
									</div>
								)
							})}
						</div>

						{/* Genesis Orb Visual */}
						<div className="hidden md:flex items-center justify-center flex-1">
							<GenesisOrb className="w-56 h-56" />
						</div>
					</div>

					{/* Log Output Area */}
					<div className="font-mono text-xs mt-8 mb-6 h-28 overflow-hidden relative">
						<div className="absolute top-0 left-0 w-0.5 h-full bg-slate-100" />
						<div className="pl-6 space-y-1.5">
							{logs.map((log, i) => (
								<div
									key={`${log}-${i}`}
									className={`animate-[cm-slide-in-left_200ms_ease-out] ${i === logs.length - 1
										? "text-slate-900 font-bold"
										: "text-slate-300"
										}`}
								>
									<span className="opacity-50 mr-3">{">"}</span>
									{log}
								</div>
							))}
							<div className="animate-pulse text-slate-900 ml-4">_</div>
						</div>
					</div>

					{/* Footer Progress */}
					<div className="w-full space-y-4">
						<div className="flex justify-between font-mono text-[10px] text-slate-400 uppercase">
							<span>Active_Process: {currentStep || "Standby"}</span>
							<span>Mem_Alloc: {(loadingProgress * 12.4).toFixed(1)}MB</span>
						</div>
						<ProgressBar progress={loadingProgress} />
					</div>
				</div>
			)}

			{/* Complete view shows the map with a fade-in */}
			{view === "complete" && (
				<div className="w-full h-full animate-[cm-fade-in_800ms_ease-out]">
					<WorldMap />
				</div>
			)}

			{showLab && <EbmLab onClose={() => setShowLab(false)} />}
		</div>
	)
}

export default App
