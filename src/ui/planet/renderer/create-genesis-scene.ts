import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { HeritageScript } from "@/model/society/script"
import { SCRIPT } from "@/model/society/script"
import {
	networkCount,
	type SerializedGenesisWorld,
	type SerializedNetwork,
} from "@/model/transport/worker-types"
import { formatClockTimeDisplay } from "../clock"
import { type ColorMode, VEGETATION_WATER_BLUE } from "../colors"
import type { LabelMode } from "../controls/OverlayControls"
import { disposeGroup, disposeObject3D } from "./disposal"
import { getRegionFocusTargets } from "./focus"
import { createMapProjection } from "./map-projection"
import {
	buildGlobeMeasurementOverlay,
	buildMapMeasurementOverlay,
} from "./measurement-overlay"
import {
	applyFaceRegionColors,
	applyMapColorModeColors,
	applyTerrainColorModeColors,
	buildMapMesh,
	buildMapOccupationOverlay,
	buildMapWireframe,
	buildTerrainMesh,
	buildTerrainWireframe,
} from "./mesh-builders"
import {
	buildMoonOrbitOverlay,
	type MoonOrbitState,
} from "./moon-orbit-overlay"
import { shouldRebuildNationBordersForVisibilityChange } from "./nation-border-visibility"
import {
	buildGlobeCultureLabels,
	buildGlobeHeritageLabels,
	buildGlobeNationLabels,
	buildGlobeSettlementLabels,
	buildMapCultureLabels,
	buildMapHeritageLabels,
	buildMapNationLabels,
	buildMapSettlementLabels,
	createNationLabelPools,
	createSettlementLabelPools,
	disposePool,
	updateGlobeLabelOrientations,
} from "./nation-label-overlay"
import {
	buildGlobeNationScripts,
	buildMapNationScripts,
	createNationScriptPools,
	createPendingNationScriptTextureQueue,
	disposeNationScriptPools,
	disposeScriptTextureCache,
	type PendingNationScriptTextureQueue,
	processPendingNationScriptTextures,
	type ScriptTextureCacheEntry,
} from "./nation-script-overlay"
import {
	buildGlobeGrid,
	buildGlobeHierarchyOverlay,
	buildGlobeRivers,
	buildGlobeThermalEquator,
	buildGlobeWindArrows,
	buildLandNationBordersGlobe,
	buildLandNationBordersMap,
	buildMapGrid,
	buildMapHierarchyOverlay,
	buildMapRivers,
	buildMapThermalEquator,
	buildMapWindArrows,
	collectAllNationBorderGlobePositions,
	collectAllNationBorderMapPositions,
	collectNationBorderGlobePositions,
	collectNationBorderMapPositions,
	repeatMapPositions,
} from "./overlay-builders"
import { PngStreamWriter } from "./PngStreamWriter"
import {
	buildGlobePathfindingOverlay,
	buildMapPathfindingOverlay,
} from "./pathfinding-overlay"
import {
	buildSelectedProvinceBorderGlobe,
	buildSelectedProvinceBorderMap,
	collectProvinceBorderGlobePositions,
	collectProvinceBorderMapPositions,
} from "./province-overlay"
import { createRenderScheduler } from "./render-scheduler"
import {
	buildGlobeSettlements,
	buildMapSettlements,
} from "./settlement-overlay"
import {
	buildSolarSystemOverlay,
	type SolarSystemOverlayParams,
	type SolarSystemOverlayState,
} from "./solar-system-overlay"
import {
	buildGlobeTradeRoutes,
	buildMapTradeRoutes,
} from "./trade-route-overlay"
import type {
	GenesisHoverInfo,
	GenesisScene,
	GenesisViewMode,
	RiverData,
	WindArrowData,
} from "./types"

const SOLAR_TERMINATOR_ALTITUDE_DEG = -0.833
const SOLAR_TERMINATOR_LINE_COLOR = 0xf8fafc
const SOLAR_TERMINATOR_HAIRLINE_COLOR = 0x0f172a
const SOLAR_TERMINATOR_BAND_COLOR = 0xe2e8f0
const SOLAR_TERMINATOR_RADIUS = 1.02
const SOLAR_TERMINATOR_ELEVATED_RADIUS = 1.05
const SOLAR_TERMINATOR_BAND_HALF_WIDTH = 0.008
const SOLAR_TERMINATOR_LABEL_COUNT = 24
const SOLAR_TERMINATOR_LABEL_RENDER_ORDER = 1002
const SOLAR_TERMINATOR_LABEL_TEXT_COLOR = "#0f172a"
const SOLAR_TERMINATOR_LABEL_BG_FILL = "rgba(248, 250, 252, 0.94)"
const SOLAR_TERMINATOR_LABEL_BG_STROKE = "rgba(148, 163, 184, 0.55)"
const SOLAR_TERMINATOR_LABEL_BASE_FONT_PX = 12
const SOLAR_TERMINATOR_LABEL_TEXTURE_SCALE = 2

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) {
	ctx.beginPath()
	ctx.moveTo(x + radius, y)
	ctx.lineTo(x + width - radius, y)
	ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
	ctx.lineTo(x + width, y + height - radius)
	ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
	ctx.lineTo(x + radius, y + height)
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
	ctx.lineTo(x, y + radius)
	ctx.quadraticCurveTo(x, y, x + radius, y)
	ctx.closePath()
}

function createSolarTerminatorBand(
	points: THREE.Vector3[],
	radius: number,
	halfWidth: number,
): THREE.BufferGeometry {
	const positions = new Float32Array(points.length * 2 * 3)
	const indices: number[] = []

	for (let index = 0; index < points.length; index++) {
		const direction = points[index]!.clone().normalize()
		const inner = direction.clone().multiplyScalar(radius - halfWidth)
		const outer = direction.clone().multiplyScalar(radius + halfWidth)
		const offset = index * 6
		positions[offset] = inner.x
		positions[offset + 1] = inner.y
		positions[offset + 2] = inner.z
		positions[offset + 3] = outer.x
		positions[offset + 4] = outer.y
		positions[offset + 5] = outer.z
	}

	for (let index = 0; index < points.length - 1; index++) {
		const base = index * 2
		indices.push(base, base + 1, base + 3, base, base + 3, base + 2)
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setIndex(indices)
	return geometry
}

function createSolarTerminatorLabelSprite(label: string): {
	sprite: THREE.Sprite
	aspect: number
} | null {
	if (typeof document === "undefined") return null
	const canvas = document.createElement("canvas")
	const ctx = canvas.getContext("2d")
	if (!ctx) return null
	const textureScale = SOLAR_TERMINATOR_LABEL_TEXTURE_SCALE
	const scaledFontPx = SOLAR_TERMINATOR_LABEL_BASE_FONT_PX * textureScale
	ctx.font = `500 ${scaledFontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`
	const textMetrics = ctx.measureText(label)
	const width = Math.ceil(textMetrics.width / textureScale + 14)
	const height = 22
	canvas.width = width * textureScale
	canvas.height = height * textureScale
	ctx.setTransform(textureScale, 0, 0, textureScale, 0, 0)
	ctx.font = `500 ${SOLAR_TERMINATOR_LABEL_BASE_FONT_PX}px ui-monospace, SFMono-Regular, Menlo, monospace`
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.fillStyle = SOLAR_TERMINATOR_LABEL_BG_FILL
	drawRoundedRect(ctx, 0.5, 0.5, width - 1, height - 1, 6)
	ctx.fill()
	ctx.strokeStyle = SOLAR_TERMINATOR_LABEL_BG_STROKE
	ctx.lineWidth = 1
	ctx.stroke()
	ctx.fillStyle = SOLAR_TERMINATOR_LABEL_TEXT_COLOR
	ctx.fillText(label, width / 2, height / 2 + 0.5)
	const texture = new THREE.CanvasTexture(canvas)
	texture.needsUpdate = true
	texture.colorSpace = THREE.SRGBColorSpace
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	})
	const sprite = new THREE.Sprite(material)
	sprite.renderOrder = SOLAR_TERMINATOR_LABEL_RENDER_ORDER
	return { sprite, aspect: width / height }
}

function getSolarTerminatorLabelText(params: {
	anchor: THREE.Vector3
	sunDirection: THREE.Vector3
	hoursPerDay: number
	useMeridiem: boolean
}) {
	const { anchor, sunDirection, hoursPerDay, useMeridiem } = params
	const latitude = Math.asin(anchor.z)
	const declination = Math.asin(sunDirection.z)
	const h0 = THREE.MathUtils.degToRad(SOLAR_TERMINATOR_ALTITUDE_DEG)
	const sinH0 = Math.sin(h0)
	const denom = Math.max(
		1e-6,
		Math.abs(Math.cos(latitude) * Math.cos(declination)),
	)
	const cosHourAngle = THREE.MathUtils.clamp(
		(sinH0 - Math.sin(latitude) * Math.sin(declination)) / denom,
		-1,
		1,
	)
	const hourAngleMagnitude = Math.acos(cosHourAngle)
	const east = new THREE.Vector3(-anchor.y, anchor.x, 0)
	if (east.lengthSq() < 1e-6) east.set(0, 1, 0)
	east.normalize()
	const isSunrise = east.dot(sunDirection) > 0
	const localHours =
		12 +
		((isSunrise ? -hourAngleMagnitude : hourAngleMagnitude) * hoursPerDay) /
			(2 * Math.PI)
	return `${isSunrise ? "↑" : "↓"} ${formatClockTimeDisplay(
		localHours,
		hoursPerDay,
		useMeridiem,
	)}`
}

function buildSolarTerminatorRingPoints(
	sunDirection: THREE.Vector3,
	radius: number,
): THREE.Vector3[] | null {
	const sunDir = sunDirection.clone().normalize()
	if (sunDir.lengthSq() === 0) return null
	const reference =
		Math.abs(sunDir.z) > 0.9
			? new THREE.Vector3(1, 0, 0)
			: new THREE.Vector3(0, 0, 1)
	const uAxis = new THREE.Vector3().crossVectors(reference, sunDir).normalize()
	const vAxis = new THREE.Vector3().crossVectors(sunDir, uAxis).normalize()
	const h0 = THREE.MathUtils.degToRad(SOLAR_TERMINATOR_ALTITUDE_DEG)
	const sinH0 = Math.sin(h0)
	const cosH0 = Math.cos(h0)
	const sampleCount = 192
	const points: THREE.Vector3[] = []
	for (let index = 0; index <= sampleCount; index++) {
		const t = (index / sampleCount) * Math.PI * 2
		const ring = uAxis
			.clone()
			.multiplyScalar(Math.cos(t))
			.addScaledVector(vAxis, Math.sin(t))
		points.push(
			sunDir
				.clone()
				.multiplyScalar(sinH0)
				.addScaledVector(ring, cosH0)
				.normalize()
				.multiplyScalar(radius),
		)
	}
	return points
}

function projectSolarTerminatorPointsToMap(
	points: THREE.Vector3[],
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	zOffset: number,
): THREE.Vector3[][] {
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const segments: THREE.Vector3[][] = []
	let currentSegment: THREE.Vector3[] = []
	const seamThreshold = projection.repeatWidth * 0.5

	for (let index = 0; index < points.length; index++) {
		const point = points[index]!
		const lon = Math.atan2(point.y, point.x)
		const lat = Math.asin(
			THREE.MathUtils.clamp(point.z / Math.max(point.length(), 1e-6), -1, 1),
		)
		const projected = projection.projectRadians(lon, lat, zOffset)
		const nextPoint = new THREE.Vector3(
			projection.clampX(projected[0]),
			projection.clampY(projected[1]),
			projected[2],
		)
		const previousPoint = currentSegment[currentSegment.length - 1]

		if (
			previousPoint &&
			Math.abs(nextPoint.x - previousPoint.x) > seamThreshold
		) {
			if (currentSegment.length > 1) segments.push(currentSegment)
			currentSegment = [nextPoint]
			continue
		}

		currentSegment.push(nextPoint)
	}

	if (currentSegment.length > 1) segments.push(currentSegment)
	return segments
}

function reapplyMeshOverlayState(params: {
	world: SerializedGenesisWorld
	colorMode: ColorMode
	regionColors: Float32Array | null
	occupationOverlay: Float32Array | null
	terrainMesh: THREE.Mesh | null
	terrainFaceToRegion: Int32Array
	mapMesh: THREE.Mesh | null
	mapFaceToRegion: Int32Array
	mapCenterLongitudeDeg: number
	mapProjectionLatitudeDeg: number
}): void {
	const {
		world,
		colorMode,
		regionColors,
		occupationOverlay,
		terrainMesh,
		terrainFaceToRegion,
		mapMesh,
		mapFaceToRegion,
		mapCenterLongitudeDeg,
		mapProjectionLatitudeDeg,
	} = params

	if (regionColors) {
		applyFaceRegionColors(
			terrainMesh,
			terrainFaceToRegion,
			regionColors,
			occupationOverlay,
		)
		applyFaceRegionColors(
			mapMesh,
			mapFaceToRegion,
			regionColors,
			occupationOverlay,
		)
		return
	}

	applyTerrainColorModeColors(
		terrainMesh,
		world,
		colorMode,
		terrainFaceToRegion,
		occupationOverlay,
	)
	applyMapColorModeColors(
		mapMesh,
		world,
		colorMode,
		mapFaceToRegion,
		mapCenterLongitudeDeg,
		mapProjectionLatitudeDeg,
		occupationOverlay,
	)
}

const MAP_REPEAT_WIDTH = 4
const CONTROL_SETTLE_FRAMES = 2
const MAP_EXPORT_TILE_CAP = 2048

interface MapExportOptions {
	width: number
	centerLongitudeDeg?: number
	onProgress?: (percent: number, label: string) => void
}

interface ExportRenderTargetLike {
	width?: number
	height?: number
	texture?:
		| {
				colorSpace?: string
		  }
		| Array<{
				colorSpace?: string
		  }>
	dispose: () => void
}

interface MapExportVisibilityTarget {
	object: THREE.Object3D | null
	visible: boolean
}

interface MapExportDependencies {
	createRenderTarget?: (width: number, height: number) => ExportRenderTargetLike
	yieldToMainThread?: () => Promise<void>
}

interface ExportRendererLike {
	capabilities: {
		maxTextureSize: number
	}
	getRenderTarget: () => unknown
	setRenderTarget: (target: unknown | null) => void
	render: (sceneToRender: THREE.Scene, cameraToRender: THREE.Camera) => void
	readRenderTargetPixels: (
		target: unknown,
		x: number,
		y: number,
		width: number,
		height: number,
		buffer: Uint8Array,
	) => void
}

function normalizeMapCenterLongitudeDeg(longitudeDeg: number): number {
	return ((((longitudeDeg + 180) % 360) + 360) % 360) - 180
}

function linearChannelToSrgb8(channel: number): number {
	const normalized = THREE.MathUtils.clamp(channel / 255, 0, 1)
	const srgb =
		normalized <= 0.0031308
			? normalized * 12.92
			: 1.055 * Math.pow(normalized, 1 / 2.4) - 0.055
	return Math.round(THREE.MathUtils.clamp(srgb, 0, 1) * 255)
}

const MAP_EXPORT_BAND_HEIGHT = 512

function renderMapExportPng(params: {
	scene: THREE.Scene
	renderer: ExportRendererLike
	camera: THREE.OrthographicCamera
	width: number
	height: number
	onProgress?: (percent: number, label: string) => void
	createRenderTarget: (width: number, height: number) => ExportRenderTargetLike
	yieldToMainThread?: () => Promise<void>
}): Promise<Blob> {
	const {
		scene,
		renderer,
		camera,
		width,
		height,
		onProgress,
		createRenderTarget,
		yieldToMainThread,
	} = params
	const maxTileWidth = Math.max(
		1,
		Math.min(MAP_EXPORT_TILE_CAP, renderer.capabilities.maxTextureSize),
	)
	const previousTarget = renderer.getRenderTarget()
	const previousFrustum = {
		left: camera.left,
		right: camera.right,
		top: camera.top,
		bottom: camera.bottom,
	}

	const pngWriter = new PngStreamWriter(
		width,
		height,
		(rowsCompleted, totalRows) => {
			onProgress?.(
				Math.round((rowsCompleted / totalRows) * 100),
				`Encoding row ${rowsCompleted}/${totalRows}`,
			)
		},
	)

	const renderBands = async () => {
		onProgress?.(0, "Preparing export")
		let bandIndex = 0
		const totalBands = Math.ceil(height / MAP_EXPORT_BAND_HEIGHT)

		for (let y = 0; y < height; y += MAP_EXPORT_BAND_HEIGHT) {
			const bandHeight = Math.min(MAP_EXPORT_BAND_HEIGHT, height - y)
			const bytesPerRow = width * 4
			const bandPixels = new Uint8Array(bandHeight * bytesPerRow)

			for (let x = 0; x < width; x += maxTileWidth) {
				const tileWidth = Math.min(maxTileWidth, width - x)
				const target = createRenderTarget(tileWidth, bandHeight)
				const targetTexture = Array.isArray(target.texture)
					? target.texture[0]
					: target.texture
				if (targetTexture) targetTexture.colorSpace = THREE.LinearSRGBColorSpace
				try {
					camera.left = -2 + (4 * x) / width
					camera.right = -2 + (4 * (x + tileWidth)) / width
					camera.top = 1 - (2 * y) / height
					camera.bottom = 1 - (2 * (y + bandHeight)) / height
					camera.updateProjectionMatrix()
					renderer.setRenderTarget(target)
					renderer.render(scene, camera)
					const pixels = new Uint8Array(tileWidth * bandHeight * 4)
					renderer.readRenderTargetPixels(
						target,
						0,
						0,
						tileWidth,
						bandHeight,
						pixels,
					)
					for (let row = 0; row < bandHeight; row++) {
						const srcRow = bandHeight - row - 1
						for (let col = 0; col < tileWidth; col++) {
							const srcOffset = (srcRow * tileWidth + col) * 4
							const destOffset = (row * width + (x + col)) * 4
							bandPixels[destOffset] = linearChannelToSrgb8(
								pixels[srcOffset] ?? 0,
							)
							bandPixels[destOffset + 1] = linearChannelToSrgb8(
								pixels[srcOffset + 1] ?? 0,
							)
							bandPixels[destOffset + 2] = linearChannelToSrgb8(
								pixels[srcOffset + 2] ?? 0,
							)
							bandPixels[destOffset + 3] = pixels[srcOffset + 3] ?? 255
						}
					}
				} finally {
					renderer.setRenderTarget(previousTarget)
					target.dispose()
				}
			}

			await pngWriter.writeBand(bandPixels, bandHeight)
			bandIndex++
			onProgress?.(
				Math.round((bandIndex / totalBands) * 100),
				`Rendering band ${bandIndex}/${totalBands}`,
			)
			await yieldToMainThread?.()
		}

		return pngWriter.finalize()
	}

	return renderBands().finally(() => {
		camera.left = previousFrustum.left
		camera.right = previousFrustum.right
		camera.top = previousFrustum.top
		camera.bottom = previousFrustum.bottom
		camera.updateProjectionMatrix()
		renderer.setRenderTarget(previousTarget)
	})
}

function applyMapExportVisibility(
	targets: ReadonlyArray<MapExportVisibilityTarget>,
): () => void {
	const snapshot = new Map<THREE.Object3D, boolean>()
	for (const target of targets) {
		if (!target.object) continue
		snapshot.set(target.object, target.object.visible)
		target.object.visible = target.visible
	}
	return () => {
		for (const [object, visible] of snapshot) {
			object.visible = visible
		}
	}
}

function addMapSlideClones(object: THREE.Object3D) {
	const clones: THREE.Object3D[] = []
	const cloneL = object.clone()
	const cloneR = object.clone()
	cloneL.visible = true
	cloneR.visible = true
	cloneL.position.x -= MAP_REPEAT_WIDTH
	cloneR.position.x += MAP_REPEAT_WIDTH
	clones.push(cloneL, cloneR)
	for (const clone of clones) {
		object.add(clone)
	}
}

export function createGenesisScene(
	canvas: HTMLCanvasElement,
	initialWorld?: SerializedGenesisWorld,
	dependencies: MapExportDependencies = {},
): GenesisScene {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

	const scene = new THREE.Scene()
	scene.background = new THREE.Color(0x030308)

	const camera = new THREE.PerspectiveCamera(
		50,
		canvas.clientWidth / canvas.clientHeight,
		0.01,
		2000,
	)
	camera.position.set(0, 0, 3)

	const mapCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
	mapCamera.position.set(0, 0, 5)
	mapCamera.lookAt(0, 0, 0)

	const controls = new TrackballControls(camera, canvas)
	controls.rotateSpeed = 2.5
	controls.zoomSpeed = 1.2
	controls.noPan = true
	controls.dynamicDampingFactor = 0.15
	controls.minDistance = 1.2
	controls.maxDistance = 12

	const mapControls = new OrbitControls(mapCamera, canvas)
	mapControls.enableRotate = false
	mapControls.mouseButtons = {
		LEFT: THREE.MOUSE.PAN,
		MIDDLE: THREE.MOUSE.PAN,
		RIGHT: THREE.MOUSE.PAN,
	}
	mapControls.enableDamping = true
	mapControls.dampingFactor = 0.09
	mapControls.panSpeed = 1.4
	mapControls.screenSpacePanning = true
	mapControls.enableZoom = true
	mapControls.minZoom = 0.5
	mapControls.maxZoom = 20
	mapControls.zoomToCursor = true
	mapControls.enabled = false

	// Planet group — all globe-surface objects live here. The globe spins for
	// time-of-day (Z rotation) and tilts for obliquity (Y rotation).
	const globeGroup = new THREE.Group()
	scene.add(globeGroup)

	// Orbit overlay group — in scene space, tilted for obliquity only (no spin)
	// so moon/gas-giant orbit rings stay in the ecliptic plane.
	const orbitGroup = new THREE.Group()
	scene.add(orbitGroup)

	// Solar-system view group — an independent overlay that replaces the
	// globe/map entirely while active (see setSolarSystemActive).
	const solarSystemGroup = new THREE.Group()
	solarSystemGroup.visible = false
	scene.add(solarSystemGroup)
	let solarSystemActive = false
	let solarSystemOverlayState: SolarSystemOverlayState | null = null
	// The body/moon the camera is currently glued to in the solar-system view
	// (set by focusOnSystemBody) — re-applied after every setDay/setSpinHours
	// call so the clock knobs can move the focused body without the camera
	// drifting away from it.
	let solarSystemTrackedFocus: {
		bodyIndex: number
		moonIndex?: number
	} | null = null
	let solarSystemTrackedFocusPosition: THREE.Vector3 | null = null
	let solarSystemFocusChangeHandler:
		| ((bodyIndex: number, moonIndex?: number) => void)
		| null = null
	let savedCameraPosition: THREE.Vector3 | null = null
	let savedControlsTarget: THREE.Vector3 | null = null
	const DEFAULT_CONTROLS_MIN_DISTANCE = 1.2
	const DEFAULT_CONTROLS_MAX_DISTANCE = 12
	// The camera's far clipping plane is fixed at construction time (see
	// `camera.far` below), but the solar-system view's camera distance scales
	// with the system's real size — which can now run well past 2000 scene
	// units for e.g. an O-class star (see MAX_BODY_DIAMETER_KM in
	// moon-visual-scale.ts). Without extending `far` to match, zooming out
	// toward `maxDistance` pushes the camera past its own far plane and the
	// whole scene gets clipped — reads as the view going blank/"crashing".
	const DEFAULT_CAMERA_FAR = 2000
	function setCameraFarForMaxDistance(maxDistance: number) {
		camera.far = Math.max(DEFAULT_CAMERA_FAR, maxDistance * 1.5)
		camera.updateProjectionMatrix()
	}

	// Lighting — low ambient so day/night contrast is visible
	const DEFAULT_AMBIENT_INTENSITY = 0.55
	const DEFAULT_SUN_INTENSITY = 2.8
	const DEFAULT_WATER_SPECULAR = 0x5f8fb5
	const ambient = new THREE.AmbientLight(0x667788, DEFAULT_AMBIENT_INTENSITY)
	scene.add(ambient)
	const sun = new THREE.DirectionalLight(0xfff8ee, DEFAULT_SUN_INTENSITY)
	sun.position.set(5, 3, 4)
	scene.add(sun)

	// Water sphere
	const waterGeo = new THREE.SphereGeometry(1.0, 64, 48)
	const waterMat = new THREE.MeshPhongMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0.12,
		shininess: 120,
		specular: DEFAULT_WATER_SPECULAR,
		depthWrite: false,
	})
	const waterMesh = new THREE.Mesh(waterGeo, waterMat)
	globeGroup.add(waterMesh)

	// Atmosphere
	const atmosGeo = new THREE.SphereGeometry(1.12, 48, 36)
	const atmosMat = new THREE.ShaderMaterial({
		uniforms: {
			atmosphereColor: { value: new THREE.Color(0.52, 0.68, 0.98) },
			sunDirection: { value: sun.position.clone().normalize() },
			atmosphereStrength: { value: 1.0 },
		},
		vertexShader: `
			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;
			void main() {
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPosition.xyz;
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform vec3 atmosphereColor;
			uniform vec3 sunDirection;
			uniform float atmosphereStrength;
			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;
			void main() {
				vec3 viewDir = normalize(cameraPosition - vWorldPosition);
				float rim = pow(1.0 - max(dot(viewDir, normalize(vWorldNormal)), 0.0), 5.0);
				float daylight = smoothstep(-0.15, 0.65, dot(normalize(vWorldNormal), normalize(sunDirection)));
				float alpha = rim * mix(0.03, 0.18, daylight) * atmosphereStrength;
				gl_FragColor = vec4(atmosphereColor, alpha);
			}
		`,
		transparent: true,
		side: THREE.BackSide,
		depthWrite: false,
	})
	const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat)
	globeGroup.add(atmosMesh)

	function setAtmospherePressure(pressureBar: number) {
		const clamped = Math.max(
			0.1,
			Math.min(10, Number.isFinite(pressureBar) ? pressureBar : 1),
		)
		const pressureFactor = Math.pow(clamped, 0.4)
		atmosMat.uniforms.atmosphereStrength.value = 0.7 + pressureFactor * 0.45
		const shellScale = 1.105 + pressureFactor * 0.02
		atmosMesh.scale.setScalar(shellScale / 1.12)
		requestRender()
	}

	// Starfield
	const starCount = 3000
	const starPositions = new Float32Array(starCount * 3)
	for (let i = 0; i < starCount; i++) {
		const theta = Math.random() * 2 * Math.PI
		const phi = Math.acos(2 * Math.random() - 1)
		const r = 600 + Math.random() * 200
		starPositions[3 * i] = r * Math.sin(phi) * Math.cos(theta)
		starPositions[3 * i + 1] = r * Math.sin(phi) * Math.sin(theta)
		starPositions[3 * i + 2] = r * Math.cos(phi)
	}
	const starGeo = new THREE.BufferGeometry()
	starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3))
	const starMat = new THREE.PointsMaterial({
		color: 0xffffff,
		size: 1.2,
		sizeAttenuation: false,
	})
	scene.add(new THREE.Points(starGeo, starMat))

	// Terrain mesh placeholder
	let terrainMesh: THREE.Mesh | null = null
	let mapMesh: THREE.Mesh | null = null
	let mapOccupationOverlay: THREE.Mesh | null = null
	let terrainWireframe: THREE.LineSegments | null = null
	let mapWireframe: THREE.LineSegments | null = null
	let globeGrid: THREE.LineSegments | null = null
	let mapGrid: THREE.LineSegments | null = null
	let currentWorld: SerializedGenesisWorld | null = null
	let currentColorMode: ColorMode = "terrain"
	let currentRegionColors: Float32Array | null = null
	let currentOccupationOverlay: Float32Array | null = null
	let currentViewMode: GenesisViewMode = "globe"
	let wireframeVisible = false
	let gridVisible = false
	let gridSpacingDeg = 15
	let currentMapCenterLongitudeDeg = 0
	let currentMapProjectionLatitudeDeg = 0
	let focusTween: {
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
	} | null = null
	let solarSystemFocusTween: {
		t0: number
		duration: number
		camFrom: THREE.Vector3
		camTo: THREE.Vector3
		targetFrom: THREE.Vector3
		targetTo: THREE.Vector3
	} | null = null
	let pulseGlobe: LineSegments2 | null = null
	let pulseMap: LineSegments2 | null = null
	let pulseMaterials: LineMaterial[] = []
	let pulse: {
		t0: number
		duration: number
		clearSelectedProvince: boolean
	} | null = null
	let terrainFaceToRegion: Int32Array = new Int32Array(0)
	let mapFaceToRegion: Int32Array = new Int32Array(0)
	let globeThermalEquator: THREE.Line | null = null
	let mapThermalEquator: THREE.Line | null = null
	let thermalEquatorPoints: [number, number][] | null = null
	let globeSolarTerminator: THREE.Group | null = null
	let mapSolarTerminator: THREE.Group | null = null
	let solarTerminatorVisible = false
	let solarTerminatorUseMeridiem = false
	const currentSunDirection = new THREE.Vector3(1, 0, 0)
	// Sun direction in globe-local space (includes obliquity Z component).
	// Used by the solar terminator so it tracks the planet surface correctly.
	const currentLocalSunDirection = new THREE.Vector3(1, 0, 0)
	let currentSunHoursPerDay = 24
	let globeWindArrows: THREE.LineSegments | null = null
	let mapWindArrows: THREE.LineSegments | null = null
	let windArrowData: WindArrowData | null = null
	let globeRivers: THREE.Group | null = null
	let mapRivers: THREE.Group | null = null
	let riverData: RiverData | null = null
	let riversVisible = false
	let globeRiverMaterials: LineMaterial[] = []
	let mapRiverMaterials: LineMaterial[] = []
	let riverMaterials: LineMaterial[] = []
	let globeNationBorders: LineSegments2 | null = null
	let mapNationBorders: LineSegments2 | null = null
	let nationBorderMaterials: LineMaterial[] = []
	let globeSelectedProvinceBorder: THREE.Object3D | null = null
	let mapSelectedProvinceBorder: THREE.Object3D | null = null
	let hoverHandler: ((info: GenesisHoverInfo | null) => void) | null = null
	let clickHandler: ((info: GenesisHoverInfo) => void) | null = null
	let hoveredRegion = -1
	let selectedProvince = -1
	let nationBordersVisible = false
	let globeLandNationBorders: LineSegments2 | null = null
	let mapLandNationBorders: LineSegments2 | null = null
	let landNationBordersVisible = false
	let landNationBorderMaterials: LineMaterial[] = []
	const raycaster = new THREE.Raycaster()
	const pointer = new THREE.Vector2()
	let globeMeasureLine: THREE.Line | null = null
	let mapMeasureLine: THREE.Line | null = null
	let globeMeasureDots: THREE.Group | null = null
	let mapMeasureDots: THREE.Group | null = null
	let globePathfindingLine: LineSegments2 | null = null
	let mapPathfindingLine: LineSegments2 | null = null
	let globePathfindingDots: THREE.Group | null = null
	let mapPathfindingDots: THREE.Group | null = null
	let globeHierarchyOverlay: THREE.Group | null = null
	let mapHierarchyOverlay: THREE.Group | null = null
	let hierarchyOverlayNationId = -1
	let hierarchyOverlayWorld: SerializedGenesisWorld | null = null
	let globeSettlements: THREE.Group | null = null
	let mapSettlements: THREE.Group | null = null
	let settlementLocations: Int32Array | null = null
	let settlementUrbanPop: Float32Array | null = null
	let settlementsVisible = false
	let settlementsDirty = false
	let globeInfrastructure: THREE.Group | null = null
	let mapInfrastructure: THREE.Group | null = null
	let infrastructureData: SerializedNetwork | null = null
	let globeInfrastructureMaterials: LineMaterial[] = []
	let mapInfrastructureMaterials: LineMaterial[] = []
	let infrastructureMaterials: LineMaterial[] = []
	let infrastructureVisible = false
	let globeNationLabels: THREE.Group | null = null
	let mapNationLabels: THREE.Group | null = null
	let globeNationScripts: THREE.Group | null = null
	let mapNationScripts: THREE.Group | null = null
	let globeSettlementLabels: THREE.Group | null = null
	let mapSettlementLabels: THREE.Group | null = null
	let globeCultureLabels: THREE.Group | null = null
	let mapCultureLabels: THREE.Group | null = null
	let globeHeritageLabels: THREE.Group | null = null
	let mapHeritageLabels: THREE.Group | null = null
	interface SolarTerminatorLabel {
		anchor: THREE.Vector3
		sprite: THREE.Sprite
		aspect: number
		leader: THREE.Line
	}
	let labelMode: LabelMode = {
		nations: false,
		dynasty: false,
		settlements: false,
		culture: false,
		heritage: false,
		script: false,
	}
	let heritageScripts: Map<number, HeritageScript> | null = null
	const nationScriptTextureCache = new Map<string, ScriptTextureCacheEntry>()
	let pendingNationScriptTextureQueue: PendingNationScriptTextureQueue | null =
		null
	const solarTerminatorLabels: SolarTerminatorLabel[] = []
	const solarTerminatorCameraUp = new THREE.Vector3()
	const solarTerminatorCameraDir = new THREE.Vector3()
	const solarTerminatorCameraRight = new THREE.Vector3()
	const solarTerminatorLabelStart = new THREE.Vector3()
	const solarTerminatorLabelEnd = new THREE.Vector3()
	const labelCullingEnabled = true
	let elevationVisible = true

	function buildSolarTerminatorGroup(): THREE.Group | null {
		if (!solarTerminatorVisible) return null
		const radius = elevationVisible
			? SOLAR_TERMINATOR_ELEVATED_RADIUS
			: SOLAR_TERMINATOR_RADIUS
		// Terminator geometry lives in globeGroup local space; use the pre-computed
		// globe-local sun direction (includes obliquity Z component).
		const sunDir = currentLocalSunDirection.clone().normalize()
		const points = buildSolarTerminatorRingPoints(
			currentLocalSunDirection,
			radius,
		)
		if (!points) return null
		const h0 = THREE.MathUtils.degToRad(SOLAR_TERMINATOR_ALTITUDE_DEG)
		const sinH0 = Math.sin(h0)
		const cosH0 = Math.cos(h0)
		const reference =
			Math.abs(sunDir.z) > 0.9
				? new THREE.Vector3(1, 0, 0)
				: new THREE.Vector3(0, 0, 1)
		const U = new THREE.Vector3().crossVectors(reference, sunDir).normalize()
		const V = new THREE.Vector3().crossVectors(sunDir, U).normalize()

		const group = new THREE.Group()
		group.add(
			new THREE.Mesh(
				createSolarTerminatorBand(
					points,
					radius,
					SOLAR_TERMINATOR_BAND_HALF_WIDTH,
				),
				new THREE.MeshBasicMaterial({
					color: SOLAR_TERMINATOR_BAND_COLOR,
					transparent: true,
					opacity: 0.16,
					side: THREE.DoubleSide,
					depthWrite: false,
				}),
			),
		)
		group.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(points),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_HAIRLINE_COLOR,
					transparent: true,
					opacity: 0.42,
					depthWrite: false,
				}),
			),
		)
		group.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(points),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_LINE_COLOR,
					transparent: true,
					opacity: 0.82,
					depthWrite: false,
				}),
			),
		)

		solarTerminatorLabels.length = 0
		for (let index = 0; index < SOLAR_TERMINATOR_LABEL_COUNT; index++) {
			const fraction = (index + 0.5) / SOLAR_TERMINATOR_LABEL_COUNT
			const t = fraction * Math.PI * 2
			const ring = U.clone()
				.multiplyScalar(Math.cos(t))
				.addScaledVector(V, Math.sin(t))
			const anchor = sunDir
				.clone()
				.multiplyScalar(sinH0)
				.addScaledVector(ring, cosH0)
				.normalize()
			const spriteData = createSolarTerminatorLabelSprite(
				getSolarTerminatorLabelText({
					anchor,
					sunDirection: sunDir,
					hoursPerDay: currentSunHoursPerDay,
					useMeridiem: solarTerminatorUseMeridiem,
				}),
			)
			if (!spriteData) continue
			const leader = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints([
					anchor.clone().multiplyScalar(radius),
					anchor.clone().multiplyScalar(radius + 0.01),
				]),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_LINE_COLOR,
					transparent: true,
					opacity: 0.75,
					depthWrite: false,
				}),
			)
			group.add(leader)
			group.add(spriteData.sprite)
			solarTerminatorLabels.push({
				anchor,
				sprite: spriteData.sprite,
				aspect: spriteData.aspect,
				leader,
			})
		}

		group.visible = currentViewMode === "globe"
		updateSolarTerminatorLabels(radius)
		return group
	}

	function buildMapSolarTerminatorGroup(): THREE.Group | null {
		if (!solarTerminatorVisible || !mapMesh) return null
		const projection = createMapProjection(
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
		)
		const sunDir = currentLocalSunDirection.clone().normalize()
		const points = buildSolarTerminatorRingPoints(currentLocalSunDirection, 1)
		if (!points) return null
		const segments = projectSolarTerminatorPointsToMap(
			points,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			0.012,
		)
		if (segments.length === 0) return null

		const content = new THREE.Group()
		for (const segment of segments) {
			const geometry = new THREE.BufferGeometry().setFromPoints(segment)
			const hairline = new THREE.Line(
				geometry.clone(),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_HAIRLINE_COLOR,
					transparent: true,
					opacity: 0.55,
					depthWrite: false,
				}),
			)
			hairline.renderOrder = 1001
			const line = new THREE.Line(
				geometry,
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_LINE_COLOR,
					transparent: true,
					opacity: 0.9,
					depthWrite: false,
				}),
			)
			line.renderOrder = 1002
			content.add(hairline, line)
		}

		for (let index = 0; index < SOLAR_TERMINATOR_LABEL_COUNT; index++) {
			const pointIndex = Math.floor(
				((index + 0.5) / SOLAR_TERMINATOR_LABEL_COUNT) * (points.length - 1),
			)
			const anchorPoint = points[pointIndex]
			if (!anchorPoint) continue
			const anchor = anchorPoint.clone().normalize()
			const label = getSolarTerminatorLabelText({
				anchor,
				sunDirection: sunDir,
				hoursPerDay: currentSunHoursPerDay,
				useMeridiem: solarTerminatorUseMeridiem,
			})
			const spriteData = createSolarTerminatorLabelSprite(label)
			if (!spriteData) continue
			const projected = projection.projectRadians(
				Math.atan2(anchor.y, anchor.x),
				Math.asin(THREE.MathUtils.clamp(anchor.z, -1, 1)),
				0.014,
			)
			const posX = projection.clampX(projected[0])
			const posY = projection.clampY(projected[1])
			const leader = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(posX, posY, 0.0125),
					new THREE.Vector3(posX, posY + 0.008, 0.0125),
				]),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_LINE_COLOR,
					transparent: true,
					opacity: 0.72,
					depthWrite: false,
				}),
			)
			leader.renderOrder = SOLAR_TERMINATOR_LABEL_RENDER_ORDER
			spriteData.sprite.position.set(posX, posY + 0.012, 0.014)
			spriteData.sprite.scale.set(spriteData.aspect * 0.028, 0.028, 1)
			content.add(leader, spriteData.sprite)
		}

		const root = new THREE.Group()
		for (const offset of [-projection.repeatWidth, 0, projection.repeatWidth]) {
			const copy = offset === 0 ? content : content.clone(true)
			copy.position.x = offset
			root.add(copy)
		}

		root.visible = currentViewMode === "map"
		root.position.copy(mapMesh.position)
		return root
	}

	function rebuildSolarTerminator() {
		if (globeSolarTerminator) {
			disposeGroup(globeGroup, globeSolarTerminator)
			globeSolarTerminator = null
		}
		if (mapSolarTerminator) {
			disposeGroup(scene, mapSolarTerminator)
			mapSolarTerminator = null
		}
		if (!solarTerminatorVisible) return
		globeSolarTerminator = buildSolarTerminatorGroup()
		if (globeSolarTerminator) globeGroup.add(globeSolarTerminator)
		mapSolarTerminator = buildMapSolarTerminatorGroup()
		if (mapSolarTerminator) scene.add(mapSolarTerminator)
	}

	function updateSolarTerminatorLabels(radius: number) {
		if (!globeSolarTerminator || currentViewMode !== "globe") return
		solarTerminatorCameraDir.copy(camera.position).normalize()
		solarTerminatorCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
		solarTerminatorCameraRight
			.crossVectors(solarTerminatorCameraDir, solarTerminatorCameraUp)
			.normalize()
		const camDist = camera.position.length()
		const depth = Math.max(camDist - 1.0, 0.3)
		const baseHeight = Math.pow(depth, 0.65) * 0.022
		const stride = camDist < 2.0 ? 1 : camDist < 3.2 ? 2 : 3

		// Labels are children of globeGroup, so camera vectors must be in
		// globe-local space to position them correctly when the globe is tilted.
		const invQ = globeGroup.quaternion.clone().invert()
		const localCamDir = solarTerminatorCameraDir.clone().applyQuaternion(invQ)
		const localCamUp = solarTerminatorCameraUp.clone().applyQuaternion(invQ)
		const localCamRight = solarTerminatorCameraRight
			.clone()
			.applyQuaternion(invQ)

		for (let index = 0; index < solarTerminatorLabels.length; index++) {
			const label = solarTerminatorLabels[index]!
			const frontFacing =
				index % stride === 0 && label.anchor.dot(localCamDir) > 0.06
			label.sprite.visible = frontFacing
			label.leader.visible = frontFacing
			if (!frontFacing) continue

			solarTerminatorLabelStart.copy(label.anchor).multiplyScalar(radius)
			solarTerminatorLabelEnd
				.copy(label.anchor)
				.multiplyScalar(radius + 0.04)
				.addScaledVector(
					localCamUp,
					baseHeight * (index % 2 === 0 ? 0.22 : -0.22),
				)
				.addScaledVector(localCamRight, baseHeight * ((index % 3) - 1) * 0.16)
			label.sprite.position.copy(solarTerminatorLabelEnd)
			label.sprite.scale.set(label.aspect * baseHeight, baseHeight, 1)
			;(label.leader.geometry as THREE.BufferGeometry).setFromPoints([
				solarTerminatorLabelStart,
				solarTerminatorLabelEnd,
			])
		}
	}
	const nationLabelPools = createNationLabelPools()
	const nationScriptPools = createNationScriptPools()
	const settlementLabelPools = createSettlementLabelPools()
	const cultureLabelPools = createNationLabelPools()
	const heritageLabelPools = createNationLabelPools()
	let nationNames: string[] | null = null
	let dynastyNames: string[] | null = null
	let settlementLabelNames: string[] | null = null
	let cultureNames: string[] | null = null
	let heritageNames: string[] | null = null
	let globeControlsInteracting = false
	let mapControlsInteracting = false
	let globeControlActivityFrames = 0
	let mapControlActivityFrames = 0

	const renderScheduler = createRenderScheduler({
		requestFrame: (callback) => window.requestAnimationFrame(callback),
		cancelFrame: (handle) => window.cancelAnimationFrame(handle),
		onFrame: () => {
			let keepAnimating = false

			if (focusTween) {
				stepFocusTween()
				keepAnimating = keepAnimating || focusTween !== null
			}
			if (pulse) {
				stepPulse()
				keepAnimating = keepAnimating || pulse !== null
			}

			if (solarSystemFocusTween) {
				stepSolarSystemFocusTween()
				keepAnimating = keepAnimating || solarSystemFocusTween !== null
			}

			if (solarSystemActive) {
				if (globeControlsInteracting || globeControlActivityFrames > 0) {
					controls.update()
					if (!globeControlsInteracting && globeControlActivityFrames > 0) {
						globeControlActivityFrames--
					}
					keepAnimating =
						keepAnimating ||
						globeControlsInteracting ||
						globeControlActivityFrames > 0
				}
				// Body-name labels don't rotate with anything else in the scene
				// (bodyGroups only ever translate), so they need their own
				// per-frame billboard update to keep facing the camera.
				solarSystemOverlayState?.updateLabelOrientations(camera)
				renderer.render(scene, camera)
				return keepAnimating
			}

			if (currentViewMode === "map") {
				if (mapControlsInteracting || mapControlActivityFrames > 0) {
					mapControls.update()
					if (!mapControlsInteracting && mapControlActivityFrames > 0) {
						mapControlActivityFrames--
					}
					keepAnimating =
						keepAnimating ||
						mapControlsInteracting ||
						mapControlActivityFrames > 0
				}
				if (mapInfrastructureMaterials.length > 0) {
					const zoomScale = Math.sqrt(mapCamera.zoom)
					for (const mat of mapInfrastructureMaterials) {
						mat.linewidth = mat.userData.baseWidth * zoomScale
					}
				}
				if (mapRiverMaterials.length > 0) {
					const zoomScale = Math.sqrt(mapCamera.zoom)
					for (const mat of mapRiverMaterials) {
						mat.linewidth = mat.userData.baseWidth * zoomScale
					}
				}
				if (nationBorderMaterials.length > 0) {
					const zoomScale = Math.pow(mapCamera.zoom, 0.3)
					for (const mat of nationBorderMaterials) {
						mat.linewidth = mat.userData.baseWidth * zoomScale
					}
				}
				if (landNationBorderMaterials.length > 0) {
					const zoomScale = Math.sqrt(mapCamera.zoom)
					for (const mat of landNationBorderMaterials) {
						mat.linewidth = mat.userData.baseWidth * zoomScale
					}
				}
				const scriptTextureProgress = processPendingNationScriptTextures(
					pendingNationScriptTextureQueue,
					nationScriptTextureCache,
					3,
				)
				if (scriptTextureProgress.pending === 0) {
					pendingNationScriptTextureQueue = null
				}
				keepAnimating =
					keepAnimating ||
					scriptTextureProgress.pending > 0 ||
					scriptTextureProgress.processed > 0
				renderer.render(scene, mapCamera)
				return keepAnimating
			}

			if (globeRiverMaterials.length > 0) {
				const dist = camera.position.length()
				const zoomScale = 3 / dist
				for (const mat of globeRiverMaterials) {
					mat.linewidth = mat.userData.baseWidth * zoomScale
				}
			}
			if (nationBorderMaterials.length > 0) {
				const dist = camera.position.length()
				const zoomScale = Math.pow(3 / dist, 0.3)
				for (const mat of nationBorderMaterials) {
					mat.linewidth = mat.userData.baseWidth * zoomScale
				}
			}
			if (landNationBorderMaterials.length > 0) {
				const dist = camera.position.length()
				const zoomScale = 3 / dist
				for (const mat of landNationBorderMaterials) {
					mat.linewidth = mat.userData.baseWidth * zoomScale
				}
			}
			if (globeMeasureDots && globeMeasureDots.visible) {
				const dist = camera.position.length()
				const scale = dist * 0.001
				for (const child of globeMeasureDots.children) {
					child.scale.setScalar(scale)
				}
			}
			if (globeInfrastructureMaterials.length > 0) {
				const dist = camera.position.length()
				const zoomScale = 3 / dist
				for (const mat of globeInfrastructureMaterials) {
					mat.linewidth = mat.userData.baseWidth * zoomScale
				}
			}
			if (globeControlsInteracting || globeControlActivityFrames > 0) {
				controls.update()
				if (!globeControlsInteracting && globeControlActivityFrames > 0) {
					globeControlActivityFrames--
				}
				keepAnimating =
					keepAnimating ||
					globeControlsInteracting ||
					globeControlActivityFrames > 0
			}
			const scriptTextureProgress = processPendingNationScriptTextures(
				pendingNationScriptTextureQueue,
				nationScriptTextureCache,
				3,
			)
			if (scriptTextureProgress.pending === 0) {
				pendingNationScriptTextureQueue = null
			}
			keepAnimating =
				keepAnimating ||
				scriptTextureProgress.pending > 0 ||
				scriptTextureProgress.processed > 0
			updateGlobeLabelOrientations(
				globeNationLabels,
				camera,
				labelCullingEnabled,
			)
			updateGlobeLabelOrientations(
				globeNationScripts,
				camera,
				labelCullingEnabled,
			)
			updateGlobeLabelOrientations(
				globeSettlementLabels,
				camera,
				labelCullingEnabled,
			)
			updateGlobeLabelOrientations(
				globeCultureLabels,
				camera,
				labelCullingEnabled,
			)
			updateGlobeLabelOrientations(
				globeHeritageLabels,
				camera,
				labelCullingEnabled,
			)
			updateSolarTerminatorLabels(
				elevationVisible
					? SOLAR_TERMINATOR_ELEVATED_RADIUS
					: SOLAR_TERMINATOR_RADIUS,
			)
			renderer.render(scene, camera)
			return keepAnimating
		},
	})

	function requestRender() {
		renderScheduler.requestRender()
	}

	function syncAnimationState() {
		renderScheduler.setAnimationActive(
			!!focusTween ||
				!!solarSystemFocusTween ||
				!!pulse ||
				globeControlsInteracting ||
				mapControlsInteracting ||
				globeControlActivityFrames > 0 ||
				mapControlActivityFrames > 0,
		)
	}

	function getHeritageScripts(
		world: SerializedGenesisWorld,
	): Map<number, HeritageScript> {
		if (heritageScripts) return heritageScripts
		const scripts = new Map<number, HeritageScript>()
		if (world.heritages?.languageSeeds) {
			for (
				let heritageIdx = 0;
				heritageIdx < world.heritages.count;
				heritageIdx++
			) {
				scripts.set(
					heritageIdx,
					SCRIPT.spawn(`script:${world.heritages.languageSeeds[heritageIdx]}`),
				)
			}
		}
		heritageScripts = scripts
		return scripts
	}

	function updateMapCameraFrustum() {
		const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
		const mapAspect = 2
		let halfW: number
		let halfH: number
		if (aspect > mapAspect) {
			halfH = 1.15
			halfW = halfH * aspect
		} else {
			halfW = 2.3
			halfH = halfW / aspect
		}
		mapCamera.left = -halfW
		mapCamera.right = halfW
		mapCamera.top = halfH
		mapCamera.bottom = -halfH
		mapCamera.updateProjectionMatrix()
	}

	function rebuildHierarchyOverlay() {
		disposeGroup(globeGroup, globeHierarchyOverlay)
		disposeGroup(scene, mapHierarchyOverlay)
		globeHierarchyOverlay = null
		mapHierarchyOverlay = null
		if (!hierarchyOverlayWorld || hierarchyOverlayNationId < 0) return
		globeHierarchyOverlay = buildGlobeHierarchyOverlay(
			hierarchyOverlayWorld,
			hierarchyOverlayNationId,
			currentViewMode,
			canvas,
			elevationVisible,
		)
		mapHierarchyOverlay = buildMapHierarchyOverlay(
			hierarchyOverlayWorld,
			hierarchyOverlayNationId,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			currentViewMode,
			canvas,
		)
		if (globeHierarchyOverlay) globeGroup.add(globeHierarchyOverlay)
		if (mapHierarchyOverlay) {
			addMapSlideClones(mapHierarchyOverlay)
			scene.add(mapHierarchyOverlay)
		}
		updateOverlayVisibility()
	}

	function rebuildSettlementOverlay() {
		disposeGroup(globeGroup, globeSettlements)
		disposeGroup(scene, mapSettlements)
		globeSettlements = null
		mapSettlements = null
		if (
			!currentWorld?.provinces ||
			!settlementLocations ||
			!settlementUrbanPop ||
			!settlementsVisible
		) {
			return
		}
		globeSettlements = buildGlobeSettlements(
			currentWorld,
			settlementLocations,
			settlementUrbanPop,
			elevationVisible,
		)
		mapSettlements = buildMapSettlements(
			currentWorld,
			settlementLocations,
			settlementUrbanPop,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
		)
		if (globeSettlements) globeGroup.add(globeSettlements)
		if (mapSettlements) {
			addMapSlideClones(mapSettlements)
			if (mapMesh) mapSettlements.position.copy(mapMesh.position)
			scene.add(mapSettlements)
		}
		updateOverlayVisibility()
	}

	function rebuildNationLabels() {
		disposeGroup(globeGroup, globeNationLabels)
		disposeGroup(scene, mapNationLabels)
		if (globeNationScripts) globeGroup.remove(globeNationScripts)
		if (mapNationScripts) scene.remove(mapNationScripts)
		pendingNationScriptTextureQueue = null
		globeNationLabels = null
		mapNationLabels = null
		globeNationScripts = null
		mapNationScripts = null
		if (!currentWorld?.nations) {
			return
		}
		const showNationLabels = labelMode.nations || labelMode.dynasty
		if (!showNationLabels) return
		const labelNames = labelMode.dynasty ? dynastyNames : nationNames
		if (!labelNames) return
		globeNationLabels = buildGlobeNationLabels(
			currentWorld,
			labelNames,
			camera,
			nationLabelPools.globe,
			labelCullingEnabled,
			elevationVisible,
		)
		mapNationLabels = buildMapNationLabels(
			currentWorld,
			labelNames,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			nationLabelPools.map,
			labelCullingEnabled,
		)
		if (globeNationLabels) globeGroup.add(globeNationLabels)
		if (mapNationLabels) {
			if (!labelCullingEnabled) addMapSlideClones(mapNationLabels)
			if (mapMesh) mapNationLabels.position.copy(mapMesh.position)
			scene.add(mapNationLabels)
		}
		if (
			labelMode.script &&
			currentWorld.heritages &&
			currentWorld.cultures &&
			labelNames
		) {
			pendingNationScriptTextureQueue = createPendingNationScriptTextureQueue()
			const scripts = getHeritageScripts(currentWorld)
			globeNationScripts = buildGlobeNationScripts(
				currentWorld,
				labelNames,
				scripts,
				nationScriptTextureCache,
				pendingNationScriptTextureQueue,
				camera,
				nationScriptPools.globe,
				labelCullingEnabled,
				elevationVisible,
			)
			mapNationScripts = buildMapNationScripts(
				currentWorld,
				labelNames,
				scripts,
				nationScriptTextureCache,
				pendingNationScriptTextureQueue,
				currentMapCenterLongitudeDeg,
				currentMapProjectionLatitudeDeg,
				nationScriptPools.map,
				labelCullingEnabled,
			)
			if (globeNationScripts) globeGroup.add(globeNationScripts)
			if (mapNationScripts) {
				if (mapMesh) mapNationScripts.position.copy(mapMesh.position)
				scene.add(mapNationScripts)
			}
		}
		updateOverlayVisibility()
	}

	function rebuildSettlementLabels() {
		disposeGroup(globeGroup, globeSettlementLabels)
		disposeGroup(scene, mapSettlementLabels)
		globeSettlementLabels = null
		mapSettlementLabels = null
		if (
			!currentWorld?.settlementRegions ||
			!labelMode.settlements ||
			!settlementLabelNames
		) {
			return
		}
		globeSettlementLabels = buildGlobeSettlementLabels(
			currentWorld,
			settlementLabelNames,
			camera,
			settlementLabelPools.globe,
			labelCullingEnabled,
			elevationVisible,
		)
		mapSettlementLabels = buildMapSettlementLabels(
			currentWorld,
			settlementLabelNames,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			settlementLabelPools.map,
			labelCullingEnabled,
		)
		if (globeSettlementLabels) globeGroup.add(globeSettlementLabels)
		if (mapSettlementLabels) {
			if (!labelCullingEnabled) addMapSlideClones(mapSettlementLabels)
			if (mapMesh) mapSettlementLabels.position.copy(mapMesh.position)
			scene.add(mapSettlementLabels)
		}
		updateOverlayVisibility()
	}

	function rebuildCultureLabels() {
		disposeGroup(globeGroup, globeCultureLabels)
		disposeGroup(scene, mapCultureLabels)
		globeCultureLabels = null
		mapCultureLabels = null
		if (!currentWorld?.cultures || !labelMode.culture || !cultureNames) {
			return
		}
		globeCultureLabels = buildGlobeCultureLabels(
			currentWorld,
			cultureNames,
			camera,
			cultureLabelPools.globe,
			labelCullingEnabled,
			elevationVisible,
		)
		mapCultureLabels = buildMapCultureLabels(
			currentWorld,
			cultureNames,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			cultureLabelPools.map,
			labelCullingEnabled,
		)
		if (globeCultureLabels) globeGroup.add(globeCultureLabels)
		if (mapCultureLabels) {
			if (mapMesh) mapCultureLabels.position.copy(mapMesh.position)
			scene.add(mapCultureLabels)
		}
		updateOverlayVisibility()
	}

	function rebuildHeritageLabels() {
		disposeGroup(globeGroup, globeHeritageLabels)
		disposeGroup(scene, mapHeritageLabels)
		globeHeritageLabels = null
		mapHeritageLabels = null
		if (!currentWorld?.heritages || !labelMode.heritage || !heritageNames) {
			return
		}
		globeHeritageLabels = buildGlobeHeritageLabels(
			currentWorld,
			heritageNames,
			camera,
			heritageLabelPools.globe,
			labelCullingEnabled,
			elevationVisible,
		)
		mapHeritageLabels = buildMapHeritageLabels(
			currentWorld,
			heritageNames,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			heritageLabelPools.map,
			labelCullingEnabled,
		)
		if (globeHeritageLabels) globeGroup.add(globeHeritageLabels)
		if (mapHeritageLabels) {
			if (mapMesh) mapHeritageLabels.position.copy(mapMesh.position)
			scene.add(mapHeritageLabels)
		}
		updateOverlayVisibility()
	}

	function rebuildTradeRouteOverlay() {
		disposeGroup(globeGroup, globeInfrastructure)
		disposeGroup(scene, mapInfrastructure)
		globeInfrastructure = null
		mapInfrastructure = null
		globeInfrastructureMaterials = []
		mapInfrastructureMaterials = []
		infrastructureMaterials = []
		if (
			!currentWorld?.provinces ||
			!infrastructureData ||
			networkCount(infrastructureData) === 0 ||
			!infrastructureVisible
		) {
			return
		}
		const globeTradeRouteBuild = buildGlobeTradeRoutes(
			currentWorld,
			infrastructureData,
			{
				width: canvas.clientWidth || 1,
				height: canvas.clientHeight || 1,
			},
			elevationVisible,
		)
		const mapTradeRouteBuild = buildMapTradeRoutes(
			currentWorld,
			infrastructureData,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			{
				width: canvas.clientWidth || 1,
				height: canvas.clientHeight || 1,
			},
		)
		globeInfrastructure = globeTradeRouteBuild.group
		mapInfrastructure = mapTradeRouteBuild.group
		globeInfrastructureMaterials = globeTradeRouteBuild.materials
		mapInfrastructureMaterials = mapTradeRouteBuild.materials
		infrastructureMaterials = [
			...globeTradeRouteBuild.materials,
			...mapTradeRouteBuild.materials,
		]
		if (globeInfrastructure) globeGroup.add(globeInfrastructure)
		if (mapInfrastructure) {
			addMapSlideClones(mapInfrastructure)
			if (mapMesh) mapInfrastructure.position.copy(mapMesh.position)
			scene.add(mapInfrastructure)
		}
		updateOverlayVisibility()
	}

	function rebuildNationBorders() {
		disposeObject3D(globeGroup, globeNationBorders)
		disposeObject3D(scene, mapNationBorders)
		disposeObject3D(globeGroup, globeLandNationBorders)
		disposeObject3D(scene, mapLandNationBorders)
		globeNationBorders = null
		mapNationBorders = null
		globeLandNationBorders = null
		mapLandNationBorders = null
		nationBorderMaterials = []
		landNationBorderMaterials = []

		const w = canvas.clientWidth || 1
		const h = canvas.clientHeight || 1

		if (currentWorld && landNationBordersVisible) {
			const globeLand = buildLandNationBordersGlobe(
				currentWorld,
				currentViewMode,
				landNationBordersVisible,
				elevationVisible,
				[w, h],
			)
			const mapLand = buildLandNationBordersMap(
				currentWorld,
				currentMapCenterLongitudeDeg,
				currentMapProjectionLatitudeDeg,
				currentViewMode,
				landNationBordersVisible,
				[w, h],
			)
			if (globeLand) {
				globeLandNationBorders = globeLand.lines
				landNationBorderMaterials.push(globeLand.material)
				globeGroup.add(globeLandNationBorders)
			}
			if (mapLand) {
				mapLandNationBorders = mapLand.lines
				landNationBorderMaterials.push(mapLand.material)
				scene.add(mapLandNationBorders)
			}
		}

		if (currentWorld && nationBordersVisible) {
			const BORDER_BASE_WIDTH = 1.2
			const globePos = collectAllNationBorderGlobePositions(
				currentWorld,
				0,
				elevationVisible,
			)
			if (globePos.length > 0) {
				const geom = new LineSegmentsGeometry()
				geom.setPositions(globePos)
				const mat = new LineMaterial({
					color: 0x020617,
					linewidth: BORDER_BASE_WIDTH,
					resolution: new THREE.Vector2(w, h),
					transparent: true,
					opacity: 0.95,
					depthWrite: false,
				})
				mat.userData.baseWidth = BORDER_BASE_WIDTH
				globeNationBorders = new LineSegments2(geom, mat)
				globeNationBorders.computeLineDistances()
				globeNationBorders.visible = currentViewMode === "globe"
				globeNationBorders.renderOrder = 1
				nationBorderMaterials.push(mat)
				globeGroup.add(globeNationBorders)
			}
			const mapRaw = collectAllNationBorderMapPositions(
				currentWorld,
				currentMapCenterLongitudeDeg,
				currentMapProjectionLatitudeDeg,
				0,
			)
			const mapPos = repeatMapPositions(
				mapRaw,
				createMapProjection(
					currentMapCenterLongitudeDeg,
					currentMapProjectionLatitudeDeg,
				).repeatWidth,
			)
			if (mapPos.length > 0) {
				const geom = new LineSegmentsGeometry()
				geom.setPositions(mapPos)
				const mat = new LineMaterial({
					color: 0x020617,
					linewidth: BORDER_BASE_WIDTH,
					resolution: new THREE.Vector2(w, h),
					transparent: true,
					opacity: 0.95,
					depthWrite: false,
				})
				mat.userData.baseWidth = BORDER_BASE_WIDTH
				mapNationBorders = new LineSegments2(geom, mat)
				mapNationBorders.computeLineDistances()
				mapNationBorders.visible = currentViewMode === "map"
				mapNationBorders.renderOrder = 1
				nationBorderMaterials.push(mat)
				scene.add(mapNationBorders)
			}
		}

		updateOverlayVisibility()
	}

	function rebuildSelectedProvinceBorder() {
		disposeObject3D(globeGroup, globeSelectedProvinceBorder)
		disposeObject3D(scene, mapSelectedProvinceBorder)
		globeSelectedProvinceBorder = null
		mapSelectedProvinceBorder = null
		if (!currentWorld?.provinces || selectedProvince < 0) return
		globeSelectedProvinceBorder = buildSelectedProvinceBorderGlobe(
			currentWorld,
			selectedProvince,
			currentViewMode,
			elevationVisible,
			{
				color: 0xfffbeb,
				radiusBoost: 0.003,
				lineWidth: 4,
				resolution: [canvas.clientWidth || 1, canvas.clientHeight || 1],
			},
		)
		mapSelectedProvinceBorder = buildSelectedProvinceBorderMap(
			currentWorld,
			selectedProvince,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			currentViewMode,
			{
				color: 0xfffbeb,
				zBoost: 0.004,
				lineWidth: 4,
				resolution: [canvas.clientWidth || 1, canvas.clientHeight || 1],
			},
		)
		if (globeSelectedProvinceBorder) globeGroup.add(globeSelectedProvinceBorder)
		if (mapSelectedProvinceBorder) {
			addMapSlideClones(mapSelectedProvinceBorder)
			scene.add(mapSelectedProvinceBorder)
		}
		updateOverlayVisibility()
	}

	function recolorMeshesInPlace(): boolean {
		if (!currentRegionColors) return false
		const terrainUpdated = applyFaceRegionColors(
			terrainMesh,
			terrainFaceToRegion,
			currentRegionColors,
			currentOccupationOverlay,
		)
		const mapUpdated = applyFaceRegionColors(
			mapMesh,
			mapFaceToRegion,
			currentRegionColors,
			currentOccupationOverlay,
		)
		return terrainUpdated || mapUpdated
	}

	function recolorModeColorsInPlace(): boolean {
		if (!currentWorld || currentRegionColors) return false
		const terrainUpdated = applyTerrainColorModeColors(
			terrainMesh,
			currentWorld,
			currentColorMode,
			terrainFaceToRegion,
			currentOccupationOverlay,
		)
		const mapUpdated = applyMapColorModeColors(
			mapMesh,
			currentWorld,
			currentColorMode,
			mapFaceToRegion,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			currentOccupationOverlay,
		)
		return terrainUpdated || mapUpdated
	}

	function applyWaterMaterialForMode(mode: ColorMode) {
		const useTerrainWaterMaterial = mode === "terrain"
		const useVegetationWaterMaterial =
			mode === "vegetation" ||
			mode === "vegetationMaps" ||
			mode === "vegetationSatellite"
		if (useTerrainWaterMaterial) {
			waterMat.color.set(0xffffff)
			waterMat.opacity = 0.12
			waterMat.specular.set(DEFAULT_WATER_SPECULAR)
		} else {
			if (useVegetationWaterMaterial) {
				waterMat.color.setRGB(
					VEGETATION_WATER_BLUE[0],
					VEGETATION_WATER_BLUE[1],
					VEGETATION_WATER_BLUE[2],
				)
			} else {
				waterMat.color.set(0x0c3a6e)
			}
			waterMat.opacity = 0.12
			waterMat.specular.set(0x000000)
		}
		const riverHex = useVegetationWaterMaterial ? 0x90d9ed : 0x0978ab
		for (const material of riverMaterials) {
			material.color.setHex(riverHex)
			material.opacity = useVegetationWaterMaterial
				? 1
				: (material.userData.baseOpacity ?? material.opacity)
			material.transparent = !useVegetationWaterMaterial
			material.needsUpdate = true
		}
		if (currentViewMode === "globe") {
			waterMesh.visible = true
			atmosMesh.visible = sun.intensity > 0
		}
	}

	function refreshMeshColors() {
		if (currentRegionColors) {
			if (!recolorMeshesInPlace()) rebuildTerrain()
			else requestRender()
			return
		}
		if (!recolorModeColorsInPlace()) rebuildTerrain()
		else requestRender()
	}

	function rebuildOverlays() {
		disposeObject3D(scene, terrainWireframe)
		disposeObject3D(scene, mapWireframe)
		disposeObject3D(globeGroup, globeGrid)
		disposeObject3D(scene, mapGrid)
		disposeObject3D(globeGroup, globeThermalEquator)
		disposeObject3D(scene, mapThermalEquator)
		disposeObject3D(globeGroup, globeWindArrows)
		disposeObject3D(scene, mapWindArrows)
		disposeGroup(scene, mapSolarTerminator)
		disposeObject3D(globeGroup, globeNationBorders)
		disposeObject3D(scene, mapNationBorders)
		disposeObject3D(globeGroup, globeLandNationBorders)
		disposeObject3D(scene, mapLandNationBorders)
		disposeObject3D(globeGroup, globeSelectedProvinceBorder)
		disposeObject3D(scene, mapSelectedProvinceBorder)
		disposeObject3D(scene, pulseGlobe)
		disposeObject3D(scene, pulseMap)
		disposeGroup(globeGroup, globeRivers)
		disposeGroup(scene, mapRivers)
		disposeGroup(globeGroup, globeHierarchyOverlay)
		disposeGroup(scene, mapHierarchyOverlay)
		disposeGroup(globeGroup, globeSettlements)
		disposeGroup(scene, mapSettlements)
		disposeGroup(globeGroup, globeInfrastructure)
		disposeGroup(scene, mapInfrastructure)
		disposeGroup(globeGroup, globeNationLabels)
		disposeGroup(scene, mapNationLabels)
		if (globeNationScripts) globeGroup.remove(globeNationScripts)
		if (mapNationScripts) scene.remove(mapNationScripts)
		disposeGroup(globeGroup, globeSettlementLabels)
		disposeGroup(scene, mapSettlementLabels)
		terrainWireframe = null
		mapWireframe = null
		globeGrid = null
		mapGrid = null
		globeThermalEquator = null
		mapThermalEquator = null
		globeWindArrows = null
		mapWindArrows = null
		mapSolarTerminator = null
		globeNationBorders = null
		mapNationBorders = null
		globeLandNationBorders = null
		mapLandNationBorders = null
		nationBorderMaterials = []
		landNationBorderMaterials = []
		pulseGlobe = null
		pulseMap = null
		pulse = null
		globeRivers = null
		mapRivers = null
		globeRiverMaterials = []
		mapRiverMaterials = []
		riverMaterials = []
		globeHierarchyOverlay = null
		mapHierarchyOverlay = null
		globeSettlements = null
		mapSettlements = null
		settlementsDirty = true
		globeInfrastructure = null
		mapInfrastructure = null
		globeNationLabels = null
		mapNationLabels = null
		globeNationScripts = null
		mapNationScripts = null
		globeSettlementLabels = null
		mapSettlementLabels = null
		syncAnimationState()

		if (wireframeVisible && currentWorld) {
			terrainWireframe = buildTerrainWireframe(
				currentWorld,
				wireframeVisible,
				currentViewMode,
				elevationVisible,
			)
			globeGroup.add(terrainWireframe)
		}
		if (wireframeVisible && currentWorld) {
			mapWireframe = buildMapWireframe(
				currentWorld,
				currentMapCenterLongitudeDeg,
				currentMapProjectionLatitudeDeg,
				wireframeVisible,
				currentViewMode,
			)
			addMapSlideClones(mapWireframe)
			scene.add(mapWireframe)
		}
		if (gridVisible) {
			globeGrid = buildGlobeGrid(
				gridSpacingDeg,
				gridVisible,
				currentViewMode,
				elevationVisible,
			)
			mapGrid = buildMapGrid(
				gridSpacingDeg,
				currentMapProjectionLatitudeDeg,
				gridVisible,
				currentViewMode,
			)
			globeGroup.add(globeGrid)
			addMapSlideClones(mapGrid)
			scene.add(mapGrid)
		}
		if (thermalEquatorPoints) {
			globeThermalEquator = buildGlobeThermalEquator(
				thermalEquatorPoints,
				currentViewMode,
				elevationVisible,
			)
			mapThermalEquator = buildMapThermalEquator(
				thermalEquatorPoints,
				currentMapProjectionLatitudeDeg,
				currentViewMode,
			)
			globeGroup.add(globeThermalEquator)
			addMapSlideClones(mapThermalEquator)
			scene.add(mapThermalEquator)
		}
		rebuildSolarTerminator()
		if (windArrowData) {
			globeWindArrows = buildGlobeWindArrows(
				windArrowData,
				currentViewMode,
				elevationVisible,
			)
			mapWindArrows = buildMapWindArrows(windArrowData, currentViewMode)
			if (globeWindArrows) globeGroup.add(globeWindArrows)
			if (mapWindArrows) {
				addMapSlideClones(mapWindArrows)
				scene.add(mapWindArrows)
			}
		}
		if (riversVisible && riverData) {
			globeRivers = buildGlobeRivers(
				riverData,
				canvas,
				riverMaterials,
				globeRiverMaterials,
				riversVisible,
				currentViewMode,
				elevationVisible,
			)
			mapRivers = buildMapRivers(
				riverData,
				canvas,
				riverMaterials,
				mapRiverMaterials,
				currentMapCenterLongitudeDeg,
				currentMapProjectionLatitudeDeg,
				riversVisible,
				currentViewMode,
			)
			globeGroup.add(globeRivers)
			addMapSlideClones(mapRivers)
			scene.add(mapRivers)
		}
		applyWaterMaterialForMode(currentColorMode)
		rebuildNationBorders()
		rebuildSelectedProvinceBorder()
		rebuildHierarchyOverlay()
		rebuildSettlementOverlay()
		rebuildTradeRouteOverlay()
		rebuildNationLabels()
		updateOverlayVisibility()
	}

	function updateOverlayVisibility() {
		if (terrainWireframe)
			terrainWireframe.visible = wireframeVisible && currentViewMode === "globe"
		if (mapWireframe) {
			mapWireframe.visible = wireframeVisible && currentViewMode === "map"
			if (mapMesh) mapWireframe.position.copy(mapMesh.position)
		}
		if (mapOccupationOverlay) {
			mapOccupationOverlay.visible =
				currentViewMode === "map" && !!currentOccupationOverlay
			if (mapMesh) mapOccupationOverlay.position.copy(mapMesh.position)
		}
		if (globeLandNationBorders)
			globeLandNationBorders.visible =
				currentViewMode === "globe" && landNationBordersVisible
		if (mapLandNationBorders) {
			mapLandNationBorders.visible =
				currentViewMode === "map" && landNationBordersVisible
			if (mapMesh) mapLandNationBorders.position.copy(mapMesh.position)
		}
		if (globeNationBorders)
			globeNationBorders.visible =
				currentViewMode === "globe" && nationBordersVisible
		if (mapNationBorders) {
			mapNationBorders.visible =
				currentViewMode === "map" && nationBordersVisible
			if (mapMesh) mapNationBorders.position.copy(mapMesh.position)
		}
		if (globeSelectedProvinceBorder)
			globeSelectedProvinceBorder.visible = currentViewMode === "globe"
		if (mapSelectedProvinceBorder) {
			mapSelectedProvinceBorder.visible = currentViewMode === "map"
			if (mapMesh) mapSelectedProvinceBorder.position.copy(mapMesh.position)
		}
		if (globeGrid)
			globeGrid.visible = gridVisible && currentViewMode === "globe"
		if (mapGrid) {
			mapGrid.visible = gridVisible && currentViewMode === "map"
			if (mapMesh) mapGrid.position.copy(mapMesh.position)
		}
		if (globeThermalEquator)
			globeThermalEquator.visible = currentViewMode === "globe"
		if (mapThermalEquator) {
			mapThermalEquator.visible = currentViewMode === "map"
			if (mapMesh) mapThermalEquator.position.copy(mapMesh.position)
		}
		if (mapSolarTerminator) {
			mapSolarTerminator.visible =
				solarTerminatorVisible && currentViewMode === "map"
			if (mapMesh) mapSolarTerminator.position.copy(mapMesh.position)
		}
		if (globeWindArrows) globeWindArrows.visible = currentViewMode === "globe"
		if (mapWindArrows) {
			mapWindArrows.visible = currentViewMode === "map"
			if (mapMesh) mapWindArrows.position.copy(mapMesh.position)
		}
		if (globeRivers)
			globeRivers.visible = riversVisible && currentViewMode === "globe"
		if (mapRivers) {
			mapRivers.visible = riversVisible && currentViewMode === "map"
			if (mapMesh) mapRivers.position.copy(mapMesh.position)
		}
		if (globeMeasureLine) globeMeasureLine.visible = currentViewMode === "globe"
		if (mapMeasureLine) {
			mapMeasureLine.visible = currentViewMode === "map"
			if (mapMesh) mapMeasureLine.position.copy(mapMesh.position)
		}
		if (globeMeasureDots) globeMeasureDots.visible = currentViewMode === "globe"
		if (mapMeasureDots) {
			mapMeasureDots.visible = currentViewMode === "map"
			if (mapMesh) mapMeasureDots.position.copy(mapMesh.position)
		}
		if (globeHierarchyOverlay)
			globeHierarchyOverlay.visible = currentViewMode === "globe"
		if (mapHierarchyOverlay) {
			mapHierarchyOverlay.visible = currentViewMode === "map"
			if (mapMesh) mapHierarchyOverlay.position.copy(mapMesh.position)
		}
		if (globeSettlements)
			globeSettlements.visible =
				settlementsVisible && currentViewMode === "globe"
		if (mapSettlements) {
			mapSettlements.visible = settlementsVisible && currentViewMode === "map"
			if (mapMesh) mapSettlements.position.copy(mapMesh.position)
		}
		if (globeInfrastructure)
			globeInfrastructure.visible =
				infrastructureVisible && currentViewMode === "globe"
		if (mapInfrastructure) {
			mapInfrastructure.visible =
				infrastructureVisible && currentViewMode === "map"
			if (mapMesh) mapInfrastructure.position.copy(mapMesh.position)
		}
		if (globeNationLabels)
			globeNationLabels.visible =
				(labelMode.nations || labelMode.dynasty) && currentViewMode === "globe"
		if (globeNationScripts)
			globeNationScripts.visible =
				labelMode.script &&
				(labelMode.nations || labelMode.dynasty) &&
				currentViewMode === "globe"
		if (mapNationLabels) {
			mapNationLabels.visible =
				(labelMode.nations || labelMode.dynasty) && currentViewMode === "map"
			if (mapMesh) mapNationLabels.position.copy(mapMesh.position)
		}
		if (mapNationScripts) {
			mapNationScripts.visible =
				labelMode.script &&
				(labelMode.nations || labelMode.dynasty) &&
				currentViewMode === "map"
			if (mapMesh) mapNationScripts.position.copy(mapMesh.position)
		}
		if (globeSettlementLabels)
			globeSettlementLabels.visible =
				labelMode.settlements && currentViewMode === "globe"
		if (mapSettlementLabels) {
			mapSettlementLabels.visible =
				labelMode.settlements && currentViewMode === "map"
			if (mapMesh) mapSettlementLabels.position.copy(mapMesh.position)
		}
		if (globeCultureLabels)
			globeCultureLabels.visible =
				labelMode.culture && currentViewMode === "globe"
		if (mapCultureLabels) {
			mapCultureLabels.visible = labelMode.culture && currentViewMode === "map"
			if (mapMesh) mapCultureLabels.position.copy(mapMesh.position)
		}
		if (globeHeritageLabels)
			globeHeritageLabels.visible =
				labelMode.heritage && currentViewMode === "globe"
		if (mapHeritageLabels) {
			mapHeritageLabels.visible =
				labelMode.heritage && currentViewMode === "map"
			if (mapMesh) mapHeritageLabels.position.copy(mapMesh.position)
		}
		requestRender()
	}

	function syncMapExportObjectPositions() {
		const mapObjects = [
			mapWireframe,
			mapOccupationOverlay,
			mapLandNationBorders,
			mapNationBorders,
			mapSelectedProvinceBorder,
			mapGrid,
			mapThermalEquator,
			mapSolarTerminator,
			mapRivers,
			mapMeasureLine,
			mapMeasureDots,
			mapHierarchyOverlay,
			mapSettlements,
			mapInfrastructure,
			mapNationLabels,
			mapNationScripts,
			mapSettlementLabels,
			mapCultureLabels,
			mapHeritageLabels,
			mapPathfindingLine,
			mapPathfindingDots,
			pulseMap,
		]
		for (const object of mapObjects) {
			if (object && mapMesh) object.position.copy(mapMesh.position)
		}
	}

	function buildMapExportVisibilityTargets(): MapExportVisibilityTarget[] {
		return [
			{ object: terrainMesh, visible: false },
			{ object: waterMesh, visible: false },
			{ object: atmosMesh, visible: false },
			{ object: terrainWireframe, visible: false },
			{ object: globeGrid, visible: false },
			{ object: globeThermalEquator, visible: false },
			{ object: globeRivers, visible: false },
			{ object: globeLandNationBorders, visible: false },
			{ object: globeNationBorders, visible: false },
			{ object: globeSelectedProvinceBorder, visible: false },
			{ object: globeMeasureLine, visible: false },
			{ object: globeMeasureDots, visible: false },
			{ object: globePathfindingLine, visible: false },
			{ object: globePathfindingDots, visible: false },
			{ object: globeHierarchyOverlay, visible: false },
			{ object: globeSettlements, visible: false },
			{ object: globeInfrastructure, visible: false },
			{ object: globeNationLabels, visible: false },
			{ object: globeNationScripts, visible: false },
			{ object: globeSettlementLabels, visible: false },
			{ object: globeCultureLabels, visible: false },
			{ object: globeHeritageLabels, visible: false },
			{ object: pulseGlobe, visible: false },
			{ object: mapMesh, visible: true },
			{
				object: mapOccupationOverlay,
				visible: !!currentOccupationOverlay,
			},
			{ object: mapWireframe, visible: wireframeVisible },
			{ object: mapGrid, visible: gridVisible },
			{ object: mapThermalEquator, visible: false },
			{ object: mapSolarTerminator, visible: solarTerminatorVisible },
			{ object: mapRivers, visible: riversVisible },
			{ object: mapLandNationBorders, visible: landNationBordersVisible },
			{ object: mapNationBorders, visible: nationBordersVisible },
			{ object: mapHierarchyOverlay, visible: hierarchyOverlayNationId >= 0 },
			{ object: mapSettlements, visible: settlementsVisible },
			{ object: mapInfrastructure, visible: infrastructureVisible },
			{
				object: mapNationLabels,
				visible: labelMode.nations || labelMode.dynasty,
			},
			{
				object: mapNationScripts,
				visible: labelMode.script && (labelMode.nations || labelMode.dynasty),
			},
			{ object: mapSettlementLabels, visible: labelMode.settlements },
			{ object: mapCultureLabels, visible: labelMode.culture },
			{ object: mapHeritageLabels, visible: labelMode.heritage },
			{ object: mapSelectedProvinceBorder, visible: false },
			{ object: mapMeasureLine, visible: false },
			{ object: mapMeasureDots, visible: false },
			{ object: mapPathfindingLine, visible: false },
			{ object: mapPathfindingDots, visible: false },
			{ object: pulseMap, visible: false },
		]
	}

	function rebuildTerrain() {
		if (!currentWorld) return
		disposeObject3D(scene, terrainMesh)
		disposeObject3D(scene, mapMesh)
		disposeObject3D(scene, mapOccupationOverlay)
		disposeGroup(scene, mapSolarTerminator)
		terrainMesh = null
		mapMesh = null
		mapOccupationOverlay = null
		mapSolarTerminator = null
		const terrainBuild = buildTerrainMesh(
			currentWorld,
			currentColorMode,
			currentRegionColors,
			elevationVisible,
		)
		terrainMesh = terrainBuild.mesh
		terrainFaceToRegion = terrainBuild.faceToRegion
		const mapBuild = buildMapMesh(
			currentWorld,
			currentColorMode,
			currentRegionColors,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
		)
		mapMesh = mapBuild.mesh
		mapFaceToRegion = mapBuild.faceToRegion
		globeGroup.add(terrainMesh)
		scene.add(mapMesh)
		reapplyMeshOverlayState({
			world: currentWorld,
			colorMode: currentColorMode,
			regionColors: currentRegionColors,
			occupationOverlay: currentOccupationOverlay,
			terrainMesh,
			terrainFaceToRegion,
			mapMesh,
			mapFaceToRegion,
			mapCenterLongitudeDeg: currentMapCenterLongitudeDeg,
			mapProjectionLatitudeDeg: currentMapProjectionLatitudeDeg,
		})
		syncMapLighting()
		if (currentOccupationOverlay) {
			mapOccupationOverlay = buildMapOccupationOverlay(
				mapMesh,
				currentOccupationOverlay,
				mapFaceToRegion,
				currentMapCenterLongitudeDeg,
				currentMapProjectionLatitudeDeg,
			)
			if (mapOccupationOverlay) {
				addMapSlideClones(mapOccupationOverlay)
				scene.add(mapOccupationOverlay)
			}
		}
		rebuildOverlays()
		setViewMode(currentViewMode)
	}

	function updateWorld(world: SerializedGenesisWorld | null) {
		if (currentWorld !== world) {
			heritageScripts = null
			disposeScriptTextureCache(nationScriptTextureCache)
			pendingNationScriptTextureQueue = null
		}
		if (!world) {
			currentWorld = null
			hoveredRegion = -1
			disposeObject3D(scene, terrainMesh)
			disposeObject3D(scene, mapMesh)
			disposeObject3D(scene, mapOccupationOverlay)
			terrainMesh = null
			mapMesh = null
			mapOccupationOverlay = null
			rebuildOverlays()
			emitHover(null)
			return
		}
		const geometryUnchanged =
			!!currentWorld &&
			currentWorld.mesh === world.mesh &&
			currentWorld.elevation === world.elevation &&
			currentWorld.elevation_km === world.elevation_km &&
			currentWorld.provinces?.regionProvince === world.provinces?.regionProvince
		currentWorld = world
		if (geometryUnchanged) {
			rebuildNationBorders()
			rebuildSelectedProvinceBorder()
			return
		}
		rebuildTerrain()
	}

	function setColorMode(mode: ColorMode) {
		if (mode === currentColorMode) return
		currentColorMode = mode
		applyWaterMaterialForMode(mode)
		refreshMeshColors()
	}

	function setRegionColors(colors: Float32Array | null) {
		if (currentRegionColors === colors) return
		currentRegionColors = colors
		refreshMeshColors()
	}

	function setDisplayColors(mode: ColorMode, colors: Float32Array | null) {
		if (mode === currentColorMode && currentRegionColors === colors) return
		currentColorMode = mode
		currentRegionColors = colors
		applyWaterMaterialForMode(mode)
		refreshMeshColors()
	}

	function setOccupationOverlay(overlay: Float32Array | null) {
		if (currentOccupationOverlay === overlay) return
		currentOccupationOverlay = overlay
		if (!recolorMeshesInPlace()) {
			rebuildTerrain()
			return
		}
		updateOverlayVisibility()
	}

	function setHoveredRegion(region: number | null) {
		hoveredRegion = region ?? -1
	}

	function setNationBordersVisible(visible: boolean) {
		if (nationBordersVisible === visible) return
		nationBordersVisible = visible
		if (
			shouldRebuildNationBordersForVisibilityChange({
				nextVisible: visible,
				hasGlobeOverlay: globeNationBorders !== null,
				hasMapOverlay: mapNationBorders !== null,
			})
		) {
			rebuildNationBorders()
			return
		}
		updateOverlayVisibility()
	}

	function setLandNationBordersVisible(visible: boolean) {
		if (landNationBordersVisible === visible) return
		landNationBordersVisible = visible
		if (
			shouldRebuildNationBordersForVisibilityChange({
				nextVisible: visible,
				hasGlobeOverlay: globeLandNationBorders !== null,
				hasMapOverlay: mapLandNationBorders !== null,
			})
		) {
			rebuildNationBorders()
			return
		}
		updateOverlayVisibility()
	}

	function setSelectedProvince(provinceId: number | null) {
		selectedProvince = provinceId ?? -1
		rebuildSelectedProvinceBorder()
	}

	function focusOnRegion(region: number, opts?: { durationMs?: number }) {
		if (!currentWorld) return
		const targets = getRegionFocusTargets({
			meshXYZ: currentWorld.mesh.r_xyz,
			numRegions: currentWorld.mesh.numRegions,
			region,
			centerLongitudeDeg: currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
			mapOffsetX: mapMesh?.position.x ?? 0,
			mapOffsetY: mapMesh?.position.y ?? 0,
			minDistance: controls.minDistance,
		})
		if (!targets) return

		focusTween = {
			mode: currentViewMode,
			t0: performance.now(),
			duration: opts?.durationMs ?? 700,
			globeFrom: camera.position.clone(),
			globeTo: new THREE.Vector3(...targets.globeTarget),
			mapFromX: mapCamera.position.x,
			mapFromY: mapCamera.position.y,
			mapToX: targets.mapToX,
			mapToY: targets.mapToY,
			mapFromZoom: mapCamera.zoom,
			mapToZoom: targets.mapToZoom,
		}
		if (currentViewMode === "globe") controls.enabled = false
		else mapControls.enabled = false
		syncAnimationState()
		requestRender()
	}

	function focusOnNation(nationId: number, opts?: { durationMs?: number }) {
		if (!currentWorld?.nations || !currentWorld.provinces) return
		if (nationId < 0) return
		setSelectedProvince(null)
		// `nationId` from the UI is actually a sovereign province index
		// (see GenesisView click handler — assignment = sovereign).
		const province = nationId
		if (province >= currentWorld.provinces.count) return
		const region = currentWorld.provinces.seeds[province]
		if (region < 0) return
		focusOnRegion(region, opts)
		startBorderPulse(province)
	}

	function focusOnProvince(provinceId: number, opts?: { durationMs?: number }) {
		if (!currentWorld?.provinces) return
		if (provinceId < 0 || provinceId >= currentWorld.provinces.count) {
			setSelectedProvince(null)
			return
		}
		setSelectedProvince(provinceId)
		const region = currentWorld.provinces.seeds[provinceId]
		if (region < 0) {
			setSelectedProvince(null)
			return
		}
		focusOnRegion(region, opts)
		startBorderPulse(provinceId, "province")
	}

	function clearPulse() {
		disposeObject3D(scene, pulseGlobe)
		disposeObject3D(scene, pulseMap)
		pulseGlobe = null
		pulseMap = null
		pulseMaterials = []
		pulse = null
	}

	function makeThickPulseLine(
		positions: number[],
		linewidth = 4,
	): LineSegments2 | null {
		if (positions.length === 0) return null
		const geom = new LineSegmentsGeometry()
		geom.setPositions(positions)
		const w = canvas.clientWidth || 1
		const h = canvas.clientHeight || 1
		const mat = new LineMaterial({
			color: 0xffffff,
			linewidth,
			resolution: new THREE.Vector2(w, h),
			transparent: true,
			opacity: 0,
			depthWrite: false,
			depthTest: false,
		})
		pulseMaterials.push(mat)
		const line = new LineSegments2(geom, mat)
		line.computeLineDistances()
		line.renderOrder = 998
		return line
	}

	function startBorderPulse(
		province: number,
		target: "nation" | "province" = "nation",
	) {
		clearPulse()
		if (!currentWorld) return
		const lineWidth = target === "province" ? 5 : 4
		const globePositions =
			target === "province"
				? collectProvinceBorderGlobePositions(
						currentWorld,
						province,
						0.003,
						elevationVisible,
					)
				: (() => {
						if (!currentWorld.nations) return []
						const nation = currentWorld.nations.assignment[province]
						return nation < 0
							? []
							: collectNationBorderGlobePositions(
									currentWorld,
									nation,
									0.003,
									elevationVisible,
								)
					})()
		const mapPositions =
			target === "province"
				? collectProvinceBorderMapPositions(
						currentWorld,
						province,
						currentMapCenterLongitudeDeg,
						currentMapProjectionLatitudeDeg,
						0.004,
					)
				: (() => {
						if (!currentWorld.nations) return []
						const nation = currentWorld.nations.assignment[province]
						return nation < 0
							? []
							: collectNationBorderMapPositions(
									currentWorld,
									nation,
									currentMapCenterLongitudeDeg,
									currentMapProjectionLatitudeDeg,
									0.001,
								)
					})()
		pulseGlobe = makeThickPulseLine(globePositions, lineWidth)
		pulseMap = makeThickPulseLine(mapPositions, lineWidth)
		if (!pulseGlobe && !pulseMap) return
		if (pulseGlobe) {
			pulseGlobe.visible = currentViewMode === "globe"
			globeGroup.add(pulseGlobe)
		}
		if (pulseMap) {
			pulseMap.visible = currentViewMode === "map"
			if (mapMesh) pulseMap.position.copy(mapMesh.position)
			scene.add(pulseMap)
		}
		pulse = {
			t0: performance.now(),
			duration: 1200,
			clearSelectedProvince: target === "province",
		}
		syncAnimationState()
		requestRender()
	}

	function stepPulse() {
		if (!pulse) return
		const u = (performance.now() - pulse.t0) / pulse.duration
		if (u >= 1) {
			const clearSelectedProvince = pulse.clearSelectedProvince
			clearPulse()
			if (clearSelectedProvince) setSelectedProvince(null)
			syncAnimationState()
			return
		}
		const op = 0.9 * Math.abs(Math.sin(u * 2 * Math.PI))
		for (const m of pulseMaterials) m.opacity = op
	}

	function stepFocusTween() {
		if (!focusTween) return
		const u = Math.min(
			1,
			(performance.now() - focusTween.t0) / focusTween.duration,
		)
		const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
		if (focusTween.mode === "globe") {
			camera.position.lerpVectors(
				focusTween.globeFrom,
				focusTween.globeTo,
				eased,
			)
		} else {
			mapCamera.position.x =
				focusTween.mapFromX + (focusTween.mapToX - focusTween.mapFromX) * eased
			mapCamera.position.y =
				focusTween.mapFromY + (focusTween.mapToY - focusTween.mapFromY) * eased
			mapCamera.zoom =
				focusTween.mapFromZoom +
				(focusTween.mapToZoom - focusTween.mapFromZoom) * eased
			mapCamera.updateProjectionMatrix()
			mapControls.target.set(mapCamera.position.x, mapCamera.position.y, 0)
		}
		if (u >= 1) {
			const mode = focusTween.mode
			focusTween = null
			if (mode === "globe") controls.enabled = currentViewMode === "globe"
			else mapControls.enabled = currentViewMode === "map"
			syncAnimationState()
		}
	}

	function stepSolarSystemFocusTween() {
		if (!solarSystemFocusTween) return
		const u = Math.min(
			1,
			(performance.now() - solarSystemFocusTween.t0) /
				solarSystemFocusTween.duration,
		)
		const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
		camera.position.lerpVectors(
			solarSystemFocusTween.camFrom,
			solarSystemFocusTween.camTo,
			eased,
		)
		controls.target.lerpVectors(
			solarSystemFocusTween.targetFrom,
			solarSystemFocusTween.targetTo,
			eased,
		)
		if (u >= 1) {
			solarSystemFocusTween = null
			syncAnimationState()
		}
	}

	const SOLAR_SYSTEM_FOCUS_DISTANCE_MULTIPLIER = 6
	const SOLAR_SYSTEM_MIN_FOCUS_DISTANCE = 0.3

	function focusOnSystemBody(
		bodyIndex: number,
		moonIndex?: number,
		opts?: { durationMs?: number },
	) {
		if (!solarSystemActive) setSolarSystemActive(true)
		if (!solarSystemOverlayState) return
		const focus = solarSystemOverlayState.getBodyFocus(bodyIndex, moonIndex)
		if (!focus) return
		solarSystemTrackedFocus = { bodyIndex, moonIndex }
		solarSystemTrackedFocusPosition = focus.position.clone()
		solarSystemFocusChangeHandler?.(bodyIndex, moonIndex)
		const distance = Math.max(
			focus.radius * SOLAR_SYSTEM_FOCUS_DISTANCE_MULTIPLIER,
			SOLAR_SYSTEM_MIN_FOCUS_DISTANCE,
		)
		const dir = camera.position.clone().sub(controls.target).normalize()
		if (!Number.isFinite(dir.x) || dir.lengthSq() === 0) dir.set(0, 0, 1)
		const camTo = focus.position.clone().add(dir.multiplyScalar(distance))
		solarSystemFocusTween = {
			t0: performance.now(),
			duration: opts?.durationMs ?? 900,
			camFrom: camera.position.clone(),
			camTo,
			targetFrom: controls.target.clone(),
			targetTo: focus.position.clone(),
		}
		syncAnimationState()
	}

	function setViewMode(mode: GenesisViewMode) {
		currentViewMode = mode
		const isMap = mode === "map"
		controls.enabled = !isMap
		mapControls.enabled = isMap
		if (terrainMesh) terrainMesh.visible = !isMap
		if (mapMesh) mapMesh.visible = isMap
		waterMesh.visible = !isMap
		atmosMesh.visible = !isMap && sun.intensity > 0
		if (globeSolarTerminator) globeSolarTerminator.visible = !isMap
		if (mapSolarTerminator) mapSolarTerminator.visible = isMap
		updateOverlayVisibility()
		syncAnimationState()
	}

	function setWireframeVisible(visible: boolean) {
		if (wireframeVisible === visible) return
		wireframeVisible = visible
		rebuildOverlays()
	}

	function setGridVisible(visible: boolean) {
		if (gridVisible === visible) return
		gridVisible = visible
		rebuildOverlays()
	}

	function setGridSpacing(spacingDeg: number) {
		if (gridSpacingDeg === spacingDeg) return
		gridSpacingDeg = spacingDeg
		rebuildOverlays()
	}

	function setMapCenterLongitude(longitudeDeg: number) {
		const normalized = normalizeMapCenterLongitudeDeg(longitudeDeg)
		if (currentMapCenterLongitudeDeg === normalized) return
		currentMapCenterLongitudeDeg = normalized
		if (currentWorld) rebuildTerrain()
		else rebuildOverlays()
	}

	function setMapProjectionLatitude(latitudeDeg: number) {
		const clamped = THREE.MathUtils.clamp(latitudeDeg, -90, 90)
		if (currentMapProjectionLatitudeDeg === clamped) return
		currentMapProjectionLatitudeDeg = clamped
		if (currentWorld) rebuildTerrain()
		else rebuildOverlays()
	}

	function commitMapCenterLongitude() {
		requestRender()
	}

	function emitHover(info: GenesisHoverInfo | null) {
		hoverHandler?.(info)
	}

	function clearHover() {
		if (hoveredRegion === -1) return
		hoveredRegion = -1
		emitHover(null)
	}

	function updateHover(event: PointerEvent) {
		if (!currentWorld) {
			clearHover()
			return
		}

		const rect = canvas.getBoundingClientRect()
		const width = Math.max(rect.width, 1)
		const height = Math.max(rect.height, 1)
		pointer.x = ((event.clientX - rect.left) / width) * 2 - 1
		pointer.y = -(((event.clientY - rect.top) / height) * 2 - 1)
		raycaster.setFromCamera(
			pointer,
			currentViewMode === "map" ? mapCamera : camera,
		)

		const target = currentViewMode === "map" ? mapMesh : terrainMesh
		if (!target) {
			clearHover()
			return
		}

		const hits = raycaster.intersectObject(target, true)
		const hit = hits[0]
		if (!hit || hit.faceIndex == null) {
			clearHover()
			return
		}

		const faceToRegion =
			currentViewMode === "map" ? mapFaceToRegion : terrainFaceToRegion
		const region = faceToRegion[hit.faceIndex] ?? -1
		if (region < 0) {
			clearHover()
			return
		}

		hoveredRegion = region
		emitHover({
			region,
			clientX: event.clientX - rect.left,
			clientY: event.clientY - rect.top,
		})
	}

	if (initialWorld) {
		updateWorld(initialWorld)
	} else {
		requestRender()
	}

	function resize() {
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		camera.aspect = w / h
		camera.updateProjectionMatrix()
		updateMapCameraFrustum()
		renderer.setSize(w, h, false)
		for (const mat of riverMaterials) mat.resolution.set(w, h)
		for (const mat of pulseMaterials) mat.resolution.set(w, h)
		for (const mat of infrastructureMaterials) mat.resolution.set(w, h)
		for (const mat of nationBorderMaterials) mat.resolution.set(w, h)
		for (const mat of landNationBorderMaterials) mat.resolution.set(w, h)
		if (selectedProvince >= 0) rebuildSelectedProvinceBorder()
		requestRender()
	}

	async function exportMapPng(options: MapExportOptions): Promise<Blob> {
		if (!currentWorld || !mapMesh) {
			throw new Error("Cannot export map before a world is loaded")
		}
		const width = Math.max(1, Math.floor(options.width))
		const height = Math.max(1, Math.floor(width / 2))
		const previousCenterLongitude = currentMapCenterLongitudeDeg
		const requestedCenterLongitude = options.centerLongitudeDeg
		const shouldRecenterForExport =
			typeof requestedCenterLongitude === "number" &&
			Number.isFinite(requestedCenterLongitude) &&
			requestedCenterLongitude !== previousCenterLongitude
		if (shouldRecenterForExport) {
			setMapCenterLongitude(requestedCenterLongitude)
		}
		syncMapExportObjectPositions()
		const restoreVisibility = applyMapExportVisibility(
			buildMapExportVisibilityTargets(),
		)
		const exportCamera = new THREE.OrthographicCamera(-2, 2, 1, -1, 0.1, 100)
		exportCamera.position.set(0, 0, 5)
		exportCamera.lookAt(0, 0, 0)
		try {
			return await renderMapExportPng({
				scene,
				renderer: renderer as unknown as ExportRendererLike,
				camera: exportCamera,
				width,
				height,
				onProgress: options.onProgress,
				createRenderTarget:
					dependencies.createRenderTarget ??
					((tileWidth, tileHeight) =>
						new THREE.WebGLRenderTarget(tileWidth, tileHeight)),
				yieldToMainThread:
					dependencies.yieldToMainThread ??
					(() => new Promise((resolve) => window.setTimeout(resolve, 0))),
			})
		} finally {
			restoreVisibility()
			if (shouldRecenterForExport) {
				setMapCenterLongitude(previousCenterLongitude)
			}
			requestRender()
		}
	}

	updateMapCameraFrustum()

	let pointerDownPos: { x: number; y: number } | null = null
	function handlePointerDown(event: PointerEvent) {
		pointerDownPos = { x: event.clientX, y: event.clientY }
	}

	function handleClick(event: PointerEvent) {
		if (!clickHandler || !currentWorld) return
		if (pointerDownPos) {
			const dx = event.clientX - pointerDownPos.x
			const dy = event.clientY - pointerDownPos.y
			if (dx * dx + dy * dy > 25) return
		}
		const rect = canvas.getBoundingClientRect()
		const width = Math.max(rect.width, 1)
		const height = Math.max(rect.height, 1)
		pointer.x = ((event.clientX - rect.left) / width) * 2 - 1
		pointer.y = -(((event.clientY - rect.top) / height) * 2 - 1)
		raycaster.setFromCamera(
			pointer,
			currentViewMode === "map" ? mapCamera : camera,
		)
		const target = currentViewMode === "map" ? mapMesh : terrainMesh
		if (!target) return
		const hits = raycaster.intersectObject(target, true)
		const hit = hits[0]
		if (!hit || hit.faceIndex == null) return
		const faceToRegion =
			currentViewMode === "map" ? mapFaceToRegion : terrainFaceToRegion
		const region = faceToRegion[hit.faceIndex] ?? -1
		if (region < 0) return
		setSelectedProvince(null)
		clickHandler({
			region,
			clientX: event.clientX - rect.left,
			clientY: event.clientY - rect.top,
		})
	}

	// Double-clicking any body in the solar-system view (star, planet, or a
	// moon) recenters the orbit target on it. Returning to the planet view
	// is a deliberate action via the settings panel, not a click gesture.
	function handleSolarSystemDoubleClick(event: MouseEvent) {
		if (!solarSystemActive || !solarSystemOverlayState) return
		const rect = canvas.getBoundingClientRect()
		const width = Math.max(rect.width, 1)
		const height = Math.max(rect.height, 1)
		pointer.x = ((event.clientX - rect.left) / width) * 2 - 1
		pointer.y = -(((event.clientY - rect.top) / height) * 2 - 1)
		raycaster.setFromCamera(pointer, camera)
		const hits = raycaster.intersectObject(solarSystemOverlayState.group, true)
		const hit = hits.find((h) => h.object instanceof THREE.Mesh)
		if (!hit) return
		const target = solarSystemOverlayState.resolveHitBodyIndex(hit.object)
		if (!target) return
		// Route through focusOnSystemBody (not a one-off controls.target set)
		// so this double-click gets the same tracked-focus treatment as a GPS
		// click — otherwise the camera would stop following as soon as the
		// clock or any other slider moved the body.
		focusOnSystemBody(target.bodyIndex, target.moonIndex)
	}

	canvas.addEventListener("pointermove", updateHover)
	canvas.addEventListener("pointerleave", clearHover)
	canvas.addEventListener("pointerdown", handlePointerDown)
	canvas.addEventListener("pointerup", handleClick)
	canvas.addEventListener("dblclick", handleSolarSystemDoubleClick)
	controls.addEventListener("start", () => {
		globeControlsInteracting = true
		globeControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	controls.addEventListener("change", () => {
		globeControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	controls.addEventListener("end", () => {
		globeControlsInteracting = false
		globeControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	mapControls.addEventListener("start", () => {
		mapControlsInteracting = true
		mapControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	mapControls.addEventListener("change", () => {
		mapControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	mapControls.addEventListener("end", () => {
		mapControlsInteracting = false
		mapControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})

	function dispose() {
		renderScheduler.dispose()
		canvas.removeEventListener("pointermove", updateHover)
		canvas.removeEventListener("pointerleave", clearHover)
		canvas.removeEventListener("pointerdown", handlePointerDown)
		canvas.removeEventListener("pointerup", handleClick)
		canvas.removeEventListener("dblclick", handleSolarSystemDoubleClick)
		solarSystemOverlayState?.dispose()
		controls.dispose()
		mapControls.dispose()
		renderer.dispose()
		disposeObject3D(scene, terrainMesh)
		disposeObject3D(scene, mapMesh)
		disposeObject3D(scene, mapOccupationOverlay)
		disposeObject3D(scene, terrainWireframe)
		disposeObject3D(scene, mapWireframe)
		disposeObject3D(globeGroup, globeGrid)
		disposeObject3D(scene, mapGrid)
		disposeObject3D(globeGroup, globeThermalEquator)
		disposeObject3D(scene, mapThermalEquator)
		disposeGroup(globeGroup, globeSolarTerminator)
		disposeGroup(scene, mapSolarTerminator)
		disposeObject3D(globeGroup, globeNationBorders)
		disposeObject3D(scene, mapNationBorders)
		disposeObject3D(globeGroup, globeLandNationBorders)
		disposeObject3D(scene, mapLandNationBorders)
		disposeObject3D(scene, pulseGlobe)
		disposeObject3D(scene, pulseMap)
		disposeGroup(globeGroup, globeRivers)
		disposeGroup(scene, mapRivers)
		disposeGroup(globeGroup, globeHierarchyOverlay)
		disposeGroup(scene, mapHierarchyOverlay)
		disposeGroup(globeGroup, globeSettlements)
		disposeGroup(scene, mapSettlements)
		disposeGroup(globeGroup, globeInfrastructure)
		disposeGroup(scene, mapInfrastructure)
		disposeGroup(globeGroup, globeNationLabels)
		disposeGroup(scene, mapNationLabels)
		disposePool(nationLabelPools.globe)
		disposePool(nationLabelPools.map)
		if (globeNationScripts) globeGroup.remove(globeNationScripts)
		if (mapNationScripts) scene.remove(mapNationScripts)
		pendingNationScriptTextureQueue = null
		disposeScriptTextureCache(nationScriptTextureCache)
		disposeNationScriptPools(nationScriptPools)
		disposeGroup(globeGroup, globeSettlementLabels)
		disposeGroup(scene, mapSettlementLabels)
		disposePool(settlementLabelPools.globe)
		disposePool(settlementLabelPools.map)
		waterGeo.dispose()
		waterMat.dispose()
		atmosGeo.dispose()
		atmosMat.dispose()
		starGeo.dispose()
		starMat.dispose()
	}

	function setHoverHandler(
		handler: ((info: GenesisHoverInfo | null) => void) | null,
	) {
		hoverHandler = handler
		if (!handler) clearHover()
	}

	function setClickHandler(handler: ((info: GenesisHoverInfo) => void) | null) {
		clickHandler = handler
	}

	function setMeasureLine(
		startXYZ: [number, number, number] | null,
		endXYZ: [number, number, number] | null,
	) {
		disposeObject3D(globeGroup, globeMeasureLine)
		disposeObject3D(scene, mapMeasureLine)
		disposeObject3D(globeGroup, globeMeasureDots)
		disposeObject3D(scene, mapMeasureDots)
		globeMeasureLine = null
		mapMeasureLine = null
		globeMeasureDots = null
		mapMeasureDots = null

		if (!startXYZ) {
			requestRender()
			return
		}

		const w = canvas.clientWidth || 1
		const h = canvas.clientHeight || 1
		const globeOverlay = buildGlobeMeasurementOverlay(
			startXYZ,
			endXYZ,
			currentViewMode,
			[w, h],
		)
		globeMeasureLine = globeOverlay.line
		globeMeasureDots = globeOverlay.dots
		if (globeMeasureLine) globeGroup.add(globeMeasureLine)
		globeGroup.add(globeMeasureDots)

		const mapOverlay = buildMapMeasurementOverlay(
			startXYZ,
			endXYZ,
			currentViewMode,
			[w, h],
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
		)
		mapMeasureLine = mapOverlay.line
		mapMeasureDots = mapOverlay.dots
		if (mapMeasureLine) {
			if (mapMesh) mapMeasureLine.position.copy(mapMesh.position)
			addMapSlideClones(mapMeasureLine)
			scene.add(mapMeasureLine)
		}
		if (mapMesh) mapMeasureDots.position.copy(mapMesh.position)
		addMapSlideClones(mapMeasureDots)
		scene.add(mapMeasureDots)
		requestRender()
	}

	function setPathfindingOverlay(
		pathRegions: number[] | null,
		startXYZ: [number, number, number] | null,
		endXYZ: [number, number, number] | null,
	) {
		disposeObject3D(globeGroup, globePathfindingLine)
		disposeObject3D(scene, mapPathfindingLine)
		disposeObject3D(globeGroup, globePathfindingDots)
		disposeObject3D(scene, mapPathfindingDots)
		globePathfindingLine = null
		mapPathfindingLine = null
		globePathfindingDots = null
		mapPathfindingDots = null

		if (!startXYZ || !currentWorld) {
			requestRender()
			return
		}

		const r_xyz = currentWorld.mesh.r_xyz
		const elevation = currentWorld.elevation
		const w = canvas.clientWidth || 1
		const h = canvas.clientHeight || 1

		const globeOverlay = buildGlobePathfindingOverlay(
			pathRegions,
			startXYZ,
			endXYZ,
			r_xyz,
			elevation,
			currentViewMode,
			[w, h],
		)
		globePathfindingLine = globeOverlay.line as LineSegments2 | null
		globePathfindingDots = globeOverlay.dots
		if (globePathfindingLine) globeGroup.add(globePathfindingLine)
		globeGroup.add(globePathfindingDots)

		const mapOverlay = buildMapPathfindingOverlay(
			pathRegions,
			startXYZ,
			endXYZ,
			r_xyz,
			elevation,
			currentViewMode,
			[w, h],
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
		)
		mapPathfindingLine = mapOverlay.line as LineSegments2 | null
		mapPathfindingDots = mapOverlay.dots
		if (mapPathfindingLine) {
			if (mapMesh) mapPathfindingLine.position.copy(mapMesh.position)
			addMapSlideClones(mapPathfindingLine)
			scene.add(mapPathfindingLine)
		}
		if (mapMesh) mapPathfindingDots.position.copy(mapMesh.position)
		addMapSlideClones(mapPathfindingDots)
		scene.add(mapPathfindingDots)
		requestRender()
	}

	function projectToScreen(
		xyz: [number, number, number],
		lonOffsetRad = 0,
	): [number, number] | null {
		const cam = currentViewMode === "map" ? mapCamera : camera
		const v = new THREE.Vector3(...xyz)
		if (currentViewMode === "map") {
			const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
			const projection = createMapProjection(
				currentMapCenterLongitudeDeg,
				currentMapProjectionLatitudeDeg,
			)
			const projected = projection.projectCartesian(
				v.x / len,
				v.y / len,
				v.z / len,
			)
			const mapPoint = projection.projectRadians(
				projected.lon + lonOffsetRad,
				projected.lat,
				0.003,
			)
			v.set(mapPoint[0], mapPoint[1], mapPoint[2])
			if (mapMesh) v.add(mapMesh.position)
		} else {
			v.normalize().multiplyScalar(1.005)
			globeGroup.updateWorldMatrix(true, false)
			v.applyMatrix4(globeGroup.matrixWorld)
		}
		v.project(cam)
		if (v.z > 1) return null
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h]
	}

	function setThermalEquator(points: [number, number][] | null) {
		thermalEquatorPoints = points
		rebuildOverlays()
	}

	function setWindArrows(data: WindArrowData | null) {
		windArrowData = data
		rebuildOverlays()
	}

	function setRivers(data: RiverData | null) {
		riverData = data
		rebuildOverlays()
	}

	function setRiversVisible(visible: boolean) {
		if (riversVisible === visible) return
		riversVisible = visible
		rebuildOverlays()
	}

	// Sun is fixed at +X. The globe spins (Z) for time-of-day and tilts (Y)
	// for obliquity. orbitGroup gets the obliquity tilt only so orbit rings
	// stay in the ecliptic plane regardless of the planet's rotation.
	const SUN_DIST = 10
	const Y_AXIS = new THREE.Vector3(0, 1, 0)
	const Z_AXIS = new THREE.Vector3(0, 0, 1)
	sun.position.set(SUN_DIST, 0, 0)
	currentSunDirection.set(1, 0, 0)
	atmosMat.uniforms.sunDirection.value.set(1, 0, 0)

	function applyGlobeOrientation(subSolarLatRad: number, spinAngle: number) {
		// Obliquity: north pole tips toward sun (+X) by subSolarLatRad → Y rotation
		const obliquityQ = new THREE.Quaternion().setFromAxisAngle(
			Y_AXIS,
			subSolarLatRad,
		)
		// Spin: planet rotates around its own pole (Z) for time-of-day
		const spinQ = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, spinAngle)
		// Globe = obliquity then spin (spin is in globe-local space)
		globeGroup.quaternion.copy(obliquityQ).multiply(spinQ)
		// Orbit rings: obliquity tilt only, no spin
		orbitGroup.quaternion.copy(obliquityQ)
		// Sun direction in globe-local space for the solar terminator
		currentLocalSunDirection
			.copy(currentSunDirection)
			.applyQuaternion(globeGroup.quaternion.clone().invert())
	}

	/**
	 * Position sun from month (season) and time-of-day (planet spin).
	 * month 0 = equinox, 1-12 = Jan-Dec.
	 * timeOfDay in hours [0, hoursPerDay).
	 */
	function setSunPosition(
		month: number,
		obliquityDeg: number,
		timeOfDay: number,
		hoursPerDay: number,
	) {
		const oblRad = (obliquityDeg * Math.PI) / 180
		const subSolarLat =
			month === 0 ? 0 : oblRad * Math.sin((2 * Math.PI * (month - 4)) / 12)
		// Spin angle: offset by π so noon (timeOfDay=hoursPerDay/2) faces +X (sun)
		const spinAngle = Math.PI + 2 * Math.PI * (timeOfDay / (hoursPerDay || 24))
		currentSunHoursPerDay = hoursPerDay || 24
		applyGlobeOrientation(subSolarLat, spinAngle)
		syncMapLighting()
		if (solarTerminatorVisible) rebuildSolarTerminator()
		requestRender()
	}

	function setSunDirection(
		x: number,
		y: number,
		z: number,
		hoursPerDay: number,
	) {
		// For tidally-locked mode: the sun direction is fixed in world space,
		// so the globe spin is whatever longitude places that substellar point
		// under +X.
		const subSolarLatRad = Math.asin(Math.max(-1, Math.min(1, z)))
		const spinAngle = -Math.atan2(y, x)
		currentSunHoursPerDay = hoursPerDay || 24
		applyGlobeOrientation(subSolarLatRad, spinAngle)
		syncMapLighting()
		if (solarTerminatorVisible) rebuildSolarTerminator()
		requestRender()
	}

	function setSolarTerminatorVisible(visible: boolean) {
		if (solarTerminatorVisible === visible) return
		solarTerminatorVisible = visible
		rebuildSolarTerminator()
		requestRender()
	}

	function setSolarTerminatorUseMeridiem(enabled: boolean) {
		if (solarTerminatorUseMeridiem === enabled) return
		solarTerminatorUseMeridiem = enabled
		if (solarTerminatorVisible) rebuildSolarTerminator()
		requestRender()
	}

	function syncMapLighting() {
		if (!mapMesh) return
		const mat = mapMesh.material as THREE.ShaderMaterial
		const invPi = 1 / Math.PI
		mat.uniforms.uAmbient.value.set(
			ambient.color.r * ambient.intensity * invPi,
			ambient.color.g * ambient.intensity * invPi,
			ambient.color.b * ambient.intensity * invPi,
		)
		mat.uniforms.uSunDirection.value.copy(currentLocalSunDirection).normalize()
		mat.uniforms.uSunLight.value.set(
			sun.color.r * sun.intensity * invPi,
			sun.color.g * sun.intensity * invPi,
			sun.color.b * sun.intensity * invPi,
		)
	}

	function setFullAmbient(enabled: boolean) {
		if (enabled) {
			ambient.color.set(0xffffff)
			ambient.intensity = 2.5
			sun.intensity = 0
			atmosMesh.visible = false
			waterMat.specular.set(0x000000)
		} else {
			ambient.color.set(0x667788)
			ambient.intensity = DEFAULT_AMBIENT_INTENSITY
			sun.intensity = DEFAULT_SUN_INTENSITY
			if (currentViewMode === "globe") atmosMesh.visible = true
			waterMat.specular.set(
				currentColorMode === "terrain" ? DEFAULT_WATER_SPECULAR : 0x000000,
			)
		}
		syncMapLighting()
		requestRender()
	}

	function setHierarchyOverlay(
		world: SerializedGenesisWorld | null,
		selectedNationId: number,
	) {
		hierarchyOverlayWorld = world
		hierarchyOverlayNationId = selectedNationId
		rebuildHierarchyOverlay()
	}

	function setSettlements(urbanPop: Float32Array | null) {
		if (
			!urbanPop ||
			!currentWorld?.provinces ||
			!currentWorld.settlementRegions
		) {
			settlementUrbanPop = null
			settlementLocations = null
			rebuildSettlementOverlay()
			return
		}
		settlementLocations = currentWorld.settlementRegions
		settlementUrbanPop = urbanPop
		settlementsDirty = false
		rebuildSettlementOverlay()
	}

	function setSettlementsVisible(visible: boolean) {
		if (settlementsVisible === visible) return
		settlementsVisible = visible
		if (
			visible &&
			settlementsDirty &&
			settlementUrbanPop &&
			currentWorld?.provinces &&
			currentWorld.settlementRegions
		) {
			settlementLocations = currentWorld.settlementRegions
			settlementsDirty = false
		}
		rebuildSettlementOverlay()
	}

	function setInfrastructure(edges: SerializedNetwork | null) {
		infrastructureData = edges
		rebuildTradeRouteOverlay()
	}

	function setInfrastructureVisible(visible: boolean) {
		if (infrastructureVisible === visible) return
		infrastructureVisible = visible
		rebuildTradeRouteOverlay()
	}

	function setLabelMode(mode: LabelMode) {
		if (labelMode === mode) return
		labelMode = mode
		rebuildNationLabels()
		rebuildSettlementLabels()
		rebuildCultureLabels()
		rebuildHeritageLabels()
	}

	function setNationNames(names: string[] | null) {
		nationNames = names
		rebuildNationLabels()
	}

	function setDynastyNames(names: string[] | null) {
		dynastyNames = names
		rebuildNationLabels()
	}

	function setCultureNames(names: string[] | null) {
		cultureNames = names
		rebuildCultureLabels()
	}

	function setHeritageNames(names: string[] | null) {
		heritageNames = names
		rebuildHeritageLabels()
	}

	function setSettlementNames(names: string[] | null) {
		settlementLabelNames = names
		rebuildSettlementLabels()
	}

	function setElevationVisible(visible: boolean) {
		if (elevationVisible === visible) return
		elevationVisible = visible
		if (currentWorld) rebuildTerrain()
		rebuildSolarTerminator()
		rebuildNationLabels()
		rebuildSettlementLabels()
		rebuildCultureLabels()
		rebuildHeritageLabels()
	}

	// Moon orbit overlay
	let moonOrbitState: MoonOrbitState | null = null
	let currentMoonOrbitDay = 0
	let currentSolarSystemDay = 0
	let currentSolarSystemSpinHours = 0

	function disposeMoonOrbitOverlay() {
		if (!moonOrbitState) return
		orbitGroup.remove(moonOrbitState.group)
		moonOrbitState.dispose()
		moonOrbitState = null
	}

	function setMoonOrbitOverlay(
		moons: import("@/model/celestial/moons/moon-types").MoonBody[] | null,
		planetRadiusKm: number,
		hoursPerDay: number,
		tideLock: import("@/model/celestial/moons/moon-types").TideLock | null,
		day: number,
		showGrid: boolean,
		gridSpacing: number,
		showEllipticalOrbits: boolean,
	) {
		currentMoonOrbitDay = day
		disposeMoonOrbitOverlay()
		if (moons && moons.length > 0) {
			moonOrbitState = buildMoonOrbitOverlay(
				moons,
				planetRadiusKm,
				hoursPerDay,
				tideLock,
				day,
				showGrid,
				gridSpacing,
				showEllipticalOrbits,
			)
			orbitGroup.add(moonOrbitState.group)
		}
		requestRender()
	}

	function updateMoonOrbitOverlay(
		moons: import("@/model/celestial/moons/moon-types").MoonBody[] | null,
		planetRadiusKm: number,
		hoursPerDay: number,
		tideLock: import("@/model/celestial/moons/moon-types").TideLock | null,
		showGrid: boolean,
		gridSpacing: number,
		showEllipticalOrbits: boolean,
	) {
		setMoonOrbitOverlay(
			moons,
			planetRadiusKm,
			hoursPerDay,
			tideLock,
			currentMoonOrbitDay,
			showGrid,
			gridSpacing,
			showEllipticalOrbits,
		)
	}

	function updateMoonOrbitDay(day: number) {
		currentMoonOrbitDay = day
		moonOrbitState?.setDay(day)
		requestRender()
	}

	function setSolarSystemActive(active: boolean) {
		if (solarSystemActive === active) return
		solarSystemActive = active
		solarSystemGroup.visible = active
		globeGroup.visible = !active
		orbitGroup.visible = !active
		// The globe's own sun/ambient lights are scene-wide and would otherwise
		// wash out the solar-system overlay's star light, making its Daylight
		// toggle invisible — suppress them while this view is active.
		ambient.visible = !active
		sun.visible = !active
		if (active) {
			savedCameraPosition = camera.position.clone()
			savedControlsTarget = controls.target.clone()
			controls.target.set(0, 0, 0)
			const dist = solarSystemOverlayState?.suggestedCameraDistance ?? 6
			controls.minDistance = 0.1
			controls.maxDistance = dist * 4
			setCameraFarForMaxDistance(controls.maxDistance)
			camera.position.set(0, 0, dist)
		} else {
			if (savedCameraPosition) camera.position.copy(savedCameraPosition)
			if (savedControlsTarget) controls.target.copy(savedControlsTarget)
			controls.minDistance = DEFAULT_CONTROLS_MIN_DISTANCE
			controls.maxDistance = DEFAULT_CONTROLS_MAX_DISTANCE
			camera.far = DEFAULT_CAMERA_FAR
			camera.updateProjectionMatrix()
		}
		controls.update()
		requestRender()
		syncAnimationState()
	}

	function setSolarSystemOverlay(params: SolarSystemOverlayParams | null) {
		if (solarSystemOverlayState) {
			solarSystemGroup.remove(solarSystemOverlayState.group)
			solarSystemOverlayState.dispose()
			solarSystemOverlayState = null
		}
		if (params) {
			solarSystemOverlayState = buildSolarSystemOverlay(params)
			solarSystemGroup.add(solarSystemOverlayState.group)
			if (solarSystemActive) {
				controls.maxDistance =
					solarSystemOverlayState.suggestedCameraDistance * 4
				setCameraFarForMaxDistance(controls.maxDistance)
			}
		}
		// The overlay just got torn down and rebuilt from scratch (this fires
		// on nearly every slider tweak, not just clock changes) — without
		// this, the camera would keep looking at wherever the tracked body
		// used to be instead of following it into the new overlay.
		reapplyTrackedSolarSystemFocus()
		requestRender()
	}

	function updateSolarSystemOverlay(params: SolarSystemOverlayParams | null) {
		if (!params) {
			setSolarSystemOverlay(null)
			return
		}
		if (
			!solarSystemOverlayState ||
			!solarSystemOverlayState.updateBodies(params.bodies)
		) {
			setSolarSystemOverlay({
				...params,
				initialDay: currentSolarSystemDay,
			})
		}
		solarSystemOverlayState?.setSpinHours(currentSolarSystemSpinHours)
		reapplyTrackedSolarSystemFocus()
		requestRender()
	}

	function reapplyTrackedSolarSystemFocus() {
		if (!solarSystemTrackedFocus || !solarSystemOverlayState) return
		const focus = solarSystemOverlayState.getBodyFocus(
			solarSystemTrackedFocus.bodyIndex,
			solarSystemTrackedFocus.moonIndex,
		)
		if (!focus) return
		if (solarSystemTrackedFocusPosition) {
			const delta = focus.position.clone().sub(solarSystemTrackedFocusPosition)
			camera.position.add(delta)
			controls.target.add(delta)
		}
		solarSystemTrackedFocusPosition = focus.position.clone()
	}

	function updateSolarSystemDay(day: number) {
		currentSolarSystemDay = day
		solarSystemOverlayState?.setDay(day)
		reapplyTrackedSolarSystemFocus()
		requestRender()
	}

	function setSolarSystemSpinHours(hours: number) {
		currentSolarSystemSpinHours = hours
		solarSystemOverlayState?.setSpinHours(hours)
		reapplyTrackedSolarSystemFocus()
		requestRender()
	}

	function setSolarSystemFocusChangeHandler(
		handler: ((bodyIndex: number, moonIndex?: number) => void) | null,
	) {
		solarSystemFocusChangeHandler = handler
	}

	return {
		dispose,
		resize,
		updateWorld,
		exportMapPng,
		setColorMode,
		setRegionColors,
		setDisplayColors,
		setOccupationOverlay,
		setHoveredRegion,
		setNationBordersVisible,
		setLandNationBordersVisible,
		setViewMode,
		setWireframeVisible,
		setGridVisible,
		setGridSpacing,
		setMapCenterLongitude,
		setMapProjectionLatitude,
		commitMapCenterLongitude,
		setHoverHandler,
		setClickHandler,
		setMeasureLine,
		setPathfindingOverlay,
		projectToScreen,
		getGlobeCameraDir(): [number, number, number] | null {
			if (currentViewMode !== "globe") return null
			const p = camera.position
			if (p.x === 0 && p.y === 0 && p.z === 0) return null
			// Transform camera world position into globe-body space so the
			// dot-product visibility test matches particle positions (body space).
			globeGroup.updateWorldMatrix(true, false)
			const bodyPos = p
				.clone()
				.applyMatrix4(globeGroup.matrixWorld.clone().invert())
			return [bodyPos.x, bodyPos.y, bodyPos.z]
		},
		setThermalEquator,
		setWindArrows,
		setRivers,
		setRiversVisible,
		setHierarchyOverlay,
		setSettlements,
		setSettlementsVisible,
		setInfrastructure,
		setInfrastructureVisible,
		setLabelMode,
		setNationNames,
		setDynastyNames,
		setCultureNames,
		setHeritageNames,
		setSettlementNames,
		setElevationVisible,
		setSunPosition,
		setSunDirection,
		setSolarTerminatorUseMeridiem,
		setSolarTerminatorVisible,
		setAtmospherePressure,
		setFullAmbient,
		focusOnNation,
		focusOnProvince,
		setMoonOrbitOverlay,
		updateMoonOrbitOverlay,
		updateMoonOrbitDay,
		setSolarSystemActive,
		setSolarSystemOverlay,
		updateSolarSystemOverlay,
		updateSolarSystemDay,
		setSolarSystemSpinHours,
		focusOnSystemBody,
		setSolarSystemFocusChangeHandler,
	}
}
