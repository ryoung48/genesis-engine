import React from "react"

interface PlayPauseButtonProps {
	isPlaying: boolean
	setIsPlaying: (playing: boolean) => void
	setSelectedTime: (time: number | undefined) => void
}

export const PlayPauseButton: React.FC<PlayPauseButtonProps> = ({
	isPlaying,
	setIsPlaying,
	setSelectedTime,
}) => {
	const handleClick = () => {
		if (!isPlaying) {
			// When pressing play, go to live mode
			setSelectedTime(undefined)
		}
		setIsPlaying(!isPlaying)
	}

	return (
		<button
			onClick={handleClick}
			className={`flex items-center justify-center gap-1.5 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
				isPlaying
					? "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50"
					: "bg-slate-900 text-white hover:bg-black"
			}`}
		>
			<span className="text-xs">{isPlaying ? "⏸" : "▶"}</span>
			{isPlaying ? "PAUSE" : "PLAY"}
		</button>
	)
}
