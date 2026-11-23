import React from "react"
import { fadeVisibilityClassName } from "@/ui/components/animations/fade"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { PanelHeader } from "@/ui/components/composites/PanelHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { GearIcon } from "@/ui/components/primitives/icons/GearIcon"
import { LabeledSlider } from "@/ui/components/primitives/LabeledSlider"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import { Tooltip } from "@/ui/components/primitives/Tooltip"
import {
	GALAXY_TIME_STEP_MAX,
	GALAXY_TIME_STEP_MIN,
	type PortedGalaxyDisplayFlags,
} from "@/ui/genesis/galaxy/view/portedGalaxyParams"

const DISPLAY_FLAG_LABELS: Record<keyof PortedGalaxyDisplayFlags, string> = {
	showStarOverlay: "Star Map",
	showSearchMatches: "Search Match Markers",
	showCapitalMarkers: "Capital Markers",
	showSectorBoundaries: "Sector Boundaries",
	showGalaxy: "Galaxy",
	showDensityWaves: "Density-Wave Guides",
}

const DISPLAY_FLAG_KEYS: (keyof PortedGalaxyDisplayFlags)[] = [
	"showStarOverlay",
	"showSearchMatches",
	"showCapitalMarkers",
	"showSectorBoundaries",
	"showGalaxy",
	"showDensityWaves",
]

interface GalaxyOverlayControlsProps {
	displayFlags: PortedGalaxyDisplayFlags
	onDisplayFlagChange: (
		key: keyof PortedGalaxyDisplayFlags,
		checked: boolean,
	) => void
	/** GalaxyRenderer.ts's own `timeStep` -- world-units added to its
	 * internal clock every frame (`this.time += this.timeStep` in update()),
	 * which every particle's orbit position is a function of. Effectively an
	 * animation-speed control: 0 pauses the rotation entirely. */
	timeStep: number
	onTimeStepChange: (value: number) => void
	overlaysExpanded: boolean
	onOverlaysExpandedChange: (expanded: boolean) => void
}

const TIME_STEP_STEP = 10_000

export const GalaxyOverlayControls: React.FC<GalaxyOverlayControlsProps> = ({
	displayFlags,
	onDisplayFlagChange,
	timeStep,
	onTimeStepChange,
	overlaysExpanded,
	onOverlaysExpandedChange,
}) => {
	return (
		<div className="absolute inset-0 z-20 pointer-events-none">
			<div className="absolute bottom-3 left-3 flex flex-col items-start gap-2">
				<div
					className={fadeVisibilityClassName(
						overlaysExpanded,
						"pointer-events-none absolute bottom-full left-0 mb-2",
					)}
				>
					<div
						className={
							overlaysExpanded ? "pointer-events-auto" : "pointer-events-none"
						}
					>
						<FloatingPanel
							interactive={overlaysExpanded}
							className="w-60"
							padding="md"
						>
							<PanelHeader title="Display" tone="overlay" />
							<div className="space-y-2">
								{DISPLAY_FLAG_KEYS.map((key) => (
									<ToggleRow
										key={key}
										label={DISPLAY_FLAG_LABELS[key]}
										checked={displayFlags[key]}
										onChange={(checked) => onDisplayFlagChange(key, checked)}
										labelClassName="text-slate-200"
									/>
								))}
								<LabeledSlider
									label="Time Step"
									value={timeStep.toLocaleString()}
									min={GALAXY_TIME_STEP_MIN}
									max={GALAXY_TIME_STEP_MAX}
									step={TIME_STEP_STEP}
									numericValue={timeStep}
									onChange={onTimeStepChange}
								/>
							</div>
						</FloatingPanel>
					</div>
				</div>
				<div className="flex items-center gap-2 pointer-events-auto">
					<Tooltip
						content={overlaysExpanded ? "Hide settings" : "Show settings"}
						position="top"
					>
						<IconButton
							onClick={() => onOverlaysExpandedChange(!overlaysExpanded)}
							tone="overlay"
							selected={overlaysExpanded}
							shape="rounded"
							size="sm"
							className="shadow-lg backdrop-blur-md"
						>
							<GearIcon className="h-4 w-4" />
						</IconButton>
					</Tooltip>
				</div>
			</div>
		</div>
	)
}
