import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js"
import { Line2 } from "three/examples/jsm/lines/Line2.js"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import type { ColorMode } from "../colors"
import { disposeGroup, disposeObject3D } from "./disposal"
import { getRegionFocusTargets } from "./focus"
import { createMapProjection } from "./map-projection"
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
	buildGlobeGrid,
	buildGlobeHierarchyOverlay,
	buildGlobeRivers,
	buildGlobeThermalEquator,
	buildHoveredNationBorderGlobe,
	buildHoveredNationBorderMap,
	buildMapGrid,
	buildMapHierarchyOverlay,
	buildMapRivers,
	buildMapThermalEquator,
	collectNationBorderGlobePositions,
	collectNationBorderMapPositions,
} from "./overlay-builders"
import {
	buildSelectedProvinceBorderGlobe,
	buildSelectedProvinceBorderMap,
	collectProvinceBorderGlobePositions,
	collectProvinceBorderMapPositions,
} from "./province-overlay"
import type {
	OrogenHoverInfo,
	OrogenScene,
	OrogenViewMode,
	RiverData,
} from "./types"

export function createOrogenScene(
	canvas: HTMLCanvasElement,
	initialWorld?: SerializedOrogenWorld,
): OrogenScene {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

	const scene = new THREE.Scene()
	scene.background = new THREE.Color(0x030308)

	const camera = new THREE.PerspectiveCamera(
		50,
		canvas.clientWidth / canvas.clientHeight,
		0.01,
		100,
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
	controls.minDistance = 1.4
	controls.maxDistance = 8

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
	scene.add(waterMesh)

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
	scene.add(atmosMesh)

	function setAtmospherePressure(pressureBar: number) {
		const clamped = Math.max(
			0.1,
			Math.min(10, Number.isFinite(pressureBar) ? pressureBar : 1),
		)
		const pressureFactor = Math.pow(clamped, 0.4)
		atmosMat.uniforms.atmosphereStrength.value = 0.7 + pressureFactor * 0.45
		const shellScale = 1.105 + pressureFactor * 0.02
		atmosMesh.scale.setScalar(shellScale / 1.12)
	}

	// Starfield
	const starCount = 3000
	const starPositions = new Float32Array(starCount * 3)
	for (let i = 0; i < starCount; i++) {
		const theta = Math.random() * 2 * Math.PI
		const phi = Math.acos(2 * Math.random() - 1)
		const r = 30 + Math.random() * 20
		starPositions[3 * i] = r * Math.sin(phi) * Math.cos(theta)
		starPositions[3 * i + 1] = r * Math.sin(phi) * Math.sin(theta)
		starPositions[3 * i + 2] = r * Math.cos(phi)
	}
	const starGeo = new THREE.BufferGeometry()
	starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3))
	const starMat = new THREE.PointsMaterial({
		color: 0xffffff,
		size: 0.08,
		sizeAttenuation: true,
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
	let currentWorld: SerializedOrogenWorld | null = null
	let currentColorMode: ColorMode = "terrain"
	let currentRegionColors: Float32Array | null = null
	let currentOccupationOverlay: Float32Array | null = null
	let currentViewMode: OrogenViewMode = "globe"
	let wireframeVisible = false
	let gridVisible = false
	let gridSpacingDeg = 15
	const currentMapCenterLongitudeDeg = 0
	let currentMapProjectionLatitudeDeg = 0
	let focusTween: {
		mode: OrogenViewMode
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
	let globeRivers: THREE.Group | null = null
	let mapRivers: THREE.Group | null = null
	let riverData: RiverData | null = null
	let riversVisible = false
	let riverMaterials: LineMaterial[] = []
	let globeHoverNationBorder: THREE.LineSegments | null = null
	let mapHoverNationBorder: THREE.LineSegments | null = null
	let globeSelectedProvinceBorder: THREE.Object3D | null = null
	let mapSelectedProvinceBorder: THREE.Object3D | null = null
	let hoverHandler: ((info: OrogenHoverInfo | null) => void) | null = null
	let clickHandler: ((info: OrogenHoverInfo) => void) | null = null
	let hoveredRegion = -1
	let hoveredNation = -1
	let selectedProvince = -1
	let nationBordersVisible = false
	const raycaster = new THREE.Raycaster()
	const pointer = new THREE.Vector2()
	let globeMeasureLine: THREE.Line | null = null
	let mapMeasureLine: THREE.Line | null = null
	let globeMeasureDots: THREE.Group | null = null
	let mapMeasureDots: THREE.Group | null = null
	let globeHierarchyOverlay: THREE.Group | null = null
	let mapHierarchyOverlay: THREE.Group | null = null
	let hierarchyOverlayNationId = -1
	let hierarchyOverlayWorld: SerializedOrogenWorld | null = null

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
		disposeGroup(scene, globeHierarchyOverlay)
		disposeGroup(scene, mapHierarchyOverlay)
		globeHierarchyOverlay = null
		mapHierarchyOverlay = null
		if (!hierarchyOverlayWorld || hierarchyOverlayNationId < 0) return
		globeHierarchyOverlay = buildGlobeHierarchyOverlay(
			hierarchyOverlayWorld,
			hierarchyOverlayNationId,
			currentViewMode,
			canvas,
		)
		mapHierarchyOverlay = buildMapHierarchyOverlay(
			hierarchyOverlayWorld,
			hierarchyOverlayNationId,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			currentViewMode,
			canvas,
		)
		if (globeHierarchyOverlay) scene.add(globeHierarchyOverlay)
		if (mapHierarchyOverlay) scene.add(mapHierarchyOverlay)
		updateOverlayVisibility()
	}

	function rebuildHoveredNationBorder() {
		disposeObject3D(scene, globeHoverNationBorder)
		disposeObject3D(scene, mapHoverNationBorder)
		globeHoverNationBorder = null
		mapHoverNationBorder = null
		if (!currentWorld || hoveredNation < 0 || !nationBordersVisible) return
		globeHoverNationBorder = buildHoveredNationBorderGlobe(
			currentWorld,
			hoveredNation,
			currentViewMode,
			nationBordersVisible,
		)
		mapHoverNationBorder = buildHoveredNationBorderMap(
			currentWorld,
			hoveredNation,
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
			currentViewMode,
			nationBordersVisible,
		)
		if (globeHoverNationBorder) scene.add(globeHoverNationBorder)
		if (mapHoverNationBorder) scene.add(mapHoverNationBorder)
		updateOverlayVisibility()
	}

	function rebuildSelectedProvinceBorder() {
		disposeObject3D(scene, globeSelectedProvinceBorder)
		disposeObject3D(scene, mapSelectedProvinceBorder)
		globeSelectedProvinceBorder = null
		mapSelectedProvinceBorder = null
		if (!currentWorld?.provinces || selectedProvince < 0) return
		globeSelectedProvinceBorder = buildSelectedProvinceBorderGlobe(
			currentWorld,
			selectedProvince,
			currentViewMode,
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
		if (globeSelectedProvinceBorder) scene.add(globeSelectedProvinceBorder)
		if (mapSelectedProvinceBorder) scene.add(mapSelectedProvinceBorder)
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
		if (useTerrainWaterMaterial) {
			waterMat.color.set(0xffffff)
			waterMat.opacity = 0.12
			waterMat.specular.set(DEFAULT_WATER_SPECULAR)
		} else {
			waterMat.color.set(0x0c3a6e)
			waterMat.opacity = 0.12
			waterMat.specular.set(0x000000)
		}
		if (currentViewMode === "globe") {
			waterMesh.visible = true
			atmosMesh.visible = sun.intensity > 0
		}
	}

	function refreshMeshColors() {
		if (currentRegionColors) {
			if (!recolorMeshesInPlace()) rebuildTerrain()
			return
		}
		if (!recolorModeColorsInPlace()) rebuildTerrain()
	}

	function rebuildOverlays() {
		disposeObject3D(scene, terrainWireframe)
		disposeObject3D(scene, mapWireframe)
		disposeObject3D(scene, globeGrid)
		disposeObject3D(scene, mapGrid)
		disposeObject3D(scene, globeThermalEquator)
		disposeObject3D(scene, mapThermalEquator)
		disposeObject3D(scene, globeHoverNationBorder)
		disposeObject3D(scene, mapHoverNationBorder)
		disposeObject3D(scene, globeSelectedProvinceBorder)
		disposeObject3D(scene, mapSelectedProvinceBorder)
		disposeObject3D(scene, pulseGlobe)
		disposeObject3D(scene, pulseMap)
		disposeGroup(scene, globeRivers)
		disposeGroup(scene, mapRivers)
		disposeGroup(scene, globeHierarchyOverlay)
		disposeGroup(scene, mapHierarchyOverlay)
		terrainWireframe = null
		mapWireframe = null
		globeGrid = null
		mapGrid = null
		globeThermalEquator = null
		mapThermalEquator = null
		globeHoverNationBorder = null
		mapHoverNationBorder = null
		pulseGlobe = null
		pulseMap = null
		pulse = null
		globeRivers = null
		mapRivers = null
		riverMaterials = []
		globeHierarchyOverlay = null
		mapHierarchyOverlay = null

		if (wireframeVisible && currentWorld) {
			terrainWireframe = buildTerrainWireframe(
				currentWorld,
				wireframeVisible,
				currentViewMode,
			)
			scene.add(terrainWireframe)
		}
		if (wireframeVisible && currentWorld) {
			mapWireframe = buildMapWireframe(
				currentWorld,
				currentMapCenterLongitudeDeg,
				currentMapProjectionLatitudeDeg,
				wireframeVisible,
				currentViewMode,
			)
			scene.add(mapWireframe)
		}
		if (gridVisible) {
			globeGrid = buildGlobeGrid(gridSpacingDeg, gridVisible, currentViewMode)
			mapGrid = buildMapGrid(
				gridSpacingDeg,
				currentMapProjectionLatitudeDeg,
				gridVisible,
				currentViewMode,
			)
			scene.add(globeGrid)
			scene.add(mapGrid)
		}
		if (thermalEquatorPoints) {
			globeThermalEquator = buildGlobeThermalEquator(
				thermalEquatorPoints,
				currentViewMode,
			)
			mapThermalEquator = buildMapThermalEquator(
				thermalEquatorPoints,
				currentMapProjectionLatitudeDeg,
				currentViewMode,
			)
			scene.add(globeThermalEquator)
			scene.add(mapThermalEquator)
		}
		if (riversVisible && riverData) {
			globeRivers = buildGlobeRivers(
				riverData,
				canvas,
				riverMaterials,
				riversVisible,
				currentViewMode,
			)
			mapRivers = buildMapRivers(
				riverData,
				canvas,
				riverMaterials,
				currentMapProjectionLatitudeDeg,
				riversVisible,
				currentViewMode,
			)
			scene.add(globeRivers)
			scene.add(mapRivers)
		}
		rebuildHoveredNationBorder()
		rebuildSelectedProvinceBorder()
		rebuildHierarchyOverlay()
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
		if (globeHoverNationBorder)
			globeHoverNationBorder.visible =
				currentViewMode === "globe" && nationBordersVisible
		if (mapHoverNationBorder) {
			mapHoverNationBorder.visible =
				currentViewMode === "map" && nationBordersVisible
			if (mapMesh) mapHoverNationBorder.position.copy(mapMesh.position)
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
	}

	function rebuildTerrain() {
		if (!currentWorld) return
		disposeObject3D(scene, terrainMesh)
		disposeObject3D(scene, mapMesh)
		disposeObject3D(scene, mapOccupationOverlay)
		terrainMesh = null
		mapMesh = null
		mapOccupationOverlay = null
		const terrainBuild = buildTerrainMesh(
			currentWorld,
			currentColorMode,
			currentRegionColors,
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
		scene.add(terrainMesh)
		scene.add(mapMesh)
		if (currentOccupationOverlay) {
			mapOccupationOverlay = buildMapOccupationOverlay(
				mapMesh,
				currentOccupationOverlay,
				mapFaceToRegion,
				currentMapCenterLongitudeDeg,
				currentMapProjectionLatitudeDeg,
			)
			if (mapOccupationOverlay) scene.add(mapOccupationOverlay)
		}
		rebuildOverlays()
		setViewMode(currentViewMode)
	}

	function updateWorld(world: SerializedOrogenWorld | null) {
		if (!world) {
			currentWorld = null
			hoveredRegion = -1
			hoveredNation = -1
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
		if (hoveredRegion >= 0) {
			const hoveredProvince =
				world.provinces?.regionProvince?.[hoveredRegion] ?? -1
			hoveredNation =
				hoveredProvince >= 0 && world.nations
					? world.nations.assignment[hoveredProvince]
					: -1
		} else {
			hoveredNation = -1
		}
		if (geometryUnchanged) {
			rebuildHoveredNationBorder()
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
		if (!currentWorld || hoveredRegion < 0 || !nationBordersVisible) {
			hoveredNation = -1
			rebuildHoveredNationBorder()
			return
		}
		const hoveredProvince =
			currentWorld.provinces?.regionProvince?.[hoveredRegion] ?? -1
		hoveredNation =
			hoveredProvince >= 0 && currentWorld.nations
				? currentWorld.nations.assignment[hoveredProvince]
				: -1
		rebuildHoveredNationBorder()
	}

	function setNationBordersVisible(visible: boolean) {
		if (nationBordersVisible === visible) return
		nationBordersVisible = visible
		rebuildHoveredNationBorder()
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
	}

	function focusOnNation(nationId: number, opts?: { durationMs?: number }) {
		if (!currentWorld?.nations || !currentWorld.provinces) return
		if (nationId < 0) return
		setSelectedProvince(null)
		// `nationId` from the UI is actually a sovereign province index
		// (see OrogenView click handler — assignment = sovereign).
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
				? collectProvinceBorderGlobePositions(currentWorld, province, 0.003)
				: (() => {
						if (!currentWorld.nations) return []
						const nation = currentWorld.nations.assignment[province]
						return nation < 0
							? []
							: collectNationBorderGlobePositions(currentWorld, nation, 0.003)
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
			scene.add(pulseGlobe)
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
	}

	function stepPulse() {
		if (!pulse) return
		const u = (performance.now() - pulse.t0) / pulse.duration
		if (u >= 1) {
			const clearSelectedProvince = pulse.clearSelectedProvince
			clearPulse()
			if (clearSelectedProvince) setSelectedProvince(null)
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
		}
	}

	function setViewMode(mode: OrogenViewMode) {
		currentViewMode = mode
		const isMap = mode === "map"
		controls.enabled = !isMap
		mapControls.enabled = isMap
		if (terrainMesh) terrainMesh.visible = !isMap
		if (mapMesh) mapMesh.visible = isMap
		waterMesh.visible = !isMap
		atmosMesh.visible = !isMap && sun.intensity > 0
		updateOverlayVisibility()
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

	function setMapCenterLongitude(_longitudeDeg: number) {
		// No-op — free pan/zoom replaces center longitude control
	}

	function setMapProjectionLatitude(latitudeDeg: number) {
		const clamped = THREE.MathUtils.clamp(latitudeDeg, -90, 90)
		if (currentMapProjectionLatitudeDeg === clamped) return
		currentMapProjectionLatitudeDeg = clamped
		if (currentWorld) rebuildTerrain()
		else rebuildOverlays()
	}

	function commitMapCenterLongitude() {
		// No-op — free pan/zoom replaces center longitude control
	}

	function emitHover(info: OrogenHoverInfo | null) {
		hoverHandler?.(info)
	}

	function clearHover() {
		if (hoveredRegion === -1) return
		hoveredRegion = -1
		hoveredNation = -1
		rebuildHoveredNationBorder()
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
		if (currentWorld && nationBordersVisible) {
			const hoveredProvince =
				currentWorld.provinces?.regionProvince?.[region] ?? -1
			const nextHoveredNation =
				hoveredProvince >= 0 && currentWorld.nations
					? currentWorld.nations.assignment[hoveredProvince]
					: -1
			if (nextHoveredNation !== hoveredNation) {
				hoveredNation = nextHoveredNation
				rebuildHoveredNationBorder()
			}
		}
		emitHover({
			region,
			clientX: event.clientX - rect.left,
			clientY: event.clientY - rect.top,
		})
	}

	if (initialWorld) {
		updateWorld(initialWorld)
	}

	// Animation loop
	let animId = 0
	function animate() {
		animId = requestAnimationFrame(animate)
		stepFocusTween()
		stepPulse()
		if (currentViewMode === "map") {
			mapControls.update()
			renderer.render(scene, mapCamera)
		} else {
			if (globeMeasureDots && globeMeasureDots.visible) {
				const dist = camera.position.length()
				const scale = dist * 0.001
				for (const child of globeMeasureDots.children) {
					child.scale.setScalar(scale)
				}
			}
			controls.update()
			renderer.render(scene, camera)
		}
	}
	animate()

	function resize() {
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		camera.aspect = w / h
		camera.updateProjectionMatrix()
		updateMapCameraFrustum()
		renderer.setSize(w, h, false)
		for (const mat of riverMaterials) mat.resolution.set(w, h)
		for (const mat of pulseMaterials) mat.resolution.set(w, h)
		if (selectedProvince >= 0) rebuildSelectedProvinceBorder()
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

	canvas.addEventListener("pointermove", updateHover)
	canvas.addEventListener("pointerleave", clearHover)
	canvas.addEventListener("pointerdown", handlePointerDown)
	canvas.addEventListener("pointerup", handleClick)

	function dispose() {
		cancelAnimationFrame(animId)
		canvas.removeEventListener("pointermove", updateHover)
		canvas.removeEventListener("pointerleave", clearHover)
		canvas.removeEventListener("pointerdown", handlePointerDown)
		canvas.removeEventListener("pointerup", handleClick)
		controls.dispose()
		mapControls.dispose()
		renderer.dispose()
		disposeObject3D(scene, terrainMesh)
		disposeObject3D(scene, mapMesh)
		disposeObject3D(scene, mapOccupationOverlay)
		disposeObject3D(scene, terrainWireframe)
		disposeObject3D(scene, mapWireframe)
		disposeObject3D(scene, globeGrid)
		disposeObject3D(scene, mapGrid)
		disposeObject3D(scene, globeThermalEquator)
		disposeObject3D(scene, mapThermalEquator)
		disposeObject3D(scene, globeHoverNationBorder)
		disposeObject3D(scene, mapHoverNationBorder)
		disposeObject3D(scene, pulseGlobe)
		disposeObject3D(scene, pulseMap)
		disposeGroup(scene, globeRivers)
		disposeGroup(scene, mapRivers)
		disposeGroup(scene, globeHierarchyOverlay)
		disposeGroup(scene, mapHierarchyOverlay)
		waterGeo.dispose()
		waterMat.dispose()
		atmosGeo.dispose()
		atmosMat.dispose()
		starGeo.dispose()
		starMat.dispose()
	}

	function setHoverHandler(
		handler: ((info: OrogenHoverInfo | null) => void) | null,
	) {
		hoverHandler = handler
		if (!handler) clearHover()
	}

	function setClickHandler(handler: ((info: OrogenHoverInfo) => void) | null) {
		clickHandler = handler
	}

	function setMeasureLine(
		startXYZ: [number, number, number] | null,
		endXYZ: [number, number, number] | null,
	) {
		disposeObject3D(scene, globeMeasureLine)
		disposeObject3D(scene, mapMeasureLine)
		disposeObject3D(scene, globeMeasureDots)
		disposeObject3D(scene, mapMeasureDots)
		globeMeasureLine = null
		mapMeasureLine = null
		globeMeasureDots = null
		mapMeasureDots = null

		if (!startXYZ || !endXYZ) return

		const arcRadius = 1.02
		const mapProjection = createMapProjection(
			currentMapCenterLongitudeDeg,
			currentMapProjectionLatitudeDeg,
		)
		const w = canvas.clientWidth || 1
		const h = canvas.clientHeight || 1

		const s = new THREE.Vector3(...startXYZ).normalize()
		const e = new THREE.Vector3(...endXYZ).normalize()
		const angle = s.angleTo(e)
		const numSegments = Math.max(2, Math.ceil(angle / 0.02))
		const globePositions: number[] = []
		const mapPositions: number[] = []

		for (let i = 0; i <= numSegments; i++) {
			const t = i / numSegments
			let pt: THREE.Vector3
			if (angle < 0.001) {
				pt = s.clone()
			} else {
				const sinA = Math.sin(angle)
				const a = Math.sin((1 - t) * angle) / sinA
				const b = Math.sin(t * angle) / sinA
				pt = new THREE.Vector3(
					s.x * a + e.x * b,
					s.y * a + e.y * b,
					s.z * a + e.z * b,
				)
			}
			pt.normalize().multiplyScalar(arcRadius)
			globePositions.push(pt.x, pt.y, pt.z)
			const projected = mapProjection.projectCartesian(
				pt.x / arcRadius,
				pt.y / arcRadius,
				pt.z / arcRadius,
			)
			const mapPoint = mapProjection.projectRadians(
				projected.lon,
				projected.lat,
				0.003,
			)
			mapPositions.push(mapPoint[0], mapPoint[1], mapPoint[2])
		}

		const globeLineGeo = new LineGeometry()
		globeLineGeo.setPositions(globePositions)
		const globeLineMat = new LineMaterial({
			color: 0x000000,
			linewidth: 2,
			resolution: new THREE.Vector2(w, h),
			depthWrite: false,
			depthTest: false,
			dashed: true,
			dashSize: 0.008,
			gapSize: 0.006,
		})
		const globeLine2 = new Line2(globeLineGeo, globeLineMat)
		globeLine2.computeLineDistances()
		globeLine2.renderOrder = 999
		globeLine2.visible = currentViewMode === "globe"
		globeMeasureLine = globeLine2 as unknown as THREE.Line
		scene.add(globeMeasureLine)

		const mapLineGeo = new LineGeometry()
		mapLineGeo.setPositions(mapPositions)
		const mapLineMat = new LineMaterial({
			color: 0x000000,
			linewidth: 2,
			resolution: new THREE.Vector2(w, h),
			depthWrite: false,
			depthTest: false,
			dashed: true,
			dashSize: 0.008,
			gapSize: 0.006,
		})
		const mapLine2 = new Line2(mapLineGeo, mapLineMat)
		mapLine2.computeLineDistances()
		mapLine2.renderOrder = 999
		mapLine2.visible = currentViewMode === "map"
		if (mapMesh) mapLine2.position.copy(mapMesh.position)
		mapMeasureLine = mapLine2 as unknown as THREE.Line
		scene.add(mapMeasureLine)

		globeMeasureDots = new THREE.Group()
		const dotGeo = new THREE.SphereGeometry(1, 8, 8)
		const dotMat = new THREE.MeshBasicMaterial({
			color: 0x000000,
			depthTest: false,
		})
		for (const xyz of [
			s.clone().multiplyScalar(arcRadius),
			e.clone().multiplyScalar(arcRadius),
		]) {
			const dot = new THREE.Mesh(dotGeo, dotMat)
			dot.position.copy(xyz)
			dot.renderOrder = 999
			globeMeasureDots.add(dot)
		}
		globeMeasureDots.visible = currentViewMode === "globe"
		scene.add(globeMeasureDots)

		mapMeasureDots = new THREE.Group()
		const mapDotGeo = new THREE.CircleGeometry(0.008, 12)
		const startMapPt = new THREE.Vector3(
			mapPositions[0],
			mapPositions[1],
			mapPositions[2],
		)
		const endMapPt = new THREE.Vector3(
			mapPositions[mapPositions.length - 3],
			mapPositions[mapPositions.length - 2],
			mapPositions[mapPositions.length - 1],
		)
		for (const pt of [startMapPt, endMapPt]) {
			const dot = new THREE.Mesh(mapDotGeo, dotMat.clone())
			dot.position.copy(pt)
			dot.renderOrder = 999
			mapMeasureDots.add(dot)
		}
		mapMeasureDots.visible = currentViewMode === "map"
		if (mapMesh) mapMeasureDots.position.copy(mapMesh.position)
		scene.add(mapMeasureDots)
	}

	function projectToScreen(
		xyz: [number, number, number],
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
				projected.lon,
				projected.lat,
				0.003,
			)
			v.set(mapPoint[0], mapPoint[1], mapPoint[2])
			if (mapMesh) v.add(mapMesh.position)
		} else {
			v.normalize().multiplyScalar(1.005)
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

	function setRivers(data: RiverData | null) {
		riverData = data
		rebuildOverlays()
	}

	function setRiversVisible(visible: boolean) {
		if (riversVisible === visible) return
		riversVisible = visible
		rebuildOverlays()
	}

	/**
	 * Position the sun from month (season → latitude) and time-of-day (→ longitude).
	 * month 0 = equinox, 1-12 = Jan-Dec.
	 * timeOfDay in hours [0, hoursPerDay). hoursPerDay controls full rotation.
	 */
	function setSunPosition(
		month: number,
		obliquityDeg: number,
		timeOfDay: number,
		hoursPerDay: number,
	) {
		const oblRad = (obliquityDeg * Math.PI) / 180
		// June (month 6) = northern summer solstice (+obliquity)
		// December (month 12) = southern summer solstice (-obliquity)
		const subSolarLat =
			month === 0 ? 0 : oblRad * Math.sin((2 * Math.PI * (month - 4)) / 12)
		const cosLat = Math.cos(subSolarLat)
		const sinLat = Math.sin(subSolarLat)
		// Longitude from time of day — offset so noon faces the default camera
		const lon = Math.PI + 2 * Math.PI * (timeOfDay / (hoursPerDay || 24))
		const dist = 10
		sun.position.set(
			dist * cosLat * Math.cos(lon),
			dist * cosLat * Math.sin(lon),
			dist * sinLat,
		)
		atmosMat.uniforms.sunDirection.value.copy(sun.position).normalize()
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
	}

	function setHierarchyOverlay(
		world: SerializedOrogenWorld | null,
		selectedNationId: number,
	) {
		hierarchyOverlayWorld = world
		hierarchyOverlayNationId = selectedNationId
		rebuildHierarchyOverlay()
	}

	return {
		dispose,
		resize,
		updateWorld,
		setColorMode,
		setRegionColors,
		setDisplayColors,
		setOccupationOverlay,
		setHoveredRegion,
		setNationBordersVisible,
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
		projectToScreen,
		setThermalEquator,
		setRivers,
		setRiversVisible,
		setHierarchyOverlay,
		setSunPosition,
		setAtmospherePressure,
		setFullAmbient,
		focusOnNation,
		focusOnProvince,
	}
}
