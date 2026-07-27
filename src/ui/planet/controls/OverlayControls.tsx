import React from "react"
import { fadeVisibilityClassName } from "@/ui/components/animations/fade"
import { CopyButton } from "@/ui/components/composites/CopyButton"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { PanelHeader } from "@/ui/components/composites/PanelHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { BugIcon } from "@/ui/components/primitives/icons/BugIcon"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import { DetailsIcon } from "@/ui/components/primitives/icons/DetailsIcon"
import { GearIcon } from "@/ui/components/primitives/icons/GearIcon"
import { GlobeIcon } from "@/ui/components/primitives/icons/GlobeIcon"
import { MapIcon } from "@/ui/components/primitives/icons/MapIcon"
import { RefreshIcon } from "@/ui/components/primitives/icons/RefreshIcon"
import { TransferUpIcon } from "@/ui/components/primitives/icons/TransferUpIcon"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { Tooltip } from "@/ui/components/primitives/Tooltip"
import {
	CLOCK_DIAL_HOURS,
	clampClockDialHour,
	formatClockTimeDisplay,
	scaleClockDialHourToDayLength,
} from "@/ui/planet/clock"
import type { ColorMode } from "@/ui/planet/colors"
import type { GenesisViewMode } from "@/ui/planet/renderer"
import { MAX_MAP_PROJECTION_LATITUDE_DEG } from "@/ui/planet/renderer/map-projection"
import { gridSpacingOptions } from "@/ui/planet/screen/shared/constants"
import {
	type DataVariant,
	getAvailableVariants,
	getBaseMapMode,
} from "@/ui/planet/screen/shared/data-variant"
import type {
	NationMapMode,
	PopulationMapMode,
} from "@/ui/planet/screen/shared/map-modes"
import type { UnitSystem } from "@/ui/planet/screen/shared/ui-format"
import { formatDistance } from "@/ui/planet/screen/shared/ui-format"

export type MeasureMode = "off" | "ruler" | "pathfinding"
export type DangerSubMode =
	| "earthquake"
	| "volcanic"
	| "cyclone"
	| "tornado"
	| "tidal"
export type VegetationSubMode = "base" | "maps" | "satellite" | "eu5"
export type ClimateSubMode = "basic" | "pasta" | "koppen" | "eu5"
export type TopographySubMode = "classification" | "slope" | "eu5"
export type ExportWidthPreset = "4096" | "8192" | "16384" | "32768"
export interface LabelMode {
	nations: boolean
	dynasty: boolean
	settlements: boolean
	culture: boolean
	heritage: boolean
	/** Only meaningful for Earth-imported worlds -- there is no procedural
	 * religion label overlay (world.religions is culture-indexed, not
	 * province-indexed). See create-genesis-scene.ts's
	 * earthHistoryLabelPartitions. */
	religion: boolean
	script: boolean
}

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
	showCoastlines: boolean
	setShowCoastlines: (v: boolean) => void
	showWindArrows: boolean
	setShowWindArrows: (v: boolean) => void
	showGdd: boolean
	setShowGdd: (v: boolean) => void
	showGint: boolean
	setShowGint: (v: boolean) => void
	showPet: boolean
	setShowPet: (v: boolean) => void
	showAet: boolean
	setShowAet: (v: boolean) => void
	showOceanCurrents: boolean
	setShowOceanCurrents: (v: boolean) => void
	showGrid: boolean
	setShowGrid: (v: boolean) => void
	showNationBorders: boolean
	setShowNationBorders: (v: boolean) => void
	showLandBorders: boolean
	setShowLandBorders: (v: boolean) => void
	showNationHierarchy: boolean
	setShowNationHierarchy: (v: boolean) => void
	nationMode: NationMapMode
	populationMode: PopulationMapMode
	labelMode: LabelMode
	setLabelMode: (v: LabelMode) => void
	showElevation: boolean
	setShowElevation: (v: boolean) => void
	showInfrastructure: boolean
	setShowInfrastructure: (v: boolean) => void
	gridSpacing: number
	setGridSpacing: (v: number) => void
	viewMode: GenesisViewMode
	setViewMode: (v: GenesisViewMode) => void
	unitSystem: UnitSystem
	setUnitSystem: (v: UnitSystem) => void
	mapProjectionLatitude: number
	draftMapProjectionLatitude: number
	setDraftMapProjectionLatitude: (v: number) => void
	setMapProjectionLatitude: (v: number) => void
	debugMapModes: boolean
	setDebugMapModes: (v: boolean) => void
	colorMode: ColorMode
	setColorMode: (v: ColorMode) => void
	dataVariant: DataVariant
	setDataVariant: (v: DataVariant) => void
	clockCurrent: boolean
	setClockCurrent: (v: boolean) => void
	clockMonthMode: "annual" | "monthly"
	setClockMonthMode: (v: "annual" | "monthly") => void
	clockMonth: number
	setClockMonth: (v: number) => void
	clockDay: number
	setClockDay: (v: number) => void
	clockHour?: number
	setClockHour?: (v: number) => void
	clockUseMeridiem?: boolean
	setClockUseMeridiem?: (v: boolean) => void
	hoursPerDay?: number
	tidallyLocked?: boolean
	daysPerYear: number
	vegetationSubMode: VegetationSubMode
	setVegetationSubMode: (v: VegetationSubMode) => void
	climateSubMode: ClimateSubMode
	setClimateSubMode: (v: ClimateSubMode) => void
	elevationSubMode: "colored" | "grayscale"
	setElevationSubMode: (v: "colored" | "grayscale") => void
	topographySubMode: TopographySubMode
	setTopographySubMode: (v: TopographySubMode) => void
	dangerSubMode: DangerSubMode
	setDangerSubMode: (v: DangerSubMode) => void
	hasCycloneRisk: boolean
	hasTornadoRisk: boolean
	hasTidalRisk: boolean
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
	onReset?: () => void
	generationPanelOpen?: boolean
	onToggleGenerationPanel?: () => void
	showDaylight?: boolean
	setShowDaylight?: (v: boolean) => void
	onEnterSolarSystem?: () => void
	isEarthImport?: boolean
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
	showCoastlines,
	setShowCoastlines,
	showWindArrows,
	setShowWindArrows,
	showGdd,
	setShowGdd,
	showGint,
	setShowGint,
	showPet,
	setShowPet,
	showAet,
	setShowAet,
	showOceanCurrents,
	setShowOceanCurrents,
	showGrid,
	setShowGrid,
	showNationBorders,
	setShowNationBorders,
	showLandBorders,
	setShowLandBorders,
	showNationHierarchy,
	setShowNationHierarchy,
	nationMode,
	populationMode,
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
	colorMode,
	setColorMode,
	dataVariant,
	setDataVariant,
	clockCurrent,
	setClockCurrent,
	clockMonthMode,
	setClockMonthMode,
	clockMonth,
	setClockMonth,
	clockDay,
	setClockDay,
	clockHour = 12,
	setClockHour = () => undefined,
	clockUseMeridiem = false,
	setClockUseMeridiem = () => undefined,
	hoursPerDay = 24,
	tidallyLocked = false,
	daysPerYear,
	vegetationSubMode,
	setVegetationSubMode,
	climateSubMode,
	setClimateSubMode,
	elevationSubMode,
	setElevationSubMode,
	topographySubMode,
	setTopographySubMode,
	dangerSubMode,
	setDangerSubMode,
	hasCycloneRisk,
	hasTornadoRisk,
	hasTidalRisk,
	exportWidthPreset,
	setExportWidthPreset,
	exportCenterLongitude,
	setExportCenterLongitude,
	exportDisabled,
	exportBusy,
	exportProgress,
	exportError,
	onExport,
	onReset,
	generationPanelOpen,
	onToggleGenerationPanel,
	showDaylight = false,
	setShowDaylight,
	onEnterSolarSystem,
	exportExpanded: controlledExportExpanded,
	setExportExpanded: controlledSetExportExpanded,
	isEarthImport = false,
}) => {
	const [gridSpacingExpanded, setGridSpacingExpanded] = React.useState(false)
	const [politicalExpanded, setPoliticalExpanded] = React.useState(false)
	const [geographyExpanded, setGeographyExpanded] = React.useState(false)
	const [labelsExpanded, setLabelsExpanded] = React.useState(false)
	const [clockExpanded, setClockExpanded] = React.useState(false)
	const [vegetationExpanded, setVegetationExpanded] = React.useState(false)
	const [climateExpanded, setClimateExpanded] = React.useState(false)
	const [dangerExpanded, setDangerExpanded] = React.useState(false)
	const [measureExpanded, setMeasureExpanded] = React.useState(false)
	const [elevationExpanded, setElevationExpanded] = React.useState(false)
	const [topographyExpanded, setTopographyExpanded] = React.useState(false)
	const [localExportExpanded, setLocalExportExpanded] = React.useState(false)
	const exportExpanded =
		controlledExportExpanded !== undefined
			? controlledExportExpanded
			: localExportExpanded
	const setExportExpanded =
		controlledSetExportExpanded ?? setLocalExportExpanded
	const availableVariants = getAvailableVariants(colorMode)
	const baseColorMode = getBaseMapMode(colorMode)
	const clampedClockHour = clampClockDialHour(clockHour)
	const scaledClockHour = scaleClockDialHourToDayLength(clockHour, hoursPerDay)
	const daysPerMonth = Math.max(1, Math.round(daysPerYear / 12))
	const clampedClockDay = Math.max(0, Math.min(clockDay, daysPerMonth - 1))
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
	const headerAction = (
		<div className="flex items-center gap-1">
			<Tooltip
				content={debugMapModes ? "Disable debug modes" : "Enable debug modes"}
				position="top"
			>
				<IconButton
					onClick={() => setDebugMapModes(!debugMapModes)}
					tone="overlay"
					shape="pill"
					size="sm"
					className={
						debugMapModes
							? "border-emerald-300/60 bg-emerald-400/20 shadow-none"
							: "shadow-none"
					}
				>
					<BugIcon className="h-3.5 w-3.5" filled={debugMapModes} />
				</IconButton>
			</Tooltip>
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
			{onEnterSolarSystem && (
				<Tooltip content="Solar system view" position="top">
					<IconButton
						onClick={onEnterSolarSystem}
						tone="overlay"
						shape="pill"
						size="sm"
						className="shadow-none"
					>
						<TransferUpIcon className="h-3.5 w-3.5" />
					</IconButton>
				</Tooltip>
			)}
		</div>
	)

	return (
		<div className="absolute inset-0 z-20 pointer-events-none">
			<div className="hidden" aria-hidden="true">
				<CopyButton text="" disabled tone="overlay" size="sm" />
			</div>
			<div className="absolute top-3 left-3 pointer-events-auto">
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
							className="w-64"
							padding="md"
						>
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
										onChange={() => setShowWireframe(!showWireframe)}
										className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
								</label>

								<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
									<span>Measure</span>
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={() => setMeasureExpanded((v) => !v)}
											className="flex items-center justify-center w-4 h-4 rounded hover:bg-white/10 transition-colors"
										>
											<ChevronIcon
												direction={measureExpanded ? "up" : "down"}
												className="h-3 w-3 text-slate-400"
											/>
										</button>
										<input
											type="checkbox"
											checked={measureMode !== "off"}
											onChange={(e) => {
												if (!e.target.checked) {
													setMeasureMode("off")
												} else if (measureMode === "off") {
													setMeasureMode("ruler")
												}
											}}
											className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
										/>
									</div>
								</label>
								{measureExpanded && (
									<div className="space-y-1.5">
										<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
											<span>Ruler</span>
											<input
												type="radio"
												name="measure-mode"
												checked={measureMode === "ruler"}
												onChange={() => setMeasureMode("ruler")}
												className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
											/>
										</label>
										<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
											<span>Pathfinding</span>
											<input
												type="radio"
												name="measure-mode"
												checked={measureMode === "pathfinding"}
												onChange={() => setMeasureMode("pathfinding")}
												className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
											/>
										</label>
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
														onChange={(e) =>
															setPathfindingLand(e.target.checked)
														}
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
														onChange={(e) =>
															setPathfindingSea(e.target.checked)
														}
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
															{formatDistance(
																pathfindingResult.landKm,
																unitSystem,
															)}
														</div>
														<div>
															Sea:{" "}
															{formatDistance(
																pathfindingResult.seaKm,
																unitSystem,
															)}
														</div>
														<div>
															Travel time: ~
															{formatTravelTime(pathfindingResult.travelDays)}
														</div>
													</div>
												)}
											</div>
										)}
									</div>
								)}

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

								<div>
									<button
										type="button"
										onClick={() => setClockExpanded((v) => !v)}
										className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
									>
										<span>Clock</span>
										<ChevronIcon
											direction={clockExpanded ? "up" : "down"}
											className="h-3 w-3 text-slate-400"
										/>
									</button>
									{clockExpanded && (
										<div className="mt-1.5 space-y-1.5">
											<div className="flex items-center gap-4 text-[11px] font-medium">
												<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
													<input
														type="radio"
														name="clock-mode"
														checked={clockCurrent}
														onChange={() => setClockCurrent(true)}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
													Current
												</label>
												<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
													<input
														type="radio"
														name="clock-mode"
														checked={
															!clockCurrent && clockMonthMode === "annual"
														}
														onChange={() => {
															setClockCurrent(false)
															setClockMonthMode("annual")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
													Annual
												</label>
												<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
													<input
														type="radio"
														name="clock-mode"
														checked={
															!clockCurrent && clockMonthMode === "monthly"
														}
														onChange={() => {
															setClockCurrent(false)
															setClockMonthMode("monthly")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
													Monthly
												</label>
											</div>
											<div className="border-t border-white/10" />
											<div
												className={
													clockCurrent || clockMonthMode === "annual"
														? "space-y-1.5 opacity-50 pointer-events-none"
														: "space-y-1.5"
												}
											>
												<div className="flex items-center justify-between">
													<label className="text-[11px] font-medium text-slate-300">
														Month
													</label>
													<span className="font-mono text-[11px] text-slate-400">
														{[
															"Jan",
															"Feb",
															"Mar",
															"Apr",
															"May",
															"Jun",
															"Jul",
															"Aug",
															"Sep",
															"Oct",
															"Nov",
															"Dec",
														][clockMonth] ?? clockMonth + 1}
													</span>
												</div>
												<input
													type="range"
													min={0}
													max={11}
													step={1}
													value={clockMonth}
													onChange={(e) =>
														setClockMonth(Number(e.target.value))
													}
													disabled={clockCurrent || clockMonthMode === "annual"}
													className="w-full accent-slate-100 disabled:cursor-not-allowed"
												/>
												<div className="flex items-center justify-between">
													<label className="text-[11px] font-medium text-slate-300">
														Day
													</label>
													<span className="font-mono text-[11px] text-slate-400">
														#{clampedClockDay + 1}
													</span>
												</div>
												<input
													type="range"
													min={0}
													max={daysPerMonth - 1}
													step={1}
													value={clampedClockDay}
													onChange={(e) => setClockDay(Number(e.target.value))}
													disabled={clockCurrent || clockMonthMode === "annual"}
													className="w-full accent-slate-100 disabled:cursor-not-allowed"
												/>
											</div>
											{!tidallyLocked && (
												<div className="space-y-1">
													<div className="flex items-center justify-between">
														<label className="text-[11px] font-medium text-slate-300">
															Hour
														</label>
														<span className="font-mono text-[11px] text-slate-400">
															{formatClockTimeDisplay(
																scaledClockHour,
																hoursPerDay,
																clockUseMeridiem,
															)}
														</span>
													</div>
													<input
														type="range"
														min={0}
														max={CLOCK_DIAL_HOURS}
														step={0.5}
														value={clampedClockHour}
														onChange={(e) =>
															setClockHour(Number(e.target.value))
														}
														className="m-0 block w-full accent-slate-100"
													/>
													<label className="mt-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
														<span>AM / PM</span>
														<input
															type="checkbox"
															checked={clockUseMeridiem}
															onChange={(e) =>
																setClockUseMeridiem(e.target.checked)
															}
															className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
														/>
													</label>
												</div>
											)}
											{setShowDaylight && (
												<label className="mt-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Daylight</span>
													<input
														type="checkbox"
														checked={showDaylight}
														onChange={(e) => setShowDaylight(e.target.checked)}
														className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
											)}
										</div>
									)}
								</div>

								<div>
									<button
										type="button"
										onClick={() => setGeographyExpanded((v) => !v)}
										className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
									>
										<span>Geography</span>
										<ChevronIcon
											direction={geographyExpanded ? "up" : "down"}
											className="h-3 w-3 text-slate-400"
										/>
									</button>
									{geographyExpanded && (
										<div className="mt-1.5 space-y-1.5">
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Elevation</span>
												<input
													type="checkbox"
													checked={showElevation}
													onChange={() => setShowElevation(!showElevation)}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Rivers</span>
												<input
													type="checkbox"
													checked={showRivers}
													onChange={(e) => setShowRivers(e.target.checked)}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Infrastructure</span>
												<input
													type="checkbox"
													checked={showInfrastructure}
													onChange={(e) =>
														setShowInfrastructure(e.target.checked)
													}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Wind</span>
												<input
													type="checkbox"
													checked={showWindArrows}
													onChange={(e) => setShowWindArrows(e.target.checked)}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Ocean Currents</span>
												<input
													type="checkbox"
													checked={showOceanCurrents}
													onChange={(e) =>
														setShowOceanCurrents(e.target.checked)
													}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Thermal Equator</span>
												<input
													type="checkbox"
													checked={showThermalEquator}
													onChange={(e) =>
														setShowThermalEquator(e.target.checked)
													}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Coastlines</span>
												<input
													type="checkbox"
													checked={showCoastlines}
													onChange={(e) => setShowCoastlines(e.target.checked)}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											{isEarthImport && availableVariants.length > 1 && (
												<div className="pt-1">
													<div className="flex items-center gap-4 text-[11px] font-medium">
														<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
															<input
																type="radio"
																name="data-variant"
																checked={dataVariant === "generated"}
																onChange={() => setDataVariant("generated")}
																className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
															/>
															Model
														</label>
														<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
															<input
																type="radio"
																name="data-variant"
																checked={dataVariant === "observed"}
																onChange={() => setDataVariant("observed")}
																className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
															/>
															Observed
														</label>
														{availableVariants.includes("diff") && (
															<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
																<input
																	type="radio"
																	name="data-variant"
																	checked={dataVariant === "diff"}
																	onChange={() => setDataVariant("diff")}
																	className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
																/>
																Diff
															</label>
														)}
													</div>
												</div>
											)}
										</div>
									)}
								</div>

								<div>
									<button
										type="button"
										onClick={() => setPoliticalExpanded((v) => !v)}
										className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
									>
										<span>Political</span>
										<ChevronIcon
											direction={politicalExpanded ? "up" : "down"}
											className="h-3 w-3 text-slate-400"
										/>
									</button>
									{politicalExpanded && (
										<div className="mt-1.5 space-y-1.5">
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Hierarchy</span>
												<input
													type="checkbox"
													checked={showNationHierarchy}
													onChange={(e) =>
														setShowNationHierarchy(e.target.checked)
													}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Land Borders</span>
												<input
													type="checkbox"
													checked={showLandBorders}
													onChange={(e) => setShowLandBorders(e.target.checked)}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Borders</span>
												<input
													type="checkbox"
													checked={showNationBorders}
													onChange={(e) =>
														setShowNationBorders(e.target.checked)
													}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
										</div>
									)}
								</div>

								<div>
									<button
										type="button"
										onClick={() => setLabelsExpanded((v) => !v)}
										className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
									>
										<span>Labels</span>
										<ChevronIcon
											direction={labelsExpanded ? "up" : "down"}
											className="h-3 w-3 text-slate-400"
										/>
									</button>
									{labelsExpanded && (
										<div className="mt-1.5 space-y-1.5">
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>
													{getBaseMapMode(colorMode) === "population" &&
													populationMode === "culture"
														? "Culture"
														: getBaseMapMode(colorMode) === "population" &&
																(populationMode === "heritage" ||
																	populationMode === "religion")
															? "Heritage"
															: nationMode === "dynasty"
																? "Dynasty"
																: "Nations"}
												</span>
												<input
													type="checkbox"
													checked={
														labelMode.nations ||
														labelMode.dynasty ||
														labelMode.culture ||
														labelMode.heritage
													}
													onChange={(e) => {
														const isPopMode =
															getBaseMapMode(colorMode) === "population"
														const isDynasty = nationMode === "dynasty"
														setLabelMode({
															...labelMode,
															nations:
																e.target.checked && !isPopMode && !isDynasty,
															dynasty:
																e.target.checked && !isPopMode && isDynasty,
															culture:
																e.target.checked &&
																isPopMode &&
																populationMode === "culture",
															heritage:
																e.target.checked &&
																isPopMode &&
																(populationMode === "heritage" ||
																	populationMode === "religion"),
														})
													}}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Settlements</span>
												<input
													type="checkbox"
													checked={labelMode.settlements}
													onChange={(e) =>
														setLabelMode({
															...labelMode,
															settlements: e.target.checked,
														})
													}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
											<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
												<span>Script</span>
												<input
													type="checkbox"
													checked={labelMode.script}
													onChange={(e) =>
														setLabelMode({
															...labelMode,
															script: e.target.checked,
														})
													}
													className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
												/>
											</label>
										</div>
									)}
								</div>

								{(colorMode === "temperature" ||
									colorMode === "realTemperature" ||
									colorMode === "temperatureDiff" ||
									colorMode === "realDtr" ||
									colorMode === "dtrDiff" ||
									colorMode === "precipitation" ||
									colorMode === "realPrecipitation" ||
									colorMode === "precipitationDiff" ||
									colorMode === "humidity" ||
									colorMode === "realHumidity" ||
									colorMode === "humidityDiff" ||
									colorMode === "wind" ||
									colorMode === "dtr" ||
									baseColorMode === "misery") && (
									<div>
										<button
											type="button"
											onClick={() => setClimateExpanded((v) => !v)}
											className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
										>
											<span>
												{colorMode === "temperature" ||
												colorMode === "realTemperature" ||
												colorMode === "temperatureDiff" ||
												colorMode === "dtr" ||
												colorMode === "realDtr" ||
												colorMode === "dtrDiff" ||
												baseColorMode === "misery"
													? "Temperature"
													: colorMode === "wind"
														? "Wind"
														: "Rainfall"}
											</span>
											<ChevronIcon
												direction={climateExpanded ? "up" : "down"}
												className="h-3 w-3 text-slate-400"
											/>
										</button>
										{climateExpanded && (
											<div className="mt-1.5 space-y-1.5">
												{(colorMode === "precipitation" ||
													colorMode === "realPrecipitation" ||
													colorMode === "precipitationDiff" ||
													colorMode === "humidity" ||
													colorMode === "realHumidity" ||
													colorMode === "humidityDiff") && (
													<div className="flex items-center gap-4 text-[11px] font-medium">
														<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
															<input
																type="radio"
																name="rain-sub"
																checked={baseColorMode === "precipitation"}
																onChange={() => setColorMode("precipitation")}
																className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
															/>
															Precipitation
														</label>
														<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
															<input
																type="radio"
																name="rain-sub"
																checked={baseColorMode === "humidity"}
																onChange={() => setColorMode("humidity")}
																className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
															/>
															Humidity
														</label>
													</div>
												)}
												{(colorMode === "temperature" ||
													colorMode === "realTemperature" ||
													colorMode === "temperatureDiff" ||
													colorMode === "dtr" ||
													colorMode === "realDtr" ||
													colorMode === "dtrDiff" ||
													baseColorMode === "misery") && (
													<div className="flex items-center gap-4 text-[11px] font-medium">
														<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
															<input
																type="radio"
																name="temp-sub"
																checked={baseColorMode === "temperature"}
																onChange={() => setColorMode("temperature")}
																className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
															/>
															Temp
														</label>
														<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
															<input
																type="radio"
																name="temp-sub"
																checked={baseColorMode === "dtr"}
																onChange={() => setColorMode("dtr")}
																className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
															/>
															DTR
														</label>
														<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
															<input
																type="radio"
																name="temp-sub"
																checked={baseColorMode === "misery"}
																onChange={() => setColorMode("misery")}
																className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
															/>
															MI
														</label>
													</div>
												)}
											</div>
										)}
									</div>
								)}

								{colorMode === "dangerZones" && (
									<div>
										<button
											type="button"
											onClick={() => setDangerExpanded((v) => !v)}
											className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
										>
											<span>Danger</span>
											<ChevronIcon
												direction={dangerExpanded ? "up" : "down"}
												className="h-3 w-3 text-slate-400"
											/>
										</button>
										{dangerExpanded && (
											<div className="mt-1.5 space-y-1.5">
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Earthquakes</span>
													<input
														type="radio"
														name="danger-sub"
														checked={dangerSubMode === "earthquake"}
														onChange={() => setDangerSubMode("earthquake")}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Volcanic</span>
													<input
														type="radio"
														name="danger-sub"
														checked={dangerSubMode === "volcanic"}
														onChange={() => setDangerSubMode("volcanic")}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label
													className={`flex items-center justify-between gap-3 text-[11px] font-medium ${hasCycloneRisk ? "text-slate-300" : "text-slate-600"}`}
												>
													<span>Cyclones</span>
													<input
														type="radio"
														name="danger-sub"
														checked={dangerSubMode === "cyclone"}
														onChange={() => setDangerSubMode("cyclone")}
														disabled={!hasCycloneRisk}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20 disabled:cursor-not-allowed"
													/>
												</label>
												<label
													className={`flex items-center justify-between gap-3 text-[11px] font-medium ${hasTornadoRisk ? "text-slate-300" : "text-slate-600"}`}
												>
													<span>Tornadoes</span>
													<input
														type="radio"
														name="danger-sub"
														checked={dangerSubMode === "tornado"}
														onChange={() => setDangerSubMode("tornado")}
														disabled={!hasTornadoRisk}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20 disabled:cursor-not-allowed"
													/>
												</label>
												<label
													className={`flex items-center justify-between gap-3 text-[11px] font-medium ${hasTidalRisk ? "text-slate-300" : "text-slate-600"}`}
												>
													<span>Tidal Range</span>
													<input
														type="radio"
														name="danger-sub"
														checked={dangerSubMode === "tidal"}
														onChange={() => setDangerSubMode("tidal")}
														disabled={!hasTidalRisk}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20 disabled:cursor-not-allowed"
													/>
												</label>
											</div>
										)}
									</div>
								)}

								{(colorMode === "terrain" || colorMode === "landHeightmap") && (
									<div>
										<button
											type="button"
											onClick={() => setElevationExpanded((v) => !v)}
											className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
										>
											<span>Elevation</span>
											<ChevronIcon
												direction={elevationExpanded ? "up" : "down"}
												className="h-3 w-3 text-slate-400"
											/>
										</button>
										{elevationExpanded && (
											<div className="mt-1.5 space-y-1.5">
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Colored</span>
													<input
														type="radio"
														name="elevation-sub"
														checked={elevationSubMode === "colored"}
														onChange={() => {
															setElevationSubMode("colored")
															setColorMode("terrain")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Grayscale</span>
													<input
														type="radio"
														name="elevation-sub"
														checked={elevationSubMode === "grayscale"}
														onChange={() => {
															setElevationSubMode("grayscale")
															setColorMode("landHeightmap")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
											</div>
										)}
									</div>
								)}

								{(colorMode === "topography" ||
									colorMode === "slope" ||
									colorMode === "eu5Topography") && (
									<div>
										<button
											type="button"
											onClick={() => setTopographyExpanded((v) => !v)}
											className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
										>
											<span>Topography</span>
											<ChevronIcon
												direction={topographyExpanded ? "up" : "down"}
												className="h-3 w-3 text-slate-400"
											/>
										</button>
										{topographyExpanded && (
											<div className="mt-1.5 space-y-1.5">
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Classification</span>
													<input
														type="radio"
														name="topography-sub"
														checked={topographySubMode === "classification"}
														onChange={() => {
															setTopographySubMode("classification")
															setColorMode("topography")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Slope</span>
													<input
														type="radio"
														name="topography-sub"
														checked={topographySubMode === "slope"}
														onChange={() => {
															setTopographySubMode("slope")
															setColorMode("slope")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
											</div>
										)}
									</div>
								)}

								{(colorMode === "vegetation" ||
									colorMode === "vegetationMaps" ||
									colorMode === "vegetationSatellite" ||
									colorMode === "eu5Vegetation") && (
									<div>
										<button
											type="button"
											onClick={() => setVegetationExpanded((v) => !v)}
											className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
										>
											<span>Vegetation</span>
											<ChevronIcon
												direction={vegetationExpanded ? "up" : "down"}
												className="h-3 w-3 text-slate-400"
											/>
										</button>
										{vegetationExpanded && (
											<div className="mt-1.5 space-y-1.5">
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Base</span>
													<input
														type="radio"
														name="vegetation-sub"
														checked={vegetationSubMode === "base"}
														onChange={() => {
															setVegetationSubMode("base")
															setColorMode("vegetation")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Maps</span>
													<input
														type="radio"
														name="vegetation-sub"
														checked={vegetationSubMode === "maps"}
														onChange={() => {
															setVegetationSubMode("maps")
															setColorMode("vegetationMaps")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Satellite</span>
													<input
														type="radio"
														name="vegetation-sub"
														checked={vegetationSubMode === "satellite"}
														onChange={() => {
															setVegetationSubMode("satellite")
															setColorMode("vegetationSatellite")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
											</div>
										)}
									</div>
								)}

								{(colorMode === "climate" ||
									colorMode === "pastaClimate" ||
									colorMode === "koppenClimate" ||
									colorMode === "realPastaClimate" ||
									colorMode === "realKoppenClimate" ||
									colorMode === "eu5Climate") && (
									<div>
										<button
											type="button"
											onClick={() => setClimateExpanded((v) => !v)}
											className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
										>
											<span>Climate</span>
											<ChevronIcon
												direction={climateExpanded ? "up" : "down"}
												className="h-3 w-3 text-slate-400"
											/>
										</button>
										{climateExpanded && (
											<div className="mt-1.5 space-y-1.5">
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Basic</span>
													<input
														type="radio"
														name="climate-sub"
														checked={climateSubMode === "basic"}
														onChange={() => {
															setClimateSubMode("basic")
															setColorMode("climate")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Pasta</span>
													<input
														type="radio"
														name="climate-sub"
														checked={climateSubMode === "pasta"}
														onChange={() => {
															setClimateSubMode("pasta")
															setColorMode("pastaClimate")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>Koppen</span>
													<input
														type="radio"
														name="climate-sub"
														checked={climateSubMode === "koppen"}
														onChange={() => {
															setClimateSubMode("koppen")
															setColorMode("koppenClimate")
														}}
														className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<div className="border-t border-white/10" />
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>GDD</span>
													<input
														type="checkbox"
														checked={showGdd}
														onChange={(e) => setShowGdd(e.target.checked)}
														className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>GInt</span>
													<input
														type="checkbox"
														checked={showGint}
														onChange={(e) => setShowGint(e.target.checked)}
														className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>PET</span>
													<input
														type="checkbox"
														checked={showPet}
														onChange={(e) => setShowPet(e.target.checked)}
														className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
												<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
													<span>AET</span>
													<input
														type="checkbox"
														checked={showAet}
														onChange={(e) => setShowAet(e.target.checked)}
														className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
													/>
												</label>
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
