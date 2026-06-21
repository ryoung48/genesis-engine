import type { MoonParams } from "@/model/celestial/moons/moon-types"
import type { WindArrowData } from "@/model/climate/wind"
import type {
	SerializedGenesisWorld,
	SerializedNetwork,
} from "@/model/transport/worker-types"
import type { ColorMode } from "../colors"
import type { LabelMode } from "../controls/OverlayControls"

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
	setAtmospherePressure(pressureBar: number): void
	setFullAmbient(enabled: boolean): void
	focusOnNation(nationId: number, opts?: { durationMs?: number }): void
	focusOnProvince(provinceId: number, opts?: { durationMs?: number }): void
	setSettlements(urbanPop: Float32Array | null): void
	setSettlementsVisible(visible: boolean): void
	setInfrastructure(edges: SerializedNetwork | null): void
	setInfrastructureVisible(visible: boolean): void
	setLabelMode(mode: LabelMode): void
	setNationNames(names: string[] | null): void
	setDynastyNames(names: string[] | null): void
	setCultureNames(names: string[] | null): void
	setHeritageNames(names: string[] | null): void
	setSettlementNames(names: string[] | null): void
	setElevationVisible(visible: boolean): void
	setWindArrows(data: WindArrowData | null): void
	setMoonOrbitOverlay(
		moons: MoonParams[] | null,
		planetRadiusKm: number,
		hoursPerDay: number,
		day: number,
		showGrid: boolean,
		gridSpacing: number,
	): void
	updateMoonOrbitDay(day: number): void
	/** Unit vector pointing from origin toward the camera (globe mode only, null in map mode). */
	getGlobeCameraDir(): [number, number, number] | null
}
