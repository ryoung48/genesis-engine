import { Navigate, Route, Routes } from "react-router-dom"
import { APP_PATHS } from "@/app-routes"
import { PlanetRendererExperiment } from "@/ui/genesis/planet-renderer-experiment/PlanetRendererExperiment"
import { GenesisView } from "@/ui/genesis/view/GenesisView"

function App() {
	return (
		<div className="relative h-screen w-screen overflow-hidden bg-white font-sans text-slate-900 selection:bg-slate-900 selection:text-white">
			<Routes>
				<Route path={APP_PATHS.tectonicLab} element={<GenesisView />} />
				<Route
					path={APP_PATHS.planetRendererExperiment}
					element={<PlanetRendererExperiment />}
				/>
				<Route
					path={APP_PATHS.galaxy}
					element={
						<GenesisView sessionNamespace="galaxy" initialGalaxyModeActive />
					}
				/>
				<Route
					path="*"
					element={<Navigate to={APP_PATHS.tectonicLab} replace />}
				/>
			</Routes>
		</div>
	)
}

export default App
