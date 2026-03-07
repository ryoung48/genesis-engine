import React, { useState } from "react"
import { GenesisEngine } from "./components/landing/GenesisEngine"
import { LanguageLab } from "./components/landing/LanguageLab"
import { LoadingScreen } from "./components/loading/LoadingScreen"
import WorldMap from "./components/world"
import { EARTH_DEFAULTS, LOADING_STEPS } from "./constants/app"
import { useEbmPreview } from "./hooks/useEbmPreview"
import { useWorldGeneration } from "./hooks/useWorldGeneration"
import { ViewState } from "./types/app"

function App() {
	const [view, setView] = useState<ViewState>("start")
	const [seed, setSeed] = useState(
		() => localStorage.getItem("chaos-machine-last-seed") || "",
	)
	const [obliquity, setObliquity] = useState(EARTH_DEFAULTS.obliquity)
	const [eccentricity, setEccentricity] = useState(EARTH_DEFAULTS.eccentricity)
	const [perihelion, setPerihelion] = useState(EARTH_DEFAULTS.perihelion)
	const [tSun, setTSun] = useState(EARTH_DEFAULTS.tSun)
	const [landFraction, setLandFraction] = useState(EARTH_DEFAULTS.landFraction)
	const [previewTab, setPreviewTab] = useState<
		"temperature" | "insolation" | "daylight" | "circulation" | "wind" | "language"
	>("temperature")

	const ebmPreview = useEbmPreview({
		obliquity,
		eccentricity,
		perihelion,
		tSun,
		landFraction,
	})

	const {
		loadingProgress,
		currentStep,
		logs,
		isExiting,
		activeStepIndex,
		completedSteps,
		handleStartClick,
	} = useWorldGeneration()

	const onLaunch = () => {
		handleStartClick({
			seed,
			obliquity,
			eccentricity,
			perihelion,
			tSun,
			landFraction,
			setView,
		})
	}

	return (
		<div className="w-screen h-screen bg-white text-slate-900 font-sans overflow-hidden relative selection:bg-slate-900 selection:text-white">
			{view === "start" && (
				<GenesisEngine
					isExiting={isExiting}
					seed={seed}
					setSeed={setSeed}
					obliquity={obliquity}
					setObliquity={setObliquity}
					eccentricity={eccentricity}
					setEccentricity={setEccentricity}
					perihelion={perihelion}
					setPerihelion={setPerihelion}
					tSun={tSun}
					setTSun={setTSun}
					landFraction={landFraction}
					setLandFraction={setLandFraction}
					onLaunch={onLaunch}
					ebmPreview={ebmPreview}
					previewTab={previewTab}
					setPreviewTab={setPreviewTab}
					earthDefaults={EARTH_DEFAULTS}
				/>
			)}

			{view === "names" && (
				<LanguageLab onBack={() => setView("start")} />
			)}

			{view === "loading" && (
				<LoadingScreen
					isExiting={isExiting}
					loadingProgress={loadingProgress}
					loadingSteps={LOADING_STEPS}
					completedSteps={completedSteps}
					activeStepIndex={activeStepIndex}
					logs={logs}
					currentStep={currentStep}
				/>
			)}

			{view === "complete" && (
				<div className="w-full h-full animate-[cm-fade-in_800ms_ease-out]">
					<WorldMap />
				</div>
			)}
		</div>
	)
}

export default App

