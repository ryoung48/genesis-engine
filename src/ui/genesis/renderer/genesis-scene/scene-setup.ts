import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js"
import { boostCloudAlphaMap } from "@/ui/genesis/renderer/cloud-material"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"

const GLOBE_CLOUD_RADIUS = 1.035

export const DEFAULT_AMBIENT_INTENSITY = 0.55
export const DEFAULT_SUN_INTENSITY = 2.8
export const DEFAULT_WATER_SPECULAR = 0x5f8fb5
export const DEFAULT_CONTROLS_MIN_DISTANCE = 1.03
export const DEFAULT_CONTROLS_MAX_DISTANCE = 12
// The camera's far clipping plane is fixed at construction time (see
// `camera.far` below), but the solar-system view's camera distance scales
// with the system's real size — which can now run well past 2000 scene
// units for e.g. an O-class star (see MAX_BODY_DIAMETER_KM in
// moon-visual-scale.ts). Without extending `far` to match, zooming out
// toward `maxDistance` pushes the camera past its own far plane and the
// whole scene gets clipped — reads as the view going blank/"crashing".
export const DEFAULT_CAMERA_FAR = 2000

export function setCameraFarForMaxDistance(
	ctx: GenesisContext,
	maxDistance: number,
): void {
	ctx.camera.far = Math.max(DEFAULT_CAMERA_FAR, maxDistance * 1.5)
	ctx.camera.updateProjectionMatrix()
}

/** Constructs the renderer, cameras, controls, scene groups, lighting,
 * water/atmosphere/cloud shells, and starfield that every other genesis
 * scene controller builds on top of. Pure construction -- no per-frame or
 * world-dependent logic lives here (see terrain-controller.ts,
 * animation-loop.ts, etc. for that). */
export function buildGenesisSceneSetup(
	canvas: HTMLCanvasElement,
): GenesisContext {
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
	controls.minDistance = DEFAULT_CONTROLS_MIN_DISTANCE
	controls.maxDistance = DEFAULT_CONTROLS_MAX_DISTANCE

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
	mapControls.maxZoom = 60
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

	// Lighting — low ambient so day/night contrast is visible
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

	return {
		canvas,
		renderer,
		scene,
		camera,
		mapCamera,
		controls,
		mapControls,
		globeGroup,
		orbitGroup,
		solarSystemGroup,
		ambient,
		sun,
		waterGeo,
		waterMat,
		waterMesh,
		atmosGeo,
		atmosMat,
		atmosMesh,
		globeCloudMat,
		globeCloudMesh,
		starGeo,
		starMat,
		terrainMesh: null,
		mapMesh: null,
		terrainFaceToRegion: new Int32Array(0),
		mapFaceToRegion: new Int32Array(0),
		currentWorld: null,
		currentColorMode: "terrain",
		currentRegionColors: null,
		currentOccupationOverlay: null,
		currentViewMode: "globe",
		currentMapCenterLongitudeDeg: 0,
		currentMapProjectionLatitudeDeg: 0,
		elevationVisible: true,
		riverMaterials: [],
		globeCoastlineOverlay: null,
		mapCoastlineOverlay: null,
		cachedCoastlineData: null,
		derivedCoastlineWorld: null,
		derivedCoastlineData: null,
		coastlineOverlayVisible: false,
		coastlineMaterials: [],
		globeMeasureLine: null,
		mapMeasureLine: null,
		globeMeasureDots: null,
		mapMeasureDots: null,
		globePathfindingLine: null,
		mapPathfindingLine: null,
		globePathfindingDots: null,
		mapPathfindingDots: null,
		globeHierarchyOverlay: null,
		mapHierarchyOverlay: null,
		hierarchyOverlayNationId: -1,
		hierarchyOverlayWorld: null,
		globeSettlements: null,
		mapSettlements: null,
		settlementLocations: null,
		settlementUrbanPop: null,
		settlementsVisible: false,
		settlementsDirty: false,
		globeEu4Settlements: null,
		mapEu4Settlements: null,
		eu4SettlementLats: null,
		eu4SettlementLons: null,
		eu4SettlementPopulation: null,
		eu4SettlementProvinceIds: null,
		eu4CapitalProvinceIds: new Set(),
		eu4SettlementIndices: [],
		eu4SettlementsVisible: false,
		globeInfrastructure: null,
		mapInfrastructure: null,
		infrastructureData: null,
		globeInfrastructureMaterials: [],
		mapInfrastructureMaterials: [],
		infrastructureMaterials: [],
		infrastructureVisible: false,
		globeThermalEquator: null,
		mapThermalEquator: null,
		thermalEquatorPoints: null,
		globeWindArrows: null,
		mapWindArrows: null,
		windArrowData: null,
		globeRivers: null,
		mapRivers: null,
		riverData: null,
		riversVisible: false,
		globeRiverMaterials: [],
		mapRiverMaterials: [],
		currentOrgHighlight: null,
		earthHistoryNationOverride: null,
		globeOrgLabel: null,
		mapOrgLabel: null,
		globeNationLabels: null,
		mapNationLabels: null,
		globeNationScripts: null,
		mapNationScripts: null,
		globeSettlementLabels: null,
		mapSettlementLabels: null,
		globeCultureLabels: null,
		mapCultureLabels: null,
		globeHeritageLabels: null,
		mapHeritageLabels: null,
		globeReligionLabels: null,
		mapReligionLabels: null,
		earthHistoryLabelPartitions: null,
		labelMode: {
			nations: false,
			dynasty: false,
			settlements: false,
			culture: false,
			heritage: false,
			religion: false,
			script: false,
		},
		heritageScripts: null,
		nationScriptTextureCache: new Map(),
		pendingNationScriptTextureQueue: null,
		nationNames: null,
		dynastyNames: null,
		settlementLabelNames: null,
		cultureNames: null,
		heritageNames: null,
		cachedEu4BorderGeometry: null,
		cachedEu4FillGeometry: null,
		currentNationFillColorForRawId: null,
		globeNationFill: null,
		mapNationFill: null,
		globeNationFillRadius: null,
		mapNationFillParams: null,
		currentOccupationStripeColorForRawId: null,
		globeOccupationStripes: null,
		mapOccupationStripes: null,
		globeNationBorders: null,
		mapNationBorders: null,
		nationBorderMaterials: [],
		globeSelectedProvinceBorder: null,
		mapSelectedProvinceBorder: null,
		nationBordersVisible: false,
		selectedProvince: -1,
		focusTween: null,
		pulseGlobe: null,
		pulseMap: null,
		pulseMaterials: [],
		pulse: null,
		solarSystemActive: false,
		solarSystemOverlayState: null,
		solarSystemTrackedFocus: null,
		solarSystemTrackedFocusPosition: null,
		solarSystemFocusChangeHandler: null,
		savedCameraPosition: null,
		savedControlsTarget: null,
		solarSystemFocusTween: null,
		moonOrbitState: null,
		currentMoonOrbitDay: 0,
		currentSolarSystemDay: 0,
		currentSolarSystemSpinHours: 0,
		hoverHandler: null,
		clickHandler: null,
		hoveredRegion: -1,
		pointerDownPos: null,
		globeControlsInteracting: false,
		mapControlsInteracting: false,
		globeControlActivityFrames: 0,
		mapControlActivityFrames: 0,
		terrainWireframe: null,
		mapWireframe: null,
		globeGrid: null,
		mapGrid: null,
		wireframeVisible: false,
		gridVisible: false,
		gridSpacingDeg: 15,
		globeSolarTerminator: null,
		mapSolarTerminator: null,
		solarTerminatorVisible: false,
		solarTerminatorUseMeridiem: false,
		currentSunDirection: new THREE.Vector3(1, 0, 0),
		currentLocalSunDirection: new THREE.Vector3(1, 0, 0),
		currentSunHoursPerDay: 24,
	}
}
