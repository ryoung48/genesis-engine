import React, { useState } from "react"
import { fadeVisibilityClassName } from "@/ui/components/animations/fade"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { PanelHeader } from "@/ui/components/composites/PanelHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { GearIcon } from "@/ui/components/primitives/icons/GearIcon"
import { LabeledSlider } from "@/ui/components/primitives/LabeledSlider"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import { Tooltip } from "@/ui/components/primitives/Tooltip"
import type { PortedGalaxyDisplayFlags } from "@/ui/genesis/galaxy/view/portedGalaxyParams"

const DISPLAY_FLAG_LABELS: Record<keyof PortedGalaxyDisplayFlags, string> = {
	showStarOverlay: "Star Map",
	showDensityWaves: "Density-Wave Guides",
}

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
}

const TIME_STEP_MIN = 0
const TIME_STEP_MAX = 500_000
const TIME_STEP_STEP = 10_000

/** Bottom-left gear-triggered floating settings panel for the ported
 * density-wave galaxy view -- same shell/primitives as the standard planet
 * map's OverlayControls (FloatingPanel + PanelHeader + ToggleRow, gear
 * IconButton toggle). Everything else GalaxyRenderer exposes (axis grid,
 * dust/filaments/H2, velocity curve, dark matter halo, the renderer's own
 * decorative stars) is pinned to a fixed value in PortedGalaxyView.tsx
 * instead of being exposed here -- only the density-wave guide overlay and
 * the real (old-model) star overlay are meaningful things to hide/show. */
export const GalaxyOverlayControls: React.FC<GalaxyOverlayControlsProps> = ({
	displayFlags,
	onDisplayFlagChange,
	timeStep,
	onTimeStepChange,
}) => {
	const [overlaysExpanded, setOverlaysExpanded] = useState(false)

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
								{(
									Object.keys(
										DISPLAY_FLAG_LABELS,
									) as (keyof PortedGalaxyDisplayFlags)[]
								).map((key) => (
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
									min={TIME_STEP_MIN}
									max={TIME_STEP_MAX}
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
							onClick={() => setOverlaysExpanded((value) => !value)}
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
