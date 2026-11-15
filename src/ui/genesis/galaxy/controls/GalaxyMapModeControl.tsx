import React from "react"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { uiTokens } from "@/ui/components/tokens"
import type { GalaxyMapMode } from "@/ui/genesis/galaxy/view/portedGalaxyParams"

const OPTIONS: ReadonlyArray<{ value: GalaxyMapMode; label: string }> = [
	{ value: "stars", label: "Stars" },
	{ value: "nations", label: "Nations" },
	{ value: "cultures", label: "Cultures" },
]

interface GalaxyMapModeControlProps {
	mode: GalaxyMapMode
	showCapitalMarkers: boolean
	showSectorBoundaries: boolean
	onModeChange: (mode: GalaxyMapMode) => void
}

export const GalaxyMapModeControl: React.FC<GalaxyMapModeControlProps> = ({
	mode,
	showCapitalMarkers,
	showSectorBoundaries,
	onModeChange,
}) => (
	<div className="absolute top-3 left-1/2 z-20 -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-2">
		<SegmentedControl
			options={OPTIONS}
			value={mode}
			onChange={onModeChange}
			tone="overlay"
			size="sm"
		/>
		{mode === "nations" && (showSectorBoundaries || showCapitalMarkers) && (
			<div
				className={`${uiTokens.surface.overlay} ${uiTokens.type.controlSm} ${uiTokens.radius.sm} flex items-center gap-3 px-2 py-1`}
			>
				{showSectorBoundaries && (
					<span className="flex items-center gap-1">
						<span className="w-4 border-t border-dotted border-slate-300" />
						Sector boundary
					</span>
				)}
				{showCapitalMarkers && (
					<>
						<span className="flex items-center gap-1">
							<span className={uiTokens.text.sectorCapital}>⌜⌝</span>Sector
							capital
						</span>
						<span className="flex items-center gap-1">
							<span className={uiTokens.text.nationCapital}>◇</span>Nation
							capital
						</span>
					</>
				)}
			</div>
		)}
	</div>
)
