import type * as THREE from "three"
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import type { Galaxy } from "@/model/celestial/galaxy/types"
import type { ClusterData } from "@/ui/genesis/galaxy/renderer/galaxy-scene/cluster"

export interface GalaxySceneContext {
	canvas: HTMLCanvasElement
	renderer: THREE.WebGLRenderer
	scene: THREE.Scene
	camera: THREE.OrthographicCamera
	controls: OrbitControls
	backgroundGroup: THREE.Group
	pointsGroup: THREE.Group
	lanesGroup: THREE.Group
	points: THREE.Points | null
	clusterData: ClusterData | null
	lanes: LineSegments2 | null
	galaxy: Galaxy | null
	hoveredIndex: number
	hoverRing: THREE.LineLoop
	/** Density-based scale (see density-scale.ts) applied to the hover ring at
	 * the camera's reference zoom (1) -- render() divides this by the live
	 * camera.zoom every frame so the ring holds a constant on-screen size
	 * instead of shrinking to a pixel as the user zooms in. */
	hoverRingBaseScale: number
}

export interface ZoomCameraToSystemInput {
	ctx: GalaxySceneContext
	systemIndex: number
}
