import React from "react"
import { LoadingStep } from "../../types/app"
import { GenesisOrb } from "../ui/GenesisOrb"
import { ProgressBar } from "../ui/ProgressBar"

interface LoadingScreenProps {
	isExiting: boolean
	loadingProgress: number
	loadingSteps: LoadingStep[]
	completedSteps: Set<number>
	activeStepIndex: number
	logs: string[]
	currentStep: string
}

export const LoadingScreen = ({
	isExiting,
	loadingProgress,
	loadingSteps,
	completedSteps,
	activeStepIndex,
	logs,
	currentStep,
}: LoadingScreenProps) => {
	return (
		<div
			className={`w-full h-full flex flex-col p-24 bg-white relative ${
				isExiting
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
					<h1 className="text-6xl font-bold tracking-tighter">BOOT_SEQUENCE</h1>
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
					{loadingSteps.map((step, i) => {
						const isCompleted = completedSteps.has(i)
						const isActive = activeStepIndex === i && !isCompleted

						return (
							<div
								key={i}
								className={`group flex items-center gap-4 font-mono text-sm transition-all duration-300 ${
									isActive
										? "text-slate-900 translate-x-2"
										: isCompleted
											? "text-slate-400"
											: "text-slate-200"
								}`}
							>
								<div
									className={`w-6 h-6 flex items-center justify-center border transition-all duration-300 shrink-0 ${
										isCompleted
											? "bg-slate-900 border-slate-900"
											: isActive
												? "border-slate-900 bg-slate-50 shadow-[0_0_15px_rgba(15,23,42,0.1)]"
												: "border-slate-200"
									}`}
								>
									{isCompleted && (
										<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
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
							className={`animate-[cm-slide-in-left_200ms_ease-out] ${
								i === logs.length - 1
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
	)
}
