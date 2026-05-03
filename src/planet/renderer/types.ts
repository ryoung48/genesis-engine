import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import type { ColorMode } from "../colors"

export type OrogenViewMode = "globe" | "map"

export interface OrogenHoverInfo {
	region: number
	clientX: number
	clientY: number
}

export interface RiverData {
	lines: [number, number, number, number][][]
	maxFlow: number
	minFlow: number
}

export interface OrogenScene {
	dispose(): void
	resize(): void
	updateWorld(world: SerializedOrogenWorld | null): void
	setColorMode(mode: ColorMode): void
	setRegionColors(colors: Float32Array | null): void
	setOccupationOverlay(overlay: Float32Array | null): void
	setHoveredRegion(region: number | null): void
	setNationBordersVisible(visible: boolean): void
	setViewMode(mode: OrogenViewMode): void
	setWireframeVisible(visible: boolean): void
	setGridVisible(visible: boolean): void
	setGridSpacing(spacingDeg: number): void
	setMapCenterLongitude(longitudeDeg: number): void
	setMapProjectionLatitude(latitudeDeg: number): void
	commitMapCenterLongitude(): void
	setHoverHandler(
		handler: ((info: OrogenHoverInfo | null) => void) | null,
	): void
	setClickHandler(handler: ((info: OrogenHoverInfo) => void) | null): void
	setMeasureLine(
		startXYZ: [number, number, number] | null,
		endXYZ: [number, number, number] | null,
	): void
	projectToScreen(xyz: [number, number, number]): [number, number] | null
	setThermalEquator(points: [number, number][] | null): void
	setRivers(data: RiverData | null): void
	setRiversVisible(visible: boolean): void
	setSunPosition(
		month: number,
		obliquityDeg: number,
		timeOfDay: number,
		hoursPerDay: number,
	): void
	setAtmospherePressure(pressureBar: number): void
	setFullAmbient(enabled: boolean): void
	focusOnNation(nationId: number, opts?: { durationMs?: number }): void
}
