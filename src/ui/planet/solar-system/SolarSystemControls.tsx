import React from "react"
import { fadeVisibilityClassName } from "@/ui/components/animations/fade"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { PanelHeader } from "@/ui/components/composites/PanelHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { DetailsIcon } from "@/ui/components/primitives/icons/DetailsIcon"
import { GearIcon } from "@/ui/components/primitives/icons/GearIcon"
import { TransferDownIcon } from "@/ui/components/primitives/icons/TransferDownIcon"
import { LabeledSlider } from "@/ui/components/primitives/LabeledSlider"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import { Tooltip } from "@/ui/components/primitives/Tooltip"

interface SolarSystemClockProps {
	/** 0–1 progress through the focused body's own rotation. */
	rotationFraction: number
	setRotationFraction: (v: number) => void
	/** 0–1 progress through the focused body's own orbit. */
	orbitFraction: number
	setOrbitFraction: (v: number) => void
	rotationPeriodHours: number
	orbitalPeriodDays: number
}

interface SolarSystemControlsProps {
	expanded: boolean
	setExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	onBack: () => void
	canReturnToPlanetMap?: boolean
	generationPanelOpen?: boolean
	onToggleGenerationPanel?: () => void
	showEllipticalOrbits: boolean
	setShowEllipticalOrbits: (v: boolean) => void
	showDaylight: boolean
	setShowDaylight: (v: boolean) => void
	showInclination: boolean
	setShowInclination: (v: boolean) => void
	showAxialTilt: boolean
	setShowAxialTilt: (v: boolean) => void
	showRealisticSizes: boolean
	setShowRealisticSizes: (v: boolean) => void
	showBodyNames: boolean
	setShowBodyNames: (v: boolean) => void
	/** null when the star is focused (no rotation/orbit knobs to show). */
	clock: SolarSystemClockProps | null
}

function formatClockHours(hours: number): string {
	if (hours >= 24 * 2) return `${(hours / 24).toFixed(1)} d`
	return `${hours.toFixed(1)} h`
}

function formatClockDays(days: number): string {
	if (days >= 365 * 2) return `${(days / 365).toFixed(2)} y`
	return `${days.toFixed(1)} d`
}

export const SolarSystemControls: React.FC<SolarSystemControlsProps> = ({
	expanded,
	setExpanded,
	onBack,
	canReturnToPlanetMap = false,
	generationPanelOpen,
	onToggleGenerationPanel,
	showEllipticalOrbits,
	setShowEllipticalOrbits,
	showDaylight,
	setShowDaylight,
	showInclination,
	setShowInclination,
	showAxialTilt,
	setShowAxialTilt,
	showRealisticSizes,
	setShowRealisticSizes,
	showBodyNames,
	setShowBodyNames,
	clock,
}) => {
	const headerAction = canReturnToPlanetMap ? (
		<Tooltip content="Planet map" position="top">
			<IconButton onClick={onBack} tone="overlay" shape="pill" size="sm">
				<TransferDownIcon className="h-3.5 w-3.5" />
			</IconButton>
		</Tooltip>
	) : undefined

	return (
		<>
			<div className="absolute top-3 left-3 pointer-events-auto z-20">
				{!generationPanelOpen && onToggleGenerationPanel && (
					<Tooltip content="Show generation panel" position="bottom">
						<IconButton
							onClick={onToggleGenerationPanel}
							tone="overlay"
							size="sm"
						>
							<DetailsIcon className="h-4 w-4 text-white" />
						</IconButton>
					</Tooltip>
				)}
			</div>
			<div className="absolute bottom-3 left-3 flex flex-col items-start gap-2 z-20 pointer-events-none">
				<div
					className={fadeVisibilityClassName(
						expanded,
						"pointer-events-none absolute bottom-full left-0 mb-2",
					)}
				>
					<div className="pointer-events-auto">
						<FloatingPanel className="w-56" padding="md">
							<PanelHeader
								title="Solar System"
								tone="overlay"
								action={headerAction}
							/>
							<div className="space-y-3">
								<ToggleRow
									label="Elliptical Orbits"
									checked={showEllipticalOrbits}
									onChange={setShowEllipticalOrbits}
									labelClassName="text-slate-200"
								/>
								<ToggleRow
									label="Inclination"
									checked={showInclination}
									onChange={setShowInclination}
									labelClassName="text-slate-200"
								/>
								<ToggleRow
									label="Axial Tilt"
									checked={showAxialTilt}
									onChange={setShowAxialTilt}
									labelClassName="text-slate-200"
								/>
								<ToggleRow
									label="Daylight"
									checked={showDaylight}
									onChange={setShowDaylight}
									labelClassName="text-slate-200"
								/>
								<ToggleRow
									label="Realistic Sizes"
									checked={showRealisticSizes}
									onChange={setShowRealisticSizes}
									labelClassName="text-slate-200"
								/>
								<ToggleRow
									label="Body Names"
									checked={showBodyNames}
									onChange={setShowBodyNames}
									labelClassName="text-slate-200"
								/>
								{clock && (
									<div className="space-y-3 border-t border-white/10 pt-3">
										<LabeledSlider
											label="Rotation"
											value={formatClockHours(clock.rotationPeriodHours)}
											min={0}
											max={1}
											step={0.001}
											numericValue={clock.rotationFraction}
											onChange={clock.setRotationFraction}
											sliderClassName="m-0 block"
										/>
										<LabeledSlider
											label="Orbit"
											value={formatClockDays(clock.orbitalPeriodDays)}
											min={0}
											max={1}
											step={0.001}
											numericValue={clock.orbitFraction}
											onChange={clock.setOrbitFraction}
											sliderClassName="m-0 block"
										/>
									</div>
								)}
							</div>
						</FloatingPanel>
					</div>
				</div>
				<div className="flex items-center gap-2 pointer-events-auto">
					<Tooltip
						content={expanded ? "Hide settings" : "Show settings"}
						position="top"
					>
						<IconButton
							onClick={() => setExpanded((value) => !value)}
							tone="overlay"
							selected={expanded}
							shape="rounded"
							size="sm"
							className="shadow-lg backdrop-blur-md"
						>
							<GearIcon className="h-4 w-4" />
						</IconButton>
					</Tooltip>
				</div>
			</div>
		</>
	)
}
