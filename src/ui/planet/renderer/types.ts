import type { MoonBody } from "@/model/celestial/moons/types"
import type { WindArrowData } from "@/model/climate/wind/types"
import type {
	Eu4ProvinceBorderGeometry,
	Eu4ProvinceFillGeometry,
} from "@/model/history/earth/data-source/types"
import type {
	SerializedGenesisWorld,
	SerializedNetwork,
} from "@/model/worker-protocol/types"
import type { ColorMode } from "@/ui/planet/colors"
import type { LabelMode } from "@/ui/planet/controls/OverlayControls"
import type {
	ColorForRawId,
	ElevationKmForLonLat,
} from "@/ui/planet/renderer/eu4-nation-fill-overlay"
import type { SolarSystemOverlayParams } from "@/ui/planet/renderer/solar-system-overlay"

export type { WindArrowData }

export type GenesisViewMode = "globe" | "map"

export interface GenesisHoverInfo {
	region: number
	clientX: number
	clientY: number
}

export interface RiverData {
	lines: [number, number, number, number][][]
	maxFlow: number
	minFlow: number
}

/** One international organization's current territory while its wiki page
 * is open -- only drives the map-name label now (a single org-name label in
 * place of member nations' own labels, sized by total member province
 * count via nation-label-overlay.ts's buildGlobe/MapPartitionLabels).
 * Territory *coloring* is handled entirely at region level in GenesisView's
 * regionColors (see withOrgHighlight there) rather than a separate mesh
 * overlay -- the real EU4 province-polygon triangulation
 * (eu4-province-borders-fills.json) only covers ~85% of provinces, so a
 * mesh built from it always left gaps showing whatever was underneath;
 * region-level painting has no such coverage gap. */
export interface OrgHighlightSpec {
	orgId: string
	name: string
	/** Compact province indexes (world.provinces space) for the org's full
	 * territory -- keys the partition label. */
	memberProvinceCompactIndexes: Set<number>
}

export interface GenesisScene {
	dispose(): void
	resize(): void
	updateWorld(world: SerializedGenesisWorld | null): void
	exportMapPng(options: {
		width: number
		centerLongitudeDeg?: number
		onProgress?: (percent: number, label: string) => void
	}): Promise<Blob>
	setColorMode(mode: ColorMode): void
	setRegionColors(colors: Float32Array | null): void
	setDisplayColors(mode: ColorMode, colors: Float32Array | null): void
	setNationFillColorForRawId(
		fn: ((rawId: number) => [number, number, number] | null) | null,
	): void
	setNationOccupationStripeColorForRawId(
		fn: ((rawId: number) => [number, number, number] | null) | null,
	): void
	setOccupationOverlay(overlay: Float32Array | null): void
	setHoveredRegion(region: number | null): void
	setNationBordersVisible(visible: boolean): void
	setEarthHistoryNationOverride(
		override: {
			assignment: Int32Array
			seeds: Int32Array
			names: string[]
		} | null,
	): void
	setLandNationBordersVisible(visible: boolean): void
	/** Pass null to clear the highlight (e.g. no org wiki page open). */
	setOrganizationHighlight(spec: OrgHighlightSpec | null): void
	setViewMode(mode: GenesisViewMode): void
	setWireframeVisible(visible: boolean): void
	setGridVisible(visible: boolean): void
	setGridSpacing(spacingDeg: number): void
	setMapCenterLongitude(longitudeDeg: number): void
	setMapProjectionLatitude(latitudeDeg: number): void
	commitMapCenterLongitude(): void
	setHoverHandler(
		handler: ((info: GenesisHoverInfo | null) => void) | null,
	): void
	setClickHandler(handler: ((info: GenesisHoverInfo) => void) | null): void
	setMeasureLine(
		startXYZ: [number, number, number] | null,
		endXYZ: [number, number, number] | null,
	): void
	setPathfindingOverlay(
		pathRegions: number[] | null,
		startXYZ: [number, number, number] | null,
		endXYZ: [number, number, number] | null,
	): void
	projectToScreen(
		xyz: [number, number, number],
		lonOffsetRad?: number,
	): [number, number] | null
	setThermalEquator(points: [number, number][] | null): void
	setRivers(data: RiverData | null): void
	setRiversVisible(visible: boolean): void
	setHierarchyOverlay(
		world: SerializedGenesisWorld | null,
		selectedNationId: number,
	): void
	setSunPosition(
		month: number,
		obliquityDeg: number,
		timeOfDay: number,
		hoursPerDay: number,
	): void
	setSunDirection(x: number, y: number, z: number, hoursPerDay: number): void
	setSolarTerminatorUseMeridiem(enabled: boolean): void
	setSolarTerminatorVisible(visible: boolean): void
	setAtmospherePressure(pressureBar: number): void
	setGlobeCloudTexturePath(texturePath: string | null): void
	setCoastlineOverlayVisible(visible: boolean): void
	setFullAmbient(enabled: boolean): void
	focusOnNation(
		nationId: number,
		opts?: { durationMs?: number; distanceScale?: number },
	): void
	focusOnProvince(
		provinceId: number,
		opts?: {
			durationMs?: number
			distanceScale?: number
			pulseTarget?: "nation" | "province"
		},
	): void
	setSettlements(urbanPop: Float32Array | null): void
	setSettlementsVisible(visible: boolean): void
	setEu4Settlements(
		lats: Float32Array | null,
		lons: Float32Array | null,
		population: Float32Array | null,
		provinceIds: Int32Array | null,
		capitalProvinceIds: ReadonlySet<number>,
		indices: number[],
	): void
	setEu4SettlementsVisible(visible: boolean): void
	setInfrastructure(edges: SerializedNetwork | null): void
	setInfrastructureVisible(visible: boolean): void
	setLabelMode(mode: LabelMode): void
	setNationNames(names: string[] | null): void
	setDynastyNames(names: string[] | null): void
	setCultureNames(names: string[] | null): void
	setHeritageNames(names: string[] | null): void
	/** Real culture/religion partitions for Earth-imported worlds -- see
	 * create-genesis-scene.ts's earthHistoryLabelPartitions doc comment. */
	setEarthHistoryLabelPartitions(
		partitions: {
			culture: { assignment: Int32Array; count: number; names: string[] }
			religion: { assignment: Int32Array; count: number; names: string[] }
		} | null,
	): void
	setSettlementNames(names: string[] | null): void
	setElevationVisible(visible: boolean): void
	setWindArrows(data: WindArrowData | null): void
	setMoonOrbitOverlay(
		moons: MoonBody[] | null,
		planetRadiusKm: number,
		day: number,
		showGrid: boolean,
		gridSpacing: number,
		showEllipticalOrbits: boolean,
	): void
	updateMoonOrbitOverlay(
		moons: MoonBody[] | null,
		planetRadiusKm: number,
		showGrid: boolean,
		gridSpacing: number,
		showEllipticalOrbits: boolean,
	): void
	updateMoonOrbitDay(day: number): void
	/** Unit vector pointing from origin toward the camera (globe mode only, null in map mode). */
	getGlobeCameraDir(): [number, number, number] | null
	/** Enter or exit the solar-system view (hides the globe/map, shows the star system). */
	setSolarSystemActive(active: boolean): void
	setSolarSystemOverlay(params: SolarSystemOverlayParams | null): void
	updateSolarSystemOverlay(params: SolarSystemOverlayParams | null): void
	updateSolarSystemDay(day: number): void
	/** Spins every body/moon mesh around its own axis for the solar-system
	 * view's rotation clock — independent of updateSolarSystemDay. */
	setSolarSystemSpinHours(hours: number): void
	/** Enters the solar-system view if needed, then animates the camera to
	 * frame the given body (or one of its moons). `bodyIndex` is the index
	 * into the `bodies` array passed to setSolarSystemOverlay, or -1 for the
	 * star. `moonIndex`, if given, focuses that body's moon instead (index
	 * into the body's own `moons` array). */
	focusOnSystemBody(
		bodyIndex: number,
		moonIndex?: number,
		opts?: { durationMs?: number },
	): void
	/** Notifies the caller whenever the solar-system focus target changes for
	 * any reason (GPS button, double-click, ...), so React state (e.g. the
	 * clock knobs' reference body) can stay in sync even when the change
	 * originated from a renderer-internal event like a canvas double-click. */
	setSolarSystemFocusChangeHandler(
		handler: ((bodyIndex: number, moonIndex?: number) => void) | null,
	): void
}

export interface BuildStripeMeshParams {
	positions: Float32Array
	colors: Float32Array
	mask: Float32Array
	stripeVertexShader: string
	stripeFragmentShader: string
	visible: boolean
}

export interface RotateForProjectionParams {
	x: number
	y: number
	z: number
	centerLongitude: number
	centerLatitude: number
}

export interface CreateLineSegmentsParams {
	positions: number[]
	color: number
	opacity: number
	visible: boolean
	opts?: { lineWidth?: number; resolution?: readonly [number, number] }
}

export interface BuildGlobeRealSettlementsParams {
	lats: Float32Array
	lons: Float32Array
	populations: Float32Array
	provinceIds: Int32Array
	capitalProvinceIds: ReadonlySet<number>
	indices: number[]
}

export interface BuildMapRealSettlementsParams {
	lats: Float32Array
	lons: Float32Array
	populations: Float32Array
	provinceIds: Int32Array
	capitalProvinceIds: ReadonlySet<number>
	indices: number[]
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
}

export interface CollectEu4NationBorderMapPositionsParams {
	geometry: Eu4ProvinceBorderGeometry
	realIdToNation: Map<number, number>
	nation: number
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	z: number
}

export interface CollectEu4ProvinceBorderMapPositionsParams {
	geometry: Eu4ProvinceBorderGeometry
	provinceRealId: number
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	z: number
}

export interface BuildEu4SelectedProvinceBorderGlobeParams {
	geometry: Eu4ProvinceBorderGeometry
	provinceRealId: number
	viewMode: GenesisViewMode
	radius: number
	resolution: readonly [number, number]
	opts: { color: number; opacity: number; lineWidth: number }
}

export interface BuildEu4SelectedProvinceBorderMapParams {
	geometry: Eu4ProvinceBorderGeometry
	provinceRealId: number
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	viewMode: GenesisViewMode
	z: number
	resolution: readonly [number, number]
	opts: { color: number; opacity: number; lineWidth: number }
}

export interface BuildEu4NationFillGlobeParams {
	geometry: Eu4ProvinceFillGeometry
	colorForRawId: ColorForRawId
	viewMode: GenesisViewMode
	visible: boolean
	radius: number
	elevationKmForLonLat?: ElevationKmForLonLat
}

export interface BuildEu4NationFillMapParams {
	geometry: Eu4ProvinceFillGeometry
	colorForRawId: ColorForRawId
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	viewMode: GenesisViewMode
	visible: boolean
	z: number
	elevationKmForLonLat?: ElevationKmForLonLat
}

export interface BuildEu4OccupationStripesGlobeParams {
	geometry: Eu4ProvinceFillGeometry
	colorForRawId: ColorForRawId
	viewMode: GenesisViewMode
	visible: boolean
	radius: number
}

export interface BuildEu4OccupationStripesMapParams {
	geometry: Eu4ProvinceFillGeometry
	colorForRawId: ColorForRawId
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	viewMode: GenesisViewMode
	visible: boolean
	z: number
}

export interface BuildMapWireframeParams {
	world: SerializedGenesisWorld
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	wireframeVisible: boolean
	viewMode: GenesisViewMode
}

export interface CollectNationBorderMapPositionsParams {
	world: SerializedGenesisWorld
	nation: number
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	zBoost: number
}

export interface BuildLandNationBordersGlobeParams {
	world: SerializedGenesisWorld
	viewMode: GenesisViewMode
	visible: boolean
	elevationVisible: boolean
	resolution: [number, number]
	opts?: { color?: number; lineWidth?: number; opacity?: number }
}

export interface BuildLandNationBordersMapParams {
	world: SerializedGenesisWorld
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	viewMode: GenesisViewMode
	visible: boolean
	resolution: [number, number]
	opts?: { color?: number; lineWidth?: number; opacity?: number }
}

export interface CollectProvinceBorderMapPositionsParams {
	world: SerializedGenesisWorld
	province: number
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	zBoost: number
}

export interface BuildSelectedProvinceBorderGlobeParams {
	world: SerializedGenesisWorld
	province: number
	viewMode: GenesisViewMode
	elevationVisible: boolean
	opts?: {
		color?: number
		radiusBoost?: number
		opacity?: number
		lineWidth?: number
		resolution?: readonly [number, number]
	}
}

export interface BuildSelectedProvinceBorderMapParams {
	world: SerializedGenesisWorld
	province: number
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	viewMode: GenesisViewMode
	opts?: {
		color?: number
		opacity?: number
		zBoost?: number
		lineWidth?: number
		resolution?: readonly [number, number]
	}
}

export interface BuildMapSettlementsParams {
	world: SerializedGenesisWorld
	locations: Int32Array
	urbanPop: Float32Array
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
}
