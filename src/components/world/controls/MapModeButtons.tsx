import React from "react"
import { MapMode } from "../types"

interface MapModeButtonsProps {
	mapMode: MapMode
	setMapMode: (mode: MapMode) => void
}

const MAP_MODE_OPTIONS = [
	{ mode: "nations", label: "NAT", fullLabel: "Nations" },
	{ mode: "diplomacy", label: "DIP", fullLabel: "Diplomacy" },
	{ mode: "cultures", label: "CUL", fullLabel: "Cultures" },
	{ mode: "religion", label: "REL", fullLabel: "Religion" },
	{ mode: "dynasties", label: "DYN", fullLabel: "Dynasties" },
	{ mode: "climate", label: "CLM", fullLabel: "Climate" },
	{ mode: "biome", label: "BIO", fullLabel: "Biome" },
	{ mode: "vegetation", label: "VEG", fullLabel: "Vegetation" },
	{ mode: "terrain", label: "TER", fullLabel: "Topography" },
	{ mode: "population", label: "POP", fullLabel: "Population" },
	{ mode: "development", label: "DEV", fullLabel: "Development" },
	{ mode: "rainfall", label: "RAN", fullLabel: "Rainfall" },
	{ mode: "temperature", label: "TMP", fullLabel: "Temperature" },
	{ mode: "wind", label: "WND", fullLabel: "Wind" },
] as const

export const MapModeButtons: React.FC<MapModeButtonsProps> = ({
	mapMode,
	setMapMode,
}) => {
	return (
		<div className="flex gap-0.5">
			{MAP_MODE_OPTIONS.map((option) => (
				<button
					key={option.mode}
					onClick={() => setMapMode(option.mode as MapMode)}
					className={`px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors outline-none cursor-pointer ${
						mapMode === option.mode
							? "bg-slate-900 text-white"
							: "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
					}`}
					title={option.fullLabel}
				>
					{option.label}
				</button>
			))}
		</div>
	)
}
