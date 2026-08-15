import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import type { Galaxy } from "@/model/celestial/galaxy/types"
import {
	buildCoreGlow,
	buildInnerCircle,
	buildRimCircle,
	buildSpiralNebula,
} from "@/ui/genesis/galaxy/renderer/galaxy-scene/background"
import { fitCameraToHalfHeight } from "@/ui/genesis/galaxy/renderer/galaxy-scene/camera"
import { updateClusterPositions } from "@/ui/genesis/galaxy/renderer/galaxy-scene/cluster"
import { computeGalaxyDensityScale } from "@/ui/genesis/galaxy/renderer/galaxy-scene/density-scale"
import { buildGalaxyLanes } from "@/ui/genesis/galaxy/renderer/galaxy-scene/lanes"
import { pickNearestSystem } from "@/ui/genesis/galaxy/renderer/galaxy-scene/picking"
import { buildGalaxyPoints } from "@/ui/genesis/galaxy/renderer/galaxy-scene/points"
import type {
	GalaxySceneContext,
	ZoomCameraToSystemInput,
} from "@/ui/genesis/galaxy/renderer/galaxy-scene/types"

const HOVER_RING_COLOR = 0xf59e0b
const BACKGROUND_COLOR = 0x030308

const HOVER_RING_RADIUS = 8
// Extra headroom beyond the galaxy's own playable radius so the fit doesn't
// frame it edge-to-edge -- purely a comfortable-viewing margin, not tied to
// any galaxy data.
const CAMERA_ZOOM_OUT_MARGIN = 1.15

function buildHoverRing(): THREE.LineLoop {
	const segments = 32
	const positions = new Float32Array(segments * 3)
	for (let i = 0; i < segments; i++) {
		const angle = (i / segments) * Math.PI * 2
		positions[3 * i] = Math.cos(angle) * HOVER_RING_RADIUS
		positions[3 * i + 1] = Math.sin(angle) * HOVER_RING_RADIUS
		positions[3 * i + 2] = 0
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	const material = new THREE.LineBasicMaterial({ color: HOVER_RING_COLOR })
	const ring = new THREE.LineLoop(geometry, material)
	ring.visible = false
	return ring
}

/** Constructs the renderer, orthographic camera, pan/zoom controls, and
 * empty points/lanes groups that setGalaxy below fills in. Pure
 * construction, mirroring genesis's scene-setup.ts split between
 * "build once" and "update per galaxy/frame" (see galaxy-scene/*.ts). */
export function createGalaxyScene(
	canvas: HTMLCanvasElement,
): GalaxySceneContext {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

	const scene = new THREE.Scene()
	scene.background = new THREE.Color(BACKGROUND_COLOR)

	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000)
	camera.position.set(0, 0, 100)
	camera.lookAt(0, 0, 0)

	const controls = new OrbitControls(camera, canvas)
	// Left disabled until the first setGalaxy call centers the camera --
	// otherwise a stray wheel/pan during the async generation (zoomToCursor
	// panning toward wherever the pointer happens to be, plus damping
	// coasting that motion afterward) silently drifts the view off-center
	// before the galaxy even renders.
	controls.enabled = false
	controls.enableRotate = false
	controls.screenSpacePanning = true
	controls.enableDamping = true
	controls.dampingFactor = 0.1
	controls.zoomToCursor = true
	controls.minZoom = 0.2
	controls.maxZoom = 40
	// Rotate is disabled above, so remap the left button to pan (its default
	// ROTATE binding would otherwise leave left-drag doing nothing).
	controls.mouseButtons = {
		LEFT: THREE.MOUSE.PAN,
		MIDDLE: THREE.MOUSE.DOLLY,
		RIGHT: THREE.MOUSE.PAN,
	}
	controls.touches = {
		ONE: THREE.TOUCH.PAN,
		TWO: THREE.TOUCH.DOLLY_PAN,
	}

	const backgroundGroup = new THREE.Group()
	scene.add(backgroundGroup)
	// Lanes must be added before points -- both are transparent materials at
	// the same z, and three.js falls back to scene-graph insertion order as
	// its stable tie-break for equal-depth transparent objects, so whichever
	// group is added second renders on top (matches galaxy-gen's own
	// group.add(lanes) before group.add(points) in renderer/scene.ts).
	const lanesGroup = new THREE.Group()
	scene.add(lanesGroup)
	const pointsGroup = new THREE.Group()
	scene.add(pointsGroup)

	const hoverRing = buildHoverRing()
	scene.add(hoverRing)

	return {
		canvas,
		renderer,
		scene,
		camera,
		controls,
		backgroundGroup,
		pointsGroup,
		lanesGroup,
		points: null,
		clusterData: null,
		lanes: null,
		galaxy: null,
		hoveredIndex: -1,
		hoverRing,
		hoverRingBaseScale: 1,
	}
}

/** Replaces the scene's points/lanes meshes with the given galaxy and fits
 * the camera tightly around its playable extent. */
export function setGalaxy(ctx: GalaxySceneContext, galaxy: Galaxy): void {
	if (ctx.points) {
		ctx.pointsGroup.remove(ctx.points)
		ctx.points.geometry.dispose()
		;(ctx.points.material as THREE.Material).dispose()
	}
	if (ctx.lanes) {
		ctx.lanesGroup.remove(ctx.lanes)
		ctx.lanes.geometry.dispose()
		;(ctx.lanes.material as THREE.Material).dispose()
	}

	const { points, clusterData } = buildGalaxyPoints(galaxy)
	const lanes = buildGalaxyLanes(galaxy, [
		ctx.canvas.clientWidth,
		ctx.canvas.clientHeight,
	])
	ctx.pointsGroup.add(points)
	ctx.lanesGroup.add(lanes)
	ctx.points = points
	ctx.clusterData = clusterData
	ctx.lanes = lanes
	ctx.galaxy = galaxy
	ctx.hoveredIndex = -1
	ctx.hoverRing.visible = false
	ctx.hoverRingBaseScale = computeGalaxyDensityScale(galaxy.numSystems)
	ctx.hoverRing.scale.setScalar(ctx.hoverRingBaseScale / ctx.camera.zoom)

	disposeGroupChildren(ctx.backgroundGroup)
	ctx.backgroundGroup.add(
		buildSpiralNebula(galaxy.radius.max, galaxy.radius.min),
		buildCoreGlow(galaxy.radius.min),
		buildRimCircle(galaxy.radius.max),
		buildInnerCircle(galaxy.radius.min),
	)

	// r_xy is packed in dimensions space (centered at dimensions.w/2,
	// dimensions.h/2 -- see GALAXY_PACKING.place), not around the world
	// origin. The camera/controls, and the background group above (built at
	// local (0,0)), must recenter there or the whole galaxy renders outside
	// the view frustum.
	const centerX = galaxy.dimensions.w / 2
	const centerY = galaxy.dimensions.h / 2
	ctx.backgroundGroup.position.set(centerX, centerY, 0)
	ctx.camera.position.set(centerX, centerY, 100)
	fitCameraToHalfHeight({
		camera: ctx.camera,
		canvas: ctx.canvas,
		halfHeight: galaxy.radius.max * CAMERA_ZOOM_OUT_MARGIN,
	})
	ctx.controls.target.set(centerX, centerY, 0)
	ctx.controls.enabled = true
	ctx.controls.update()
}

/** Re-centers the camera/controls target on a system already in the current
 * galaxy, keeping whatever zoom setGalaxy's initial fit left it at -- used
 * to restore the camera to where a "back to galaxy" return last left off
 * (see GalaxyView's resume effect), since setGalaxy itself always frames the
 * whole galaxy rather than any one system. */
export function focusCameraOnSystem(
	ctx: GalaxySceneContext,
	systemIndex: number,
): void {
	if (!ctx.galaxy) return
	const x = ctx.galaxy.r_xy[2 * systemIndex]
	const y = ctx.galaxy.r_xy[2 * systemIndex + 1]
	if (x === undefined || y === undefined) return
	ctx.camera.position.set(x, y, ctx.camera.position.z)
	ctx.controls.target.set(x, y, 0)
	ctx.controls.update()
}

/** Focuses and magnifies one system selected from the galaxy search picker.
 * Keeping this separate from focusCameraOnSystem preserves the latter's
 * resume behavior, which intentionally retains the user's current zoom. */
export function zoomCameraToSystem({
	ctx,
	systemIndex,
}: ZoomCameraToSystemInput): void {
	focusCameraOnSystem(ctx, systemIndex)
	ctx.camera.zoom = Math.max(ctx.camera.zoom, 12)
	ctx.camera.updateProjectionMatrix()
	ctx.controls.update()
}

/** Converts a canvas-space (offsetX/offsetY) pointer position to world
 * coordinates under the current camera, then returns the nearest packed
 * system index (or -1). */
export function pickAtCanvasPoint(
	ctx: GalaxySceneContext,
	canvasX: number,
	canvasY: number,
): number {
	if (!ctx.galaxy) return -1
	const ndcX = (canvasX / ctx.canvas.clientWidth) * 2 - 1
	const ndcY = -(canvasY / ctx.canvas.clientHeight) * 2 + 1
	const worldX =
		ctx.camera.position.x +
		((ctx.camera.right - ctx.camera.left) / (2 * ctx.camera.zoom)) * ndcX
	const worldY =
		ctx.camera.position.y +
		((ctx.camera.top - ctx.camera.bottom) / (2 * ctx.camera.zoom)) * ndcY
	return pickNearestSystem({ galaxy: ctx.galaxy, worldX, worldY })
}

/** Moves the hover ring onto a system index, or hides it for -1. */
export function setHoveredSystem(ctx: GalaxySceneContext, index: number): void {
	ctx.hoveredIndex = index
	if (!ctx.galaxy || index < 0) {
		ctx.hoverRing.visible = false
		return
	}
	ctx.hoverRing.visible = true
	ctx.hoverRing.position.set(
		ctx.galaxy.r_xy[2 * index]!,
		ctx.galaxy.r_xy[2 * index + 1]!,
		0,
	)
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
	for (const one of Array.isArray(material) ? material : [material])
		one.dispose()
}

function disposeGroupChildren(group: THREE.Group): void {
	for (const child of [...group.children]) {
		group.remove(child)
		if (child instanceof THREE.Sprite) {
			disposeMaterial(child.material)
		} else if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
			child.geometry.dispose()
			disposeMaterial(child.material)
		}
	}
}

export function render(ctx: GalaxySceneContext): void {
	ctx.controls.update()
	if (ctx.hoverRing.visible) {
		ctx.hoverRing.scale.setScalar(ctx.hoverRingBaseScale / ctx.camera.zoom)
	}
	if (ctx.points && ctx.clusterData) {
		updateClusterPositions({
			geometry: ctx.points.geometry,
			clusterData: ctx.clusterData,
			camera: ctx.camera,
			canvasHeightPx: ctx.canvas.clientHeight,
		})
	}
	ctx.renderer.render(ctx.scene, ctx.camera)
}

export function resize(ctx: GalaxySceneContext): void {
	ctx.renderer.setSize(ctx.canvas.clientWidth, ctx.canvas.clientHeight, false)
	if (ctx.lanes) {
		;(ctx.lanes.material as InstanceType<typeof LineMaterial>).resolution.set(
			ctx.canvas.clientWidth,
			ctx.canvas.clientHeight,
		)
	}
	if (ctx.galaxy) {
		fitCameraToHalfHeight({
			camera: ctx.camera,
			canvas: ctx.canvas,
			halfHeight: ctx.galaxy.radius.max * CAMERA_ZOOM_OUT_MARGIN,
		})
	}
}

export function disposeGalaxyScene(ctx: GalaxySceneContext): void {
	ctx.controls.dispose()
	disposeGroupChildren(ctx.backgroundGroup)
	if (ctx.points) {
		ctx.points.geometry.dispose()
		;(ctx.points.material as THREE.Material).dispose()
	}
	if (ctx.lanes) {
		ctx.lanes.geometry.dispose()
		;(ctx.lanes.material as THREE.Material).dispose()
	}
	ctx.hoverRing.geometry.dispose()
	;(ctx.hoverRing.material as THREE.Material).dispose()
	ctx.renderer.dispose()
}
