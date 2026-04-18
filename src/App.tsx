import { useEffect, useState } from "react"
import {
	Navigate,
	Route,
	Routes,
	useLocation,
	useNavigate,
} from "react-router-dom"
import {
	GenesisEngine,
	type PreviewTab,
} from "./components/landing/GenesisEngine"
import { LanguageLab } from "./components/landing/LanguageLab"
import { LoadingScreen } from "./components/loading/LoadingScreen"
import { OrogenView } from "./components/orogen"
import WorldMap from "./components/world"
import { EARTH_DEFAULTS, LOADING_STEPS } from "./constants/app"
import { useEbmPreview } from "./hooks/useEbmPreview"
import {
	type HeightmapPreset,
	useWorldGeneration,
} from "./hooks/useWorldGeneration"
import type { ViewState } from "./types/app"

function getViewForPath(pathname: string): ViewState {
	if (pathname === "/tectonic-lab") return "orogen"
	if (pathname === "/language-lab") return "names"
	return "start"
}

function App() {
	const navigate = useNavigate()
	const location = useLocation()
	const [view, setView] = useState<ViewState>(() =>
		getViewForPath(location.pathname),
	)
	const [seed, setSeed] = useState(
		() => localStorage.getItem("chaos-machine-last-seed") || "",
	)
	const [obliquity, setObliquity] = useState(EARTH_DEFAULTS.obliquity)
	const [eccentricity, setEccentricity] = useState(EARTH_DEFAULTS.eccentricity)
	const [perihelion, setPerihelion] = useState(EARTH_DEFAULTS.perihelion)
	const [sunTempFactor, setSunTempFactor] = useState(
		EARTH_DEFAULTS.sunTempFactor,
	)
	const [hoursPerDay, setHoursPerDay] = useState(EARTH_DEFAULTS.hoursPerDay)
	const [daysPerYear, setDaysPerYear] = useState(EARTH_DEFAULTS.daysPerYear)
	const [landFraction, setLandFraction] = useState(EARTH_DEFAULTS.landFraction)
	const [radiusFactor, setRadiusFactor] = useState(EARTH_DEFAULTS.radiusFactor)
	const [pressure, setPressure] = useState(EARTH_DEFAULTS.pressure)
	const [heightmap, setHeightmap] = useState<HeightmapPreset | undefined>(
		undefined,
	)
	const [previewTab, setPreviewTab] = useState<PreviewTab>("temperature")

	const ebmPreview = useEbmPreview({
		obliquity,
		eccentricity,
		perihelion,
		tSun: sunTempFactor * 5778,
		hoursPerDay,
		daysPerYear,
		landFraction,
		radius: radiusFactor * 6371,
		pressure,
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
			pressure,
			radius: radiusFactor * 6371,
			heightmap,
			setView,
		})
	}

	useEffect(() => {
		if (view === "loading" || view === "complete") return
		setView(getViewForPath(location.pathname))
	}, [location.pathname, view])

	useEffect(() => {
		if (view === "loading" || view === "complete") return
		if (view === "orogen" && location.pathname !== "/tectonic-lab") {
			navigate("/tectonic-lab", { replace: true })
			return
		}
		if (view === "names" && location.pathname !== "/language-lab") {
			navigate("/language-lab", { replace: true })
			return
		}
		if (view === "start" && location.pathname !== "/") {
			navigate("/", { replace: true })
		}
	}, [location.pathname, navigate, view])

	return (
		<div className="w-screen h-screen bg-white text-slate-900 font-sans overflow-hidden relative selection:bg-slate-900 selection:text-white">
			{view === "loading" ? (
				<LoadingScreen
					isExiting={isExiting}
					loadingProgress={loadingProgress}
					loadingSteps={LOADING_STEPS}
					completedSteps={completedSteps}
					activeStepIndex={activeStepIndex}
					logs={logs}
					currentStep={currentStep}
				/>
			) : view === "complete" ? (
				<div className="w-full h-full animate-[cm-fade-in_800ms_ease-out]">
					<WorldMap />
				</div>
			) : (
				<Routes>
					<Route
						path="/"
						element={
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
								pressure={pressure}
								setPressure={setPressure}
								heightmap={heightmap}
								setHeightmap={setHeightmap}
								onLaunch={onLaunch}
								onOrogenClick={() => navigate("/tectonic-lab")}
								ebmPreview={ebmPreview}
								previewTab={previewTab}
								setPreviewTab={setPreviewTab}
								earthDefaults={EARTH_DEFAULTS}
							/>
						}
					/>
					<Route
						path="/language-lab"
						element={<LanguageLab onBack={() => navigate("/")} />}
					/>
					<Route path="/tectonic-lab" element={<OrogenView />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			)}
		</div>
	)
}

export default App
