import type * as THREE from "three"
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import type { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js"
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import type {
	Eu4ProvinceBorderGeometry,
	Eu4ProvinceFillGeometry,
} from "@/model/history/earth/data-source/types"
import type { HeritageScript } from "@/model/society/script"
import type {
	SerializedGenesisWorld,
	SerializedNetwork,
} from "@/model/worker-protocol/types"
import type { LabelMode } from "@/ui/genesis/controls/OverlayControls"
import type { ColorForRawId } from "@/ui/genesis/political/eu4-nation-fill-overlay"
import type { CoastlineLineData } from "@/ui/genesis/renderer/coastline-overlay"
import type { MoonOrbitState } from "@/ui/genesis/renderer/moon-orbit-overlay"
import type {
	PendingNationScriptTextureQueue,
	ScriptTextureCacheEntry,
} from "@/ui/genesis/renderer/nation-script-overlay"
import type {
	GenesisHoverInfo,
	GenesisViewMode,
	OrgHighlightSpec,
	RiverData,
	WindArrowData,
} from "@/ui/genesis/renderer/types"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { SolarSystemOverlayState } from "@/ui/genesis/solar-system/overlay"

/** Shared mutable rendering context for the genesis scene's controller
 * modules (see plans/genesis-scene-controller-split.md). Controller
 * factories take this as their first argument instead of closing over
 * local variables the way the original create-genesis-scene.ts did.
 *
 * Fields are added here incrementally, controller by controller, as each
 * one is extracted out of create-genesis-scene.ts -- not every one of the
 * original file's ~150 shared locals lives here yet. State that's still
 * exclusive to functions remaining in create-genesis-scene.ts stays a
 * plain local there until its owning controller is extracted. See that
 * plan doc's "Remaining work" section for what's left. */
export interface GenesisContext {
	canvas: HTMLCanvasElement
	renderer: THREE.WebGLRenderer
	scene: THREE.Scene
	camera: THREE.PerspectiveCamera
	mapCamera: THREE.OrthographicCamera
	controls: TrackballControls
	mapControls: OrbitControls
	globeGroup: THREE.Group
	orbitGroup: THREE.Group
	solarSystemGroup: THREE.Group
	ambient: THREE.AmbientLight
	sun: THREE.DirectionalLight
	waterGeo: THREE.SphereGeometry
	waterMat: THREE.MeshPhongMaterial
	waterMesh: THREE.Mesh
	atmosGeo: THREE.SphereGeometry
	atmosMat: THREE.ShaderMaterial
	atmosMesh: THREE.Mesh
	globeCloudMat: THREE.MeshBasicMaterial
	globeCloudMesh: THREE.Mesh
	mapCloudMat: THREE.ShaderMaterial
	mapCloudMesh: THREE.Mesh | null
	cloudsVisible: boolean
	starGeo: THREE.BufferGeometry
	starMat: THREE.PointsMaterial

	// terrain-controller.ts's state -- also read by many not-yet-extracted
	// overlay functions still in create-genesis-scene.ts, which is why it
	// lives on the shared context rather than only inside that controller.
	terrainMesh: THREE.Mesh | null
	mapMesh: THREE.Mesh | null
	terrainFaceToRegion: Int32Array
	mapFaceToRegion: Int32Array
	currentWorld: SerializedGenesisWorld | null
	currentColorMode: ColorMode
	currentRegionColors: Float32Array | null
	currentOccupationOverlay: Float32Array | null
	currentViewMode: GenesisViewMode
	currentMapCenterLongitudeDeg: number
	currentMapProjectionLatitudeDeg: number
	elevationVisible: boolean
	/** River line materials, recolored by terrain-controller's
	 * applyWaterMaterialForMode whenever the color mode changes; rebuilt by
	 * the not-yet-extracted rivers overlay (search "setRivers" in
	 * create-genesis-scene.ts). */
	riverMaterials: LineMaterial[]

	// overlay-controllers/coastline.ts's state -- also read by
	// updateOverlayVisibility/resize/dispose, which still live in
	// create-genesis-scene.ts.
	globeCoastlineOverlay: LineSegments2 | null
	mapCoastlineOverlay: LineSegments2 | null
	cachedCoastlineData: CoastlineLineData | null
	derivedCoastlineWorld: SerializedGenesisWorld | null
	derivedCoastlineData: CoastlineLineData | null
	coastlineOverlayVisible: boolean
	coastlineMaterials: LineMaterial[]

	// overlay-controllers/measurement.ts's state.
	globeMeasureLine: THREE.Line | null
	mapMeasureLine: THREE.Line | null
	globeMeasureDots: THREE.Group | null
	mapMeasureDots: THREE.Group | null

	// overlay-controllers/pathfinding.ts's state.
	globePathfindingLine: LineSegments2 | null
	mapPathfindingLine: LineSegments2 | null
	globePathfindingDots: THREE.Group | null
	mapPathfindingDots: THREE.Group | null

	// overlay-controllers/hierarchy.ts's state.
	globeHierarchyOverlay: THREE.Group | null
	mapHierarchyOverlay: THREE.Group | null
	hierarchyOverlayNationId: number
	hierarchyOverlayWorld: SerializedGenesisWorld | null

	// overlay-controllers/settlements.ts's state.
	globeSettlements: THREE.Group | null
	mapSettlements: THREE.Group | null
	settlementLocations: Int32Array | null
	settlementUrbanPop: Float32Array | null
	settlementsVisible: boolean
	settlementsDirty: boolean
	globeEu4Settlements: THREE.Group | null
	mapEu4Settlements: THREE.Group | null
	eu4SettlementLats: Float32Array | null
	eu4SettlementLons: Float32Array | null
	eu4SettlementPopulation: Float32Array | null
	eu4SettlementProvinceIds: Int32Array | null
	eu4CapitalProvinceIds: ReadonlySet<number>
	eu4SettlementIndices: number[]
	eu4SettlementsVisible: boolean

	// overlay-controllers/infrastructure.ts's state (trade routes/transport
	// network -- named "infrastructure" after its public setInfrastructure*
	// GenesisScene methods, though it's built via buildGlobeTradeRoutes/
	// buildMapTradeRoutes).
	globeInfrastructure: THREE.Group | null
	mapInfrastructure: THREE.Group | null
	infrastructureData: SerializedNetwork | null
	globeInfrastructureMaterials: LineMaterial[]
	mapInfrastructureMaterials: LineMaterial[]
	infrastructureMaterials: LineMaterial[]
	infrastructureVisible: boolean

	// overlay-controllers/rivers-wind-thermal.ts's state.
	globeThermalEquator: THREE.Line | null
	mapThermalEquator: THREE.Line | null
	thermalEquatorPoints: [number, number][] | null
	globeWindArrows: THREE.LineSegments | null
	mapWindArrows: THREE.LineSegments | null
	windArrowData: WindArrowData | null
	globeRivers: THREE.Group | null
	mapRivers: THREE.Group | null
	riverData: RiverData | null
	riversVisible: boolean
	globeRiverMaterials: LineMaterial[]
	mapRiverMaterials: LineMaterial[]

	// overlay-controllers/labels.ts's state, plus earthHistoryNationOverride/
	// currentOrgHighlight which labels reads but doesn't own -- set by
	// setEarthHistoryNationOverride/setOrganizationHighlight, which stay in
	// create-genesis-scene.ts since they also call the not-yet-extracted
	// rebuildNationBorders.
	currentOrgHighlight: OrgHighlightSpec | null
	earthHistoryNationOverride: {
		assignment: Int32Array
		seeds: Int32Array
		names: string[]
	} | null
	/** International organization label (HRE, Hanseatic League, ...) group
	 * refs -- currently always null (pre-existing dead code the org-label
	 * overlay never actually populates; see overlay-controllers/labels.ts's
	 * doc comment). Kept on ctx so overlay-visibility-controller.ts and
	 * dispose.ts both read the same (always-null) refs instead of each
	 * holding their own local const. */
	globeOrgLabel: THREE.Group | null
	mapOrgLabel: THREE.Group | null
	globeNationLabels: THREE.Group | null
	mapNationLabels: THREE.Group | null
	globeNationScripts: THREE.Group | null
	mapNationScripts: THREE.Group | null
	globeSettlementLabels: THREE.Group | null
	mapSettlementLabels: THREE.Group | null
	globeCultureLabels: THREE.Group | null
	mapCultureLabels: THREE.Group | null
	globeHeritageLabels: THREE.Group | null
	mapHeritageLabels: THREE.Group | null
	globeReligionLabels: THREE.Group | null
	mapReligionLabels: THREE.Group | null
	earthHistoryLabelPartitions: {
		culture: { assignment: Int32Array; count: number; names: string[] }
		religion: { assignment: Int32Array; count: number; names: string[] }
	} | null
	labelMode: LabelMode
	heritageScripts: Map<number, HeritageScript> | null
	nationScriptTextureCache: Map<string, ScriptTextureCacheEntry>
	pendingNationScriptTextureQueue: PendingNationScriptTextureQueue | null
	nationNames: string[] | null
	dynastyNames: string[] | null
	settlementLabelNames: string[] | null
	cultureNames: string[] | null
	heritageNames: string[] | null

	// overlay-controllers/nation-borders.ts's state.
	cachedEu4BorderGeometry: Eu4ProvinceBorderGeometry | null
	cachedEu4FillGeometry: Eu4ProvinceFillGeometry | null
	currentNationFillColorForRawId: ColorForRawId | null
	globeNationFill: THREE.Mesh | null
	mapNationFill: THREE.Mesh | null
	globeNationFillRadius: number | null
	mapNationFillParams: {
		z: number
		centerLongitudeDeg: number
		projectionLatitudeDeg: number
	} | null
	currentOccupationStripeColorForRawId: ColorForRawId | null
	globeOccupationStripes: THREE.Mesh | null
	mapOccupationStripes: THREE.Mesh | null
	globeNationBorders: LineSegments2 | null
	mapNationBorders: LineSegments2 | null
	nationBorderMaterials: LineMaterial[]
	globeSelectedProvinceBorder: THREE.Object3D | null
	mapSelectedProvinceBorder: THREE.Object3D | null
	nationBordersVisible: boolean
	/** Interaction-controller state (not yet extracted) that
	 * rebuildSelectedProvinceBorder reads. */
	selectedProvince: number

	// camera-focus-controller.ts's state.
	focusTween: {
		mode: GenesisViewMode
		t0: number
		duration: number
		globeFrom: THREE.Vector3
		globeTo: THREE.Vector3
		mapFromX: number
		mapFromY: number
		mapToX: number
		mapToY: number
		mapFromZoom: number
		mapToZoom: number
	} | null
	pulseGlobe: LineSegments2 | null
	pulseMap: LineSegments2 | null
	pulseMaterials: LineMaterial[]
	pulse: {
		t0: number
		duration: number
		clearSelectedProvince: boolean
	} | null

	// solar-system-controller.ts's state.
	solarSystemActive: boolean
	solarSystemOverlayState: SolarSystemOverlayState | null
	/** The body/moon the camera is currently glued to in the solar-system
	 * view (set by focusOnSystemBody) -- re-applied after every setDay/
	 * setSpinHours call so the clock knobs can move the focused body
	 * without the camera drifting away from it. */
	solarSystemTrackedFocus: {
		bodyIndex: number
		moonIndex?: number
	} | null
	solarSystemTrackedFocusPosition: THREE.Vector3 | null
	solarSystemFocusChangeHandler:
		| ((bodyIndex: number, moonIndex?: number) => void)
		| null
	savedCameraPosition: THREE.Vector3 | null
	savedControlsTarget: THREE.Vector3 | null
	solarSystemFocusTween: {
		t0: number
		duration: number
		camFrom: THREE.Vector3
		camTo: THREE.Vector3
		targetFrom: THREE.Vector3
		targetTo: THREE.Vector3
	} | null
	moonOrbitState: MoonOrbitState | null
	currentMoonOrbitDay: number
	currentSolarSystemDay: number
	currentSolarSystemSpinHours: number

	// interaction-controller.ts's state.
	hoverHandler: ((info: GenesisHoverInfo | null) => void) | null
	clickHandler: ((info: GenesisHoverInfo) => void) | null
	hoveredRegion: number
	pointerDownPos: { x: number; y: number } | null

	// animation-loop.ts's state -- also written by the controls "start"/
	// "change"/"end" event listeners create-genesis-scene.ts wires up.
	globeControlsInteracting: boolean
	mapControlsInteracting: boolean
	globeControlActivityFrames: number
	mapControlActivityFrames: number

	// Wireframe/grid/solar-terminator overlay state -- read by export.ts and
	// dispose.ts; not yet split into their own controllers (solar terminator
	// in particular is still a large not-yet-extracted block in
	// create-genesis-scene.ts).
	terrainWireframe: THREE.LineSegments | null
	mapWireframe: THREE.LineSegments | null
	globeGrid: THREE.LineSegments | null
	mapGrid: THREE.LineSegments | null
	wireframeVisible: boolean
	gridVisible: boolean
	gridSpacingDeg: number
	globeSolarTerminator: THREE.Group | null
	mapSolarTerminator: THREE.Group | null
	solarTerminatorVisible: boolean
	solarTerminatorUseMeridiem: boolean
	currentSunDirection: THREE.Vector3
	/** Sun direction in globe-local space (includes obliquity Z component).
	 * Used by the solar terminator so it tracks the planet surface
	 * correctly. */
	currentLocalSunDirection: THREE.Vector3
	currentSunHoursPerDay: number
}
