import type { MoonBody } from "@/model/celestial/moons/moon-types"
import type { WindArrowData } from "@/model/climate/wind"
import type {
	SerializedGenesisWorld,
	SerializedNetwork,
} from "@/model/transport/worker-types"
import type { ColorMode } from "../colors"
import type { LabelMode } from "../controls/OverlayControls"
import type { SolarSystemOverlayParams } from "./solar-system-overlay"

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
	setCoastlineOverlayVisible(visible: boolean): void
	setFullAmbient(enabled: boolean): void
	focusOnNation(nationId: number, opts?: { durationMs?: number }): void
	focusOnProvince(provinceId: number, opts?: { durationMs?: number }): void
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
		hoursPerDay: number,
		tideLock: import("@/model/celestial/moons/moon-types").TideLock | null,
		day: number,
		showGrid: boolean,
		gridSpacing: number,
		showEllipticalOrbits: boolean,
	): void
	updateMoonOrbitOverlay(
		moons: MoonBody[] | null,
		planetRadiusKm: number,
		hoursPerDay: number,
		tideLock: import("@/model/celestial/moons/moon-types").TideLock | null,
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
