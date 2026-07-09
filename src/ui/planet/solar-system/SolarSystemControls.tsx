import React from "react"
import { fadeVisibilityClassName } from "@/ui/components/animations/fade"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { PanelHeader } from "@/ui/components/composites/PanelHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { GearIcon } from "@/ui/components/primitives/icons/GearIcon"
import { LightningIcon } from "@/ui/components/primitives/icons/LightningIcon"
import { TransferDownIcon } from "@/ui/components/primitives/icons/TransferDownIcon"
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
	showRealNames?: boolean
	setShowRealNames?: (v: boolean) => void
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
	showRealNames,
	setShowRealNames,
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
							<LightningIcon className="h-4 w-4 text-white" />
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
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Elliptical Orbits</span>
									<input
										type="checkbox"
										checked={showEllipticalOrbits}
										onChange={(e) => setShowEllipticalOrbits(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Inclination</span>
									<input
										type="checkbox"
										checked={showInclination}
										onChange={(e) => setShowInclination(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Axial Tilt</span>
									<input
										type="checkbox"
										checked={showAxialTilt}
										onChange={(e) => setShowAxialTilt(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Daylight</span>
									<input
										type="checkbox"
										checked={showDaylight}
										onChange={(e) => setShowDaylight(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Realistic Sizes</span>
									<input
										type="checkbox"
										checked={showRealisticSizes}
										onChange={(e) => setShowRealisticSizes(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Body Names</span>
									<input
										type="checkbox"
										checked={showBodyNames}
										onChange={(e) => setShowBodyNames(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								{showRealNames !== undefined && setShowRealNames && (
									<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
										<span>Real Sol Names</span>
										<input
											type="checkbox"
											checked={showRealNames}
											onChange={(e) => setShowRealNames(e.target.checked)}
											className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
										/>
									</label>
								)}
								{clock && (
									<div className="space-y-3 border-t border-white/10 pt-3">
										<div className="space-y-1">
											<div className="flex items-center justify-between">
												<label className="text-[11px] font-medium text-slate-300">
													Rotation
												</label>
												<span className="font-mono text-[11px] text-slate-400">
													{formatClockHours(clock.rotationPeriodHours)}
												</span>
											</div>
											<input
												type="range"
												min={0}
												max={1}
												step={0.001}
												value={clock.rotationFraction}
												onChange={(e) =>
													clock.setRotationFraction(Number(e.target.value))
												}
												className="m-0 block w-full accent-slate-100"
											/>
										</div>
										<div className="space-y-1">
											<div className="flex items-center justify-between">
												<label className="text-[11px] font-medium text-slate-300">
													Orbit
												</label>
												<span className="font-mono text-[11px] text-slate-400">
													{formatClockDays(clock.orbitalPeriodDays)}
												</span>
											</div>
											<input
												type="range"
												min={0}
												max={1}
												step={0.001}
												value={clock.orbitFraction}
												onChange={(e) =>
													clock.setOrbitFraction(Number(e.target.value))
												}
												className="m-0 block w-full accent-slate-100"
											/>
										</div>
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
