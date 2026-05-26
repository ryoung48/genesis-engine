import React from "react"
import { fadeVisibilityClassName } from "@/ui/components/animations/fade"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { PanelHeader } from "@/ui/components/composites/PanelHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { BankIcon } from "@/ui/components/primitives/icons/BankIcon"
import { CityIcon } from "@/ui/components/primitives/icons/CityIcon"
import { CheckIcon } from "@/ui/components/primitives/icons/CheckIcon"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import { CompassRoseIcon } from "@/ui/components/primitives/icons/CompassRoseIcon"
import { CopyIcon } from "@/ui/components/primitives/icons/CopyIcon"
import { CrownIcon } from "@/ui/components/primitives/icons/CrownIcon"
import { DiameterVariantIcon } from "@/ui/components/primitives/icons/DiameterVariantIcon"
import { GearIcon } from "@/ui/components/primitives/icons/GearIcon"
import { GlobeIcon } from "@/ui/components/primitives/icons/GlobeIcon"
import { LightningIcon } from "@/ui/components/primitives/icons/LightningIcon"
import { MapIcon } from "@/ui/components/primitives/icons/MapIcon"
import { RefreshIcon } from "@/ui/components/primitives/icons/RefreshIcon"
import { RulerIcon } from "@/ui/components/primitives/icons/RulerIcon"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { Tooltip } from "@/ui/components/primitives/Tooltip"
import type { OrogenViewMode } from "../renderer"
import { MAX_MAP_PROJECTION_LATITUDE_DEG } from "../renderer/map-projection"
import { gridSpacingOptions } from "../screen/shared/constants"
import type { UnitSystem } from "../screen/shared/ui-format"
import { formatDistance } from "../screen/shared/ui-format"

export type MeasureMode = "off" | "ruler" | "pathfinding"
export type ExportWidthPreset = "4096" | "8192" | "16384" | "32768"
export type LabelMode = "off" | "nations" | "dynasty" | "settlements"

const LAND_TRAVEL_KM_PER_DAY = 30
const SEA_TRAVEL_KM_PER_DAY = 100

function formatTravelTime(days: number): string {
	if (days < 30) return `${days}d`
	const months = Math.floor(days / 30)
	const remainingDays = days % 30
	if (months < 12) {
		return remainingDays > 0 ? `${months}m ${remainingDays}d` : `${months}m`
	}
	const years = Math.floor(months / 12)
	const remainingMonths = months % 12
	const parts: string[] = []
	if (years > 0) parts.push(`${years}y`)
	if (remainingMonths > 0) parts.push(`${remainingMonths}m`)
	if (remainingDays > 0) parts.push(`${remainingDays}d`)
	return parts.join(" ")
}

function formatTravelRateLabel(
	kmPerDay: number,
	unitSystem: UnitSystem,
): string {
	return `(${formatDistance(kmPerDay, unitSystem)}/day)`
}

interface OverlayControlsProps {
	overlaysExpanded: boolean
	setOverlaysExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	measureMode: MeasureMode
	setMeasureMode: (v: MeasureMode) => void
	pathfindingLand: boolean
	setPathfindingLand: (v: boolean) => void
	pathfindingSea: boolean
	setPathfindingSea: (v: boolean) => void
	pathfindingResult: {
		distanceKm: number
		landKm: number
		seaKm: number
		travelDays: number
	} | null
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
	labelMode: LabelMode
	setLabelMode: (v: LabelMode) => void
	showElevation: boolean
	setShowElevation: (v: boolean) => void
	showInfrastructure: boolean
	setShowInfrastructure: (v: boolean) => void
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
	exportExpanded?: boolean
	setExportExpanded?: (v: boolean | ((prev: boolean) => boolean)) => void
	exportWidthPreset: ExportWidthPreset
	setExportWidthPreset: (v: ExportWidthPreset) => void
	exportCenterLongitude: number
	setExportCenterLongitude: (v: number) => void
	exportDisabled: boolean
	exportBusy: boolean
	exportProgress: { percent: number; label: string } | null
	exportError?: string | null
	onExport: () => void
	canCopyCode?: boolean
	codeCopied?: boolean
	onCopyCode?: () => void
	onReset?: () => void
	generationPanelOpen?: boolean
	onToggleGenerationPanel?: () => void
}

export const OverlayControls: React.FC<OverlayControlsProps> = ({
	overlaysExpanded,
	setOverlaysExpanded,
	measureMode,
	setMeasureMode,
	pathfindingLand,
	setPathfindingLand,
	pathfindingSea,
	setPathfindingSea,
	pathfindingResult,
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
	labelMode,
	setLabelMode,
	showElevation,
	setShowElevation,
	showInfrastructure,
	setShowInfrastructure,
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
	exportWidthPreset,
	setExportWidthPreset,
	exportCenterLongitude,
	setExportCenterLongitude,
	exportDisabled,
	exportBusy,
	exportProgress,
	exportError,
	onExport,
	canCopyCode = false,
	codeCopied = false,
	onCopyCode,
	onReset,
	generationPanelOpen,
	onToggleGenerationPanel,
	exportExpanded: controlledExportExpanded,
	setExportExpanded: controlledSetExportExpanded,
}) => {
	const [gridSpacingExpanded, setGridSpacingExpanded] = React.useState(false)
	const [localExportExpanded, setLocalExportExpanded] = React.useState(false)
	const exportExpanded =
		controlledExportExpanded !== undefined
			? controlledExportExpanded
			: localExportExpanded
	const setExportExpanded =
		controlledSetExportExpanded ?? setLocalExportExpanded
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
		(canCopyCode && onCopyCode) || onReset ? (
			<div className="flex items-center gap-1">
				{onReset && (
					<Tooltip content="Reset to defaults" position="top">
						<IconButton
							onClick={onReset}
							tone="overlay"
							shape="pill"
							size="sm"
							className="shadow-none"
						>
							<RefreshIcon className="h-3.5 w-3.5" />
						</IconButton>
					</Tooltip>
				)}
				{canCopyCode && onCopyCode && (
					<Tooltip content={codeCopied ? "Copied" : "Copy seed"} position="top">
						<IconButton
							onClick={onCopyCode}
							tone="overlay"
							shape="pill"
							size="sm"
							className={
								codeCopied
									? "border-emerald-300/60 bg-emerald-400/20 shadow-none"
									: "shadow-none"
							}
						>
							{codeCopied ? (
								<CheckIcon className="h-3.5 w-3.5 text-emerald-300" />
							) : (
								<CopyIcon className="h-3.5 w-3.5" />
							)}
						</IconButton>
					</Tooltip>
				)}
			</div>
		) : undefined

	return (
		<div className="absolute inset-0 z-20 pointer-events-none">
			<div className="absolute top-3 left-3 pointer-events-auto">
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
									<span>Wireframe</span>
									<input
										type="checkbox"
										checked={showWireframe}
										onChange={(e) => setShowWireframe(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Elevation</span>
									<input
										type="checkbox"
										checked={showElevation}
										onChange={(e) => setShowElevation(e.target.checked)}
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
									<span>Nation Borders</span>
									<input
										type="checkbox"
										checked={showNationBorders}
										onChange={(e) => setShowNationBorders(e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>
								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Infrastructure</span>
									<input
										type="checkbox"
										checked={showInfrastructure}
										onChange={(e) => setShowInfrastructure(e.target.checked)}
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
									<span>Grid Lines</span>
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={() => setGridSpacingExpanded((v) => !v)}
											className="flex items-center justify-center w-4 h-4 rounded hover:bg-white/10 transition-colors"
										>
											<ChevronIcon
												direction={gridSpacingExpanded ? "up" : "down"}
												className="h-3 w-3 text-slate-400"
											/>
										</button>
										<input
											type="checkbox"
											checked={showGrid}
											onChange={(e) => setShowGrid(e.target.checked)}
											className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
										/>
									</div>
								</label>
								{gridSpacingExpanded && (
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
											value={Math.max(
												0,
												gridSpacingOptions.indexOf(gridSpacing),
											)}
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

								<div className="flex items-center justify-between gap-3">
									<span className="text-[11px] font-medium text-slate-200">
										Labels
									</span>
									<SegmentedControl
										options={[
											{
												value: "off",
												label: <DiameterVariantIcon className="h-3.5 w-3.5" />,
												ariaLabel: "Labels off",
												title: "Labels off",
											},
											{
												value: "nations",
												label: <BankIcon className="h-3.5 w-3.5" />,
												ariaLabel: "Nation labels",
												title: "Nation labels",
											},
											{
												value: "dynasty",
												label: <CrownIcon className="h-3.5 w-3.5" />,
												ariaLabel: "Dynasty labels",
												title: "Dynasty labels",
											},
											{
												value: "settlements",
												label: <CityIcon className="h-3.5 w-3.5" />,
												ariaLabel: "Settlement labels",
												title: "Settlement labels",
											},
										]}
										value={labelMode}
										onChange={setLabelMode}
										tone="overlay"
										size="sm"
										buttonClassName="px-2"
									/>
								</div>
								<div className="border-t border-white/10 pt-2">
									<div className="flex items-center justify-between gap-3">
										<span className="text-[11px] font-medium text-slate-200">
											Measure
										</span>
										<SegmentedControl
											options={[
												{
													value: "off",
													label: (
														<DiameterVariantIcon className="h-3.5 w-3.5" />
													),
													ariaLabel: "Measure off",
													title: "Measure off",
												},
												{
													value: "ruler",
													label: <RulerIcon className="h-3.5 w-3.5" />,
													ariaLabel: "Ruler mode",
													title: "Ruler mode",
												},
												{
													value: "pathfinding",
													label: <CompassRoseIcon className="h-3.5 w-3.5" />,
													ariaLabel: "Pathfinding mode",
													title: "Pathfinding mode",
												},
											]}
											value={measureMode}
											onChange={setMeasureMode}
											tone="overlay"
											size="sm"
											buttonClassName="px-2"
										/>
									</div>
								</div>
								{measureMode === "pathfinding" && (
									<div className="space-y-1.5">
										<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
											<span>
												Land Travel{" "}
												{formatTravelRateLabel(
													LAND_TRAVEL_KM_PER_DAY,
													unitSystem,
												)}
											</span>
											<input
												type="checkbox"
												checked={pathfindingLand}
												onChange={(e) => setPathfindingLand(e.target.checked)}
												className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
											/>
										</label>
										<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
											<span>
												Sea Travel{" "}
												{formatTravelRateLabel(
													SEA_TRAVEL_KM_PER_DAY,
													unitSystem,
												)}
											</span>
											<input
												type="checkbox"
												checked={pathfindingSea}
												onChange={(e) => setPathfindingSea(e.target.checked)}
												className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
											/>
										</label>
										{pathfindingResult && (
											<div className="rounded bg-white/5 px-2 py-1.5 font-mono text-[10px] text-slate-300">
												<div>
													Distance:{" "}
													{formatDistance(
														pathfindingResult.distanceKm,
														unitSystem,
													)}
												</div>
												<div>
													Land:{" "}
													{formatDistance(pathfindingResult.landKm, unitSystem)}
												</div>
												<div>
													Sea:{" "}
													{formatDistance(pathfindingResult.seaKm, unitSystem)}
												</div>
												<div>
													Travel time: ~
													{formatTravelTime(pathfindingResult.travelDays)}
												</div>
											</div>
										)}
									</div>
								)}
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
												label: <span className="font-mono uppercase">me</span>,
												title: "Metric units",
												ariaLabel: "Metric units",
											},
											{
												value: "imperial",
												label: <span className="font-mono uppercase">im</span>,
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
								<div className="space-y-2 border-t border-white/10 pt-2">
									<div className="flex items-center justify-between gap-3">
										<label className="text-[11px] font-medium text-slate-300">
											Export PNG
										</label>
										<button
											type="button"
											onClick={() => setExportExpanded((v) => !v)}
											className="flex items-center justify-center w-4 h-4 rounded hover:bg-white/10 transition-colors"
										>
											<ChevronIcon
												direction={exportExpanded ? "up" : "down"}
												className="h-3 w-3 text-slate-400"
											/>
										</button>
									</div>
									{exportExpanded && (
										<div className="space-y-2">
											<div className="flex items-center justify-between gap-3">
												<label className="text-[11px] font-medium text-slate-300">
													Resolution
												</label>
												<SegmentedControl
													options={[
														{
															value: "4096",
															label: "4k",
															ariaLabel: "4096 wide",
														},
														{
															value: "8192",
															label: "8k",
															ariaLabel: "8192 wide",
														},
														{
															value: "16384",
															label: "16k",
															ariaLabel: "16384 wide",
														},
														{
															value: "32768",
															label: "32k",
															ariaLabel: "32768 wide",
														},
													]}
													value={exportWidthPreset}
													onChange={setExportWidthPreset}
													tone="overlay"
													size="sm"
													buttonClassName="px-1.5"
												/>
											</div>
											<div className="space-y-1.5">
												<div className="flex items-baseline justify-between gap-3">
													<label className="text-[11px] font-medium text-slate-300">
														Export Longitude
													</label>
													<span className="font-mono text-[11px] text-slate-400">
														{exportCenterLongitude.toFixed(0)}°
													</span>
												</div>
												<input
													type="range"
													min={-180}
													max={180}
													step={1}
													value={exportCenterLongitude}
													onChange={(e) =>
														setExportCenterLongitude(Number(e.target.value))
													}
													className="w-full accent-slate-100"
												/>
											</div>
											<button
												type="button"
												onClick={onExport}
												disabled={exportDisabled}
												className="w-full rounded-md border border-white/10 bg-white/8 px-2.5 py-1.5 text-[11px] font-medium text-slate-100 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
											>
												{exportBusy
													? `Exporting ${exportWidthPreset}w`
													: "Export PNG"}
											</button>
											{exportProgress && (
												<div className="space-y-1">
													<div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
														<span>{exportProgress.label}</span>
														<span className="font-mono">
															{exportProgress.percent}%
														</span>
													</div>
													<div className="h-1.5 overflow-hidden rounded-full bg-white/8">
														<div
															className="h-full rounded-full bg-slate-100 transition-[width]"
															style={{ width: `${exportProgress.percent}%` }}
														/>
													</div>
												</div>
											)}
											{exportError && (
												<div className="text-[10px] text-rose-300">
													{exportError}
												</div>
											)}
										</div>
									)}
								</div>
							</div>
						</FloatingPanel>
					</div>
				</div>
				<div className="pointer-events-auto">
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
