import * as THREE from "three"
import type { SerializedGenesisWorld } from "@/model/transport"
import { getColor } from "../colors"
import { createMapProjection } from "./map-projection"
import {
	computeMapGeometryArrays,
	computeTerrainGeometryArrays,
	type MapGeometryArrays,
	TERRAIN_ELEVATION_SCALE,
	type TerrainGeometryArrays,
} from "./terrain-geometry"
import type { BuildMapWireframeParams, GenesisViewMode } from "./types"

interface MeshBuildResult {
	mesh: THREE.Mesh
	faceToRegion: Int32Array
}

function usesSmoothedHeightmapColors(
	colorMode: Parameters<typeof getColor>[1],
): boolean {
	return colorMode === "landHeightmap"
}

export function buildTerrainMesh(
	world: SerializedGenesisWorld,
	colorMode: Parameters<typeof getColor>[1],
	regionColors: Float32Array | null,
	elevationVisible: boolean,
): MeshBuildResult {
	// genesis.worker.ts precomputes this for the default color mode
	// (terrain / no region colors / elevation on) before the world ever
	// reaches the main thread -- reuse that instead of redoing the
	// per-vertex color/normal-averaging pass here, which is what used to
	// freeze the tab right before the first paint after "Generate"/"Load
	// Earth". Anything else (a non-default color mode already selected,
	// region colors already set) falls back to computing it here.
	const precomputed = world.precomputedTerrainGeometry
	const { positions, normals, colors, faceToRegion }: TerrainGeometryArrays =
		precomputed && colorMode === "terrain" && !regionColors && elevationVisible
			? precomputed
			: computeTerrainGeometryArrays(
					world,
					colorMode,
					regionColors,
					elevationVisible,
				)

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3))
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
	geometry.setAttribute(
		"occColor",
		new THREE.BufferAttribute(new Float32Array(faceToRegion.length * 9), 3),
	)
	geometry.setAttribute(
		"occMask",
		new THREE.BufferAttribute(new Float32Array(faceToRegion.length * 3), 1),
	)

	// Dithering breaks up 8-bit banding in the smooth Lambertian light falloff
	// across the sphere — without it, the lighting gradient quantizes into
	// visible concentric rings around the terminator.
	const material = new THREE.MeshLambertMaterial({
		vertexColors: true,
		dithering: true,
	})
	material.onBeforeCompile = (shader) => {
		// Normals now come from the geometry's own (properly smoothed)
		// "normal" attribute — no need to fake one from raw position here.
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

	return { mesh: new THREE.Mesh(geometry, material), faceToRegion }
}

export function buildTerrainWireframe(
	world: SerializedGenesisWorld,
	wireframeVisible: boolean,
	viewMode: GenesisViewMode,
	elevationVisible: boolean,
): THREE.LineSegments {
	const { mesh, elevation } = world
	const { numSides, halfedges, s_inner_t, s_outer_t, t_xyz, s_begin_r } = mesh
	const positions: number[] = []

	for (let side = 0; side < numSides; side++) {
		const opposite = halfedges[side]
		if (opposite >= 0 && side > opposite) continue
		const tInner = s_inner_t[side]
		const tOuter = s_outer_t[side]
		if (tInner < 0 || tOuter < 0) continue

		const regionA = s_begin_r[side]
		const regionB = opposite >= 0 ? s_begin_r[opposite] : regionA
		const averageElevation = (elevation[regionA] + elevation[regionB]) * 0.5
		const elevationFactor = elevationVisible
			? averageElevation > 0
				? averageElevation * TERRAIN_ELEVATION_SCALE
				: averageElevation * TERRAIN_ELEVATION_SCALE * 0.3
			: 0
		const radius = 1.002 + elevationFactor

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
	lines.visible = wireframeVisible && viewMode === "globe"
	return lines
}

export function buildMapMesh(
	world: SerializedGenesisWorld,
	colorMode: Parameters<typeof getColor>[1],
	regionColors: Float32Array | null,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
): MeshBuildResult {
	// See buildTerrainMesh's comment: genesis.worker.ts precomputes this for
	// the default color mode/map center before the world reaches the main
	// thread. Anything else falls back to computing it here.
	const precomputed = world.precomputedMapGeometry
	const { positions, colors, lonLat, faceToRegion }: MapGeometryArrays =
		precomputed &&
		colorMode === "terrain" &&
		!regionColors &&
		centerLongitudeDeg === 0 &&
		projectionLatitudeDeg === 0
			? precomputed
			: computeMapGeometryArrays(
					world,
					colorMode,
					regionColors,
					centerLongitudeDeg,
					projectionLatitudeDeg,
				)
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
	geometry.setAttribute("lonLat", new THREE.BufferAttribute(lonLat, 2))

	const vertexCount = faceToRegion.length * 3
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
		uniforms: {
			uAmbient: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
			uSunDirection: { value: new THREE.Vector3(1.0, 0.0, 0.0) },
			uSunLight: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
		},
		vertexShader: `
			attribute vec3 color;
			attribute vec3 occColor;
			attribute float occMask;
			attribute vec2 lonLat;
			varying vec3 vColor;
			varying vec3 vOccColor;
			varying float vOccMask;
			varying vec2 vWorldPos;
			varying vec2 vLonLat;
			void main() {
				vColor = color;
				vOccColor = occColor;
				vOccMask = occMask;
				vWorldPos = position.xy;
				vLonLat = lonLat;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			uniform vec3 uAmbient;
			uniform vec3 uSunDirection;
			uniform vec3 uSunLight;
			varying vec3 vColor;
			varying vec3 vOccColor;
			varying float vOccMask;
			varying vec2 vWorldPos;
			varying vec2 vLonLat;
			void main() {
				float cosLat = cos(vLonLat.y);
				vec3 surfaceNormal = vec3(
					cosLat * cos(vLonLat.x),
					cosLat * sin(vLonLat.x),
					sin(vLonLat.y)
				);
				float daylight = max(dot(normalize(surfaceNormal), normalize(uSunDirection)), 0.0);
				vec3 light = uAmbient + (uSunLight * daylight);
				vec3 finalColor = vColor * light;
				if (vOccMask > 0.5) {
					float stripe = fract((vWorldPos.x + vWorldPos.y) * 150.0);
					if (stripe > 0.25 && stripe < 0.75) {
						finalColor = vOccColor * light;
					}
				}
				gl_FragColor = linearToOutputTexel(vec4(finalColor, 1.0));
			}
		`,
	})

	const meshObject = new THREE.Mesh(geometry, material)
	const cloneL = new THREE.Mesh(geometry, material)
	const cloneR = new THREE.Mesh(geometry, material)
	cloneL.position.x = -projection.repeatWidth
	cloneR.position.x = projection.repeatWidth
	meshObject.add(cloneL, cloneR)
	meshObject.userData.builtCenterLonDeg = centerLongitudeDeg
	return {
		mesh: meshObject,
		faceToRegion,
	}
}

// buildMapOccupationOverlay was removed: it duplicated, via a full clone of
// mapMesh's geometry rendered as an always-on separate draw call, exactly
// what mapMesh's own occColor/occMask attributes + fragment shader already
// render in place (see buildMapMesh above and applyFaceRegionColors below).
// That redundant clone was rebuilt on every rebuildTerrain() call --
// including ones triggered by map panning -- making it a real per-pan CPU
// and per-frame GPU cost whenever an occupation overlay was active. Since
// mapMesh already paints the identical stripe for free, nothing else needs
// to build or render this separately.

export function buildMapWireframe({
	world,
	centerLongitudeDeg,
	projectionLatitudeDeg,
	wireframeVisible,
	viewMode,
}: BuildMapWireframeParams): THREE.LineSegments {
	const { mesh } = world
	const { numSides, halfedges, s_inner_t, s_outer_t, t_xyz } = mesh
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const positions: number[] = []

	const writeSegment = (
		lon0: number,
		lat0: number,
		lon1: number,
		lat1: number,
	) => {
		const a = projection.projectRadians(lon0, lat0, 0.001)
		const b = projection.projectRadians(lon1, lat1, 0.001)
		positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
	}

	for (let side = 0; side < numSides; side++) {
		const opposite = halfedges[side]
		if (opposite >= 0 && side > opposite) continue
		const tInner = s_inner_t[side]
		const tOuter = s_outer_t[side]
		if (tInner < 0 || tOuter < 0) continue

		const a = projection.projectCartesian(
			t_xyz[3 * tInner],
			t_xyz[3 * tInner + 1],
			t_xyz[3 * tInner + 2],
		)
		const b = projection.projectCartesian(
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
	lines.visible = wireframeVisible && viewMode === "map"
	return lines
}

function applyOccupationOverlayColors(
	geometry: THREE.BufferGeometry,
	faceToRegion: Int32Array,
	occupationOverlay: Float32Array | null,
	faceCount: number,
) {
	const occColorAttribute = geometry.getAttribute("occColor")
	const occMaskAttribute = geometry.getAttribute("occMask")
	if (
		!(occColorAttribute instanceof THREE.BufferAttribute) ||
		!(occMaskAttribute instanceof THREE.BufferAttribute)
	) {
		return
	}

	const occColorArray = occColorAttribute.array as Float32Array
	const occMaskArray = occMaskAttribute.array as Float32Array
	for (let face = 0; face < faceCount; face++) {
		const region = faceToRegion[face]
		const faceBase = face * 9
		const maskBase = face * 3
		if (occupationOverlay) {
			const overlayBase = region * 4
			const mask = occupationOverlay[overlayBase + 3] > 0.5 ? 1 : 0
			const or = occupationOverlay[overlayBase]
			const og = occupationOverlay[overlayBase + 1]
			const ob = occupationOverlay[overlayBase + 2]
			for (let vertex = 0; vertex < 9; vertex += 3) {
				occColorArray[faceBase + vertex] = or
				occColorArray[faceBase + vertex + 1] = og
				occColorArray[faceBase + vertex + 2] = ob
			}
			occMaskArray[maskBase] = mask
			occMaskArray[maskBase + 1] = mask
			occMaskArray[maskBase + 2] = mask
		} else {
			for (let vertex = 0; vertex < 9; vertex += 3) {
				occColorArray[faceBase + vertex] = 0
				occColorArray[faceBase + vertex + 1] = 0
				occColorArray[faceBase + vertex + 2] = 0
			}
			occMaskArray[maskBase] = 0
			occMaskArray[maskBase + 1] = 0
			occMaskArray[maskBase + 2] = 0
		}
	}
	occColorAttribute.needsUpdate = true
	occMaskAttribute.needsUpdate = true
}

export function applyTerrainColorModeColors(
	meshObject: THREE.Mesh | null,
	world: SerializedGenesisWorld,
	colorMode: Parameters<typeof getColor>[1],
	faceToRegion: Int32Array,
	occupationOverlay: Float32Array | null,
): boolean {
	if (!meshObject) return false
	const geometry = meshObject.geometry
	const colorAttribute = geometry.getAttribute("color")
	if (!(colorAttribute instanceof THREE.BufferAttribute)) return false
	const colorArray = colorAttribute.array
	if (!(colorArray instanceof Float32Array)) return false

	const { mesh, elevation_km } = world
	const { numSides, numTriangles, s_begin_r, s_inner_t, s_outer_t } = mesh
	const triangleElevationKm = new Float32Array(numTriangles)
	for (let triangle = 0; triangle < numTriangles; triangle++) {
		const sideOffset = 3 * triangle
		const a = s_begin_r[sideOffset]
		const b = s_begin_r[sideOffset + 1]
		const c = s_begin_r[sideOffset + 2]
		triangleElevationKm[triangle] =
			(elevation_km[a] + elevation_km[b] + elevation_km[c]) / 3
	}

	const isSmoothHeightmap = usesSmoothedHeightmapColors(colorMode)
	let faceCount = 0
	for (let side = 0; side < numSides; side++) {
		const tOuter = s_outer_t[side]
		if (tOuter < 0) continue
		const region = s_begin_r[side]
		const tInner = s_inner_t[side]
		const vertexElevations = isSmoothHeightmap
			? [
					triangleElevationKm[tInner],
					elevation_km[region],
					triangleElevationKm[tOuter],
				]
			: [elevation_km[region], elevation_km[region], elevation_km[region]]
		const faceBase = faceCount * 9
		for (let vertex = 0; vertex < 3; vertex++) {
			const [r, g, b] = getColor(vertexElevations[vertex], colorMode)
			colorArray[faceBase + vertex * 3] = r
			colorArray[faceBase + vertex * 3 + 1] = g
			colorArray[faceBase + vertex * 3 + 2] = b
		}
		faceCount++
	}
	colorAttribute.needsUpdate = true
	applyOccupationOverlayColors(
		geometry,
		faceToRegion,
		occupationOverlay,
		faceCount,
	)
	return true
}

export function applyMapColorModeColors(
	meshObject: THREE.Mesh | null,
	world: SerializedGenesisWorld,
	colorMode: Parameters<typeof getColor>[1],
	faceToRegion: Int32Array,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	occupationOverlay: Float32Array | null,
): boolean {
	if (!meshObject) return false
	const geometry = meshObject.geometry
	const colorAttribute = geometry.getAttribute("color")
	if (!(colorAttribute instanceof THREE.BufferAttribute)) return false
	const colorArray = colorAttribute.array
	if (!(colorArray instanceof Float32Array)) return false

	const { mesh, elevation_km } = world
	const {
		numSides,
		numTriangles,
		s_begin_r,
		s_inner_t,
		s_outer_t,
		r_xyz,
		t_xyz,
	} = mesh
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const triangleElevationKm = new Float32Array(numTriangles)
	for (let triangle = 0; triangle < numTriangles; triangle++) {
		const sideOffset = 3 * triangle
		const a = s_begin_r[sideOffset]
		const b = s_begin_r[sideOffset + 1]
		const c = s_begin_r[sideOffset + 2]
		triangleElevationKm[triangle] =
			(elevation_km[a] + elevation_km[b] + elevation_km[c]) / 3
	}

	const isSmoothHeightmap = usesSmoothedHeightmapColors(colorMode)
	let faceCount = 0
	for (let side = 0; side < numSides; side++) {
		const tInner = s_inner_t[side]
		const tOuter = s_outer_t[side]
		if (tOuter < 0) continue
		const region = s_begin_r[side]

		const p0 = projection.projectCartesian(
			t_xyz[3 * tInner],
			t_xyz[3 * tInner + 1],
			t_xyz[3 * tInner + 2],
		)
		const p1 = projection.projectCartesian(
			t_xyz[3 * tOuter],
			t_xyz[3 * tOuter + 1],
			t_xyz[3 * tOuter + 2],
		)
		const p2 = projection.projectCartesian(
			r_xyz[3 * region],
			r_xyz[3 * region + 1],
			r_xyz[3 * region + 2],
		)
		const maxLon = Math.max(p0.lon, p1.lon, p2.lon)
		const minLon = Math.min(p0.lon, p1.lon, p2.lon)
		const wraps = maxLon - minLon > Math.PI

		const vertexElevations = isSmoothHeightmap
			? [
					triangleElevationKm[tInner],
					triangleElevationKm[tOuter],
					elevation_km[region],
				]
			: [elevation_km[region], elevation_km[region], elevation_km[region]]
		const triangleInstances = wraps ? 2 : 1
		for (let instance = 0; instance < triangleInstances; instance++) {
			const faceBase = faceCount * 9
			for (let vertex = 0; vertex < 3; vertex++) {
				const [r, g, b] = getColor(vertexElevations[vertex], colorMode)
				colorArray[faceBase + vertex * 3] = r
				colorArray[faceBase + vertex * 3 + 1] = g
				colorArray[faceBase + vertex * 3 + 2] = b
			}
			faceCount++
		}
	}
	colorAttribute.needsUpdate = true
	applyOccupationOverlayColors(
		geometry,
		faceToRegion,
		occupationOverlay,
		faceCount,
	)
	return true
}

export function applyFaceRegionColors(
	meshObject: THREE.Mesh | null,
	faceToRegion: Int32Array,
	regionColors: Float32Array | null,
	occupationOverlay: Float32Array | null,
): boolean {
	if (!meshObject || !regionColors) return false
	const geometry = meshObject.geometry
	const colorAttribute = geometry.getAttribute("color")
	if (!(colorAttribute instanceof THREE.BufferAttribute)) return false
	const colorArray = colorAttribute.array
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
	colorAttribute.needsUpdate = true

	applyOccupationOverlayColors(
		geometry,
		faceToRegion,
		occupationOverlay,
		faceCount,
	)
	return true
}
