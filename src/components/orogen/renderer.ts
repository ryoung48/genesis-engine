import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js"
import { Line2 } from "three/examples/jsm/lines/Line2.js"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import { type ColorMode, getColor } from "./colors"

export type OrogenViewMode = "globe" | "map"
export interface OrogenHoverInfo {
	region: number
	clientX: number
	clientY: number
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
	/** Set thermal equator points as [lonDeg, latDeg][] or null to hide */
	setThermalEquator(points: [number, number][] | null): void
	setRivers(
		data: {
			lines: [number, number, number, number][][]
			maxFlow: number
			minFlow: number
		} | null,
	): void
	setRiversVisible(visible: boolean): void
	setWindArrows(
		data: {
			east: Float32Array
			north: Float32Array
			speed: Float32Array
		} | null,
	): void
	setWindArrowsVisible(visible: boolean): void
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
	let pulse: { t0: number; duration: number } | null = null
	let terrainFaceToRegion: Int32Array = new Int32Array(0)
	let mapFaceToRegion: Int32Array = new Int32Array(0)
	let globeThermalEquator: THREE.Line | null = null
	let mapThermalEquator: THREE.Line | null = null
	let thermalEquatorPoints: [number, number][] | null = null
	let globeRivers: THREE.Group | null = null
	let mapRivers: THREE.Group | null = null
	let riverData: {
		lines: [number, number, number, number][][]
		maxFlow: number
		minFlow: number
	} | null = null
	let riversVisible = false
	let riverMaterials: LineMaterial[] = []
	let globeWindArrows: THREE.LineSegments | null = null
	let mapWindArrows: THREE.LineSegments | null = null
	let globeHoverNationBorder: THREE.LineSegments | null = null
	let mapHoverNationBorder: THREE.LineSegments | null = null
	let windArrowData: {
		east: Float32Array
		north: Float32Array
		speed: Float32Array
	} | null = null
	let windArrowsVisible = false
	let hoverHandler: ((info: OrogenHoverInfo | null) => void) | null = null
	let clickHandler: ((info: OrogenHoverInfo) => void) | null = null
	let hoveredRegion = -1
	let hoveredNation = -1
	let nationBordersVisible = false
	const raycaster = new THREE.Raycaster()
	const pointer = new THREE.Vector2()
	let globeMeasureLine: THREE.Line | null = null
	let mapMeasureLine: THREE.Line | null = null
	let globeMeasureDots: THREE.Group | null = null
	let mapMeasureDots: THREE.Group | null = null

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

	function buildTerrainMesh(
		world: SerializedOrogenWorld,
		colorMode: ColorMode,
	): THREE.Mesh {
		const { mesh, elevation, elevation_km } = world
		const {
			numSides,
			numTriangles,
			s_begin_r,
			s_inner_t,
			s_outer_t,
			r_xyz,
			t_xyz,
		} = mesh
		const useRegionColors =
			currentRegionColors && currentRegionColors.length >= mesh.numRegions * 3
		const isHeightmap = colorMode === "heightmap"
		const isLandHeightmap = colorMode === "landHeightmap"
		const isSmoothHeightmap = isHeightmap || isLandHeightmap
		const V = 0.04

		const tElevation = new Float32Array(numTriangles)
		const tElevationKm = new Float32Array(numTriangles)
		for (let t = 0; t < numTriangles; t++) {
			const s0 = 3 * t
			const a = s_begin_r[s0]
			const b = s_begin_r[s0 + 1]
			const c = s_begin_r[s0 + 2]
			tElevation[t] = (elevation[a] + elevation[b] + elevation[c]) / 3
			tElevationKm[t] =
				(elevation_km[a] + elevation_km[b] + elevation_km[c]) / 3
		}

		// Count valid sides (both triangles exist)
		let validCount = 0
		for (let s = 0; s < numSides; s++) {
			if (s_outer_t[s] >= 0) validCount++
		}
		terrainFaceToRegion = new Int32Array(validCount)

		const positions = new Float32Array(validCount * 3 * 3)
		const colors = new Float32Array(validCount * 3 * 3)
		let vi = 0
		let faceIndex = 0

		for (let s = 0; s < numSides; s++) {
			const tInner = s_inner_t[s]
			const tOuter = s_outer_t[s]
			if (tOuter < 0) continue

			const rBegin = s_begin_r[s]
			terrainFaceToRegion[faceIndex++] = rBegin

			// Triangle: inner_t center, region_begin, outer_t center
			const pts = [
				{
					x: t_xyz[3 * tInner],
					y: t_xyz[3 * tInner + 1],
					z: t_xyz[3 * tInner + 2],
					elev: tElevation[tInner],
					colorElev: tElevationKm[tInner],
				},
				{
					x: r_xyz[3 * rBegin],
					y: r_xyz[3 * rBegin + 1],
					z: r_xyz[3 * rBegin + 2],
					elev: elevation[rBegin],
					colorElev: elevation_km[rBegin],
				},
				{
					x: t_xyz[3 * tOuter],
					y: t_xyz[3 * tOuter + 1],
					z: t_xyz[3 * tOuter + 2],
					elev: tElevation[tOuter],
					colorElev: tElevationKm[tOuter],
				},
			]

			// Displace and set vertex data
			for (const p of pts) {
				const r = 1.0 + (p.elev > 0 ? p.elev * V : p.elev * V * 0.3)
				const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
				const nx = p.x / len
				const ny = p.y / len
				const nz = p.z / len

				positions[vi] = nx * r
				positions[vi + 1] = ny * r
				positions[vi + 2] = nz * r

				if (useRegionColors) {
					colors[vi] = currentRegionColors![3 * rBegin]
					colors[vi + 1] = currentRegionColors![3 * rBegin + 1]
					colors[vi + 2] = currentRegionColors![3 * rBegin + 2]
				} else {
					const colorElev = isSmoothHeightmap
						? p.colorElev
						: elevation_km[rBegin]
					const [cr, cg, cb] = getColor(colorElev, colorMode)
					colors[vi] = cr
					colors[vi + 1] = cg
					colors[vi + 2] = cb
				}
				vi += 3
			}
		}

		// Fix winding order
		for (let i = 0; i < validCount; i++) {
			const base = i * 9
			const ax = positions[base]
			const ay = positions[base + 1]
			const az = positions[base + 2]
			const bx = positions[base + 3]
			const by = positions[base + 4]
			const bz = positions[base + 5]
			const cx = positions[base + 6]
			const cy = positions[base + 7]
			const cz = positions[base + 8]

			// Edge vectors
			const e1x = bx - ax,
				e1y = by - ay,
				e1z = bz - az
			const e2x = cx - ax,
				e2y = cy - ay,
				e2z = cz - az

			// Face normal
			const fnx = e1y * e2z - e1z * e2y
			const fny = e1z * e2x - e1x * e2z
			const fnz = e1x * e2y - e1y * e2x

			// Centroid
			const centX = (ax + bx + cx) / 3
			const centY = (ay + by + cy) / 3
			const centZ = (az + bz + cz) / 3

			// If normal points inward, swap v1 and v2
			if (fnx * centX + fny * centY + fnz * centZ < 0) {
				// Swap B and C
				positions[base + 3] = cx
				positions[base + 4] = cy
				positions[base + 5] = cz
				positions[base + 6] = bx
				positions[base + 7] = by
				positions[base + 8] = bz
				// Swap colors too
				const tr = colors[base + 3],
					tg = colors[base + 4],
					tb = colors[base + 5]
				colors[base + 3] = colors[base + 6]
				colors[base + 4] = colors[base + 7]
				colors[base + 5] = colors[base + 8]
				colors[base + 6] = tr
				colors[base + 7] = tg
				colors[base + 8] = tb
			}
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
		geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
		geometry.setAttribute(
			"occColor",
			new THREE.BufferAttribute(new Float32Array(validCount * 3 * 3), 3),
		)
		geometry.setAttribute(
			"occMask",
			new THREE.BufferAttribute(new Float32Array(validCount * 3), 1),
		)
		geometry.computeVertexNormals()

		const material = new THREE.MeshLambertMaterial({
			vertexColors: true,
		})
		material.onBeforeCompile = (shader) => {
			shader.vertexShader = shader.vertexShader.replace(
				"#include <beginnormal_vertex>",
				"vec3 objectNormal = normalize(position);",
			)
			shader.vertexShader = shader.vertexShader.replace(
				"void main() {",
				`attribute vec3 occColor;
				attribute float occMask;
				varying vec3 vOccColor;
				varying float vOccMask;
				varying vec3 vWorldPos;
				void main() {
					vOccColor = occColor;
					vOccMask = occMask;
					vWorldPos = position;`,
			)
			shader.fragmentShader = shader.fragmentShader.replace(
				"void main() {",
				`varying vec3 vOccColor;
				varying float vOccMask;
				varying vec3 vWorldPos;
				void main() {`,
			)
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <color_fragment>",
				`#include <color_fragment>
				if (vOccMask > 0.5) {
					float lon = atan(vWorldPos.y, vWorldPos.x);
					float lat = asin(clamp(vWorldPos.z / length(vWorldPos), -1.0, 1.0));
					float stripe = fract((lon + lat) * 100.0);
					if (stripe > 0.25 && stripe < 0.75) {
						diffuseColor.rgb = vOccColor;
					}
				}`,
			)
		}

		return new THREE.Mesh(geometry, material)
	}

	function buildTerrainWireframe(
		world: SerializedOrogenWorld,
	): THREE.LineSegments {
		const { mesh, elevation } = world
		const { numSides, halfedges, s_inner_t, s_outer_t, t_xyz, s_begin_r } = mesh
		const positions: number[] = []
		const V = 0.04

		for (let s = 0; s < numSides; s++) {
			const opp = halfedges[s]
			if (opp >= 0 && s > opp) continue
			const tInner = s_inner_t[s]
			const tOuter = s_outer_t[s]
			if (tInner < 0 || tOuter < 0) continue

			const r0 = s_begin_r[s]
			const r1 = opp >= 0 ? s_begin_r[opp] : r0
			const avgElev = (elevation[r0] + elevation[r1]) * 0.5
			const radius = 1.002 + (avgElev > 0 ? avgElev * V : avgElev * V * 0.3)

			positions.push(
				t_xyz[3 * tInner] * radius,
				t_xyz[3 * tInner + 1] * radius,
				t_xyz[3 * tInner + 2] * radius,
				t_xyz[3 * tOuter] * radius,
				t_xyz[3 * tOuter + 1] * radius,
				t_xyz[3 * tOuter + 2] * radius,
			)
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
		)
		const material = new THREE.LineBasicMaterial({
			color: 0x0f172a,
			transparent: true,
			opacity: 0.32,
			depthWrite: false,
		})
		const lines = new THREE.LineSegments(geometry, material)
		lines.visible = wireframeVisible && currentViewMode === "globe"
		return lines
	}

	function buildMapMesh(
		world: SerializedOrogenWorld,
		colorMode: ColorMode,
	): THREE.Mesh {
		const { mesh, elevation_km } = world
		const { numSides, s_begin_r, s_inner_t, s_outer_t, r_xyz, t_xyz } = mesh
		const useRegionColors =
			currentRegionColors && currentRegionColors.length >= mesh.numRegions * 3
		const isHeightmap = colorMode === "heightmap"
		const isLandHeightmap = colorMode === "landHeightmap"
		const isSmoothHeightmap = isHeightmap || isLandHeightmap
		const pi = Math.PI
		const sx = 2 / pi
		const centerLon = (currentMapCenterLongitudeDeg * pi) / 180

		const tElevationKm = new Float32Array(mesh.numTriangles)
		for (let t = 0; t < mesh.numTriangles; t++) {
			const s0 = 3 * t
			const a = s_begin_r[s0]
			const b = s_begin_r[s0 + 1]
			const c = s_begin_r[s0 + 2]
			tElevationKm[t] =
				(elevation_km[a] + elevation_km[b] + elevation_km[c]) / 3
		}

		const posArr = new Float32Array(numSides * 2 * 9)
		const colArr = new Float32Array(numSides * 2 * 9)
		const faceToRegion = new Int32Array(numSides * 2)
		let triCount = 0

		const clampX = (v: number) => Math.max(-2, Math.min(2, v))
		const clampY = (v: number) => Math.max(-1, Math.min(1, v))
		const wrapLon = (lon: number) => {
			let l = lon - centerLon
			if (l > pi) l -= 2 * pi
			else if (l < -pi) l += 2 * pi
			return l
		}
		const project = (x: number, y: number, z: number) => {
			const lon = wrapLon(Math.atan2(y, x))
			const lat = Math.asin(Math.max(-1, Math.min(1, z)))
			return { lon, lat }
		}

		for (let s = 0; s < numSides; s++) {
			const tInner = s_inner_t[s]
			const tOuter = s_outer_t[s]
			if (tOuter < 0) continue
			const rBegin = s_begin_r[s]

			const p0 = project(
				t_xyz[3 * tInner],
				t_xyz[3 * tInner + 1],
				t_xyz[3 * tInner + 2],
			)
			const p1 = project(
				t_xyz[3 * tOuter],
				t_xyz[3 * tOuter + 1],
				t_xyz[3 * tOuter + 2],
			)
			const p2 = project(
				r_xyz[3 * rBegin],
				r_xyz[3 * rBegin + 1],
				r_xyz[3 * rBegin + 2],
			)

			let lon0 = p0.lon,
				lon1 = p1.lon,
				lon2 = p2.lon
			const lat0 = p0.lat,
				lat1 = p1.lat,
				lat2 = p2.lat

			const maxLon = Math.max(lon0, lon1, lon2)
			const minLon = Math.min(lon0, lon1, lon2)
			const wraps = maxLon - minLon > pi

			const colors = useRegionColors
				? Array(3).fill([
						currentRegionColors![3 * rBegin],
						currentRegionColors![3 * rBegin + 1],
						currentRegionColors![3 * rBegin + 2],
					])
				: (isSmoothHeightmap
						? [tElevationKm[tInner], tElevationKm[tOuter], elevation_km[rBegin]]
						: [elevation_km[rBegin], elevation_km[rBegin], elevation_km[rBegin]]
					).map((value) => getColor(value, colorMode))

			const writeTri = (
				aLon: number,
				aLat: number,
				bLon: number,
				bLat: number,
				cLon: number,
				cLat: number,
			) => {
				const off = triCount * 9
				faceToRegion[triCount] = rBegin
				posArr[off] = clampX(aLon * sx)
				posArr[off + 1] = clampY(aLat * sx)
				posArr[off + 2] = 0
				posArr[off + 3] = clampX(bLon * sx)
				posArr[off + 4] = clampY(bLat * sx)
				posArr[off + 5] = 0
				posArr[off + 6] = clampX(cLon * sx)
				posArr[off + 7] = clampY(cLat * sx)
				posArr[off + 8] = 0
				for (let i = 0; i < 3; i++) {
					colArr[off + i * 3] = colors[i][0]
					colArr[off + i * 3 + 1] = colors[i][1]
					colArr[off + i * 3 + 2] = colors[i][2]
				}
				triCount++
			}

			if (wraps) {
				if (lon0 < 0) lon0 += 2 * pi
				if (lon1 < 0) lon1 += 2 * pi
				if (lon2 < 0) lon2 += 2 * pi
				writeTri(lon0, lat0, lon1, lat1, lon2, lat2)
				writeTri(lon0 - 2 * pi, lat0, lon1 - 2 * pi, lat1, lon2 - 2 * pi, lat2)
			} else {
				writeTri(lon0, lat0, lon1, lat1, lon2, lat2)
			}
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(
				new Float32Array(posArr.subarray(0, triCount * 9)),
				3,
			),
		)
		geometry.setAttribute(
			"color",
			new THREE.BufferAttribute(
				new Float32Array(colArr.subarray(0, triCount * 9)),
				3,
			),
		)
		mapFaceToRegion = new Int32Array(faceToRegion.subarray(0, triCount))

		const vertexCount = triCount * 3
		geometry.setAttribute(
			"occColor",
			new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3),
		)
		geometry.setAttribute(
			"occMask",
			new THREE.BufferAttribute(new Float32Array(vertexCount), 1),
		)

		const material = new THREE.ShaderMaterial({
			side: THREE.DoubleSide,
			vertexShader: `
				attribute vec3 color;
				attribute vec3 occColor;
				attribute float occMask;
				varying vec3 vColor;
				varying vec3 vOccColor;
				varying float vOccMask;
				varying vec2 vWorldPos;
				void main() {
					vColor = color;
					vOccColor = occColor;
					vOccMask = occMask;
					vWorldPos = position.xy;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				varying vec3 vColor;
				varying vec3 vOccColor;
				varying float vOccMask;
				varying vec2 vWorldPos;
				void main() {
					vec3 finalColor = vColor;
					if (vOccMask > 0.5) {
						float stripe = fract((vWorldPos.x + vWorldPos.y) * 150.0);
						if (stripe > 0.25 && stripe < 0.75) {
							finalColor = vOccColor;
						}
					}
					gl_FragColor = vec4(finalColor, 1.0);
				}
			`,
		})

		const meshObj = new THREE.Mesh(geometry, material)
		const cloneL = new THREE.Mesh(geometry, material)
		const cloneR = new THREE.Mesh(geometry, material)
		cloneL.position.x = -4
		cloneR.position.x = 4
		meshObj.add(cloneL, cloneR)
		meshObj.userData.builtCenterLonDeg = currentMapCenterLongitudeDeg
		return meshObj
	}

	function buildMapOccupationOverlay(): THREE.Mesh | null {
		if (!mapMesh || !currentOccupationOverlay) return null
		const geometry = mapMesh.geometry.clone()
		const vertexCount = Math.floor(
			(geometry.getAttribute("position") as THREE.BufferAttribute).count,
		)
		const overlayColors = new Float32Array(vertexCount * 3)
		const overlayMask = new Float32Array(vertexCount)
		const faceCount = Math.min(
			mapFaceToRegion.length,
			Math.floor(vertexCount / 3),
		)
		for (let face = 0; face < faceCount; face++) {
			const region = mapFaceToRegion[face]
			const regionBase = region * 4
			const r = currentOccupationOverlay[regionBase]
			const g = currentOccupationOverlay[regionBase + 1]
			const b = currentOccupationOverlay[regionBase + 2]
			const a = currentOccupationOverlay[regionBase + 3]
			const vertexBase = face * 9
			for (let offset = 0; offset < 9; offset += 3) {
				overlayColors[vertexBase + offset] = r
				overlayColors[vertexBase + offset + 1] = g
				overlayColors[vertexBase + offset + 2] = b
			}
			const maskBase = face * 3
			overlayMask[maskBase] = a
			overlayMask[maskBase + 1] = a
			overlayMask[maskBase + 2] = a
		}
		geometry.setAttribute(
			"overlayColor",
			new THREE.BufferAttribute(overlayColors, 3),
		)
		geometry.setAttribute(
			"overlayMask",
			new THREE.BufferAttribute(overlayMask, 1),
		)

		const material = new THREE.ShaderMaterial({
			transparent: true,
			depthTest: false,
			depthWrite: false,
			toneMapped: false,
			side: THREE.DoubleSide,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -1,
			vertexShader: `
				attribute vec3 overlayColor;
				attribute float overlayMask;
				varying vec3 vOverlayColor;
				varying float vOverlayMask;
				varying vec2 vStripePos;
				void main() {
					vOverlayColor = overlayColor;
					vOverlayMask = overlayMask;
					vStripePos = position.xy;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				varying vec3 vOverlayColor;
				varying float vOverlayMask;
				varying vec2 vStripePos;
				void main() {
					if (vOverlayMask < 0.5) discard;
					gl_FragColor = vec4(0.0, 0.0, 0.0, 0.9);
				}
			`,
		})

		const meshObj = new THREE.Mesh(geometry, material)
		meshObj.renderOrder = 1000
		meshObj.position.z += 0.01
		const cloneL = new THREE.Mesh(geometry, material)
		const cloneR = new THREE.Mesh(geometry, material)
		cloneL.renderOrder = 1000
		cloneR.renderOrder = 1000
		cloneL.position.set(-4, 0, 0.01)
		cloneR.position.set(4, 0, 0.01)
		meshObj.add(cloneL, cloneR)
		meshObj.userData.builtCenterLonDeg = currentMapCenterLongitudeDeg
		return meshObj
	}

	function buildMapWireframe(world: SerializedOrogenWorld): THREE.LineSegments {
		const { mesh } = world
		const { numSides, halfedges, s_inner_t, s_outer_t, t_xyz } = mesh
		const positions: number[] = []
		const pi = Math.PI
		const sx = 2 / pi
		const centerLon = (currentMapCenterLongitudeDeg * pi) / 180

		const wrapLon = (lon: number) => {
			let l = lon - centerLon
			if (l > pi) l -= 2 * pi
			else if (l < -pi) l += 2 * pi
			return l
		}

		const project = (x: number, y: number, z: number) => ({
			lon: wrapLon(Math.atan2(y, x)),
			lat: Math.asin(Math.max(-1, Math.min(1, z))),
		})

		const writeSegment = (
			lon0: number,
			lat0: number,
			lon1: number,
			lat1: number,
		) => {
			positions.push(lon0 * sx, lat0 * sx, 0.001, lon1 * sx, lat1 * sx, 0.001)
		}

		for (let s = 0; s < numSides; s++) {
			const opp = halfedges[s]
			if (opp >= 0 && s > opp) continue
			const tInner = s_inner_t[s]
			const tOuter = s_outer_t[s]
			if (tInner < 0 || tOuter < 0) continue

			const a = project(
				t_xyz[3 * tInner],
				t_xyz[3 * tInner + 1],
				t_xyz[3 * tInner + 2],
			)
			const b = project(
				t_xyz[3 * tOuter],
				t_xyz[3 * tOuter + 1],
				t_xyz[3 * tOuter + 2],
			)

			let lon0 = a.lon
			let lon1 = b.lon

			if (Math.abs(lon1 - lon0) > pi) {
				if (lon0 < lon1) lon0 += 2 * pi
				else lon1 += 2 * pi
				writeSegment(lon0, a.lat, lon1, b.lat)
				writeSegment(lon0 - 2 * pi, a.lat, lon1 - 2 * pi, b.lat)
			} else {
				writeSegment(lon0, a.lat, lon1, b.lat)
			}
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
		)
		const material = new THREE.LineBasicMaterial({
			color: 0xf8fafc,
			transparent: true,
			opacity: 0.22,
			depthWrite: false,
		})
		const lines = new THREE.LineSegments(geometry, material)
		lines.position.set(0, 0, 0)
		lines.visible = wireframeVisible && currentViewMode === "map"
		return lines
	}

	function buildHoveredNationBorderGlobe(
		world: SerializedOrogenWorld,
		nation: number,
		opts?: { color?: number; radiusBoost?: number; opacity?: number },
	): THREE.LineSegments | null {
		if (!world.nations || !world.provinces) return null
		const { mesh, elevation } = world
		const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t, t_xyz } = mesh
		const { regionProvince } = world.provinces
		const positions: number[] = []
		const V = 0.04

		for (let s = 0; s < numSides; s++) {
			const opp = halfedges[s]
			if (opp < 0 || s > opp) continue
			const r0 = s_begin_r[s]
			const r1 = s_begin_r[opp]
			const p0 = regionProvince[r0]
			const p1 = regionProvince[r1]
			const n0 = p0 >= 0 ? world.nations.assignment[p0] : -1
			const n1 = p1 >= 0 ? world.nations.assignment[p1] : -1
			if (n0 === n1 || (n0 !== nation && n1 !== nation)) continue

			const tInner = s_inner_t[s]
			const tOuter = s_outer_t[s]
			if (tInner < 0 || tOuter < 0) continue

			const avgElev = (elevation[r0] + elevation[r1]) * 0.5
			const radius =
				1.006 +
				(opts?.radiusBoost ?? 0) +
				(avgElev > 0 ? avgElev * V : avgElev * V * 0.3)
			positions.push(
				t_xyz[3 * tInner] * radius,
				t_xyz[3 * tInner + 1] * radius,
				t_xyz[3 * tInner + 2] * radius,
				t_xyz[3 * tOuter] * radius,
				t_xyz[3 * tOuter + 1] * radius,
				t_xyz[3 * tOuter + 2] * radius,
			)
		}

		if (positions.length === 0) return null
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
		)
		const material = new THREE.LineBasicMaterial({
			color: opts?.color ?? 0x020617,
			transparent: true,
			opacity: opts?.opacity ?? 0.95,
			depthWrite: false,
		})
		const lines = new THREE.LineSegments(geometry, material)
		lines.visible = currentViewMode === "globe" && nationBordersVisible
		return lines
	}

	function buildHoveredNationBorderMap(
		world: SerializedOrogenWorld,
		nation: number,
		opts?: { color?: number; opacity?: number; zBoost?: number },
	): THREE.LineSegments | null {
		if (!world.nations || !world.provinces) return null
		const { mesh } = world
		const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t, t_xyz } = mesh
		const { regionProvince } = world.provinces
		const positions: number[] = []
		const pi = Math.PI
		const sx = 2 / pi
		const centerLon = (currentMapCenterLongitudeDeg * pi) / 180

		const wrapLon = (lon: number) => {
			let l = lon - centerLon
			if (l > pi) l -= 2 * pi
			else if (l < -pi) l += 2 * pi
			return l
		}

		const project = (x: number, y: number, z: number) => ({
			lon: wrapLon(Math.atan2(y, x)),
			lat: Math.asin(Math.max(-1, Math.min(1, z))),
		})

		const z = 0.003 + (opts?.zBoost ?? 0)
		const writeSegment = (
			lon0: number,
			lat0: number,
			lon1: number,
			lat1: number,
		) => {
			positions.push(lon0 * sx, lat0 * sx, z, lon1 * sx, lat1 * sx, z)
		}

		for (let s = 0; s < numSides; s++) {
			const opp = halfedges[s]
			if (opp < 0 || s > opp) continue
			const r0 = s_begin_r[s]
			const r1 = s_begin_r[opp]
			const p0 = regionProvince[r0]
			const p1 = regionProvince[r1]
			const n0 = p0 >= 0 ? world.nations.assignment[p0] : -1
			const n1 = p1 >= 0 ? world.nations.assignment[p1] : -1
			if (n0 === n1 || (n0 !== nation && n1 !== nation)) continue

			const tInner = s_inner_t[s]
			const tOuter = s_outer_t[s]
			if (tInner < 0 || tOuter < 0) continue

			const a = project(
				t_xyz[3 * tInner],
				t_xyz[3 * tInner + 1],
				t_xyz[3 * tInner + 2],
			)
			const b = project(
				t_xyz[3 * tOuter],
				t_xyz[3 * tOuter + 1],
				t_xyz[3 * tOuter + 2],
			)
			let lon0 = a.lon
			let lon1 = b.lon

			if (Math.abs(lon1 - lon0) > Math.PI) {
				if (lon0 < lon1) lon0 += 2 * Math.PI
				else lon1 += 2 * Math.PI
				writeSegment(lon0, a.lat, lon1, b.lat)
				writeSegment(lon0 - 2 * Math.PI, a.lat, lon1 - 2 * Math.PI, b.lat)
			} else {
				writeSegment(lon0, a.lat, lon1, b.lat)
			}
		}

		if (positions.length === 0) return null
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
		)
		const material = new THREE.LineBasicMaterial({
			color: opts?.color ?? 0x020617,
			transparent: true,
			opacity: opts?.opacity ?? 0.95,
			depthWrite: false,
		})
		const lines = new THREE.LineSegments(geometry, material)
		lines.visible = currentViewMode === "map" && nationBordersVisible
		return lines
	}

	function rebuildHoveredNationBorder() {
		disposeObject3D(globeHoverNationBorder)
		disposeObject3D(mapHoverNationBorder)
		globeHoverNationBorder = null
		mapHoverNationBorder = null
		if (!currentWorld || hoveredNation < 0 || !nationBordersVisible) return
		globeHoverNationBorder = buildHoveredNationBorderGlobe(
			currentWorld,
			hoveredNation,
		)
		mapHoverNationBorder = buildHoveredNationBorderMap(
			currentWorld,
			hoveredNation,
		)
		if (globeHoverNationBorder) scene.add(globeHoverNationBorder)
		if (mapHoverNationBorder) scene.add(mapHoverNationBorder)
		updateOverlayVisibility()
	}

	function applyFaceRegionColors(
		meshObj: THREE.Mesh | null,
		faceToRegion: Int32Array,
		regionColors: Float32Array | null,
	): boolean {
		if (!meshObj || !regionColors) return false
		const geometry = meshObj.geometry
		const colorAttr = geometry.getAttribute("color")
		if (!(colorAttr instanceof THREE.BufferAttribute)) return false
		const colorArray = colorAttr.array
		if (!(colorArray instanceof Float32Array)) return false
		const faceCount = Math.min(
			faceToRegion.length,
			Math.floor(colorArray.length / 9),
		)
		for (let face = 0; face < faceCount; face++) {
			const region = faceToRegion[face]
			const colorBase = region * 3
			const r = regionColors[colorBase]
			const g = regionColors[colorBase + 1]
			const b = regionColors[colorBase + 2]
			const faceBase = face * 9
			colorArray[faceBase] = r
			colorArray[faceBase + 1] = g
			colorArray[faceBase + 2] = b
			colorArray[faceBase + 3] = r
			colorArray[faceBase + 4] = g
			colorArray[faceBase + 5] = b
			colorArray[faceBase + 6] = r
			colorArray[faceBase + 7] = g
			colorArray[faceBase + 8] = b
		}
		colorAttr.needsUpdate = true

		// Update occupation attributes on map/terrain mesh
		if (meshObj === mapMesh || meshObj === terrainMesh) {
			const occColorAttr = geometry.getAttribute("occColor")
			const occMaskAttr = geometry.getAttribute("occMask")
			if (
				occColorAttr instanceof THREE.BufferAttribute &&
				occMaskAttr instanceof THREE.BufferAttribute
			) {
				const occColorArray = occColorAttr.array as Float32Array
				const occMaskArray = occMaskAttr.array as Float32Array
				for (let face = 0; face < faceCount; face++) {
					const region = faceToRegion[face]
					const faceBase = face * 9
					const maskBase = face * 3
					if (currentOccupationOverlay) {
						const overlayBase = region * 4
						const mask = currentOccupationOverlay[overlayBase + 3] > 0.5 ? 1 : 0
						const or = currentOccupationOverlay[overlayBase]
						const og = currentOccupationOverlay[overlayBase + 1]
						const ob = currentOccupationOverlay[overlayBase + 2]
						for (let v = 0; v < 9; v += 3) {
							occColorArray[faceBase + v] = or
							occColorArray[faceBase + v + 1] = og
							occColorArray[faceBase + v + 2] = ob
						}
						occMaskArray[maskBase] = mask
						occMaskArray[maskBase + 1] = mask
						occMaskArray[maskBase + 2] = mask
					} else {
						for (let v = 0; v < 9; v += 3) {
							occColorArray[faceBase + v] = 0
							occColorArray[faceBase + v + 1] = 0
							occColorArray[faceBase + v + 2] = 0
						}
						occMaskArray[maskBase] = 0
						occMaskArray[maskBase + 1] = 0
						occMaskArray[maskBase + 2] = 0
					}
				}
				occColorAttr.needsUpdate = true
				occMaskAttr.needsUpdate = true
			}
		}

		return true
	}

	function recolorMeshesInPlace(): boolean {
		if (!currentRegionColors) return false
		const terrainUpdated = applyFaceRegionColors(
			terrainMesh,
			terrainFaceToRegion,
			currentRegionColors,
		)
		const mapUpdated = applyFaceRegionColors(
			mapMesh,
			mapFaceToRegion,
			currentRegionColors,
		)
		return terrainUpdated || mapUpdated
	}

	function buildGlobeGrid(spacingDeg: number): THREE.LineSegments {
		const spacing = Math.max(2.5, spacingDeg)
		const latSegments: number[] = []
		const lonSegments: number[] = []
		const radius = 1.018
		const latStep = THREE.MathUtils.degToRad(3)
		const lonStep = THREE.MathUtils.degToRad(3)

		for (let latDeg = -90 + spacing; latDeg < 90; latDeg += spacing) {
			const lat = THREE.MathUtils.degToRad(latDeg)
			let prev: [number, number, number] | null = null
			for (let lon = -Math.PI; lon <= Math.PI + 0.0001; lon += lonStep) {
				const cosLat = Math.cos(lat)
				const point: [number, number, number] = [
					radius * cosLat * Math.cos(lon),
					radius * cosLat * Math.sin(lon),
					radius * Math.sin(lat),
				]
				if (prev)
					latSegments.push(
						prev[0],
						prev[1],
						prev[2],
						point[0],
						point[1],
						point[2],
					)
				prev = point
			}
		}

		for (let lonDeg = -180; lonDeg < 180; lonDeg += spacing) {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			let prev: [number, number, number] | null = null
			for (
				let lat = -Math.PI / 2;
				lat <= Math.PI / 2 + 0.0001;
				lat += latStep
			) {
				const cosLat = Math.cos(lat)
				const point: [number, number, number] = [
					radius * cosLat * Math.cos(lon),
					radius * cosLat * Math.sin(lon),
					radius * Math.sin(lat),
				]
				if (prev)
					lonSegments.push(
						prev[0],
						prev[1],
						prev[2],
						point[0],
						point[1],
						point[2],
					)
				prev = point
			}
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(
				new Float32Array([...latSegments, ...lonSegments]),
				3,
			),
		)
		const material = new THREE.LineBasicMaterial({
			color: 0xe2e8f0,
			transparent: true,
			opacity: 0.28,
			depthWrite: false,
		})
		const lines = new THREE.LineSegments(geometry, material)
		lines.visible = gridVisible && currentViewMode === "globe"
		return lines
	}

	function buildMapGrid(spacingDeg: number): THREE.LineSegments {
		const spacing = Math.max(2.5, spacingDeg)
		const positions: number[] = []
		const sx = 2 / Math.PI

		for (let latDeg = -90 + spacing; latDeg < 90; latDeg += spacing) {
			const y = THREE.MathUtils.degToRad(latDeg) * sx
			positions.push(-2, y, 0.001, 2, y, 0.001)
		}

		for (let lonDeg = -180; lonDeg < 180; lonDeg += spacing) {
			const x = THREE.MathUtils.degToRad(lonDeg) * sx
			positions.push(x, -1, 0.001, x, 1, 0.001)
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
		)
		const material = new THREE.LineBasicMaterial({
			color: 0xf8fafc,
			transparent: true,
			opacity: 0.22,
			depthWrite: false,
		})
		const lines = new THREE.LineSegments(geometry, material)
		lines.visible = gridVisible && currentViewMode === "map"
		return lines
	}

	function disposeObject3D(object: THREE.Object3D | null) {
		if (!object) return
		scene.remove(object)
		const maybeGeometry = (object as THREE.LineSegments | THREE.Mesh).geometry
		maybeGeometry?.dispose?.()
		const material = (object as THREE.LineSegments | THREE.Mesh).material
		if (Array.isArray(material)) {
			for (const mat of material) mat.dispose()
		} else {
			material?.dispose?.()
		}
	}

	function buildGlobeThermalEquator(points: [number, number][]): THREE.Line {
		const radius = 1.05
		// Build control points on sphere
		const controlPoints = points.map(([lonDeg, latDeg]) => {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			const lat = THREE.MathUtils.degToRad(latDeg)
			const cosLat = Math.cos(lat)
			return new THREE.Vector3(
				radius * cosLat * Math.cos(lon),
				radius * cosLat * Math.sin(lon),
				radius * Math.sin(lat),
			)
		})
		const curve = new THREE.CatmullRomCurve3(
			controlPoints,
			false,
			"catmullrom",
			0.5,
		)
		const smoothPoints = curve.getPoints(points.length * 4)
		// Project back onto sphere to avoid cutting through globe
		for (const p of smoothPoints) p.normalize().multiplyScalar(radius)
		const geometry = new THREE.BufferGeometry().setFromPoints(smoothPoints)
		const material = new THREE.LineBasicMaterial({
			color: 0xff3333,
			transparent: true,
			opacity: 0.9,
			depthWrite: false,
		})
		const line = new THREE.Line(geometry, material)
		line.visible = currentViewMode === "globe"
		return line
	}

	function buildMapThermalEquator(points: [number, number][]): THREE.Line {
		const sx = 2 / Math.PI
		const controlPoints = points.map(
			([lonDeg, latDeg]) =>
				new THREE.Vector3(
					THREE.MathUtils.degToRad(lonDeg) * sx,
					THREE.MathUtils.degToRad(latDeg) * sx,
					0.002,
				),
		)
		const curve = new THREE.CatmullRomCurve3(
			controlPoints,
			false,
			"catmullrom",
			0.5,
		)
		const smoothPoints = curve.getPoints(points.length * 4)
		// Keep z at overlay depth
		for (const p of smoothPoints) p.z = 0.002
		const geometry = new THREE.BufferGeometry().setFromPoints(smoothPoints)
		const material = new THREE.LineBasicMaterial({
			color: 0xff3333,
			transparent: true,
			opacity: 0.9,
			depthWrite: false,
		})
		const line = new THREE.Line(geometry, material)
		line.visible = currentViewMode === "map"
		return line
	}

	function buildRiverGroup(
		rivers: {
			lines: [number, number, number, number][][]
			maxFlow: number
			minFlow: number
		},
		toPosition: (
			lonDeg: number,
			latDeg: number,
			elev: number,
		) => [number, number, number],
	): THREE.Group {
		const group = new THREE.Group()
		const w = canvas.clientWidth || 1
		const h = canvas.clientHeight || 1

		const MIN_WIDTH = 0.15
		const MAX_WIDTH = 1.2
		const BIN_STEP = 0.3
		// Normalize flow relative to threshold→max range for better spread
		const logMin = Math.log(1 + rivers.minFlow)
		const logMax = Math.log(1 + rivers.maxFlow)
		const logRange = logMax - logMin || 1

		// Material cache keyed by binned width
		const matCache = new Map<number, LineMaterial>()
		function getMat(width: number): LineMaterial {
			const binned = Math.max(
				MIN_WIDTH,
				Math.min(MAX_WIDTH, Math.round(width / BIN_STEP) * BIN_STEP),
			)
			let mat = matCache.get(binned)
			if (!mat) {
				const t = (binned - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)
				mat = new LineMaterial({
					color: 0x0978ab,
					opacity: 0.55 + t * 0.4,
					linewidth: binned,
					transparent: true,
					depthWrite: false,
					worldUnits: false,
				})
				mat.resolution.set(w, h)
				matCache.set(binned, mat)
				riverMaterials.push(mat)
			}
			return mat
		}

		function flowToWidth(f: number): number {
			// Normalize within [minFlow..maxFlow] range for full spread
			const t = Math.max(0, (Math.log(1 + f) - logMin) / logRange)
			return MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * t
		}

		for (const polyline of rivers.lines) {
			if (polyline.length < 2) continue

			const n = polyline.length
			const flows = polyline.map(([, , f]) => f)

			// Build positioned points using elevation-aware callback
			let positions: [number, number, number][]
			let smoothFlows: number[]

			if (n >= 3) {
				const controlPts = polyline.map(([lon, lat, , elev]) => {
					const [x, y, z] = toPosition(lon, lat, elev)
					return new THREE.Vector3(x, y, z)
				})
				const curve = new THREE.CatmullRomCurve3(
					controlPts,
					false,
					"catmullrom",
					0.5,
				)
				const numSmooth = n * 3
				const smoothed = curve.getPoints(numSmooth)
				positions = smoothed.map((p) => [p.x, p.y, p.z])
				// Interpolate flow along parameter
				smoothFlows = smoothed.map((_, i) => {
					const t = i / numSmooth
					const idx = t * (n - 1)
					const lo = Math.floor(idx)
					const hi = Math.min(lo + 1, n - 1)
					return flows[lo] + (flows[hi] - flows[lo]) * (idx - lo)
				})
			} else {
				positions = polyline.map(([lon, lat, , elev]) =>
					toPosition(lon, lat, elev),
				)
				smoothFlows = flows
			}

			// Map flows to binned widths, split at transitions
			const widths = smoothFlows.map((f) => flowToWidth(f))
			const bin = (w: number) =>
				Math.max(
					MIN_WIDTH,
					Math.min(MAX_WIDTH, Math.round(w / BIN_STEP) * BIN_STEP),
				)

			let segStart = 0
			let curBin = bin(widths[0])

			const emitSegment = (start: number, end: number, binnedW: number) => {
				if (end <= start) return
				const pos: number[] = []
				for (let j = start; j <= end; j++) {
					pos.push(positions[j][0], positions[j][1], positions[j][2])
				}
				if (pos.length < 6) return // need at least 2 points
				const geo = new LineGeometry()
				geo.setPositions(pos)
				const line = new Line2(geo, getMat(binnedW))
				line.computeLineDistances()
				group.add(line)
			}

			for (let i = 1; i < positions.length; i++) {
				const b = bin(widths[i])
				if (b !== curBin) {
					emitSegment(segStart, i, curBin)
					segStart = i // overlap point for continuity
					curBin = b
				}
			}
			emitSegment(segStart, positions.length - 1, curBin)
		}

		return group
	}

	function buildGlobeRivers(rivers: {
		lines: [number, number, number, number][][]
		maxFlow: number
		minFlow: number
	}): THREE.Group {
		const V = 0.04
		const LIFT = 0.003 // small offset above terrain surface
		const toGlobe = (
			lonDeg: number,
			latDeg: number,
			elev: number,
		): [number, number, number] => {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			const lat = THREE.MathUtils.degToRad(latDeg)
			const cosLat = Math.cos(lat)
			// Match terrain radius: 1.0 + elev * V (land) or elev * V * 0.3 (ocean), plus lift
			const r = 1.0 + (elev > 0 ? elev * V : elev * V * 0.3) + LIFT
			return [
				r * cosLat * Math.cos(lon),
				r * cosLat * Math.sin(lon),
				r * Math.sin(lat),
			]
		}
		const group = buildRiverGroup(rivers, toGlobe)
		group.visible = riversVisible && currentViewMode === "globe"
		return group
	}

	function buildMapRivers(rivers: {
		lines: [number, number, number, number][][]
		maxFlow: number
		minFlow: number
	}): THREE.Group {
		const sx = 2 / Math.PI
		const toMap = (
			lonDeg: number,
			latDeg: number,
			_elev: number,
		): [number, number, number] => [
			THREE.MathUtils.degToRad(lonDeg) * sx,
			THREE.MathUtils.degToRad(latDeg) * sx,
			0.003,
		]
		const group = buildRiverGroup(rivers, toMap)
		group.visible = riversVisible && currentViewMode === "map"
		return group
	}

	function disposeRiverGroup(group: THREE.Group | null) {
		if (!group) return
		scene.remove(group)
		group.traverse((child) => {
			const node = child as THREE.Object3D & {
				geometry?: { dispose(): void }
				material?: { dispose(): void } | Array<{ dispose(): void }>
			}
			node.geometry?.dispose()
			const { material } = node
			if (Array.isArray(material)) {
				for (const m of material) m.dispose()
			} else {
				material?.dispose()
			}
		})
	}

	/**
	 * Push 3 line-segments (shaft + 2 barbs) for one arrow.
	 * tail → tip is the shaft; two barbs angle back 30° from the tip.
	 */
	function pushArrow3D(
		positions: number[],
		colors: number[],
		tx: number,
		ty: number,
		tz: number, // tail
		hx: number,
		hy: number,
		hz: number, // head (tip)
		perpX: number,
		perpY: number,
		perpZ: number, // perpendicular in tangent plane (unit length)
		barbFrac: number,
	) {
		// Shaft
		positions.push(tx, ty, tz, hx, hy, hz)
		colors.push(0, 0, 0, 0, 0, 0)
		// Barb vectors: 30° back from tip on each side
		const dx = hx - tx,
			dy = hy - ty,
			dz = hz - tz
		const shaftLen = Math.sqrt(dx * dx + dy * dy + dz * dz)
		if (shaftLen < 1e-10) return
		// Normalize shaft direction
		const ux = dx / shaftLen,
			uy = dy / shaftLen,
			uz = dz / shaftLen
		const bLen = barbFrac * shaftLen
		// cos(150°) ≈ -0.866, sin(150°) ≈ 0.5
		for (const sign of [1, -1]) {
			const bx = (-0.866 * ux + sign * 0.5 * perpX) * bLen
			const by = (-0.866 * uy + sign * 0.5 * perpY) * bLen
			const bz = (-0.866 * uz + sign * 0.5 * perpZ) * bLen
			positions.push(hx, hy, hz, hx + bx, hy + by, hz + bz)
			colors.push(0, 0, 0, 0, 0, 0)
		}
	}

	function buildGlobeWindArrows(data: {
		east: Float32Array
		north: Float32Array
		speed: Float32Array
	}): THREE.LineSegments {
		if (!currentWorld) return new THREE.LineSegments()
		const { r_xyz, numRegions } = currentWorld.mesh
		const isLand = currentWorld.isLand
		const { east, north, speed } = data
		const step = Math.max(1, Math.floor(numRegions / 2000))
		const positions: number[] = []
		const colors: number[] = []
		const shaftLen = 0.035
		const barbFrac = 0.35

		for (let r = 0; r < numRegions; r += step) {
			const s = speed[r]
			if (s < 0.02) continue
			const x = r_xyz[3 * r],
				y = r_xyz[3 * r + 1],
				z = r_xyz[3 * r + 2]
			const lon = Math.atan2(y, x)
			const lat = Math.asin(Math.max(-1, Math.min(1, z)))
			const sinLon = Math.sin(lon),
				cosLon = Math.cos(lon)
			const sinLat = Math.sin(lat),
				cosLat = Math.cos(lat)
			// Tangent basis on sphere
			const eHatX = -sinLon,
				eHatY = cosLon,
				eHatZ = 0
			const nHatX = -sinLat * cosLon,
				nHatY = -sinLat * sinLon,
				nHatZ = cosLat
			// Normalize direction
			const mag = Math.sqrt(east[r] * east[r] + north[r] * north[r])
			if (mag < 1e-8) continue
			const de = east[r] / mag,
				dn = north[r] / mag
			// Direction in 3D
			const dirX = de * eHatX + dn * nHatX
			const dirY = de * eHatY + dn * nHatY
			const dirZ = de * eHatZ + dn * nHatZ
			// Perpendicular in tangent plane (rotate 90°)
			const perpX = -dn * eHatX + de * nHatX
			const perpY = -dn * eHatY + de * nHatY
			const perpZ = -dn * eHatZ + de * nHatZ
			const lift = isLand?.[r] ? 1.035 : 1.01
			const ox = x * lift,
				oy = y * lift,
				oz = z * lift
			const tipX = ox + dirX * shaftLen
			const tipY = oy + dirY * shaftLen
			const tipZ = oz + dirZ * shaftLen
			pushArrow3D(
				positions,
				colors,
				ox,
				oy,
				oz,
				tipX,
				tipY,
				tipZ,
				perpX,
				perpY,
				perpZ,
				barbFrac,
			)
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(positions, 3),
		)
		geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
		const material = new THREE.LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			depthTest: true,
			depthWrite: false,
		})
		const lines = new THREE.LineSegments(geometry, material)
		lines.renderOrder = 20
		return lines
	}

	function buildMapWindArrows(data: {
		east: Float32Array
		north: Float32Array
		speed: Float32Array
	}): THREE.LineSegments {
		if (!currentWorld) return new THREE.LineSegments()
		const { r_xyz, numRegions } = currentWorld.mesh
		const { east, north, speed } = data
		const pi = Math.PI
		const sc = 2 / pi
		const centerLon = (currentMapCenterLongitudeDeg * pi) / 180
		const step = Math.max(1, Math.floor(numRegions / 2000))
		const positions: number[] = []
		const colors: number[] = []
		const shaftLen = 0.035
		const barbFrac = 0.35

		const wrapLon = (lon: number) => {
			let l = lon - centerLon
			if (l > pi) l -= 2 * pi
			else if (l < -pi) l += 2 * pi
			return l
		}

		for (let r = 0; r < numRegions; r += step) {
			const s = speed[r]
			if (s < 0.02) continue
			const x = r_xyz[3 * r],
				y = r_xyz[3 * r + 1],
				z = r_xyz[3 * r + 2]
			const lon = wrapLon(Math.atan2(y, x))
			const lat = Math.asin(Math.max(-1, Math.min(1, z)))
			const mx = lon * sc,
				my = lat * sc
			const mag = Math.sqrt(east[r] * east[r] + north[r] * north[r])
			if (mag < 1e-8) continue
			const de = east[r] / mag,
				dn = north[r] / mag
			const len = shaftLen * sc
			const tipX = mx + de * len,
				tipY = my + dn * len
			// Shaft
			positions.push(mx, my, 0.003, tipX, tipY, 0.003)
			colors.push(0, 0, 0, 0, 0, 0)
			// Barbs (2D rotation ±150°)
			const c150 = -0.866,
				s150 = 0.5
			const bLen = barbFrac * len
			for (const sign of [1, -1]) {
				const bx = (c150 * de + sign * s150 * -dn) * bLen
				const by = (c150 * dn + sign * s150 * de) * bLen
				positions.push(tipX, tipY, 0.003, tipX + bx, tipY + by, 0.003)
				colors.push(0, 0, 0, 0, 0, 0)
			}
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(positions, 3),
		)
		geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
		const material = new THREE.LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			depthTest: false,
		})
		const lines = new THREE.LineSegments(geometry, material)
		lines.renderOrder = 20
		return lines
	}

	function rebuildOverlays() {
		disposeObject3D(terrainWireframe)
		disposeObject3D(mapWireframe)
		disposeObject3D(globeGrid)
		disposeObject3D(mapGrid)
		disposeObject3D(globeThermalEquator)
		disposeObject3D(mapThermalEquator)
		disposeObject3D(globeHoverNationBorder)
		disposeObject3D(mapHoverNationBorder)
		disposeObject3D(pulseGlobe)
		disposeObject3D(pulseMap)
		disposeRiverGroup(globeRivers)
		disposeRiverGroup(mapRivers)
		disposeObject3D(globeWindArrows)
		disposeObject3D(mapWindArrows)
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
		globeWindArrows = null
		mapWindArrows = null
		riverMaterials = []

		if (wireframeVisible && currentWorld) {
			terrainWireframe = buildTerrainWireframe(currentWorld)
			scene.add(terrainWireframe)
		}
		if (wireframeVisible && currentWorld) {
			mapWireframe = buildMapWireframe(currentWorld)
			scene.add(mapWireframe)
		}
		if (gridVisible) {
			globeGrid = buildGlobeGrid(gridSpacingDeg)
			mapGrid = buildMapGrid(gridSpacingDeg)
			scene.add(globeGrid)
			scene.add(mapGrid)
		}
		if (thermalEquatorPoints) {
			globeThermalEquator = buildGlobeThermalEquator(thermalEquatorPoints)
			mapThermalEquator = buildMapThermalEquator(thermalEquatorPoints)
			scene.add(globeThermalEquator)
			scene.add(mapThermalEquator)
		}
		if (riversVisible && riverData) {
			globeRivers = buildGlobeRivers(riverData)
			mapRivers = buildMapRivers(riverData)
			scene.add(globeRivers)
			scene.add(mapRivers)
		}
		if (windArrowsVisible && windArrowData) {
			globeWindArrows = buildGlobeWindArrows(windArrowData)
			mapWindArrows = buildMapWindArrows(windArrowData)
			scene.add(globeWindArrows)
			scene.add(mapWindArrows)
		}
		rebuildHoveredNationBorder()
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
		if (globeWindArrows)
			globeWindArrows.visible = windArrowsVisible && currentViewMode === "globe"
		if (mapWindArrows) {
			mapWindArrows.visible = windArrowsVisible && currentViewMode === "map"
			if (mapMesh) mapWindArrows.position.copy(mapMesh.position)
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
	}

	function rebuildTerrain() {
		if (!currentWorld) return
		disposeObject3D(terrainMesh)
		disposeObject3D(mapMesh)
		disposeObject3D(mapOccupationOverlay)
		terrainMesh = null
		mapMesh = null
		mapOccupationOverlay = null
		terrainMesh = buildTerrainMesh(currentWorld, currentColorMode)
		mapMesh = buildMapMesh(currentWorld, currentColorMode)
		scene.add(terrainMesh)
		scene.add(mapMesh)
		if (currentOccupationOverlay) {
			mapOccupationOverlay = buildMapOccupationOverlay()
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
			disposeObject3D(terrainMesh)
			disposeObject3D(mapMesh)
			disposeObject3D(mapOccupationOverlay)
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
			return
		}
		rebuildTerrain()
	}

	function setColorMode(mode: ColorMode) {
		if (mode === currentColorMode) return
		currentColorMode = mode
		const useTerrainWaterMaterial = mode === "terrain" || mode === "windSpeed"
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
		if (!recolorMeshesInPlace()) rebuildTerrain()
	}

	function setRegionColors(colors: Float32Array | null) {
		if (currentRegionColors === colors) return
		currentRegionColors = colors
		if (!recolorMeshesInPlace()) rebuildTerrain()
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

	function focusOnNation(nationId: number, opts?: { durationMs?: number }) {
		if (!currentWorld?.nations || !currentWorld.provinces) return
		if (nationId < 0) return
		// `nationId` from the UI is actually a sovereign province index
		// (see OrogenView click handler — assignment = sovereign).
		const province = nationId
		if (province >= currentWorld.provinces.count) return
		const region = currentWorld.provinces.seeds[province]
		if (region < 0) return
		const rx = currentWorld.mesh.r_xyz[region * 3]
		const ry = currentWorld.mesh.r_xyz[region * 3 + 1]
		const rz = currentWorld.mesh.r_xyz[region * 3 + 2]
		const center = new THREE.Vector3(rx, ry, rz).normalize()

		const globeTargetDist = Math.max(controls.minDistance, 1.8)
		const globeFrom = camera.position.clone()
		const globeTo = center.clone().multiplyScalar(globeTargetDist)

		const sx = 2 / Math.PI
		const lat = Math.asin(Math.max(-1, Math.min(1, center.z)))
		const centerLon = (currentMapCenterLongitudeDeg * Math.PI) / 180
		let lon = Math.atan2(center.y, center.x) - centerLon
		if (lon > Math.PI) lon -= 2 * Math.PI
		else if (lon < -Math.PI) lon += 2 * Math.PI
		const mapOffsetX = mapMesh?.position.x ?? 0
		const mapOffsetY = mapMesh?.position.y ?? 0
		const mapToX = lon * sx + mapOffsetX
		const mapToY = lat * sx + mapOffsetY
		const mapToZoom = 6

		focusTween = {
			mode: currentViewMode,
			t0: performance.now(),
			duration: opts?.durationMs ?? 700,
			globeFrom,
			globeTo,
			mapFromX: mapCamera.position.x,
			mapFromY: mapCamera.position.y,
			mapToX,
			mapToY,
			mapFromZoom: mapCamera.zoom,
			mapToZoom,
		}
		if (currentViewMode === "globe") controls.enabled = false
		else mapControls.enabled = false

		startBorderPulse(province)
	}

	function clearPulse() {
		disposeObject3D(pulseGlobe)
		disposeObject3D(pulseMap)
		pulseGlobe = null
		pulseMap = null
		pulseMaterials = []
		pulse = null
	}

	function collectNationBorderGlobePositions(
		world: SerializedOrogenWorld,
		nation: number,
		radiusBoost: number,
	): number[] {
		if (!world.nations || !world.provinces) return []
		const { mesh, elevation } = world
		const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t, t_xyz } = mesh
		const { regionProvince } = world.provinces
		const positions: number[] = []
		const V = 0.04
		for (let s = 0; s < numSides; s++) {
			const opp = halfedges[s]
			if (opp < 0 || s > opp) continue
			const r0 = s_begin_r[s]
			const r1 = s_begin_r[opp]
			const p0 = regionProvince[r0]
			const p1 = regionProvince[r1]
			const n0 = p0 >= 0 ? world.nations.assignment[p0] : -1
			const n1 = p1 >= 0 ? world.nations.assignment[p1] : -1
			if (n0 === n1 || (n0 !== nation && n1 !== nation)) continue
			const tInner = s_inner_t[s]
			const tOuter = s_outer_t[s]
			if (tInner < 0 || tOuter < 0) continue
			const avgElev = (elevation[r0] + elevation[r1]) * 0.5
			const radius =
				1.006 + radiusBoost + (avgElev > 0 ? avgElev * V : avgElev * V * 0.3)
			positions.push(
				t_xyz[3 * tInner] * radius,
				t_xyz[3 * tInner + 1] * radius,
				t_xyz[3 * tInner + 2] * radius,
				t_xyz[3 * tOuter] * radius,
				t_xyz[3 * tOuter + 1] * radius,
				t_xyz[3 * tOuter + 2] * radius,
			)
		}
		return positions
	}

	function collectNationBorderMapPositions(
		world: SerializedOrogenWorld,
		nation: number,
		zBoost: number,
	): number[] {
		if (!world.nations || !world.provinces) return []
		const { mesh } = world
		const { numSides, halfedges, s_begin_r, s_inner_t, s_outer_t, t_xyz } = mesh
		const { regionProvince } = world.provinces
		const positions: number[] = []
		const pi = Math.PI
		const sx = 2 / pi
		const centerLon = (currentMapCenterLongitudeDeg * pi) / 180
		const z = 0.003 + zBoost
		const wrapLon = (lon: number) => {
			let l = lon - centerLon
			if (l > pi) l -= 2 * pi
			else if (l < -pi) l += 2 * pi
			return l
		}
		const project = (x: number, y: number, zc: number) => ({
			lon: wrapLon(Math.atan2(y, x)),
			lat: Math.asin(Math.max(-1, Math.min(1, zc))),
		})
		const writeSegment = (
			lon0: number,
			lat0: number,
			lon1: number,
			lat1: number,
		) => {
			positions.push(lon0 * sx, lat0 * sx, z, lon1 * sx, lat1 * sx, z)
		}
		for (let s = 0; s < numSides; s++) {
			const opp = halfedges[s]
			if (opp < 0 || s > opp) continue
			const r0 = s_begin_r[s]
			const r1 = s_begin_r[opp]
			const p0 = regionProvince[r0]
			const p1 = regionProvince[r1]
			const n0 = p0 >= 0 ? world.nations.assignment[p0] : -1
			const n1 = p1 >= 0 ? world.nations.assignment[p1] : -1
			if (n0 === n1 || (n0 !== nation && n1 !== nation)) continue
			const tInner = s_inner_t[s]
			const tOuter = s_outer_t[s]
			if (tInner < 0 || tOuter < 0) continue
			const a = project(
				t_xyz[3 * tInner],
				t_xyz[3 * tInner + 1],
				t_xyz[3 * tInner + 2],
			)
			const b = project(
				t_xyz[3 * tOuter],
				t_xyz[3 * tOuter + 1],
				t_xyz[3 * tOuter + 2],
			)
			let lon0 = a.lon
			let lon1 = b.lon
			if (Math.abs(lon1 - lon0) > pi) {
				if (lon0 < lon1) lon0 += 2 * pi
				else lon1 += 2 * pi
				writeSegment(lon0, a.lat, lon1, b.lat)
				writeSegment(lon0 - 2 * pi, a.lat, lon1 - 2 * pi, b.lat)
			} else {
				writeSegment(lon0, a.lat, lon1, b.lat)
			}
		}
		return positions
	}

	function makeThickPulseLine(positions: number[]): LineSegments2 | null {
		if (positions.length === 0) return null
		const geom = new LineSegmentsGeometry()
		geom.setPositions(positions)
		const w = canvas.clientWidth || 1
		const h = canvas.clientHeight || 1
		const mat = new LineMaterial({
			color: 0xffffff,
			linewidth: 4,
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

	function startBorderPulse(province: number) {
		clearPulse()
		if (!currentWorld?.nations) return
		const nation = currentWorld.nations.assignment[province]
		if (nation < 0) return
		pulseGlobe = makeThickPulseLine(
			collectNationBorderGlobePositions(currentWorld, nation, 0.003),
		)
		pulseMap = makeThickPulseLine(
			collectNationBorderMapPositions(currentWorld, nation, 0.001),
		)
		if (pulseGlobe) {
			pulseGlobe.visible = currentViewMode === "globe"
			scene.add(pulseGlobe)
		}
		if (pulseMap) {
			pulseMap.visible = currentViewMode === "map"
			if (mapMesh) pulseMap.position.copy(mapMesh.position)
			scene.add(pulseMap)
		}
		pulse = { t0: performance.now(), duration: 1200 }
	}

	function stepPulse() {
		if (!pulse) return
		const u = (performance.now() - pulse.t0) / pulse.duration
		if (u >= 1) {
			clearPulse()
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
		disposeObject3D(terrainMesh)
		disposeObject3D(mapMesh)
		disposeObject3D(mapOccupationOverlay)
		disposeObject3D(terrainWireframe)
		disposeObject3D(mapWireframe)
		disposeObject3D(globeGrid)
		disposeObject3D(mapGrid)
		disposeObject3D(globeThermalEquator)
		disposeObject3D(mapThermalEquator)
		disposeObject3D(globeHoverNationBorder)
		disposeObject3D(mapHoverNationBorder)
		disposeObject3D(pulseGlobe)
		disposeObject3D(pulseMap)
		disposeRiverGroup(globeRivers)
		disposeRiverGroup(mapRivers)
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
		disposeObject3D(globeMeasureLine)
		disposeObject3D(mapMeasureLine)
		disposeObject3D(globeMeasureDots)
		disposeObject3D(mapMeasureDots)
		globeMeasureLine = null
		mapMeasureLine = null
		globeMeasureDots = null
		mapMeasureDots = null

		if (!startXYZ || !endXYZ) return

		const arcRadius = 1.02
		const sx = 2 / Math.PI
		const centerLon = (currentMapCenterLongitudeDeg * Math.PI) / 180
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
			const lat = Math.asin(Math.max(-1, Math.min(1, pt.z / arcRadius)))
			let lon = Math.atan2(pt.y / arcRadius, pt.x / arcRadius) - centerLon
			if (lon > Math.PI) lon -= 2 * Math.PI
			else if (lon < -Math.PI) lon += 2 * Math.PI
			mapPositions.push(lon * sx, lat * sx, 0.003)
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
			const sx = 2 / Math.PI
			const centerLon = (currentMapCenterLongitudeDeg * Math.PI) / 180
			const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
			const lat = Math.asin(Math.max(-1, Math.min(1, v.z / len)))
			let lon = Math.atan2(v.y / len, v.x / len) - centerLon
			if (lon > Math.PI) lon -= 2 * Math.PI
			else if (lon < -Math.PI) lon += 2 * Math.PI
			v.set(lon * sx, lat * sx, 0.003)
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

	function setRivers(
		data: {
			lines: [number, number, number, number][][]
			maxFlow: number
			minFlow: number
		} | null,
	) {
		riverData = data
		rebuildOverlays()
	}

	function setRiversVisible(visible: boolean) {
		if (riversVisible === visible) return
		riversVisible = visible
		rebuildOverlays()
	}

	function setWindArrows(
		data: {
			east: Float32Array
			north: Float32Array
			speed: Float32Array
		} | null,
	) {
		windArrowData = data
		rebuildOverlays()
	}

	function setWindArrowsVisible(visible: boolean) {
		if (windArrowsVisible === visible) return
		windArrowsVisible = visible
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
				currentColorMode === "terrain" || currentColorMode === "windSpeed"
					? DEFAULT_WATER_SPECULAR
					: 0x000000,
			)
		}
	}

	return {
		dispose,
		resize,
		updateWorld,
		setColorMode,
		setRegionColors,
		setOccupationOverlay,
		setHoveredRegion,
		setNationBordersVisible,
		setViewMode,
		setWireframeVisible,
		setGridVisible,
		setGridSpacing,
		setMapCenterLongitude,
		commitMapCenterLongitude,
		setHoverHandler,
		setClickHandler,
		setMeasureLine,
		projectToScreen,
		setThermalEquator,
		setRivers,
		setRiversVisible,
		setWindArrows,
		setWindArrowsVisible,
		setSunPosition,
		setAtmospherePressure,
		setFullAmbient,
		focusOnNation,
	}
}
