import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js"
import { Line2 } from "three/examples/jsm/lines/Line2.js"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import { getColor, type ColorMode } from "./colors"

export type OrogenViewMode = "globe" | "map"
export interface OrogenHoverInfo {
	region: number
	clientX: number
	clientY: number
}

export interface OrogenScene {
	dispose(): void
	resize(): void
	updateWorld(world: SerializedOrogenWorld): void
	setColorMode(mode: ColorMode): void
	setRegionColors(colors: Float32Array | null): void
	setViewMode(mode: OrogenViewMode): void
	setWireframeVisible(visible: boolean): void
	setGridVisible(visible: boolean): void
	setGridSpacing(spacingDeg: number): void
	setMapCenterLongitude(longitudeDeg: number): void
	commitMapCenterLongitude(): void
	setHoverHandler(handler: ((info: OrogenHoverInfo | null) => void) | null): void
	/** Set thermal equator points as [lonDeg, latDeg][] or null to hide */
	setThermalEquator(points: [number, number][] | null): void
	setRivers(data: { lines: [number, number, number, number][][]; maxFlow: number; minFlow: number } | null): void
	setRiversVisible(visible: boolean): void
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
	controls.noRoll = false
	controls.dynamicDampingFactor = 0.15
	controls.minDistance = 1.4
	controls.maxDistance = 8

	const mapControls = new OrbitControls(mapCamera, canvas)
	mapControls.enableRotate = false
	mapControls.enableDamping = true
	mapControls.dampingFactor = 0.09
	mapControls.panSpeed = 1.4
	mapControls.screenSpacePanning = true
	mapControls.enableZoom = true
	mapControls.minZoom = 0.5
	mapControls.maxZoom = 20
	mapControls.enabled = false

	// Lighting
	const ambient = new THREE.AmbientLight(0xaabbcc, 3.5)
	scene.add(ambient)
	const sun = new THREE.DirectionalLight(0xfff8ee, 1.5)
	sun.position.set(5, 3, 4)
	scene.add(sun)

	// Water sphere
	const waterGeo = new THREE.SphereGeometry(1.0, 64, 48)
	const waterMat = new THREE.MeshPhongMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0.12,
		shininess: 120,
		specular: 0x88bfe8,
		depthWrite: false,
	})
	const waterMesh = new THREE.Mesh(waterGeo, waterMat)
	scene.add(waterMesh)

	// Atmosphere
	const atmosGeo = new THREE.SphereGeometry(1.12, 48, 36)
	const atmosMat = new THREE.ShaderMaterial({
		uniforms: {
			c: { value: new THREE.Color(0.35, 0.6, 1.0) },
		},
		vertexShader: `
			varying vec3 vNormal;
			varying vec3 vPosition;
			void main() {
				vNormal = normalize(normalMatrix * normal);
				vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
				gl_Position = projectionMatrix * vec4(vPosition, 1.0);
			}
		`,
		fragmentShader: `
			uniform vec3 c;
			varying vec3 vNormal;
			varying vec3 vPosition;
			void main() {
				vec3 viewDir = normalize(-vPosition);
				float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
				gl_FragColor = vec4(c, pow(rim, 3.5) * 0.55);
			}
		`,
		transparent: true,
		side: THREE.FrontSide,
		depthWrite: false,
	})
	const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat)
	scene.add(atmosMesh)

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
	let terrainWireframe: THREE.LineSegments | null = null
	let mapWireframe: THREE.LineSegments | null = null
	let globeGrid: THREE.LineSegments | null = null
	let mapGrid: THREE.LineSegments | null = null
	let currentWorld: SerializedOrogenWorld | null = null
	let currentColorMode: ColorMode = "terrain"
	let currentRegionColors: Float32Array | null = null
	let currentViewMode: OrogenViewMode = "globe"
	let wireframeVisible = false
	let gridVisible = false
	let gridSpacingDeg = 15
	let currentMapCenterLongitudeDeg = 0
	let terrainFaceToRegion: Int32Array = new Int32Array(0)
	let mapFaceToRegion: Int32Array = new Int32Array(0)
	let globeThermalEquator: THREE.Line | null = null
	let mapThermalEquator: THREE.Line | null = null
	let thermalEquatorPoints: [number, number][] | null = null
	let globeRivers: THREE.Group | null = null
	let mapRivers: THREE.Group | null = null
	let riverData: { lines: [number, number, number, number][][]; maxFlow: number; minFlow: number } | null = null
	let riversVisible = false
	let riverMaterials: LineMaterial[] = []
	let hoverHandler: ((info: OrogenHoverInfo | null) => void) | null = null
	let hoveredRegion = -1
	const raycaster = new THREE.Raycaster()
	const pointer = new THREE.Vector2()

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

	function buildTerrainMesh(world: SerializedOrogenWorld, colorMode: ColorMode): THREE.Mesh {
		const { mesh, elevation } = world
		const { numSides, numTriangles, s_begin_r, s_end_r, s_inner_t, s_outer_t, r_xyz, t_xyz } =
			mesh
		const useRegionColors = currentRegionColors && currentRegionColors.length >= mesh.numRegions * 3
		const isHeightmap = colorMode === "heightmap"
		const isLandHeightmap = colorMode === "landHeightmap"
		const isSmoothHeightmap = isHeightmap || isLandHeightmap
		const V = 0.04

		const tElevation = new Float32Array(numTriangles)
		for (let t = 0; t < numTriangles; t++) {
			const s0 = 3 * t
			const a = s_begin_r[s0]
			const b = s_begin_r[s0 + 1]
			const c = s_begin_r[s0 + 2]
			tElevation[t] = (elevation[a] + elevation[b] + elevation[c]) / 3
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
					colorElev: tElevation[tInner],
				},
				{
					x: r_xyz[3 * rBegin],
					y: r_xyz[3 * rBegin + 1],
					z: r_xyz[3 * rBegin + 2],
					elev: elevation[rBegin],
					colorElev: elevation[rBegin],
				},
				{
					x: t_xyz[3 * tOuter],
					y: t_xyz[3 * tOuter + 1],
					z: t_xyz[3 * tOuter + 2],
					elev: tElevation[tOuter],
					colorElev: tElevation[tOuter],
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
					const colorElev = isSmoothHeightmap ? p.colorElev : elevation[rBegin]
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
			const e1x = bx - ax, e1y = by - ay, e1z = bz - az
			const e2x = cx - ax, e2y = cy - ay, e2z = cz - az

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
				positions[base + 3] = cx; positions[base + 4] = cy; positions[base + 5] = cz
				positions[base + 6] = bx; positions[base + 7] = by; positions[base + 8] = bz
				// Swap colors too
				const tr = colors[base + 3], tg = colors[base + 4], tb = colors[base + 5]
				colors[base + 3] = colors[base + 6]
				colors[base + 4] = colors[base + 7]
				colors[base + 5] = colors[base + 8]
				colors[base + 6] = tr
				colors[base + 7] = tg
				colors[base + 8] = tb
			}
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(positions, 3),
		)
		geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
		geometry.computeVertexNormals()

		const material = new THREE.MeshLambertMaterial({
			vertexColors: true,
		})
		material.onBeforeCompile = (shader) => {
			shader.vertexShader = shader.vertexShader.replace(
				"#include <beginnormal_vertex>",
				"vec3 objectNormal = normalize(position);",
			)
		}

		return new THREE.Mesh(geometry, material)
	}

	function buildTerrainWireframe(world: SerializedOrogenWorld): THREE.LineSegments {
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

	function buildMapMesh(world: SerializedOrogenWorld, colorMode: ColorMode): THREE.Mesh {
		const { mesh, elevation } = world
		const { numSides, s_begin_r, s_inner_t, s_outer_t, r_xyz, t_xyz } = mesh
		const useRegionColors = currentRegionColors && currentRegionColors.length >= mesh.numRegions * 3
		const isHeightmap = colorMode === "heightmap"
		const isLandHeightmap = colorMode === "landHeightmap"
		const isSmoothHeightmap = isHeightmap || isLandHeightmap
		const pi = Math.PI
		const sx = 2 / pi
		const centerLon = currentMapCenterLongitudeDeg * pi / 180

		const tElevation = new Float32Array(mesh.numTriangles)
		for (let t = 0; t < mesh.numTriangles; t++) {
			const s0 = 3 * t
			const a = s_begin_r[s0]
			const b = s_begin_r[s0 + 1]
			const c = s_begin_r[s0 + 2]
			tElevation[t] = (elevation[a] + elevation[b] + elevation[c]) / 3
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

			const p0 = project(t_xyz[3 * tInner], t_xyz[3 * tInner + 1], t_xyz[3 * tInner + 2])
			const p1 = project(t_xyz[3 * tOuter], t_xyz[3 * tOuter + 1], t_xyz[3 * tOuter + 2])
			const p2 = project(r_xyz[3 * rBegin], r_xyz[3 * rBegin + 1], r_xyz[3 * rBegin + 2])

			let lon0 = p0.lon, lon1 = p1.lon, lon2 = p2.lon
			const lat0 = p0.lat, lat1 = p1.lat, lat2 = p2.lat

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
					? [tElevation[tInner], tElevation[tOuter], elevation[rBegin]]
					: [elevation[rBegin], elevation[rBegin], elevation[rBegin]]
				).map((value) => getColor(value, colorMode))

			const writeTri = (
				aLon: number, aLat: number,
				bLon: number, bLat: number,
				cLon: number, cLat: number,
			) => {
				const off = triCount * 9
				faceToRegion[triCount] = rBegin
				posArr[off] = clampX(aLon * sx); posArr[off + 1] = clampY(aLat * sx); posArr[off + 2] = 0
				posArr[off + 3] = clampX(bLon * sx); posArr[off + 4] = clampY(bLat * sx); posArr[off + 5] = 0
				posArr[off + 6] = clampX(cLon * sx); posArr[off + 7] = clampY(cLat * sx); posArr[off + 8] = 0
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
		geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(posArr.subarray(0, triCount * 9)), 3))
		geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colArr.subarray(0, triCount * 9)), 3))
		mapFaceToRegion = new Int32Array(faceToRegion.subarray(0, triCount))

		const material = new THREE.MeshBasicMaterial({
			vertexColors: true,
			side: THREE.DoubleSide,
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

	function buildMapWireframe(world: SerializedOrogenWorld): THREE.LineSegments {
		const { mesh } = world
		const { numSides, halfedges, s_inner_t, s_outer_t, t_xyz } = mesh
		const positions: number[] = []
		const pi = Math.PI
		const sx = 2 / pi
		const centerLon = currentMapCenterLongitudeDeg * pi / 180

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

		const writeSegment = (lon0: number, lat0: number, lon1: number, lat1: number) => {
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
				if (prev) latSegments.push(prev[0], prev[1], prev[2], point[0], point[1], point[2])
				prev = point
			}
		}

		for (let lonDeg = -180; lonDeg < 180; lonDeg += spacing) {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			let prev: [number, number, number] | null = null
			for (let lat = -Math.PI / 2; lat <= Math.PI / 2 + 0.0001; lat += latStep) {
				const cosLat = Math.cos(lat)
				const point: [number, number, number] = [
					radius * cosLat * Math.cos(lon),
					radius * cosLat * Math.sin(lon),
					radius * Math.sin(lat),
				]
				if (prev) lonSegments.push(prev[0], prev[1], prev[2], point[0], point[1], point[2])
				prev = point
			}
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(new Float32Array([...latSegments, ...lonSegments]), 3),
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
		const curve = new THREE.CatmullRomCurve3(controlPoints, false, "catmullrom", 0.5)
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
		const controlPoints = points.map(([lonDeg, latDeg]) =>
			new THREE.Vector3(
				THREE.MathUtils.degToRad(lonDeg) * sx,
				THREE.MathUtils.degToRad(latDeg) * sx,
				0.002,
			),
		)
		const curve = new THREE.CatmullRomCurve3(controlPoints, false, "catmullrom", 0.5)
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
		rivers: { lines: [number, number, number, number][][]; maxFlow: number; minFlow: number },
		toPosition: (lonDeg: number, latDeg: number, elev: number) => [number, number, number],
	): THREE.Group {
		const group = new THREE.Group()
		const w = canvas.clientWidth || 1
		const h = canvas.clientHeight || 1

		const MIN_WIDTH = 0.4
		const MAX_WIDTH = 3.5
		const BIN_STEP = 0.3
		// Normalize flow relative to threshold→max range for better spread
		const logMin = Math.log(1 + rivers.minFlow)
		const logMax = Math.log(1 + rivers.maxFlow)
		const logRange = logMax - logMin || 1

		// Material cache keyed by binned width
		const matCache = new Map<number, LineMaterial>()
		function getMat(width: number): LineMaterial {
			const binned = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH,
				Math.round(width / BIN_STEP) * BIN_STEP))
			let mat = matCache.get(binned)
			if (!mat) {
				const t = (binned - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)
				mat = new LineMaterial({
					color: 0xbadaef,
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
			const elevations = polyline.map(([, , , e]) => e)

			// Build positioned points using elevation-aware callback
			let positions: [number, number, number][]
			let smoothFlows: number[]

			if (n >= 3) {
				const controlPts = polyline.map(([lon, lat, , elev]) => {
					const [x, y, z] = toPosition(lon, lat, elev)
					return new THREE.Vector3(x, y, z)
				})
				const curve = new THREE.CatmullRomCurve3(controlPts, false, "catmullrom", 0.5)
				const numSmooth = n * 3
				const smoothed = curve.getPoints(numSmooth)
				positions = smoothed.map(p => [p.x, p.y, p.z])
				// Interpolate flow along parameter
				smoothFlows = smoothed.map((_, i) => {
					const t = i / numSmooth
					const idx = t * (n - 1)
					const lo = Math.floor(idx)
					const hi = Math.min(lo + 1, n - 1)
					return flows[lo] + (flows[hi] - flows[lo]) * (idx - lo)
				})
			} else {
				positions = polyline.map(([lon, lat, , elev]) => toPosition(lon, lat, elev))
				smoothFlows = flows
			}

			// Map flows to binned widths, split at transitions
			const widths = smoothFlows.map(f => flowToWidth(f))
			const bin = (w: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH,
				Math.round(w / BIN_STEP) * BIN_STEP))

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

	function buildGlobeRivers(rivers: { lines: [number, number, number, number][][]; maxFlow: number; minFlow: number }): THREE.Group {
		const V = 0.04
		const LIFT = 0.003 // small offset above terrain surface
		const toGlobe = (lonDeg: number, latDeg: number, elev: number): [number, number, number] => {
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

	function buildMapRivers(rivers: { lines: [number, number, number, number][][]; maxFlow: number; minFlow: number }): THREE.Group {
		const sx = 2 / Math.PI
		const toMap = (lonDeg: number, latDeg: number, _elev: number): [number, number, number] => [
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
			const c = child as any
			if (c.geometry) c.geometry.dispose()
			if (c.material) c.material.dispose()
		})
	}

	function rebuildOverlays() {
		disposeObject3D(terrainWireframe)
		disposeObject3D(mapWireframe)
		disposeObject3D(globeGrid)
		disposeObject3D(mapGrid)
		disposeObject3D(globeThermalEquator)
		disposeObject3D(mapThermalEquator)
		disposeRiverGroup(globeRivers)
		disposeRiverGroup(mapRivers)
		terrainWireframe = null
		mapWireframe = null
		globeGrid = null
		mapGrid = null
		globeThermalEquator = null
		mapThermalEquator = null
		globeRivers = null
		mapRivers = null
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
		updateOverlayVisibility()
	}

	function updateOverlayVisibility() {
		if (terrainWireframe) terrainWireframe.visible = wireframeVisible && currentViewMode === "globe"
		if (mapWireframe) {
			mapWireframe.visible = wireframeVisible && currentViewMode === "map"
			if (mapMesh) mapWireframe.position.copy(mapMesh.position)
		}
		if (globeGrid) globeGrid.visible = gridVisible && currentViewMode === "globe"
		if (mapGrid) {
			mapGrid.visible = gridVisible && currentViewMode === "map"
			if (mapMesh) mapGrid.position.copy(mapMesh.position)
		}
		if (globeThermalEquator) globeThermalEquator.visible = currentViewMode === "globe"
		if (mapThermalEquator) {
			mapThermalEquator.visible = currentViewMode === "map"
			if (mapMesh) mapThermalEquator.position.copy(mapMesh.position)
		}
		if (globeRivers) globeRivers.visible = riversVisible && currentViewMode === "globe"
		if (mapRivers) {
			mapRivers.visible = riversVisible && currentViewMode === "map"
			if (mapMesh) mapRivers.position.copy(mapMesh.position)
		}
	}

	function rebuildTerrain() {
		if (!currentWorld) return
		disposeObject3D(terrainMesh)
		disposeObject3D(mapMesh)
		terrainMesh = null
		mapMesh = null
		terrainMesh = buildTerrainMesh(currentWorld, currentColorMode)
		mapMesh = buildMapMesh(currentWorld, currentColorMode)
		scene.add(terrainMesh)
		scene.add(mapMesh)
		rebuildOverlays()
		setViewMode(currentViewMode)
	}

	function updateWorld(world: SerializedOrogenWorld) {
		currentWorld = world
		rebuildTerrain()
	}

	function setColorMode(mode: ColorMode) {
		if (mode === currentColorMode) return
		currentColorMode = mode
		if (mode === "terrain") {
			waterMat.color.set(0xffffff)
			waterMat.opacity = 0.12
			waterMat.specular.set(0x88bfe8)
		} else {
			waterMat.color.set(0x0c3a6e)
			waterMat.opacity = 0.4
			waterMat.specular.set(0x4488bb)
		}
		rebuildTerrain()
	}

	function setRegionColors(colors: Float32Array | null) {
		if (currentRegionColors === colors) return
		currentRegionColors = colors
		rebuildTerrain()
	}

	function setViewMode(mode: OrogenViewMode) {
		currentViewMode = mode
		const isMap = mode === "map"
		controls.enabled = !isMap
		mapControls.enabled = isMap
		if (terrainMesh) terrainMesh.visible = !isMap
		if (mapMesh) mapMesh.visible = isMap
		waterMesh.visible = !isMap
		atmosMesh.visible = !isMap
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

	function setMapCenterLongitude(longitudeDeg: number) {
		currentMapCenterLongitudeDeg = longitudeDeg
		if (mapMesh) {
			const builtLonDeg = mapMesh.userData.builtCenterLonDeg ?? 0
			const dx = ((builtLonDeg - currentMapCenterLongitudeDeg) * Math.PI / 180) * (2 / Math.PI)
			mapMesh.position.x = dx
		}
		updateOverlayVisibility()
	}

	function commitMapCenterLongitude() {
		if (currentWorld && currentViewMode === "map") rebuildTerrain()
	}

	function emitHover(info: OrogenHoverInfo | null) {
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
		raycaster.setFromCamera(pointer, currentViewMode === "map" ? mapCamera : camera)

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

		const faceToRegion = currentViewMode === "map" ? mapFaceToRegion : terrainFaceToRegion
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
	}

	// Animation loop
	let animId = 0
	function animate() {
		animId = requestAnimationFrame(animate)
		if (currentViewMode === "map") {
			mapControls.update()
			renderer.render(scene, mapCamera)
		} else {
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
	}

	updateMapCameraFrustum()

	canvas.addEventListener("pointermove", updateHover)
	canvas.addEventListener("pointerleave", clearHover)

	function dispose() {
		cancelAnimationFrame(animId)
		canvas.removeEventListener("pointermove", updateHover)
		canvas.removeEventListener("pointerleave", clearHover)
		controls.dispose()
		mapControls.dispose()
		renderer.dispose()
		disposeObject3D(terrainMesh)
		disposeObject3D(mapMesh)
		disposeObject3D(terrainWireframe)
		disposeObject3D(mapWireframe)
		disposeObject3D(globeGrid)
		disposeObject3D(mapGrid)
		disposeObject3D(globeThermalEquator)
		disposeObject3D(mapThermalEquator)
		disposeRiverGroup(globeRivers)
		disposeRiverGroup(mapRivers)
		waterGeo.dispose()
		waterMat.dispose()
		atmosGeo.dispose()
		atmosMat.dispose()
		starGeo.dispose()
		starMat.dispose()
	}

	function setHoverHandler(handler: ((info: OrogenHoverInfo | null) => void) | null) {
		hoverHandler = handler
		if (!handler) clearHover()
	}

	function setThermalEquator(points: [number, number][] | null) {
		thermalEquatorPoints = points
		rebuildOverlays()
	}

	function setRivers(data: { lines: [number, number, number, number][][]; maxFlow: number; minFlow: number } | null) {
		riverData = data
		rebuildOverlays()
	}

	function setRiversVisible(visible: boolean) {
		if (riversVisible === visible) return
		riversVisible = visible
		rebuildOverlays()
	}

	return {
		dispose,
		resize,
		updateWorld,
		setColorMode,
		setRegionColors,
		setViewMode,
		setWireframeVisible,
		setGridVisible,
		setGridSpacing,
		setMapCenterLongitude,
		commitMapCenterLongitude,
		setHoverHandler,
		setThermalEquator,
		setRivers,
		setRiversVisible,
	}
}
