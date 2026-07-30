import type { Dispatch, RefObject, SetStateAction } from "react"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import type {
	SolarSystemState,
	SystemBody,
} from "@/model/celestial/system/types"
import type { WIND } from "@/model/climate/wind"
import type {
	Eu4ProvinceFillGeometry,
	RawOrganizationReference,
} from "@/model/history/earth/data-source/types"
import type { FoldedState } from "@/model/history/earth/fold/types"
import type { OrgCategorizer } from "@/model/history/earth/organization-categories/types"
import type { HistoryNote } from "@/model/history/generated/state/types"
import type { SocietyEra } from "@/model/society/types"
import type {
	SerializedGenesisWorld,
	SerializedHistoryFrame,
} from "@/model/worker-protocol/types"
import type { ColorMode } from "@/ui/planet/colors"
import type {
	DangerSubMode,
	LabelMode,
} from "@/ui/planet/controls/OverlayControls"
import type { useEarthHistoryTimeline } from "@/ui/planet/hooks/useEarthHistoryTimeline"
import type { HoverInfo } from "@/ui/planet/hover/hover"
import type { GenesisScene, GenesisViewMode } from "@/ui/planet/renderer"
import type { DisplayNationModel } from "@/ui/planet/screen/display/display-model"
import type { buildSelectedNationDetails } from "@/ui/planet/screen/display/nation-details-model"
import type { Eu4GhslSettlementAsset } from "@/ui/planet/screen/generation/earth-assets"
import type { GenerationPreviewTab } from "@/ui/planet/screen/generation/generation-preview"
import type { loadGenerationSessionSnapshotSync } from "@/ui/planet/screen/generation/session-persistence"
import type { resetWorldDefaults } from "@/ui/planet/screen/generation/sliders"
import type { StoredViewPrefs } from "@/ui/planet/screen/generation/view-prefs"
import type { DataVariant } from "@/ui/planet/screen/shared/data-variant"
import type {
	NationMapMode,
	PopulationMapMode,
} from "@/ui/planet/screen/shared/map-modes"
import type { WikiCountHistoryPoint } from "@/ui/wiki/shared/WikiTimeline"

/** The live `GenesisScene` handle shared by every GenesisView concern hook. */
export type SceneRef = RefObject<GenesisScene | null>

/** Everything `useEarthHistoryTimeline` exposes, threaded into concern hooks. */
export type EarthHistoryTimeline = ReturnType<typeof useEarthHistoryTimeline>

/**
 * Resolves the per-org category schema (organization-categories.ts) into a
 * ready-to-use categorizer + color lookup for one folded state. Returns null
 * for an org with no registered schema.
 */
export type OrgCategorizerBuilder = (
	state: FoldedState,
	orgRef: RawOrganizationReference,
) => {
	categorize: OrgCategorizer
	categoryColor: (categoryId: string) => [number, number, number]
} | null

/** Wiki page selection setters -- mutually exclusive, see useWikiSelection. */
export type WikiSelectionSetters = {
	setSelectedWikiNationTag: (tag: string | null) => void
	setSelectedWikiOrganizationId: (orgId: string | null) => void
	setSelectedWikiWarId: (warId: string | null) => void
}

export type NationWikiDataInput = WikiSelectionSetters & {
	selectedWikiNationTag: string | null
	world: SerializedGenesisWorld | null
	worldForDisplay: SerializedGenesisWorld | null
	earthHistory: EarthHistoryTimeline
	earthImportRawIdToCompact: Map<number, number> | null
	showObservedDistributions: boolean
	planetName: string
	getProvinceColor: (provinceId: number) => string | null
	sceneRef: SceneRef
}

export type OrganizationWikiDataInput = NationWikiDataInput & {
	selectedWikiOrganizationId: string | null
	buildOrgCategorizer: OrgCategorizerBuilder
}

export type WarWikiDataInput = WikiSelectionSetters & {
	selectedWikiWarId: string | null
	world: SerializedGenesisWorld | null
	earthHistory: EarthHistoryTimeline
	earthImportRawIdToCompact: Map<number, number> | null
	planetName: string
	getProvinceColor: (provinceId: number) => string | null
	sceneRef: SceneRef
}

export type ProceduralNationWikiDataInput = {
	world: SerializedGenesisWorld | null
	selectedNation: ReturnType<typeof buildSelectedNationDetails>
	planetName: string
	proceduralHistoryTimeMs: number
	proceduralHistoryEventsRef: RefObject<HistoryNote[]>
	proceduralProvinceHistoryRef: RefObject<Map<number, WikiCountHistoryPoint[]>>
	getNationName: (nationId: number) => string
	getNationColor: (nationId: number) => string | null
	setSelectedNationId: (nationId: number | null) => void
	onSelectNation: (nationId: number) => void
	sceneRef: SceneRef
}

export type SolarSystemBodiesInput = {
	initialGenerationSession: ReturnType<
		typeof loadGenerationSessionSnapshotSync
	> | null
}

export type OverlayStateInput = SolarSystemBodiesInput & {
	initialViewPrefs: StoredViewPrefs
	isEarthImport: boolean
}

export type SolarSystemViewInput = SolarSystemBodiesInput & {
	sceneRef: SceneRef
	seed: number
	solarSystem: SolarSystemState
	setSolarSystem: Dispatch<SetStateAction<SolarSystemState>>
	skipNextGeneratedSystemBodiesSyncRef: RefObject<boolean>
	systemBodies: SystemBody[]
	systemBodiesRef: RefObject<SystemBody[]>
	displayMoons: MoonBody[]
	effectiveDaysPerYear: number
	daysPerYear: number
	hoursPerDay: number
	planetRadiusKm: number
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	tideLock: TideLock | null
	spectralClass: SolarSystemState["star"]["class"]
	starSubtype: number
	// [JUSTIFICATION] Sol's star uses its own hardcoded "Sol" name instead of
	// a generated one, so there is no generated name to pass for that system.
	starName: string | undefined
	namesEnabled: boolean
	restSeed: number
	solarSystemViewActive: boolean
	setSolarSystemViewActive: Dispatch<SetStateAction<boolean>>
	showSolarSystemEllipticalOrbits: boolean
	showSolarSystemDaylight: boolean
	showSolarSystemInclination: boolean
	showSolarSystemAxialTilt: boolean
	showSolarSystemRealisticSizes: boolean
	showSolarSystemBodyNames: boolean
	generationPanelOpen: boolean
	setGenerationPanelOpen: Dispatch<SetStateAction<boolean>>
	generationPreviewTab: GenerationPreviewTab
	setGenerationPreviewTab: Dispatch<SetStateAction<GenerationPreviewTab>>
	generationSessionRestored: boolean
	setGenerationSessionRestored: Dispatch<SetStateAction<boolean>>
}

export type WorldDisplayDataInput = {
	sceneRef: SceneRef
	world: SerializedGenesisWorld | null
	worldForDisplay: SerializedGenesisWorld | null
	hoverInfo: HoverInfo | null
	eu4HoverFillGeometry: Eu4ProvinceFillGeometry | null
	nationModel: DisplayNationModel | null
	colorMode: ColorMode
	dataVariant: DataVariant
	showWindArrows: boolean
	showRealWind: boolean
	resolvedClimateMonth: number
	temperatureMonth: number
	rainfallMonth: number
	dtrMonth: number
	earthHistoryPlaying: boolean
}

export type WorldDistributionsInput = {
	world: SerializedGenesisWorld | null
	worldForDisplay: SerializedGenesisWorld | null
	earthHistory: EarthHistoryTimeline
	nationModel: DisplayNationModel | null
	nationProvinceCounts: Map<number, number>
	colorMode: ColorMode
	dataVariant: DataVariant
}

export type ProceduralHistoryInput = {
	workerRef: RefObject<Worker | null>
}

export type MapExportInput = {
	sceneRef: SceneRef
	worldForDisplay: SerializedGenesisWorld | null
	seed: number
	exportCenterLongitude: number
}

export type MapColoringInput = {
	world: SerializedGenesisWorld | null
	worldForDisplay: SerializedGenesisWorld | null
	earthHistory: EarthHistoryTimeline
	colorMode: ColorMode
	nationMode: NationMapMode
	populationMode: PopulationMapMode
	viewMode: GenesisViewMode
	showElevation: boolean
	dangerSubMode: DangerSubMode
	selectedNationId: number | null
	selectedWikiOrganizationId: string | null
	windVectors: ReturnType<typeof WIND.computeWindVectors> | null
	earthImportRawIdToCompact: Map<number, number> | null
	hoverProvince: number | null
	labelsPlaybackActive: boolean
	temperatureMonth: number
	rainfallMonth: number
	dtrMonth: number
	currentMonth: number
}

export type WorldGenerationInput = {
	sceneRef: SceneRef
	workerRef: RefObject<Worker | null>
	lastWorldRef: RefObject<SerializedGenesisWorld | null>
	setWorld: (world: SerializedGenesisWorld | null) => void
	setSelectedTimeMs: (timeMs: number) => void
	simStartTimeMs: number
	setShowCoastlines: (show: boolean) => void
	setSolarSystemViewActive: (active: boolean) => void
	setPathfindingResult: (result: PathfindingResult | null) => void
	setProceduralHistoryFrame: (frame: SerializedHistoryFrame | null) => void
	setProceduralHistoryPlaying: (playing: boolean) => void
	setProceduralHistoryTimeMs: (timeMs: number) => void
	resetProceduralHistoryAccumulation: () => void
	recordProceduralFrame: (
		timeMs: number,
		frame: SerializedHistoryFrame,
		newEvents: HistoryNote[],
	) => void
	seed: number
	setSeed: (seed: number) => void
	seedInput: string
	setSeedInput: (seedInput: string) => void
	seedInputDirty: boolean
	setSeedInputDirty: (dirty: boolean) => void
	setSeedError: (error: boolean) => void
	setters: Parameters<typeof resetWorldDefaults>[0]
	era: SocietyEra
	numPoints: number
	numPlates: number
	jitter: number
	roughness: number
	terrainWarp: number
	smoothing: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	glacialErosion: number
	maxElevation: number
	landDistribution: number
	continentSizeVariety: number
	landCoverage: number
	planetRadiusKm: number
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: SolarSystemState["star"]["class"]
	starSubtype: number
	orbitalDistanceAU: number
	daysPerYear: number
	hoursPerDay: number
	tideLock: TideLock | null
	substellarLon: number
	seaLevel: number
	pressure: number
	mainWorldSystemBody: SystemBody | null
}

/** Worker pathfinding result surfaced by the measure/pathfinding overlay. */
export type PathfindingResult = {
	distanceKm: number
	landKm: number
	seaKm: number
	travelDays: number
}

export type GenesisSceneSyncInput = {
	sceneRef: SceneRef
	worldForDisplay: SerializedGenesisWorld | null
	earthHistory: EarthHistoryTimeline
	hoverInfo: HoverInfo | null
	selectedNationId: number | null
	viewMode: GenesisViewMode
	solarSystemViewActive: boolean
	mapProjectionLatitude: number
	setDraftMapProjectionLatitude: (latitude: number) => void
	exportCenterLongitude: number
	showNationBorders: boolean
	showLandBorders: boolean
	showNationHierarchy: boolean
	showWireframe: boolean
	showCoastlines: boolean
	showGrid: boolean
	gridSpacing: number
	showInfrastructure: boolean
	showElevation: boolean
	eu4GhslSettlements: Eu4GhslSettlementAsset | null
	labelMode: LabelMode
	sampledNationLabelsArray: string[] | null
	sampledDynastyLabelsArray: string[] | null
	sampledSettlementLabelsArray: string[] | null
	sampledCultureLabelsArray: string[] | null
	sampledHeritageLabelsArray: string[] | null
}
