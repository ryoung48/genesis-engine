import React, { useState } from "react"
import { GenesisEngine } from "./components/landing/GenesisEngine"
import { LanguageLab } from "./components/landing/LanguageLab"
import { OrogenView } from "./components/orogen"
import { LoadingScreen } from "./components/loading/LoadingScreen"
import WorldMap from "./components/world"
import { EARTH_DEFAULTS, LOADING_STEPS } from "./constants/app"
import { useEbmPreview } from "./hooks/useEbmPreview"
import { HeightmapPreset, useWorldGeneration } from "./hooks/useWorldGeneration"
import { ViewState } from "./types/app"

function App() {
	const [view, setView] = useState<ViewState>("start")
	const [seed, setSeed] = useState(
		() => localStorage.getItem("chaos-machine-last-seed") || "",
	)
	const [obliquity, setObliquity] = useState(EARTH_DEFAULTS.obliquity)
	const [eccentricity, setEccentricity] = useState(EARTH_DEFAULTS.eccentricity)
	const [perihelion, setPerihelion] = useState(EARTH_DEFAULTS.perihelion)
	const [sunTempFactor, setSunTempFactor] = useState(EARTH_DEFAULTS.sunTempFactor)
	const [hoursPerDay, setHoursPerDay] = useState(EARTH_DEFAULTS.hoursPerDay)
	const [daysPerYear, setDaysPerYear] = useState(EARTH_DEFAULTS.daysPerYear)
	const [landFraction, setLandFraction] = useState(EARTH_DEFAULTS.landFraction)
	const [radiusFactor, setRadiusFactor] = useState(EARTH_DEFAULTS.radiusFactor)
	const [heightmap, setHeightmap] = useState<HeightmapPreset | undefined>(undefined)
	const [previewTab, setPreviewTab] = useState<
		"temperature" | "insolation" | "daylight" | "circulation" | "wind" | "language"
	>("temperature")

	const ebmPreview = useEbmPreview({
		obliquity,
		eccentricity,
		perihelion,
		tSun: sunTempFactor * 5778,
		hoursPerDay,
		daysPerYear,
		landFraction,
		radius: radiusFactor * 6371,
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
			tSun: sunTempFactor * 5778,
			hoursPerDay,
			daysPerYear,
			landFraction,
			radius: radiusFactor * 6371,
			heightmap,
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
					sunTempFactor={sunTempFactor}
					setSunTempFactor={setSunTempFactor}
					hoursPerDay={hoursPerDay}
					setHoursPerDay={setHoursPerDay}
					daysPerYear={daysPerYear}
					setDaysPerYear={setDaysPerYear}
					landFraction={landFraction}
					setLandFraction={setLandFraction}
					radiusFactor={radiusFactor}
					setRadiusFactor={setRadiusFactor}
					heightmap={heightmap}
					setHeightmap={setHeightmap}
					onLaunch={onLaunch}
					onOrogenClick={() => setView("orogen")}
					ebmPreview={ebmPreview}
					previewTab={previewTab}
					setPreviewTab={setPreviewTab}
					earthDefaults={EARTH_DEFAULTS}
				/>
			)}

			{view === "names" && (
				<LanguageLab onBack={() => setView("start")} />
			)}

			{view === "orogen" && (
				<OrogenView onBack={() => setView("start")} />
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

