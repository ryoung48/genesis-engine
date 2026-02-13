import React from "react"
import { MapMode } from "../types"
import { DatePicker } from "./DatePicker"
import { MapIdBadge } from "./MapIdBadge"
import { MapModeButtons } from "./MapModeButtons"
import { PlayPauseButton } from "./PlayPauseButton"

interface MapControlsProps {
	isPlaying: boolean
	setIsPlaying: (playing: boolean) => void
	selectedTime: number | undefined
	setSelectedTime: (time: number | undefined) => void
	currentTime: number
	mapMode: MapMode
	setMapMode: (mode: MapMode) => void
	mapId: string
	isMeasuring: boolean
	setIsMeasuring: (measuring: boolean) => void
	showTEQ: boolean
	setShowTEQ: (show: boolean) => void
}

export const MapControls: React.FC<MapControlsProps> = ({
	isPlaying,
	setIsPlaying,
	selectedTime,
	setSelectedTime,
	currentTime,
	mapMode,
	setMapMode,
	mapId,
	isMeasuring,
	setIsMeasuring,
	showTEQ,
	setShowTEQ,
}) => {
	const teqAvailable = mapMode === "temperature" || mapMode === "rainfall"
	return (
		<div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white p-1.5 border border-slate-200 shadow-sm whitespace-nowrap max-w-[95vw] no-scrollbar pointer-events-auto">
			<PlayPauseButton
				isPlaying={isPlaying}
				setIsPlaying={setIsPlaying}
				setSelectedTime={setSelectedTime}
			/>

			<div className="w-px h-6 bg-slate-200 mx-0.5" />

			<button
				onClick={() => setIsMeasuring(!isMeasuring)}
				className={`flex items-center justify-center px-2 h-7 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${isMeasuring
						? "bg-slate-900 text-white"
						: "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
					}`}
				title="Measure Distance"
			>
				MEASURE
			</button>

			{teqAvailable && (
				<>
					<div className="w-px h-6 bg-slate-200 mx-0.5" />
					<button
						onClick={() => setShowTEQ(!showTEQ)}
						className={`flex items-center justify-center px-2 h-7 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${showTEQ
								? "bg-red-700 text-white"
								: "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
							}`}
						title="Show Thermal Equator"
					>
						TEQ
					</button>
				</>
			)}

			<div className="w-px h-6 bg-slate-200 mx-0.5" />

			<DatePicker
				selectedTime={selectedTime}
				setSelectedTime={setSelectedTime}
				currentTime={currentTime}
				setIsPlaying={setIsPlaying}
			/>

			<div className="w-px h-6 bg-slate-200 mx-0.5" />

			<MapIdBadge mapId={mapId} />

			<div className="w-px h-6 bg-slate-200 mx-0.5" />

			<MapModeButtons mapMode={mapMode} setMapMode={setMapMode} />
		</div>
	)
}
