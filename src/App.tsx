import { Navigate, Route, Routes } from "react-router-dom"
import { APP_PATHS } from "@/app-routes"
import { GenesisView } from "@/ui/genesis/view/GenesisView"

function App() {
	return (
		<div className="relative h-screen w-screen overflow-hidden bg-white font-sans text-slate-900 selection:bg-slate-900 selection:text-white">
			<Routes>
				<Route path={APP_PATHS.tectonicLab} element={<GenesisView />} />
				<Route
					path="*"
					element={<Navigate to={APP_PATHS.tectonicLab} replace />}
				/>
			</Routes>
		</div>
	)
}

export default App
