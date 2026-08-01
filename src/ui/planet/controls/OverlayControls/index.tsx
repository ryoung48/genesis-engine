import React from "react"
import { fadeVisibilityClassName } from "@/ui/components/animations/fade"
import { CopyButton } from "@/ui/components/composites/CopyButton"
import { FloatingPanel } from "@/ui/components/composites/FloatingPanel"
import { PanelHeader } from "@/ui/components/composites/PanelHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { BugIcon } from "@/ui/components/primitives/icons/BugIcon"
import { DetailsIcon } from "@/ui/components/primitives/icons/DetailsIcon"
import { GearIcon } from "@/ui/components/primitives/icons/GearIcon"
import { RefreshIcon } from "@/ui/components/primitives/icons/RefreshIcon"
import { TransferUpIcon } from "@/ui/components/primitives/icons/TransferUpIcon"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import { Tooltip } from "@/ui/components/primitives/Tooltip"
import {
	getAvailableVariants,
	getBaseMapMode,
} from "@/ui/planet/screen/shared/data-variant"
import { ClimateModeSection } from "./ClimateModeSection"
import { ClimateToggleSection } from "./ClimateToggleSection"
import { ClockSection } from "./ClockSection"
import { DangerSection } from "./DangerSection"
import { ElevationModeSection } from "./ElevationModeSection"
import { GeographySection } from "./GeographySection"
import { GridSection } from "./GridSection"
import { LabelsSection } from "./LabelsSection"
import { MeasureSection } from "./MeasureSection"
import { PoliticalSection } from "./PoliticalSection"
import { TopographyModeSection } from "./TopographyModeSection"
import type { OverlayControlsProps } from "./types"
import { VegetationModeSection } from "./VegetationModeSection"
import { ViewExportSection } from "./ViewExportSection"

export type {
	ClimateSubMode,
	DangerSubMode,
	ExportWidthPreset,
	LabelMode,
	MeasureMode,
	OverlayControlsProps,
	TopographySubMode,
	VegetationSubMode,
} from "./types"

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
								<ToggleRow
									label="Wireframe"
									checked={showWireframe}
									onChange={() => setShowWireframe(!showWireframe)}
									labelClassName="text-slate-200"
								/>

								<MeasureSection
									measureExpanded={measureExpanded}
									setMeasureExpanded={setMeasureExpanded}
									measureMode={measureMode}
									setMeasureMode={setMeasureMode}
									pathfindingLand={pathfindingLand}
									setPathfindingLand={setPathfindingLand}
									pathfindingSea={pathfindingSea}
									setPathfindingSea={setPathfindingSea}
									pathfindingResult={pathfindingResult}
									unitSystem={unitSystem}
								/>

								<GridSection
									gridSpacingExpanded={gridSpacingExpanded}
									setGridSpacingExpanded={setGridSpacingExpanded}
									showGrid={showGrid}
									setShowGrid={setShowGrid}
									gridSpacing={gridSpacing}
									setGridSpacing={setGridSpacing}
								/>

								<ClockSection
									clockExpanded={clockExpanded}
									setClockExpanded={setClockExpanded}
									clockCurrent={clockCurrent}
									setClockCurrent={setClockCurrent}
									clockMonthMode={clockMonthMode}
									setClockMonthMode={setClockMonthMode}
									clockMonth={clockMonth}
									setClockMonth={setClockMonth}
									clockDay={clockDay}
									setClockDay={setClockDay}
									clockHour={clockHour}
									setClockHour={setClockHour}
									clockUseMeridiem={clockUseMeridiem}
									setClockUseMeridiem={setClockUseMeridiem}
									hoursPerDay={hoursPerDay}
									tidallyLocked={tidallyLocked}
									daysPerYear={daysPerYear}
									showDaylight={showDaylight}
									setShowDaylight={setShowDaylight}
								/>

								<GeographySection
									geographyExpanded={geographyExpanded}
									setGeographyExpanded={setGeographyExpanded}
									showElevation={showElevation}
									setShowElevation={setShowElevation}
									showRivers={showRivers}
									setShowRivers={setShowRivers}
									showInfrastructure={showInfrastructure}
									setShowInfrastructure={setShowInfrastructure}
									showWindArrows={showWindArrows}
									setShowWindArrows={setShowWindArrows}
									isEarthImport={isEarthImport}
									showOceanCurrents={showOceanCurrents}
									setShowOceanCurrents={setShowOceanCurrents}
									showThermalEquator={showThermalEquator}
									setShowThermalEquator={setShowThermalEquator}
									showCoastlines={showCoastlines}
									setShowCoastlines={setShowCoastlines}
									availableVariants={availableVariants}
									dataVariant={dataVariant}
									setDataVariant={setDataVariant}
								/>

								<PoliticalSection
									politicalExpanded={politicalExpanded}
									setPoliticalExpanded={setPoliticalExpanded}
									showNationHierarchy={showNationHierarchy}
									setShowNationHierarchy={setShowNationHierarchy}
									showLandBorders={showLandBorders}
									setShowLandBorders={setShowLandBorders}
									showNationBorders={showNationBorders}
									setShowNationBorders={setShowNationBorders}
								/>

								<LabelsSection
									labelsExpanded={labelsExpanded}
									setLabelsExpanded={setLabelsExpanded}
									colorMode={colorMode}
									populationMode={populationMode}
									nationMode={nationMode}
									labelMode={labelMode}
									setLabelMode={setLabelMode}
								/>

								<ClimateToggleSection
									colorMode={colorMode}
									baseColorMode={baseColorMode}
									setColorMode={setColorMode}
									climateExpanded={climateExpanded}
									setClimateExpanded={setClimateExpanded}
								/>

								<DangerSection
									colorMode={colorMode}
									dangerExpanded={dangerExpanded}
									setDangerExpanded={setDangerExpanded}
									dangerSubMode={dangerSubMode}
									setDangerSubMode={setDangerSubMode}
									hasCycloneRisk={hasCycloneRisk}
									hasTornadoRisk={hasTornadoRisk}
									hasTidalRisk={hasTidalRisk}
								/>

								<ElevationModeSection
									colorMode={colorMode}
									setColorMode={setColorMode}
									elevationExpanded={elevationExpanded}
									setElevationExpanded={setElevationExpanded}
									elevationSubMode={elevationSubMode}
									setElevationSubMode={setElevationSubMode}
								/>

								<TopographyModeSection
									colorMode={colorMode}
									setColorMode={setColorMode}
									topographyExpanded={topographyExpanded}
									setTopographyExpanded={setTopographyExpanded}
									topographySubMode={topographySubMode}
									setTopographySubMode={setTopographySubMode}
								/>

								<VegetationModeSection
									colorMode={colorMode}
									setColorMode={setColorMode}
									vegetationExpanded={vegetationExpanded}
									setVegetationExpanded={setVegetationExpanded}
									vegetationSubMode={vegetationSubMode}
									setVegetationSubMode={setVegetationSubMode}
								/>

								<ClimateModeSection
									colorMode={colorMode}
									setColorMode={setColorMode}
									climateExpanded={climateExpanded}
									setClimateExpanded={setClimateExpanded}
									climateSubMode={climateSubMode}
									setClimateSubMode={setClimateSubMode}
									showGdd={showGdd}
									setShowGdd={setShowGdd}
									showGint={showGint}
									setShowGint={setShowGint}
									showPet={showPet}
									setShowPet={setShowPet}
									showAet={showAet}
									setShowAet={setShowAet}
								/>

								<ViewExportSection
									viewMode={viewMode}
									setViewMode={setViewMode}
									unitSystem={unitSystem}
									setUnitSystem={setUnitSystem}
									draftMapProjectionLatitude={draftMapProjectionLatitude}
									setDraftMapProjectionLatitude={setDraftMapProjectionLatitude}
									commitMapProjectionLatitude={commitMapProjectionLatitude}
									exportExpanded={exportExpanded}
									setExportExpanded={setExportExpanded}
									exportWidthPreset={exportWidthPreset}
									setExportWidthPreset={setExportWidthPreset}
									exportCenterLongitude={exportCenterLongitude}
									setExportCenterLongitude={setExportCenterLongitude}
									exportDisabled={exportDisabled}
									exportBusy={exportBusy}
									exportProgress={exportProgress}
									exportError={exportError}
									onExport={onExport}
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
