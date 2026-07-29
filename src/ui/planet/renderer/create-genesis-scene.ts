import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { MoonBody } from "@/model/celestial/moons/types"
import { DATA_SOURCE } from "@/model/history/earth/data-source"
import type {
	Eu4ProvinceBorderGeometry,
	Eu4ProvinceFillGeometry,
} from "@/model/history/earth/data-source/types"
import { MESH } from "@/model/mesh"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { HeritageScript } from "@/model/society/script"
import { SCRIPT } from "@/model/society/script"
import type {
	SerializedGenesisWorld,
	SerializedNetwork,
} from "@/model/worker-protocol/types"
import { type ColorMode, VEGETATION_WATER_BLUE } from "@/ui/planet/colors"
import type { LabelMode } from "@/ui/planet/controls/OverlayControls"
import { boostCloudAlphaMap } from "@/ui/planet/renderer/cloud-material"
import {
	buildCoastlineGlobeLines,
	buildCoastlineMapLines,
	type CoastlineLineData,
	deriveCoastlineFromWorld,
	loadCoastlineLines,
} from "@/ui/planet/renderer/coastline-overlay"
import { disposeGroup, disposeObject3D } from "@/ui/planet/renderer/disposal"
import {
	buildEu4NationBorderContext,
	buildEu4NationBordersGlobe,
	buildEu4NationBordersMap,
	buildEu4SelectedProvinceBorderGlobe,
	buildEu4SelectedProvinceBorderMap,
	buildRealIdToNation,
	collectEu4NationBorderGlobePositions,
	collectEu4NationBorderMapPositions,
	collectEu4ProvinceBorderGlobePositions,
	collectEu4ProvinceBorderMapPositions,
} from "@/ui/planet/renderer/eu4-nation-border-overlay"
import {
	buildEu4NationFillGlobe,
	buildEu4NationFillMap,
	buildEu4OccupationStripesGlobe,
	buildEu4OccupationStripesMap,
	type ColorForRawId,
	type ElevationKmForLonLat,
	updateEu4NationFillGlobeColors,
	updateEu4NationFillMapColors,
} from "@/ui/planet/renderer/eu4-nation-fill-overlay"
import { getRegionFocusTargets } from "@/ui/planet/renderer/focus"
import {
	addMapSlideClones,
	applyMapExportVisibility,
	normalizeMapCenterLongitudeDeg,
	renderMapExportPng,
} from "@/ui/planet/renderer/map-export"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import {
	buildGlobeMeasurementOverlay,
	buildMapMeasurementOverlay,
} from "@/ui/planet/renderer/measurement-overlay"
import {
	applyFaceRegionColors,
	applyMapColorModeColors,
	applyTerrainColorModeColors,
	buildMapMesh,
	buildMapWireframe,
	buildTerrainMesh,
	buildTerrainWireframe,
} from "@/ui/planet/renderer/mesh-builders"
import {
	buildMoonOrbitOverlay,
	type MoonOrbitState,
} from "@/ui/planet/renderer/moon-orbit-overlay"
import { shouldRebuildNationBordersForVisibilityChange } from "@/ui/planet/renderer/nation-border-visibility"
import {
	buildGlobeHeritageLabels,
	buildGlobeNationLabels,
	buildGlobePartitionLabels,
	buildGlobeSettlementLabels,
	buildMapHeritageLabels,
	buildMapNationLabels,
	buildMapPartitionLabels,
	buildMapSettlementLabels,
	createNationLabelPools,
	createSettlementLabelPools,
	disposePool,
	EARTH_HISTORY_LABEL_SCALE_CURVE,
	updateGlobeLabelOrientations,
} from "@/ui/planet/renderer/nation-label-overlay"
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
} from "@/ui/planet/renderer/nation-script-overlay"
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
} from "@/ui/planet/renderer/overlay-builders"
import {
	buildGlobePathfindingOverlay,
	buildMapPathfindingOverlay,
} from "@/ui/planet/renderer/pathfinding-overlay"
import {
	buildSelectedProvinceBorderGlobe,
	buildSelectedProvinceBorderMap,
	collectProvinceBorderGlobePositions,
	collectProvinceBorderMapPositions,
} from "@/ui/planet/renderer/province-overlay"
import { createRenderScheduler } from "@/ui/planet/renderer/render-scheduler"
import {
	buildGlobeRealSettlements,
	buildGlobeSettlements,
	buildMapRealSettlements,
	buildMapSettlements,
} from "@/ui/planet/renderer/settlement-overlay"
import {
	buildSolarSystemOverlay,
	type SolarSystemOverlayParams,
	type SolarSystemOverlayState,
} from "@/ui/planet/renderer/solar-system-overlay"
import {
	buildSolarTerminatorRingPoints,
	createSolarTerminatorBand,
	createSolarTerminatorLabelSprite,
	getSolarTerminatorLabelText,
	projectSolarTerminatorPointsToMap,
} from "@/ui/planet/renderer/solar-terminator"
import {
	buildGlobeTradeRoutes,
	buildMapTradeRoutes,
} from "@/ui/planet/renderer/trade-route-overlay"
import type {
	GenesisHoverInfo,
	GenesisScene,
	GenesisViewMode,
	OrgHighlightSpec,
	RiverData,
	WindArrowData,
} from "@/ui/planet/renderer/types"

export const SOLAR_TERMINATOR_ALTITUDE_DEG = -0.833
const SOLAR_TERMINATOR_LINE_COLOR = 0xf8fafc
const SOLAR_TERMINATOR_HAIRLINE_COLOR = 0x0f172a
const SOLAR_TERMINATOR_BAND_COLOR = 0xe2e8f0
const SOLAR_TERMINATOR_RADIUS = 1.02
const SOLAR_TERMINATOR_ELEVATED_RADIUS = 1.05
const SOLAR_TERMINATOR_BAND_HALF_WIDTH = 0.008
const SOLAR_TERMINATOR_LABEL_COUNT = 24
export const SOLAR_TERMINATOR_LABEL_RENDER_ORDER = 1002
const GLOBE_CLOUD_RADIUS = 1.035

const globeCloudTextureLoader = new THREE.TextureLoader()
const globeCloudTextureCache = new Map<string, THREE.Texture>()

function loadGlobeCloudTexture(texturePath: string): THREE.Texture {
	const cached = globeCloudTextureCache.get(texturePath)
	if (cached) return cached
	const texture = globeCloudTextureLoader.load(texturePath)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.userData.sharedTexture = true
	globeCloudTextureCache.set(texturePath, texture)
	return texture
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

const CONTROL_SETTLE_FRAMES = 2

interface MapExportOptions {
	width: number
	centerLongitudeDeg?: number
	onProgress?: (percent: number, label: string) => void
}

export interface ExportRenderTargetLike {
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

export interface MapExportVisibilityTarget {
	object: THREE.Object3D | null
	visible: boolean
}

interface MapExportDependencies {
	createRenderTarget?: (width: number, height: number) => ExportRenderTargetLike
	yieldToMainThread?: () => Promise<void>
}

export interface ExportRendererLike {
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

// lon/lat -> elevation_km, via nearest-mesh-region snapping (same technique
// import-heightmap.ts uses to place real river lines at the right height).
// Keyed by mesh object identity so it's built once per world's mesh, not
// once per rebuildNationBorders() call (which fires on most color-mode/
// timeline changes, far more often than the mesh itself changes).
const elevationLookupCache = new WeakMap<object, ElevationKmForLonLat>()

function buildElevationLookup(
	world: SerializedGenesisWorld | null | undefined,
): ElevationKmForLonLat | undefined {
	if (!world?.mesh || !world.elevation_km) return undefined
	let lookup = elevationLookupCache.get(world.mesh)
	if (!lookup) {
		const index = MESH.buildRegionSpatialIndex(world.mesh)
		const elevationKm = world.elevation_km
		lookup = (lonDeg, latDeg) => {
			const region = index.nearest(lonDeg, latDeg)
			return region >= 0 ? elevationKm[region] : 0
		}
		elevationLookupCache.set(world.mesh, lookup)
	}
	return lookup
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

	// Water sphere. Not added to the scene — it z-fights with the terrain
	// mesh's ocean surface, which sits at exactly the same radius (1.0)
	// whenever elevation display is off, since both are semi-transparent
	// surfaces at identical depth. That produced visible concentric rings
	// (GPU depth-buffer precision varies smoothly but non-linearly with view
	// angle across a sphere, so the z-fight winner flips in a ring pattern
	// centered on whatever point faces the camera). A radius offset avoided
	// the z-fight but the result still looked wrong, so this mesh (and the
	// code that recolors it per view mode — search "waterMat"/"waterMesh")
	// is kept around but unused rather than torn out, in case the shine
	// effect is worth rebuilding later without the z-fighting.
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

	const globeCloudGeo = new THREE.SphereGeometry(GLOBE_CLOUD_RADIUS, 64, 48)
	const globeCloudMat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 1,
		alphaTest: 0.02,
		depthWrite: false,
	})
	boostCloudAlphaMap(globeCloudMat)
	const globeCloudMesh = new THREE.Mesh(globeCloudGeo, globeCloudMat)
	globeCloudMesh.rotation.x = Math.PI / 2
	globeCloudMesh.renderOrder = 2
	globeCloudMesh.visible = false
	globeGroup.add(globeCloudMesh)

	function setGlobeCloudTexturePath(texturePath: string | null): void {
		if (!texturePath) {
			globeCloudMat.alphaMap = null
			globeCloudMat.needsUpdate = true
			globeCloudMesh.visible = false
			requestRender()
			return
		}
		globeCloudMat.alphaMap = loadGlobeCloudTexture(texturePath)
		globeCloudMat.needsUpdate = true
		globeCloudMesh.visible = false
		requestRender()
	}

	// Coastline overlay, on both the globe and the flat map. For a real
	// "Load Earth" world this is the exact Natural Earth vector data
	// (fetched once, cached, independent of any generated world). For a
	// procedurally generated world there's no real coastline to load, so
	// one is derived from the mesh's own land/ocean boundary and
	// Catmull-Rom-smoothed (see deriveCoastlineFromWorld) — computed lazily
	// (only when the overlay is actually toggled on) and cached per world
	// instance so toggling or map-longitude changes don't recompute it.
	function rebuildCoastlineOverlay() {
		disposeObject3D(globeGroup, globeCoastlineOverlay)
		disposeObject3D(scene, mapCoastlineOverlay)
		globeCoastlineOverlay = null
		mapCoastlineOverlay = null
		coastlineMaterials = []

		if (!coastlineOverlayVisible) return

		let lineData: CoastlineLineData | null
		if (currentWorld?.isEarthImport) {
			if (!cachedCoastlineData) {
				loadCoastlineLines()
					.then((data) => {
						cachedCoastlineData = data
						rebuildCoastlineOverlay()
						requestRender()
					})
					.catch((err) => {
						console.error("Failed to load coastline overlay:", err)
					})
				return
			}
			lineData = cachedCoastlineData
		} else if (currentWorld) {
			if (derivedCoastlineWorld !== currentWorld) {
				derivedCoastlineWorld = currentWorld
				derivedCoastlineData = deriveCoastlineFromWorld(currentWorld)
			}
			lineData = derivedCoastlineData
		} else {
			lineData = null
		}
		if (!lineData) return

		const w = canvas.clientWidth
		const h = canvas.clientHeight

		const globeLines = buildCoastlineGlobeLines(lineData, 1.004, [w, h])
		globeCoastlineOverlay = globeLines
		globeGroup.add(globeLines)

		const projection = createMapProjection(
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
		)
		const mapLines = buildCoastlineMapLines(lineData, projection, 0.004, [w, h])
		mapCoastlineOverlay = mapLines
		addMapSlideClones(mapLines)
		scene.add(mapLines)

		// addMapSlideClones' clones share mapLines' material instance (Three's
		// default Object3D.clone() behavior for Mesh-derived objects), so
		// updating it here also updates both slide clones.
		coastlineMaterials = [globeLines.material, mapLines.material]
		updateOverlayVisibility()
	}

	function setCoastlineOverlayVisible(visible: boolean) {
		if (coastlineOverlayVisible === visible) return
		coastlineOverlayVisible = visible
		rebuildCoastlineOverlay()
		requestRender()
	}

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
	let globeCoastlineOverlay: LineSegments2 | null = null
	let mapCoastlineOverlay: LineSegments2 | null = null
	let cachedCoastlineData: CoastlineLineData | null = null
	let derivedCoastlineWorld: SerializedGenesisWorld | null = null
	let derivedCoastlineData: CoastlineLineData | null = null
	let coastlineOverlayVisible = false
	// Real EU4 province boundary vectors, used instead of the procedural mesh's
	// own Voronoi edges for nation/province borders when world.isEarthImport.
	// Static across all Earth-imported worlds, so fetched once and reused.
	let cachedEu4BorderGeometry: Eu4ProvinceBorderGeometry | null = null
	// Real EU4 province fill polygons, paired with cachedEu4BorderGeometry --
	// see eu4-nation-fill-overlay.ts. Also static/fetched once.
	let cachedEu4FillGeometry: Eu4ProvinceFillGeometry | null = null
	let currentNationFillColorForRawId: ColorForRawId | null = null
	let globeNationFill: THREE.Mesh | null = null
	let mapNationFill: THREE.Mesh | null = null
	// Radius/projection the current fill meshes were actually built at, so a
	// rebuild triggered purely by a nation-ownership change (the common case
	// -- every timeline scrub tick creates a new currentNationFillColorForRawId
	// closure) can recolor the existing mesh in place instead of rebuilding
	// its (unchanged) position buffer from scratch. Null whenever the mesh
	// itself is null, so a stale radius never causes a wrongly-skipped rebuild.
	let globeNationFillRadius: number | null = null
	let mapNationFillParams: {
		z: number
		centerLongitudeDeg: number
		projectionLatitudeDeg: number
	} | null = null
	// Contested-province stripe overlay, drawn from the same real EU4
	// province polygons as the fill mesh above -- see eu4-nation-fill-
	// overlay.ts's buildEu4OccupationStripesGlobe/Map. Rebuilt fresh each
	// call (no in-place recolor path like the fill mesh has): contested
	// status is rare enough, and the mesh usually small enough, that this
	// hasn't needed the same optimization.
	let currentOccupationStripeColorForRawId: ColorForRawId | null = null
	let globeOccupationStripes: THREE.Mesh | null = null
	let mapOccupationStripes: THREE.Mesh | null = null
	let coastlineMaterials: LineMaterial[] = []
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
	// International organization label (HRE, Hanseatic League, ...) -- a
	// single org-name label in place of the member nations' own name labels
	// (see rebuildNationLabels' currentOrgHighlight branch). Territory
	// *coloring* is handled at region level in GenesisView's regionColors,
	// not here -- see OrgHighlightSpec's doc comment. currentOrgHighlight is
	// provided fresh each earth-history scrub tick while an organization's
	// wiki page is open (see GenesisView's organizationHighlightSpec), and
	// null the rest of the time.
	let currentOrgHighlight: OrgHighlightSpec | null = null
	const orgLabelPools = createNationLabelPools()
	const globeOrgLabel: THREE.Group | null = null
	const mapOrgLabel: THREE.Group | null = null
	// Border LINES and nation LABELS are both traced/placed from
	// currentWorld.nations (assignment for border tracing; seeds for label
	// capital anchors) independently of the fill-color path
	// (setDisplayColors/setRegionColors) -- for Earth-imported worlds
	// scrubbing the earth-history timeline this override substitutes a
	// shadow nations object sourced from the folded history state, so both
	// track the selected date instead of always reflecting the static
	// generation-time assignment. See docs/earth-history-plan.md "Map modes
	// and hover gating".
	let earthHistoryNationOverride: {
		assignment: Int32Array
		seeds: Int32Array
		names: string[]
	} | null = null
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
	let globeEu4Settlements: THREE.Group | null = null
	let mapEu4Settlements: THREE.Group | null = null
	let eu4SettlementLats: Float32Array | null = null
	let eu4SettlementLons: Float32Array | null = null
	let eu4SettlementPopulation: Float32Array | null = null
	let eu4SettlementProvinceIds: Int32Array | null = null
	let eu4CapitalProvinceIds: ReadonlySet<number> = new Set()
	let eu4SettlementIndices: number[] = []
	let eu4SettlementsVisible = false
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
	// Religion labels have no procedural equivalent (world.religions is
	// culture-indexed, not province-indexed, and the procedural UI never
	// exposed a religion label toggle) -- this overlay only ever renders
	// for Earth-imported worlds, driven by earthHistoryLabelPartitions.
	let globeReligionLabels: THREE.Group | null = null
	let mapReligionLabels: THREE.Group | null = null
	// Real culture/religion partitions (from the earth-history engine's
	// folded state) for Earth-imported worlds -- a different id space than
	// the procedural world.cultures/world.heritages, so culture/religion
	// labels are built directly via buildGlobePartitionLabels rather than
	// through a shadow `.cultures` object (see rebuildCultureLabels).
	let earthHistoryLabelPartitions: {
		culture: { assignment: Int32Array; count: number; names: string[] }
		religion: { assignment: Int32Array; count: number; names: string[] }
	} | null = null
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
		religion: false,
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
	const religionLabelPools = createNationLabelPools()
	let nationNames: string[] | null = null
	let dynastyNames: string[] | null = null
	let settlementLabelNames: string[] | null = null
	let cultureNames: string[] | null = null
	let heritageNames: string[] | null = null

	function stringArraysEqual(
		a: readonly string[] | null,
		b: readonly string[] | null,
	): boolean {
		if (a === b) return true
		if (!a || !b || a.length !== b.length) return false
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false
		}
		return true
	}

	function int32ArraysEqual(
		a: Int32Array | null,
		b: Int32Array | null,
	): boolean {
		if (a === b) return true
		if (!a || !b || a.length !== b.length) return false
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false
		}
		return true
	}

	function earthHistoryNationOverridesEqual(
		a: {
			assignment: Int32Array
			seeds: Int32Array
			names: string[]
		} | null,
		b: {
			assignment: Int32Array
			seeds: Int32Array
			names: string[]
		} | null,
	): boolean {
		if (a === b) return true
		if (!a || !b) return false
		return (
			int32ArraysEqual(a.assignment, b.assignment) &&
			int32ArraysEqual(a.seeds, b.seeds) &&
			stringArraysEqual(a.names, b.names)
		)
	}

	function earthHistoryLabelPartitionsEqual(
		a: {
			culture: { assignment: Int32Array; count: number; names: string[] }
			religion: { assignment: Int32Array; count: number; names: string[] }
		} | null,
		b: {
			culture: { assignment: Int32Array; count: number; names: string[] }
			religion: { assignment: Int32Array; count: number; names: string[] }
		} | null,
	): boolean {
		if (a === b) return true
		if (!a || !b) return false
		return (
			a.culture.count === b.culture.count &&
			a.religion.count === b.religion.count &&
			int32ArraysEqual(a.culture.assignment, b.culture.assignment) &&
			int32ArraysEqual(a.religion.assignment, b.religion.assignment) &&
			stringArraysEqual(a.culture.names, b.culture.names) &&
			stringArraysEqual(a.religion.names, b.religion.names)
		)
	}
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
			updateGlobeLabelOrientations(
				globeReligionLabels,
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
		mapSettlements = buildMapSettlements({
			world: currentWorld,
			locations: settlementLocations,
			urbanPop: settlementUrbanPop,
			centerLongitudeDeg: currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
		})
		if (globeSettlements) globeGroup.add(globeSettlements)
		if (mapSettlements) {
			addMapSlideClones(mapSettlements)
			if (mapMesh) mapSettlements.position.copy(mapMesh.position)
			scene.add(mapSettlements)
		}
		updateOverlayVisibility()
	}

	function rebuildEu4SettlementOverlay() {
		disposeGroup(globeGroup, globeEu4Settlements)
		disposeGroup(scene, mapEu4Settlements)
		globeEu4Settlements = null
		mapEu4Settlements = null
		if (
			!eu4SettlementLats ||
			!eu4SettlementLons ||
			!eu4SettlementPopulation ||
			!eu4SettlementProvinceIds ||
			eu4SettlementIndices.length === 0 ||
			!eu4SettlementsVisible
		) {
			return
		}
		globeEu4Settlements = buildGlobeRealSettlements({
			lats: eu4SettlementLats,
			lons: eu4SettlementLons,
			populations: eu4SettlementPopulation,
			provinceIds: eu4SettlementProvinceIds,
			capitalProvinceIds: eu4CapitalProvinceIds,
			indices: eu4SettlementIndices,
		})
		mapEu4Settlements = buildMapRealSettlements({
			lats: eu4SettlementLats,
			lons: eu4SettlementLons,
			populations: eu4SettlementPopulation,
			provinceIds: eu4SettlementProvinceIds,
			capitalProvinceIds: eu4CapitalProvinceIds,
			indices: eu4SettlementIndices,
			centerLongitudeDeg: currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
		})
		if (globeEu4Settlements) globeGroup.add(globeEu4Settlements)
		if (mapEu4Settlements) {
			addMapSlideClones(mapEu4Settlements)
			if (mapMesh) mapEu4Settlements.position.copy(mapMesh.position)
			scene.add(mapEu4Settlements)
		}
		updateOverlayVisibility()
	}

	function rebuildNationLabels() {
		if (currentOrgHighlight) {
			// Org map mode shows no labels at all -- neither the underlying
			// nation names/scripts nor the org's own name label (rebuildOrgLabels
			// used to build that one) -- keeping the recolored territory clean.
			if (globeNationScripts) globeGroup.remove(globeNationScripts)
			if (mapNationScripts) scene.remove(mapNationScripts)
			pendingNationScriptTextureQueue = null
			globeNationScripts = null
			mapNationScripts = null
			globeNationLabels?.clear()
			mapNationLabels?.clear()
			globeOrgLabel?.clear()
			mapOrgLabel?.clear()
			return
		}
		globeOrgLabel?.clear()
		mapOrgLabel?.clear()
		if (globeNationScripts) globeGroup.remove(globeNationScripts)
		if (mapNationScripts) scene.remove(mapNationScripts)
		pendingNationScriptTextureQueue = null
		globeNationScripts = null
		mapNationScripts = null
		// Earth-imported worlds skip procedural nation/government generation
		// entirely (see derive-province-society.ts), so currentWorld.nations
		// is genuinely undefined there -- only bail when there's neither a
		// real procedural nations object NOR an earth-history override to
		// build a shadow one from.
		if (
			!currentWorld ||
			(!currentWorld.nations && !earthHistoryNationOverride)
		) {
			globeNationLabels?.clear()
			mapNationLabels?.clear()
			return
		}
		const showNationLabels = labelMode.nations || labelMode.dynasty
		if (!showNationLabels) {
			globeNationLabels?.clear()
			mapNationLabels?.clear()
			return
		}
		// Earth-imported worlds always show real nation names when scrubbing
		// earth-history, regardless of the dynasty label toggle -- dynasty
		// data isn't part of this engine's scope (see foldedStateToNationInfo,
		// which does track rulers, just not dynastic succession trees).
		const worldForLabels = earthHistoryNationOverride
			? {
					...currentWorld,
					nations: {
						...currentWorld?.nations,
						assignment: earthHistoryNationOverride.assignment,
						seeds: earthHistoryNationOverride.seeds,
						// nationProvinceCount (nation-label-overlay.ts) uses
						// nations.size[id] directly -- without a positive-length
						// check -- as label font-scale input, only falling back to
						// scanning `assignment` when size[id] isn't a positive
						// number. Leaving the stale procedural size array in place
						// (like sovereign for borders, see rebuildNationBorders)
						// would size labels by the wrong nation's province count.
						// An empty array makes size[id] undefined for every id,
						// forcing the correct assignment-scan fallback.
						size: new Int32Array(0),
					},
				}
			: currentWorld
		const labelNames = earthHistoryNationOverride
			? earthHistoryNationOverride.names
			: labelMode.dynasty
				? dynastyNames
				: nationNames
		if (!labelNames) {
			globeNationLabels?.clear()
			mapNationLabels?.clear()
			return
		}
		// Real historical province-count distributions are far more skewed
		// than the procedural generator's (e.g. Ming's 113 provinces vs. a
		// 1-province German principality, same era) -- the default label
		// scale curve compressed large real empires together almost
		// indistinguishably, so Earth-imported worlds use a wider curve. See
		// EARTH_HISTORY_LABEL_SCALE_CURVE's doc comment.
		const labelScaleCurve = earthHistoryNationOverride
			? EARTH_HISTORY_LABEL_SCALE_CURVE
			: undefined
		globeNationLabels = buildGlobeNationLabels(
			worldForLabels,
			labelNames,
			camera,
			nationLabelPools.globe,
			labelCullingEnabled,
			elevationVisible,
			labelScaleCurve,
			globeNationLabels ?? undefined,
		)
		mapNationLabels = buildMapNationLabels(
			worldForLabels,
			labelNames,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			nationLabelPools.map,
			labelCullingEnabled,
			labelScaleCurve,
			mapNationLabels ?? undefined,
		)
		if (globeNationLabels.parent !== globeGroup)
			globeGroup.add(globeNationLabels)
		if (mapNationLabels) {
			if (!labelCullingEnabled) addMapSlideClones(mapNationLabels)
			if (mapMesh) mapNationLabels.position.copy(mapMesh.position)
			if (mapNationLabels.parent !== scene) scene.add(mapNationLabels)
		}
		if (
			!earthHistoryNationOverride &&
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
		if (
			!currentWorld?.settlementRegions ||
			!labelMode.settlements ||
			!settlementLabelNames
		) {
			globeSettlementLabels?.clear()
			mapSettlementLabels?.clear()
			return
		}
		globeSettlementLabels = buildGlobeSettlementLabels(
			currentWorld,
			settlementLabelNames,
			camera,
			settlementLabelPools.globe,
			labelCullingEnabled,
			elevationVisible,
			globeSettlementLabels ?? undefined,
		)
		mapSettlementLabels = buildMapSettlementLabels(
			currentWorld,
			settlementLabelNames,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			settlementLabelPools.map,
			labelCullingEnabled,
			mapSettlementLabels ?? undefined,
		)
		if (globeSettlementLabels.parent !== globeGroup) {
			globeGroup.add(globeSettlementLabels)
		}
		if (mapSettlementLabels) {
			if (!labelCullingEnabled) addMapSlideClones(mapSettlementLabels)
			if (mapMesh) mapSettlementLabels.position.copy(mapMesh.position)
			if (mapSettlementLabels.parent !== scene) scene.add(mapSettlementLabels)
		}
		updateOverlayVisibility()
	}

	function rebuildCultureLabels() {
		if (!currentWorld || !labelMode.culture) {
			globeCultureLabels?.clear()
			mapCultureLabels?.clear()
			return
		}

		const earthCulture = earthHistoryLabelPartitions?.culture
		if (!earthCulture && (!currentWorld.cultures || !cultureNames)) {
			globeCultureLabels?.clear()
			mapCultureLabels?.clear()
			return
		}

		const names = earthCulture ? earthCulture.names : (cultureNames as string[])
		const partitionCount = earthCulture
			? earthCulture.count
			: currentWorld.cultures!.count
		const getPartition = earthCulture
			? (p: number) => earthCulture.assignment[p] ?? -1
			: (p: number) => currentWorld!.cultures!.assignment[p] ?? -1
		const scaleCurve = earthCulture
			? EARTH_HISTORY_LABEL_SCALE_CURVE
			: undefined

		globeCultureLabels = buildGlobePartitionLabels(
			currentWorld,
			names,
			partitionCount,
			getPartition,
			camera,
			cultureLabelPools.globe,
			labelCullingEnabled,
			elevationVisible,
			scaleCurve,
			globeCultureLabels ?? undefined,
		)
		mapCultureLabels = buildMapPartitionLabels(
			currentWorld,
			names,
			partitionCount,
			getPartition,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			cultureLabelPools.map,
			labelCullingEnabled,
			scaleCurve,
			mapCultureLabels ?? undefined,
		)
		if (globeCultureLabels.parent !== globeGroup)
			globeGroup.add(globeCultureLabels)
		if (mapCultureLabels) {
			if (mapMesh) mapCultureLabels.position.copy(mapMesh.position)
			if (mapCultureLabels.parent !== scene) scene.add(mapCultureLabels)
		}
		updateOverlayVisibility()
	}

	/** Only ever populated for Earth-imported worlds -- see
	 * earthHistoryLabelPartitions's doc comment. */
	function rebuildReligionLabels() {
		const earthReligion = earthHistoryLabelPartitions?.religion
		if (!currentWorld || !labelMode.religion || !earthReligion) {
			globeReligionLabels?.clear()
			mapReligionLabels?.clear()
			return
		}

		globeReligionLabels = buildGlobePartitionLabels(
			currentWorld,
			earthReligion.names,
			earthReligion.count,
			(p) => earthReligion.assignment[p] ?? -1,
			camera,
			religionLabelPools.globe,
			labelCullingEnabled,
			elevationVisible,
			EARTH_HISTORY_LABEL_SCALE_CURVE,
			globeReligionLabels ?? undefined,
		)
		mapReligionLabels = buildMapPartitionLabels(
			currentWorld,
			earthReligion.names,
			earthReligion.count,
			(p) => earthReligion.assignment[p] ?? -1,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			religionLabelPools.map,
			labelCullingEnabled,
			EARTH_HISTORY_LABEL_SCALE_CURVE,
			mapReligionLabels ?? undefined,
		)
		if (globeReligionLabels.parent !== globeGroup) {
			globeGroup.add(globeReligionLabels)
		}
		if (mapReligionLabels) {
			if (mapMesh) mapReligionLabels.position.copy(mapMesh.position)
			if (mapReligionLabels.parent !== scene) scene.add(mapReligionLabels)
		}
		updateOverlayVisibility()
	}

	function rebuildHeritageLabels() {
		if (!currentWorld?.heritages || !labelMode.heritage || !heritageNames) {
			globeHeritageLabels?.clear()
			mapHeritageLabels?.clear()
			return
		}
		globeHeritageLabels = buildGlobeHeritageLabels(
			currentWorld,
			heritageNames,
			camera,
			heritageLabelPools.globe,
			labelCullingEnabled,
			elevationVisible,
			globeHeritageLabels ?? undefined,
		)
		mapHeritageLabels = buildMapHeritageLabels(
			currentWorld,
			heritageNames,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			heritageLabelPools.map,
			labelCullingEnabled,
			mapHeritageLabels ?? undefined,
		)
		if (globeHeritageLabels.parent !== globeGroup) {
			globeGroup.add(globeHeritageLabels)
		}
		if (mapHeritageLabels) {
			if (mapMesh) mapHeritageLabels.position.copy(mapMesh.position)
			if (mapHeritageLabels.parent !== scene) scene.add(mapHeritageLabels)
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
			TRANSPORT.networkCount(infrastructureData) === 0 ||
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

	// Earth-imported worlds never have a procedural world.nations (see
	// derive-province-society.ts's isEarthImportRaster check), so anything
	// needing "which nation owns this province" for such a world -- nation
	// border rendering, nation-border focus pulses -- has to read from
	// earthHistoryNationOverride instead. Shadows world.nations with the real
	// per-date assignment so existing nation/sovereign/rebel-aware helpers
	// (buildRealIdToNation, forEachNationBorderSide, etc.) work unmodified.
	function getWorldForBorders() {
		return earthHistoryNationOverride && currentWorld
			? {
					...currentWorld,
					nations: {
						...currentWorld.nations,
						assignment: earthHistoryNationOverride.assignment,
						// See rebuildNationBorders' identical aliasing below for why
						// sovereign points at the same array and activeRebelWars is
						// cleared -- same stale-procedural-id gap this fixes there.
						sovereign: earthHistoryNationOverride.assignment,
						activeRebelWars: [],
					},
				}
			: currentWorld
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
		// The fill mesh is intentionally NOT disposed unconditionally here
		// (unlike the border lines above, which must always be fully rebuilt
		// since their segment set is re-filtered every call) -- see the
		// isEarthImport branch below, which recolors it in place when only
		// nation ownership changed and only disposes/rebuilds it when the
		// radius/projection actually changed.
		nationBorderMaterials = []
		landNationBorderMaterials = []

		const w = canvas.clientWidth || 1
		const h = canvas.clientHeight || 1

		const worldForBorders = getWorldForBorders()

		if (worldForBorders?.isEarthImport) {
			if (!cachedEu4BorderGeometry) {
				DATA_SOURCE.loadEu4ProvinceBorderGeometry()
					.then((geometry) => {
						cachedEu4BorderGeometry = geometry
						rebuildNationBorders()
						requestRender()
					})
					.catch((err) => {
						console.error("Failed to load EU4 province border geometry:", err)
					})
				return
			}
			const borderContext = buildEu4NationBorderContext(worldForBorders)
			const geometry = cachedEu4BorderGeometry

			if (currentNationFillColorForRawId) {
				if (!cachedEu4FillGeometry) {
					DATA_SOURCE.loadEu4ProvinceFillGeometry()
						.then((fillGeometry) => {
							cachedEu4FillGeometry = fillGeometry
							rebuildNationBorders()
							requestRender()
						})
						.catch((err) => {
							console.error("Failed to load EU4 province fill geometry:", err)
						})
				} else {
					const elevationLookup = buildElevationLookup(worldForBorders)
					const globeRadius = elevationVisible ? 1.002 : 1.0005
					const mapZ = 0.0003

					// Recolor in place when the only thing that changed since the
					// last rebuild is nation ownership (the common case -- every
					// timeline scrub tick creates a new currentNationFillColorForRawId
					// closure, but the mesh's positions are still valid for the same
					// radius/projection). Falls through to a full rebuild on the
					// first build, or a real radius/pan/zoom change.
					if (globeNationFill && globeNationFillRadius === globeRadius) {
						updateEu4NationFillGlobeColors(
							globeNationFill,
							cachedEu4FillGeometry,
							currentNationFillColorForRawId,
							elevationLookup,
						)
					} else {
						disposeObject3D(globeGroup, globeNationFill)
						const globeFill = buildEu4NationFillGlobe({
							geometry: cachedEu4FillGeometry,
							colorForRawId: currentNationFillColorForRawId,
							viewMode: currentViewMode,
							visible: true,
							radius: globeRadius,
							elevationKmForLonLat: elevationLookup,
						})
						globeNationFill = globeFill?.mesh ?? null
						globeNationFillRadius = globeFill ? globeRadius : null
						if (globeNationFill) globeGroup.add(globeNationFill)
					}

					if (
						mapNationFill &&
						mapNationFillParams?.z === mapZ &&
						mapNationFillParams.centerLongitudeDeg ===
							currentMapCenterLongitudeDeg &&
						mapNationFillParams.projectionLatitudeDeg ===
							currentMapProjectionLatitudeDeg
					) {
						updateEu4NationFillMapColors(
							mapNationFill,
							cachedEu4FillGeometry,
							currentNationFillColorForRawId,
							elevationLookup,
						)
					} else {
						disposeObject3D(scene, mapNationFill)
						const mapFill = buildEu4NationFillMap({
							geometry: cachedEu4FillGeometry,
							colorForRawId: currentNationFillColorForRawId,
							centerLongitudeDeg: currentMapCenterLongitudeDeg,
							projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
							viewMode: currentViewMode,
							visible: true,
							z: mapZ,
							elevationKmForLonLat: elevationLookup,
						})
						mapNationFill = mapFill?.mesh ?? null
						mapNationFillParams = mapFill
							? {
									z: mapZ,
									centerLongitudeDeg: currentMapCenterLongitudeDeg,
									projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
								}
							: null
						if (mapNationFill) scene.add(mapNationFill)
					}
					// Visibility/position (view-mode gating, map-pan following) is
					// handled uniformly by updateOverlayVisibility() below, same as
					// every other overlay in this function.
				}
			} else if (globeNationFill || mapNationFill) {
				// Fill overlay just got switched off (e.g. left political display
				// mode) -- dispose it rather than leaving it hidden and stale, so
				// the next time it's switched back on this takes the full-rebuild
				// path instead of finding a null radius that never matches.
				disposeObject3D(globeGroup, globeNationFill)
				disposeObject3D(scene, mapNationFill)
				globeNationFill = null
				mapNationFill = null
				globeNationFillRadius = null
				mapNationFillParams = null
			}

			disposeObject3D(globeGroup, globeOccupationStripes)
			disposeObject3D(scene, mapOccupationStripes)
			globeOccupationStripes = null
			mapOccupationStripes = null
			if (currentOccupationStripeColorForRawId) {
				if (!cachedEu4FillGeometry) {
					DATA_SOURCE.loadEu4ProvinceFillGeometry()
						.then((fillGeometry) => {
							cachedEu4FillGeometry = fillGeometry
							rebuildNationBorders()
							requestRender()
						})
						.catch((err) => {
							console.error("Failed to load EU4 province fill geometry:", err)
						})
				} else {
					const globeStripes = buildEu4OccupationStripesGlobe({
						geometry: cachedEu4FillGeometry,
						colorForRawId: currentOccupationStripeColorForRawId,
						viewMode: currentViewMode,
						visible: true,
						radius: elevationVisible ? 1.002 : 1.0005,
					})
					const mapStripes = buildEu4OccupationStripesMap({
						geometry: cachedEu4FillGeometry,
						colorForRawId: currentOccupationStripeColorForRawId,
						centerLongitudeDeg: currentMapCenterLongitudeDeg,
						projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
						viewMode: currentViewMode,
						visible: true,
						z: 0.0003,
					})
					if (globeStripes) {
						globeOccupationStripes = globeStripes.mesh
						globeGroup.add(globeOccupationStripes)
					}
					if (mapStripes) {
						mapOccupationStripes = mapStripes.mesh
						scene.add(mapOccupationStripes)
					}
				}
			}

			if (borderContext && landNationBordersVisible) {
				const globeLand = buildEu4NationBordersGlobe(
					geometry,
					borderContext,
					currentViewMode,
					landNationBordersVisible,
					elevationVisible ? 1.004 : 1.001,
					[w, h],
					{ color: 0x7d556f, opacity: 0.9, lineWidth: 2 },
				)
				const mapLand = buildEu4NationBordersMap(
					geometry,
					borderContext,
					currentMapCenterLongitudeDeg,
					currentMapProjectionLatitudeDeg,
					currentViewMode,
					landNationBordersVisible,
					0.001,
					[w, h],
					{ color: 0x7d556f, opacity: 0.9, lineWidth: 2 },
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

			if (borderContext && nationBordersVisible) {
				const BORDER_BASE_WIDTH = 1.2
				const globeThin = buildEu4NationBordersGlobe(
					geometry,
					borderContext,
					currentViewMode,
					nationBordersVisible,
					elevationVisible ? 1.006 : 1.003,
					[w, h],
					{ color: 0x020617, opacity: 0.95, lineWidth: BORDER_BASE_WIDTH },
				)
				const mapThin = buildEu4NationBordersMap(
					geometry,
					borderContext,
					currentMapCenterLongitudeDeg,
					currentMapProjectionLatitudeDeg,
					currentViewMode,
					nationBordersVisible,
					0,
					[w, h],
					{ color: 0x020617, opacity: 0.95, lineWidth: BORDER_BASE_WIDTH },
				)
				if (globeThin) {
					globeThin.lines.renderOrder = 1
					globeNationBorders = globeThin.lines
					nationBorderMaterials.push(globeThin.material)
					globeGroup.add(globeNationBorders)
				}
				if (mapThin) {
					mapThin.lines.renderOrder = 1
					mapNationBorders = mapThin.lines
					nationBorderMaterials.push(mapThin.material)
					scene.add(mapNationBorders)
				}
			}

			updateOverlayVisibility()
			return
		}

		if (worldForBorders && landNationBordersVisible) {
			const globeLand = buildLandNationBordersGlobe({
				world: worldForBorders,
				viewMode: currentViewMode,
				visible: landNationBordersVisible,
				elevationVisible,
				resolution: [w, h],
			})
			const mapLand = buildLandNationBordersMap({
				world: worldForBorders,
				centerLongitudeDeg: currentMapCenterLongitudeDeg,
				projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
				viewMode: currentViewMode,
				visible: landNationBordersVisible,
				resolution: [w, h],
			})
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

		if (worldForBorders && nationBordersVisible) {
			const BORDER_BASE_WIDTH = 1.2
			const globePos = collectAllNationBorderGlobePositions(
				worldForBorders,
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
				worldForBorders,
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
		const resolution: [number, number] = [
			canvas.clientWidth || 1,
			canvas.clientHeight || 1,
		]

		if (currentWorld.isEarthImport) {
			if (!cachedEu4BorderGeometry) {
				DATA_SOURCE.loadEu4ProvinceBorderGeometry()
					.then((geometry) => {
						cachedEu4BorderGeometry = geometry
						rebuildSelectedProvinceBorder()
						requestRender()
					})
					.catch((err) => {
						console.error("Failed to load EU4 province border geometry:", err)
					})
				return
			}
			const provinceRealId = currentWorld.provinces.realIds?.[selectedProvince]
			if (provinceRealId === undefined) return
			const geometry = cachedEu4BorderGeometry
			const globeBorder = buildEu4SelectedProvinceBorderGlobe({
				geometry,
				provinceRealId,
				viewMode: currentViewMode,
				radius: 1.006,
				resolution,
				opts: { color: 0xfffbeb, opacity: 0.95, lineWidth: 4 },
			})
			const mapBorder = buildEu4SelectedProvinceBorderMap({
				geometry,
				provinceRealId,
				centerLongitudeDeg: currentMapCenterLongitudeDeg,
				projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
				viewMode: currentViewMode,
				z: 0.007,
				resolution,
				opts: { color: 0xfffbeb, opacity: 0.95, lineWidth: 4 },
			})
			if (globeBorder) {
				globeSelectedProvinceBorder = globeBorder.lines
				globeGroup.add(globeSelectedProvinceBorder)
			}
			if (mapBorder) {
				mapSelectedProvinceBorder = mapBorder.lines
				addMapSlideClones(mapSelectedProvinceBorder)
				scene.add(mapSelectedProvinceBorder)
			}
			updateOverlayVisibility()
			return
		}

		globeSelectedProvinceBorder = buildSelectedProvinceBorderGlobe({
			world: currentWorld,
			province: selectedProvince,
			viewMode: currentViewMode,
			elevationVisible,
			opts: {
				color: 0xfffbeb,
				radiusBoost: 0.003,
				lineWidth: 4,
				resolution,
			},
		})
		mapSelectedProvinceBorder = buildSelectedProvinceBorderMap({
			world: currentWorld,
			province: selectedProvince,
			centerLongitudeDeg: currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
			viewMode: currentViewMode,
			opts: {
				color: 0xfffbeb,
				zBoost: 0.004,
				lineWidth: 4,
				resolution,
			},
		})
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
		const riverHex = 0x8fc4e8
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
		disposeObject3D(globeGroup, terrainWireframe)
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
		disposeObject3D(globeGroup, globeNationFill)
		disposeObject3D(scene, mapNationFill)
		disposeObject3D(globeGroup, globeOccupationStripes)
		disposeObject3D(scene, mapOccupationStripes)
		disposeObject3D(globeGroup, globeSelectedProvinceBorder)
		disposeObject3D(scene, mapSelectedProvinceBorder)
		disposeObject3D(globeGroup, pulseGlobe)
		disposeObject3D(scene, pulseMap)
		disposeGroup(globeGroup, globeRivers)
		disposeGroup(scene, mapRivers)
		disposeGroup(globeGroup, globeHierarchyOverlay)
		disposeGroup(scene, mapHierarchyOverlay)
		disposeGroup(globeGroup, globeSettlements)
		disposeGroup(scene, mapSettlements)
		disposeGroup(globeGroup, globeEu4Settlements)
		disposeGroup(scene, mapEu4Settlements)
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
		globeNationFill = null
		mapNationFill = null
		globeNationFillRadius = null
		mapNationFillParams = null
		globeOccupationStripes = null
		mapOccupationStripes = null
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
			mapWireframe = buildMapWireframe({
				world: currentWorld,
				centerLongitudeDeg: currentMapCenterLongitudeDeg,
				projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
				wireframeVisible,
				viewMode: currentViewMode,
			})
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
		rebuildCoastlineOverlay()
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
		rebuildEu4SettlementOverlay()
		rebuildTradeRouteOverlay()
		rebuildNationLabels()
		updateOverlayVisibility()
	}

	function updateOverlayVisibility() {
		const showMap = currentViewMode === "map" && !solarSystemActive
		if (globeCoastlineOverlay)
			globeCoastlineOverlay.visible =
				coastlineOverlayVisible && currentViewMode === "globe"
		if (mapCoastlineOverlay) {
			mapCoastlineOverlay.visible = coastlineOverlayVisible && showMap
			if (mapMesh) mapCoastlineOverlay.position.copy(mapMesh.position)
		}
		if (terrainWireframe)
			terrainWireframe.visible = wireframeVisible && currentViewMode === "globe"
		if (mapWireframe) {
			mapWireframe.visible = wireframeVisible && showMap
			if (mapMesh) mapWireframe.position.copy(mapMesh.position)
		}
		if (globeNationFill) globeNationFill.visible = currentViewMode === "globe"
		if (mapNationFill) {
			mapNationFill.visible = showMap
			if (mapMesh) mapNationFill.position.copy(mapMesh.position)
		}
		if (globeOccupationStripes)
			globeOccupationStripes.visible = currentViewMode === "globe"
		if (mapOccupationStripes) {
			mapOccupationStripes.visible = showMap
			if (mapMesh) mapOccupationStripes.position.copy(mapMesh.position)
		}
		if (globeLandNationBorders)
			globeLandNationBorders.visible =
				currentViewMode === "globe" && landNationBordersVisible
		if (mapLandNationBorders) {
			mapLandNationBorders.visible = showMap && landNationBordersVisible
			if (mapMesh) mapLandNationBorders.position.copy(mapMesh.position)
		}
		if (globeNationBorders)
			globeNationBorders.visible =
				currentViewMode === "globe" && nationBordersVisible
		if (mapNationBorders) {
			mapNationBorders.visible = showMap && nationBordersVisible
			if (mapMesh) mapNationBorders.position.copy(mapMesh.position)
		}
		if (globeOrgLabel) globeOrgLabel.visible = currentViewMode === "globe"
		if (mapOrgLabel) {
			mapOrgLabel.visible = showMap
			if (mapMesh) mapOrgLabel.position.copy(mapMesh.position)
		}
		if (globeSelectedProvinceBorder)
			globeSelectedProvinceBorder.visible = currentViewMode === "globe"
		if (mapSelectedProvinceBorder) {
			mapSelectedProvinceBorder.visible = showMap
			if (mapMesh) mapSelectedProvinceBorder.position.copy(mapMesh.position)
		}
		if (globeGrid)
			globeGrid.visible = gridVisible && currentViewMode === "globe"
		if (mapGrid) {
			mapGrid.visible = gridVisible && showMap
			if (mapMesh) mapGrid.position.copy(mapMesh.position)
		}
		if (globeThermalEquator)
			globeThermalEquator.visible = currentViewMode === "globe"
		if (mapThermalEquator) {
			mapThermalEquator.visible = showMap
			if (mapMesh) mapThermalEquator.position.copy(mapMesh.position)
		}
		if (mapSolarTerminator) {
			mapSolarTerminator.visible = solarTerminatorVisible && showMap
			if (mapMesh) mapSolarTerminator.position.copy(mapMesh.position)
		}
		if (globeWindArrows) globeWindArrows.visible = currentViewMode === "globe"
		if (mapWindArrows) {
			mapWindArrows.visible = showMap
			if (mapMesh) mapWindArrows.position.copy(mapMesh.position)
		}
		if (globeRivers)
			globeRivers.visible = riversVisible && currentViewMode === "globe"
		if (mapRivers) {
			mapRivers.visible = riversVisible && showMap
			if (mapMesh) mapRivers.position.copy(mapMesh.position)
		}
		if (globeMeasureLine) globeMeasureLine.visible = currentViewMode === "globe"
		if (mapMeasureLine) {
			mapMeasureLine.visible = showMap
			if (mapMesh) mapMeasureLine.position.copy(mapMesh.position)
		}
		if (globeMeasureDots) globeMeasureDots.visible = currentViewMode === "globe"
		if (mapMeasureDots) {
			mapMeasureDots.visible = showMap
			if (mapMesh) mapMeasureDots.position.copy(mapMesh.position)
		}
		if (globeHierarchyOverlay)
			globeHierarchyOverlay.visible = currentViewMode === "globe"
		if (mapHierarchyOverlay) {
			mapHierarchyOverlay.visible = showMap
			if (mapMesh) mapHierarchyOverlay.position.copy(mapMesh.position)
		}
		if (globeSettlements)
			globeSettlements.visible =
				settlementsVisible && currentViewMode === "globe"
		if (mapSettlements) {
			mapSettlements.visible = settlementsVisible && showMap
			if (mapMesh) mapSettlements.position.copy(mapMesh.position)
		}
		if (globeEu4Settlements)
			globeEu4Settlements.visible =
				eu4SettlementsVisible && currentViewMode === "globe"
		if (mapEu4Settlements) {
			mapEu4Settlements.visible = eu4SettlementsVisible && showMap
			if (mapMesh) mapEu4Settlements.position.copy(mapMesh.position)
		}
		if (globeInfrastructure)
			globeInfrastructure.visible =
				infrastructureVisible && currentViewMode === "globe"
		if (mapInfrastructure) {
			mapInfrastructure.visible = infrastructureVisible && showMap
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
				(labelMode.nations || labelMode.dynasty) && showMap
			if (mapMesh) mapNationLabels.position.copy(mapMesh.position)
		}
		if (mapNationScripts) {
			mapNationScripts.visible =
				labelMode.script && (labelMode.nations || labelMode.dynasty) && showMap
			if (mapMesh) mapNationScripts.position.copy(mapMesh.position)
		}
		if (globeSettlementLabels)
			globeSettlementLabels.visible =
				labelMode.settlements && currentViewMode === "globe"
		if (mapSettlementLabels) {
			mapSettlementLabels.visible = labelMode.settlements && showMap
			if (mapMesh) mapSettlementLabels.position.copy(mapMesh.position)
		}
		if (globeCultureLabels)
			globeCultureLabels.visible =
				labelMode.culture && currentViewMode === "globe"
		if (mapCultureLabels) {
			mapCultureLabels.visible = labelMode.culture && showMap
			if (mapMesh) mapCultureLabels.position.copy(mapMesh.position)
		}
		if (globeHeritageLabels)
			globeHeritageLabels.visible =
				labelMode.heritage && currentViewMode === "globe"
		if (mapHeritageLabels) {
			mapHeritageLabels.visible = labelMode.heritage && showMap
			if (mapMesh) mapHeritageLabels.position.copy(mapMesh.position)
		}
		if (globeReligionLabels)
			globeReligionLabels.visible =
				labelMode.religion && currentViewMode === "globe"
		if (mapReligionLabels) {
			mapReligionLabels.visible = labelMode.religion && showMap
			if (mapMesh) mapReligionLabels.position.copy(mapMesh.position)
		}
		requestRender()
	}

	function syncMapExportObjectPositions() {
		const mapObjects = [
			mapWireframe,
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
			mapEu4Settlements,
			mapInfrastructure,
			mapNationLabels,
			mapNationScripts,
			mapSettlementLabels,
			mapCultureLabels,
			mapHeritageLabels,
			mapReligionLabels,
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
			{ object: globeEu4Settlements, visible: false },
			{ object: globeInfrastructure, visible: false },
			{ object: globeNationLabels, visible: false },
			{ object: globeNationScripts, visible: false },
			{ object: globeSettlementLabels, visible: false },
			{ object: globeCultureLabels, visible: false },
			{ object: globeHeritageLabels, visible: false },
			{ object: globeReligionLabels, visible: false },
			{ object: pulseGlobe, visible: false },
			{ object: mapMesh, visible: true },
			{ object: mapWireframe, visible: wireframeVisible },
			{ object: mapGrid, visible: gridVisible },
			{ object: mapThermalEquator, visible: false },
			{ object: mapSolarTerminator, visible: solarTerminatorVisible },
			{ object: mapRivers, visible: riversVisible },
			{ object: mapLandNationBorders, visible: landNationBordersVisible },
			{ object: mapNationBorders, visible: nationBordersVisible },
			{ object: mapHierarchyOverlay, visible: hierarchyOverlayNationId >= 0 },
			{ object: mapSettlements, visible: settlementsVisible },
			{ object: mapEu4Settlements, visible: eu4SettlementsVisible },
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
			{ object: mapReligionLabels, visible: labelMode.religion },
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
		disposeObject3D(globeGroup, terrainMesh)
		disposeObject3D(scene, mapMesh)
		disposeGroup(scene, mapSolarTerminator)
		terrainMesh = null
		mapMesh = null
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
			disposeObject3D(globeGroup, terrainMesh)
			disposeObject3D(scene, mapMesh)
			terrainMesh = null
			mapMesh = null
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

	/** Nation fill color source for the real-EU4-province-polygon overlay
	 * (eu4-nation-fill-overlay.ts), keyed by raw EU4 province id. Pass null
	 * to hide the fill overlay -- e.g. when the color mode isn't political,
	 * or the world isn't an Earth import -- and fall back to the normal
	 * per-region terrain-mesh vertex coloring (setDisplayColors). */
	function setNationFillColorForRawId(fn: ColorForRawId | null) {
		if (currentNationFillColorForRawId === fn) return
		currentNationFillColorForRawId = fn
		rebuildNationBorders()
	}

	/** Contested-province stripe color source for the real-EU4-province-
	 * polygon overlay (eu4-nation-fill-overlay.ts's stripe builders), keyed
	 * by raw EU4 province id -- null (from the color function itself, per
	 * province) means "not contested, no stripe". Pass a null function to
	 * hide the whole overlay. Draws on top of both the fill mesh and the
	 * border lines regardless of view; see buildEu4OccupationStripesGlobe/
	 * Map's renderOrder doc comment. */
	function setNationOccupationStripeColorForRawId(fn: ColorForRawId | null) {
		if (currentOccupationStripeColorForRawId === fn) return
		currentOccupationStripeColorForRawId = fn
		rebuildNationBorders()
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

	function setEarthHistoryNationOverride(
		override: {
			assignment: Int32Array
			seeds: Int32Array
			names: string[]
		} | null,
	) {
		if (earthHistoryNationOverridesEqual(earthHistoryNationOverride, override))
			return
		earthHistoryNationOverride = override
		rebuildNationBorders()
		rebuildNationLabels()
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

	/** Current territory highlight for one international organization (HRE,
	 * Hanseatic League, ...), from GenesisView's organizationHighlightSpec --
	 * recomputed fresh from FoldedState each earth-history scrub tick, so
	 * this always does a full rebuild rather than an in-place update. Pass
	 * null exactly when no organization's wiki page is open, which both
	 * clears the fill highlight and lets rebuildNationLabels resume showing
	 * normal nation name labels. */
	function setOrganizationHighlight(spec: OrgHighlightSpec | null) {
		if (currentOrgHighlight === spec) return
		currentOrgHighlight = spec
		// rebuildNationBorders' border-line tracing never reads
		// currentOrgHighlight (territory coloring is region-level, handled by
		// GenesisView's withOrgHighlight instead) -- only labels branch on it
		// (rebuildNationLabels' currentOrgHighlight check). Calling
		// rebuildNationBorders here would re-trace every border in the world a
		// second time for no visual effect, on top of the identical rebuild
		// setEarthHistoryNationOverride already triggers the same tick.
		rebuildNationLabels()
	}

	function setSelectedProvince(provinceId: number | null) {
		selectedProvince = provinceId ?? -1
		rebuildSelectedProvinceBorder()
	}

	function focusOnRegion(
		region: number,
		opts?: { durationMs?: number; distanceScale?: number },
	) {
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
			distanceScale: opts?.distanceScale,
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

	function focusOnNation(
		nationId: number,
		opts?: { durationMs?: number; distanceScale?: number },
	) {
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

	function focusOnProvince(
		provinceId: number,
		opts?: {
			durationMs?: number
			distanceScale?: number
			/** "nation" highlights the whole nation's border instead of just
			 * this one province's -- used when the caller is really focusing
			 * on a nation (e.g. Earth import, which has no procedural nation
			 * id to pass to focusOnNation) and only has a representative
			 * province to hand in. */
			pulseTarget?: "nation" | "province"
		},
	) {
		if (!currentWorld?.provinces) return
		if (provinceId < 0 || provinceId >= currentWorld.provinces.count) {
			setSelectedProvince(null)
			return
		}
		const pulseTarget = opts?.pulseTarget ?? "province"
		// The persistent yellow "selected province" outline is a distinct,
		// separate overlay from the pulse below -- only mark this as the
		// selected province when it really is one; a "nation" focus just
		// uses provinceId as a representative anchor point, not something
		// the user selected, and leaving it set would draw a stray
		// single-province outline alongside the nation-wide pulse.
		setSelectedProvince(pulseTarget === "province" ? provinceId : null)
		const region = currentWorld.provinces.seeds[provinceId]
		if (region < 0) {
			return
		}
		focusOnRegion(region, opts)
		startBorderPulse(provinceId, pulseTarget)
	}

	function clearPulse() {
		disposeObject3D(globeGroup, pulseGlobe)
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
		const useEu4Vectors = currentWorld.isEarthImport && cachedEu4BorderGeometry
		const provinceRealId = useEu4Vectors
			? currentWorld.provinces?.realIds?.[province]
			: undefined
		const globePositions = useEu4Vectors
			? target === "province"
				? provinceRealId === undefined
					? []
					: collectEu4ProvinceBorderGlobePositions(
							cachedEu4BorderGeometry!,
							provinceRealId,
							1.006,
						)
				: (() => {
						const worldForBorders = getWorldForBorders()
						const nation = worldForBorders?.nations?.assignment[province]
						if (nation === undefined || nation < 0) return []
						const realIdToNation = worldForBorders
							? buildRealIdToNation(worldForBorders)
							: null
						return realIdToNation
							? collectEu4NationBorderGlobePositions(
									cachedEu4BorderGeometry!,
									realIdToNation,
									nation,
									1.006,
								)
							: []
					})()
			: target === "province"
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
		const mapPositions = useEu4Vectors
			? target === "province"
				? provinceRealId === undefined
					? []
					: collectEu4ProvinceBorderMapPositions({
							geometry: cachedEu4BorderGeometry!,
							provinceRealId,
							centerLongitudeDeg: currentMapCenterLongitudeDeg,
							projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
							z: 0.007,
						})
				: (() => {
						const worldForBorders = getWorldForBorders()
						const nation = worldForBorders?.nations?.assignment[province]
						if (nation === undefined || nation < 0) return []
						const realIdToNation = worldForBorders
							? buildRealIdToNation(worldForBorders)
							: null
						return realIdToNation
							? collectEu4NationBorderMapPositions({
									geometry: cachedEu4BorderGeometry!,
									realIdToNation,
									nation,
									centerLongitudeDeg: currentMapCenterLongitudeDeg,
									projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
									z: 0.001,
								})
							: []
					})()
			: target === "province"
				? collectProvinceBorderMapPositions({
						world: currentWorld,
						province,
						centerLongitudeDeg: currentMapCenterLongitudeDeg,
						projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
						zBoost: 0.004,
					})
				: (() => {
						if (!currentWorld.nations) return []
						const nation = currentWorld.nations.assignment[province]
						return nation < 0
							? []
							: collectNationBorderMapPositions({
									world: currentWorld,
									nation,
									centerLongitudeDeg: currentMapCenterLongitudeDeg,
									projectionLatitudeDeg: currentMapProjectionLatitudeDeg,
									zBoost: 0.001,
								})
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
		globeCloudMesh.visible = false
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
		if (!currentWorld || solarSystemActive) {
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
		for (const mat of coastlineMaterials) mat.resolution.set(w, h)
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
		if (!clickHandler || !currentWorld || solarSystemActive) return
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
		disposeObject3D(globeGroup, terrainMesh)
		disposeObject3D(scene, mapMesh)
		disposeObject3D(globeGroup, terrainWireframe)
		disposeObject3D(scene, mapWireframe)
		disposeObject3D(globeGroup, globeGrid)
		disposeObject3D(globeGroup, globeCloudMesh)
		disposeObject3D(scene, mapGrid)
		disposeObject3D(globeGroup, globeThermalEquator)
		disposeObject3D(scene, mapThermalEquator)
		disposeGroup(globeGroup, globeSolarTerminator)
		disposeGroup(scene, mapSolarTerminator)
		disposeObject3D(globeGroup, globeNationBorders)
		disposeObject3D(scene, mapNationBorders)
		disposeObject3D(globeGroup, globeLandNationBorders)
		disposeObject3D(scene, mapLandNationBorders)
		disposeObject3D(globeGroup, globeNationFill)
		disposeObject3D(scene, mapNationFill)
		disposeObject3D(globeGroup, globeOccupationStripes)
		disposeObject3D(scene, mapOccupationStripes)
		disposeObject3D(globeGroup, pulseGlobe)
		disposeObject3D(scene, pulseMap)
		disposeObject3D(globeGroup, globeCoastlineOverlay)
		disposeObject3D(scene, mapCoastlineOverlay)
		disposeGroup(globeGroup, globeRivers)
		disposeGroup(scene, mapRivers)
		disposeGroup(globeGroup, globeHierarchyOverlay)
		disposeGroup(scene, mapHierarchyOverlay)
		disposeGroup(globeGroup, globeSettlements)
		disposeGroup(scene, mapSettlements)
		disposeGroup(globeGroup, globeEu4Settlements)
		disposeGroup(scene, mapEu4Settlements)
		disposeGroup(globeGroup, globeInfrastructure)
		disposeGroup(scene, mapInfrastructure)
		disposeGroup(globeGroup, globeNationLabels)
		disposeGroup(scene, mapNationLabels)
		disposePool(nationLabelPools.globe)
		disposePool(nationLabelPools.map)
		disposeGroup(globeGroup, globeOrgLabel)
		disposeGroup(scene, mapOrgLabel)
		disposePool(orgLabelPools.globe)
		disposePool(orgLabelPools.map)
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
		// Spin angle: offset by Ï€ so noon (timeOfDay=hoursPerDay/2) faces +X (sun)
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

	function setEu4Settlements(
		lats: Float32Array | null,
		lons: Float32Array | null,
		population: Float32Array | null,
		provinceIds: Int32Array | null,
		capitalProvinceIds: ReadonlySet<number>,
		indices: number[],
	) {
		eu4SettlementLats = lats
		eu4SettlementLons = lons
		eu4SettlementPopulation = population
		eu4SettlementProvinceIds = provinceIds
		eu4CapitalProvinceIds = capitalProvinceIds
		eu4SettlementIndices = indices
		rebuildEu4SettlementOverlay()
	}

	function setEu4SettlementsVisible(visible: boolean) {
		if (eu4SettlementsVisible === visible) return
		eu4SettlementsVisible = visible
		rebuildEu4SettlementOverlay()
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
		rebuildReligionLabels()
	}

	function setNationNames(names: string[] | null) {
		if (stringArraysEqual(nationNames, names)) return
		nationNames = names
		rebuildNationLabels()
	}

	function setDynastyNames(names: string[] | null) {
		if (stringArraysEqual(dynastyNames, names)) return
		dynastyNames = names
		rebuildNationLabels()
	}

	function setCultureNames(names: string[] | null) {
		if (stringArraysEqual(cultureNames, names)) return
		cultureNames = names
		rebuildCultureLabels()
	}

	function setHeritageNames(names: string[] | null) {
		if (stringArraysEqual(heritageNames, names)) return
		heritageNames = names
		rebuildHeritageLabels()
	}

	function setSettlementNames(names: string[] | null) {
		if (stringArraysEqual(settlementLabelNames, names)) return
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
		rebuildReligionLabels()
	}

	function setEarthHistoryLabelPartitions(
		partitions: {
			culture: { assignment: Int32Array; count: number; names: string[] }
			religion: { assignment: Int32Array; count: number; names: string[] }
		} | null,
	) {
		if (
			earthHistoryLabelPartitionsEqual(earthHistoryLabelPartitions, partitions)
		)
			return
		earthHistoryLabelPartitions = partitions
		rebuildCultureLabels()
		rebuildReligionLabels()
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
		moons: MoonBody[] | null,
		planetRadiusKm: number,
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
		moons: MoonBody[] | null,
		planetRadiusKm: number,
		showGrid: boolean,
		gridSpacing: number,
		showEllipticalOrbits: boolean,
	) {
		setMoonOrbitOverlay(
			moons,
			planetRadiusKm,
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
		// mapMesh lives directly on `scene`, not inside globeGroup, since the
		// flat-map view uses its own orthographic camera alongside the globe's
		// perspective one -- so it needs its own visibility toggle here. Every
		// other map overlay (grid, coastline, borders, etc.) is toggled by
		// updateOverlayVisibility, which also accounts for solarSystemActive.
		const showMap = !active && currentViewMode === "map"
		if (mapMesh) mapMesh.visible = showMap
		mapControls.enabled = showMap
		controls.enabled = active || currentViewMode !== "map"
		updateOverlayVisibility()
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
		setNationFillColorForRawId,
		setNationOccupationStripeColorForRawId,
		setOccupationOverlay,
		setHoveredRegion,
		setNationBordersVisible,
		setEarthHistoryNationOverride,
		setLandNationBordersVisible,
		setOrganizationHighlight,
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
		setEu4Settlements,
		setEu4SettlementsVisible,
		setInfrastructure,
		setInfrastructureVisible,
		setLabelMode,
		setNationNames,
		setDynastyNames,
		setCultureNames,
		setHeritageNames,
		setEarthHistoryLabelPartitions,
		setSettlementNames,
		setElevationVisible,
		setSunPosition,
		setSunDirection,
		setSolarTerminatorUseMeridiem,
		setSolarTerminatorVisible,
		setAtmospherePressure,
		setGlobeCloudTexturePath,
		setCoastlineOverlayVisible,
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
