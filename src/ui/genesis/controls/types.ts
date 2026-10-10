import type {
	ClimateSubMode,
	TopographySubMode,
	VegetationSubMode,
} from "@/ui/genesis/controls/OverlayControls"
import type { ColorMode } from "@/ui/genesis/shared/colors"

export interface ResolveSubModeParams {
	baseMode: ColorMode
	vegetationSubMode: VegetationSubMode
	climateSubMode: ClimateSubMode
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: TopographySubMode
}

import type {
	NationMapMode,
	SocietyMapMode,
} from "@/ui/genesis/shared/map-modes"
export interface ModeBarProps {
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	geographyMode: ColorMode
	setGeographyMode: (v: ColorMode) => void
	nationMode: NationMapMode
	setNationMode: (v: NationMapMode) => void
	societyMode: SocietyMapMode
	setSocietyMode: (v: SocietyMapMode) => void
	debugMapModes: boolean
	vegetationSubMode: VegetationSubMode
	climateSubMode: ClimateSubMode
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: TopographySubMode
	// [JUSTIFICATION] Callers outside history do not filter by a record.
	politicalOnly?: boolean
	// [JUSTIFICATION] Non-Earth callers use the procedural options.
	isEarthImport?: boolean
}

import type React from "react"
export interface SimulationControlsProps {
	selectedTimeMs: number
	minTimeMs: number
	maxTimeMs: number
	onTimeChange: (timeMs: number) => void
	// [JUSTIFICATION] Callers may use the shared control defaults.
	floating?: boolean
	// [JUSTIFICATION] Callers may use the shared control defaults.
	onPlayPause?: () => void
	// [JUSTIFICATION] Callers may use the shared control defaults.
	simPlaying?: boolean
	// [JUSTIFICATION] Callers may use the shared control defaults.
	formatLabel?: (timeValue: number) => string
	// [JUSTIFICATION] Callers may use the shared control defaults.
	stepValue?: number
	// [JUSTIFICATION] Callers may use the shared control defaults.
	extraControls?: React.ReactNode
	// [JUSTIFICATION] Annual producers override the default month labels.
	stepLabels?: { previous: string; next: string; slider: string }
	// [JUSTIFICATION] Callers may use the shared control defaults.
	playPauseLabels?: {
		play: string
		pause: string
	}
}

export interface ClampTimelineTimeParams {
	timeMs: number
	minTimeMs: number
	maxTimeMs: number
}
