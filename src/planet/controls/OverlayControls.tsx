import React from "react"
import {
	Button,
	CheckIcon,
	CopyIcon,
	FloatingPanel,
	fadeVisibilityClassName,
	GearIcon,
	GlobeIcon,
	IconButton,
	MapIcon,
	PanelHeader,
	SegmentedControl,
} from "@/components"
import type { OrogenViewMode } from "../renderer"
import { MAX_MAP_PROJECTION_LATITUDE_DEG } from "../renderer/map-projection"
import { gridSpacingOptions } from "../screen/shared/constants"
import type { UnitSystem } from "../screen/shared/ui-format"

interface OverlayControlsProps {
	overlaysExpanded: boolean
	setOverlaysExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	isMeasuring: boolean
	setIsMeasuring: (v: boolean) => void
	showWireframe: boolean
	setShowWireframe: (v: boolean) => void
	showRivers: boolean
	setShowRivers: (v: boolean) => void
	showThermalEquator: boolean
	setShowThermalEquator: (v: boolean) => void
	showGrid: boolean
	setShowGrid: (v: boolean) => void
	showNationBorders: boolean
	setShowNationBorders: (v: boolean) => void
	showNationHierarchy: boolean
	setShowNationHierarchy: (v: boolean) => void
	gridSpacing: number
	setGridSpacing: (v: number) => void
	viewMode: OrogenViewMode
	setViewMode: (v: OrogenViewMode) => void
	unitSystem: UnitSystem
	setUnitSystem: (v: UnitSystem) => void
	mapProjectionLatitude: number
	draftMapProjectionLatitude: number
	setDraftMapProjectionLatitude: (v: number) => void
	setMapProjectionLatitude: (v: number) => void
	debugMapModes: boolean
	setDebugMapModes: (v: boolean) => void
	canCopyCode?: boolean
	codeCopied?: boolean
	onCopyCode?: () => void
	generationPanelOpen?: boolean
	onToggleGenerationPanel?: () => void
}

export const OverlayControls: React.FC<OverlayControlsProps> = ({
	overlaysExpanded,
	setOverlaysExpanded,
	isMeasuring,
	setIsMeasuring,
	showWireframe,
	setShowWireframe,
	showRivers,
	setShowRivers,
	showThermalEquator,
	setShowThermalEquator,
	showGrid,
	setShowGrid,
	showNationBorders,
	setShowNationBorders,
	showNationHierarchy,
	setShowNationHierarchy,
	gridSpacing,
	setGridSpacing,
	viewMode,
	setViewMode,
	unitSystem,
	setUnitSystem,
	mapProjectionLatitude,
	draftMapProjectionLatitude,
	setDraftMapProjectionLatitude,
	setMapProjectionLatitude,
	debugMapModes,
	setDebugMapModes,
	canCopyCode = false,
	codeCopied = false,
	onCopyCode,
	generationPanelOpen,
	onToggleGenerationPanel,
}) => {
	const commitMapProjectionLatitude = (
		event:
			| React.PointerEvent<HTMLInputElement>
			| React.KeyboardEvent<HTMLInputElement>
			| React.FocusEvent<HTMLInputElement>,
	) => {
		const nextValue = Number(event.currentTarget.value)
		if (!Number.isFinite(nextValue) || nextValue === mapProjectionLatitude)
			return
		setMapProjectionLatitude(nextValue)
	}
	const headerAction =
		canCopyCode && onCopyCode ? (
			<Button
				onClick={onCopyCode}
				tone="overlay"
				shape="pill"
				size="sm"
				className={
					codeCopied
						? "inline-flex shrink-0 items-center gap-1.5 border-emerald-300/60 bg-emerald-400/20 text-emerald-100 shadow-none"
						: "inline-flex shrink-0 items-center gap-1.5 shadow-none"
				}
			>
				{codeCopied ? (
					<CheckIcon className="h-3.5 w-3.5 text-emerald-300" />
				) : (
					<CopyIcon className="h-3.5 w-3.5" />
				)}
				<span>{codeCopied ? "Copied" : "Copy seed"}</span>
			</Button>
		) : undefined

	return (
		<div className="absolute inset-0 z-20 pointer-events-none">
			<div className="absolute bottom-3 left-3 flex flex-col items-start gap-2">
				<div
					className={fadeVisibilityClassName(
						overlaysExpanded,
						"pointer-events-none absolute bottom-full left-0 mb-2",
					)}
				>
					<div className="pointer-events-auto">
						<FloatingPanel className="w-64" padding="md">
							<PanelHeader
								title="Settings"
								tone="overlay"
								action={headerAction}
							/>
							<div className="space-y-3">
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Measure</span>
									<input
										type="checkbox"
										checked={isMeasuring}
										onChange={(e) => setIsMeasuring(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Wireframe</span>
									<input
										type="checkbox"
										checked={showWireframe}
										onChange={(e) => setShowWireframe(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Rivers</span>
									<input
										type="checkbox"
										checked={showRivers}
										onChange={(e) => setShowRivers(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Thermal Equator</span>
									<input
										type="checkbox"
										checked={showThermalEquator}
										onChange={(e) => setShowThermalEquator(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Nation Borders</span>
									<input
										type="checkbox"
										checked={showNationBorders}
										onChange={(e) => setShowNationBorders(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Hierarchy</span>
									<input
										type="checkbox"
										checked={showNationHierarchy}
										onChange={(e) => setShowNationHierarchy(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Grid Lines</span>
									<input
										type="checkbox"
										checked={showGrid}
										onChange={(e) => setShowGrid(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<div
									className={
										showGrid ? "space-y-1.5" : "space-y-1.5 opacity-50"
									}
								>
									<div className="flex justify-between items-baseline">
										<label className="text-[11px] font-medium text-slate-300">
											Grid Spacing
										</label>
										<span className="font-mono text-[11px] text-slate-400">
											{gridSpacing}°
										</span>
									</div>
									<input
										type="range"
										min={0}
										max={gridSpacingOptions.length - 1}
										step={1}
										value={Math.max(0, gridSpacingOptions.indexOf(gridSpacing))}
										onChange={(e) =>
											setGridSpacing(
												gridSpacingOptions[Number(e.target.value)] ??
													gridSpacingOptions[0],
											)
										}
										disabled={!showGrid}
										className="w-full accent-slate-100 disabled:cursor-not-allowed"
									/>
								</div>
								{viewMode === "map" && (
									<div className="space-y-1.5">
										<div className="flex items-baseline justify-between gap-3">
											<label className="text-[11px] font-medium text-slate-300">
												Projection Latitude
											</label>
											<span className="font-mono text-[11px] text-slate-400">
												{draftMapProjectionLatitude.toFixed(0)}°
											</span>
										</div>
										<input
											type="range"
											min={-MAX_MAP_PROJECTION_LATITUDE_DEG}
											max={MAX_MAP_PROJECTION_LATITUDE_DEG}
											step={1}
											value={draftMapProjectionLatitude}
											onChange={(e) =>
												setDraftMapProjectionLatitude(Number(e.target.value))
											}
											onPointerUp={commitMapProjectionLatitude}
											onKeyUp={commitMapProjectionLatitude}
											onBlur={commitMapProjectionLatitude}
											className="w-full accent-slate-100"
										/>
									</div>
								)}
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Debug Map Modes</span>
									<input
										type="checkbox"
										checked={debugMapModes}
										onChange={(e) => setDebugMapModes(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
									<SegmentedControl
										options={[
											{
												value: "globe",
												label: <GlobeIcon className="h-3.5 w-3.5" />,
												ariaLabel: "Globe view",
												title: "Globe view",
											},
											{
												value: "map",
												label: <MapIcon className="h-3.5 w-3.5" />,
												ariaLabel: "Map view",
												title: "Map view",
											},
										]}
										value={viewMode}
										onChange={setViewMode}
										tone="overlay"
										size="sm"
										buttonClassName="px-1.5"
									/>
									<SegmentedControl
										options={[
											{
												value: "metric",
												label: <span className="font-mono uppercase">km</span>,
												title: "Metric units",
												ariaLabel: "Metric units",
											},
											{
												value: "imperial",
												label: <span className="font-mono uppercase">mi</span>,
												title: "Imperial units",
												ariaLabel: "Imperial units",
											},
										]}
										value={unitSystem}
										onChange={setUnitSystem}
										tone="overlay"
										size="sm"
										buttonClassName="px-1.5"
									/>
								</div>
							</div>
						</FloatingPanel>
					</div>
				</div>
				<div className="pointer-events-auto flex items-center gap-2">
					{!generationPanelOpen && onToggleGenerationPanel && (
						<IconButton
							onClick={onToggleGenerationPanel}
							title="Show generation panel"
							tone="overlay"
						>
							<GlobeIcon className="h-3.5 w-3.5 text-white" />
						</IconButton>
					)}
					<IconButton
						onClick={() => setOverlaysExpanded((value) => !value)}
						title={overlaysExpanded ? "Hide settings" : "Show settings"}
						tone="overlay"
						selected={overlaysExpanded}
						shape="rounded"
						size="sm"
						className="shadow-lg backdrop-blur-md"
					>
						<GearIcon className="h-4 w-4" />
					</IconButton>
				</div>
			</div>
		</div>
	)
}
