import React from "react"
import { fadeVisibilityClassName } from "@/ui/components/animations/fade"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { PanelHeader } from "@/ui/components/composites/PanelHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { GearIcon } from "@/ui/components/primitives/icons/GearIcon"
import { Tooltip } from "@/ui/components/primitives/Tooltip"

interface SolarSystemControlsProps {
	expanded: boolean
	setExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	onBack: () => void
	showEllipticalOrbits: boolean
	setShowEllipticalOrbits: (v: boolean) => void
	showDaylight: boolean
	setShowDaylight: (v: boolean) => void
	showInclination: boolean
	setShowInclination: (v: boolean) => void
}

export const SolarSystemControls: React.FC<SolarSystemControlsProps> = ({
	expanded,
	setExpanded,
	onBack,
	showEllipticalOrbits,
	setShowEllipticalOrbits,
	showDaylight,
	setShowDaylight,
	showInclination,
	setShowInclination,
}) => {
	return (
		<div className="absolute bottom-3 left-3 flex flex-col items-start gap-2 z-20 pointer-events-none">
			<div
				className={fadeVisibilityClassName(
					expanded,
					"pointer-events-none absolute bottom-full left-0 mb-2",
				)}
			>
				<div className="pointer-events-auto">
					<FloatingPanel className="w-56" padding="md">
						<PanelHeader title="Solar System" tone="overlay" />
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
								<span>Daylight</span>
								<input
									type="checkbox"
									checked={showDaylight}
									onChange={(e) => setShowDaylight(e.target.checked)}
									className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
							</label>
							<button
								type="button"
								onClick={onBack}
								className="w-full rounded-md border border-white/10 bg-white/8 px-2.5 py-1.5 text-[11px] font-medium text-slate-100 transition hover:bg-white/12"
							>
								Back to Planet
							</button>
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
	)
}
