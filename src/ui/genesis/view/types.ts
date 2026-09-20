import type { Dispatch, RefObject, SetStateAction } from "react"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import type { MainWorldMode } from "@/model/celestial/system/generation/types"
import type {
	SolarSystemState,
	SystemBody,
} from "@/model/celestial/system/types"
import type { WIND } from "@/model/climate/weather/wind"
import type {
	Eu4ProvinceFillGeometry,
	RawOrganizationReference,
} from "@/model/history/earth/data-source/types"
import type { OrgCategorizer } from "@/model/history/earth/organization-categories/types"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type { SocietyEra } from "@/model/society/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type {
	DangerSubMode,
	LabelMode,
} from "@/ui/genesis/controls/OverlayControls"
import type { Eu4GhslSettlementAsset } from "@/ui/genesis/generation/earth-assets"
import type { GenerationPreviewTab } from "@/ui/genesis/generation/generation-preview"
import type {
	GalaxyOrigin,
	loadGenerationSessionSnapshotSync,
} from "@/ui/genesis/generation/session-persistence"
import type { resetWorldDefaults } from "@/ui/genesis/generation/sliders"
import type { useHistoryTimeline } from "@/ui/genesis/generation/useHistoryTimeline"
import type { StoredViewPrefs } from "@/ui/genesis/generation/view-prefs"
import type { HoverInfo } from "@/ui/genesis/hover/hover"
import type { GenesisScene, GenesisViewMode } from "@/ui/genesis/renderer"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { DataVariant } from "@/ui/genesis/shared/data-variant"
import type {
	NationMapMode,
	ReligionMapMode,
	SocietyMapMode,
	TitleBorderTier,
} from "@/ui/genesis/shared/map-modes"

/** The live `GenesisScene` handle shared by every GenesisView concern hook. */
export type SceneRef = RefObject<GenesisScene | null>

/** Everything `useHistoryTimeline` exposes, threaded into concern hooks. */
export type HistoryTimeline = ReturnType<typeof useHistoryTimeline>

/**
 * Resolves the per-org category schema (organization-categories.ts) into a
 * ready-to-use categorizer + color lookup for one folded state. Returns null
 * for an org with no registered schema.
 */
export type OrgCategorizerBuilder = (
	frame: WorldFrame,
	orgRef: RawOrganizationReference,
) => {
	categorize: OrgCategorizer
	categoryColor: (categoryId: string) => [number, number, number]
} | null

/** Wiki page selection setters -- mutually exclusive, see useWikiSelection. */
export type WikiSelectionSetters = {
	setSelectedWikiNationId: (id: number | null) => void
	setSelectedWikiOrganizationId: (orgId: string | null) => void
	setSelectedWikiWarId: (warId: number | null) => void
}

export type NationWikiDataInput = WikiSelectionSetters & {
	selectedWikiNationId: number | null
	world: SerializedGenesisWorld | null
	worldForDisplay: SerializedGenesisWorld | null
	history: HistoryTimeline
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
	selectedWikiWarId: number | null
	world: SerializedGenesisWorld | null
	history: HistoryTimeline
	planetName: string
	getProvinceColor: (provinceId: number) => string | null
	sceneRef: SceneRef
}

export type SolarSystemBodiesInput = {
	initialGenerationSession: ReturnType<
		typeof loadGenerationSessionSnapshotSync
	> | null
	/** Scopes this instance's session-persistence localStorage entry so
	 * independent solar-system-view instances (e.g. the earth/sol-centric
	 * Genesis page vs. a `/galaxy` drill-in view) don't read/write the same
	 * key. Omit for the original unnamespaced Genesis session. */
	sessionNamespace?: string
}

export type OverlayStateInput = SolarSystemBodiesInput & {
	initialViewPrefs: StoredViewPrefs
}

export type SolarSystemViewInput = SolarSystemBodiesInput & {
	sceneRef: SceneRef
	/** The main world's own simulated data -- used to render its real
	 * generated terrain/vegetation as the solar-system-view surface texture
	 * instead of the curated Earth photo, for every main world except a real
	 * Earth import (see useSolarSystemView's mainWorldSatelliteTexture). */
	world: SerializedGenesisWorld | null
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
	mainWorldMode: MainWorldMode
	galaxyOrigin: GalaxyOrigin | null
	// [JUSTIFICATION] Sol's star uses its own hardcoded "Sol" name instead of
	// a generated one, so there is no generated name to pass for that system.
	starName: string | undefined
	namesEnabled: boolean
	seed: number
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
	colorMode: ColorMode
	dataVariant: DataVariant
	showWindArrows: boolean
	resolvedClimateMonth: number
	temperatureMonth: number
	rainfallMonth: number
	dtrMonth: number
}

export type WindVectorData = ReturnType<typeof WIND.computeWindVectors>

export type MonthlyWindData = Pick<
	WindVectorData,
	"windU" | "windV" | "windSpeed"
>

export type WindStats = {
	avg: number
	max: number
}

export type WorldWindStatsCache = {
	world: SerializedGenesisWorld | null
	values: Map<"generated" | "observed", WindStats>
}

export type WorldWindCache = {
	world: SerializedGenesisWorld | null
	vectors: Map<string, WindVectorData>
	monthly: Map<"generated" | "observed", MonthlyWindData[]>
}

export type WorldDistributionsInput = {
	world: SerializedGenesisWorld | null
	worldForDisplay: SerializedGenesisWorld | null
	history: HistoryTimeline
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
	worldForDisplay: SerializedGenesisWorld | null
	history: HistoryTimeline
	historyFrame: WorldFrame | null
	/** Culture/religion key -> [r,g,b] 0-1 for the active history frame --
	 * history's reference maps for Earth imports, the procedural timeline's
	 * own PartitionRow colours otherwise. Feeds computeEarthHistoryRegionColors
	 * so both modes share one rendering path. */
	historyCultureColorById: Map<string, [number, number, number]> | null
	historyReligionColorById: Map<string, [number, number, number]> | null
	colorMode: ColorMode
	nationMode: NationMapMode
	societyMode: SocietyMapMode
	religionMode: ReligionMapMode
	viewMode: GenesisViewMode
	showElevation: boolean
	dangerSubMode: DangerSubMode
	selectedWikiOrganizationId: string | null
	selectedWikiNationId: number | null
	windVectors: ReturnType<typeof WIND.computeWindVectors> | null
	hoverProvince: number | null
	temperatureMonth: number
	rainfallMonth: number
	dtrMonth: number
	currentMonth: number
}

export type WorldGenerationInput = {
	sceneRef: SceneRef
	workerRef: RefObject<Worker | null>
	lastWorldRef: RefObject<SerializedGenesisWorld | null>
	setWorld: (
		world:
			| SerializedGenesisWorld
			| null
			| ((
					prev: SerializedGenesisWorld | null,
			  ) => SerializedGenesisWorld | null),
	) => void
	setSelectedTimeMs: (timeMs: number) => void
	simStartTimeMs: number
	setShowCoastlines: (show: boolean) => void
	setSolarSystemViewActive: (active: boolean) => void
	setPathfindingResult: (result: PathfindingResult | null) => void
	setProceduralHistoryPlaying: (playing: boolean) => void
	startProceduralJournal: (transactions: JournalTransaction[]) => void
	recordProceduralJournal: (transactions: JournalTransaction[]) => void
	seed: number
	setSeed: (seed: number) => void
	/** Flips the display data source -- an Earth-import Generate (seed ===
	 * SOL_DATA.solSeed) shows real observed data by default; every other
	 * seed shows the EBM-modeled "generated" climate. */
	setDataVariant: (variant: "generated" | "observed") => void
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
	history: HistoryTimeline
	hoverInfo: HoverInfo | null
	viewMode: GenesisViewMode
	solarSystemViewActive: boolean
	mapProjectionLatitude: number
	setDraftMapProjectionLatitude: (latitude: number) => void
	exportCenterLongitude: number
	showNationBorders: boolean
	titleBorderTiers: readonly TitleBorderTier[]
	sceneFrame: WorldFrame | null
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
	sampledReligionLabelsArray: string[] | null
}

export interface BuildRealmBorderLayersParams {
	frame: WorldFrame
	world: SerializedGenesisWorld & {
		provinces: NonNullable<SerializedGenesisWorld["provinces"]>
	}
	tiers: readonly TitleBorderTier[]
}
