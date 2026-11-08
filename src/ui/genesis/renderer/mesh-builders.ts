import * as THREE from "three"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { CONTOURS } from "@/ui/genesis/renderer/contours"
import { CONTOUR_WORKER } from "@/ui/genesis/renderer/contours/worker"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import {
	createPlaceholderSatelliteTexture,
	getSatelliteStyleTexture,
} from "@/ui/genesis/renderer/satellite-texture"
import {
	computeMapGeometryArrays,
	computeTerrainGeometryArrays,
	type MapGeometryArrays,
	TERRAIN_ELEVATION_SCALE,
	type TerrainGeometryArrays,
} from "@/ui/genesis/renderer/terrain-geometry"
import { TRIANGLE_VALUES } from "@/ui/genesis/renderer/triangle-values"
import type {
	BuildMapWireframeParams,
	GenesisViewMode,
	MapCloudMeshInput,
} from "@/ui/genesis/renderer/types"
import { getColor } from "@/ui/genesis/shared/colors"

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
	// genesis.worker.ts precomputes this geometry (elevation on) before the
	// world reaches the main thread -- reuse it instead of redoing the
	// normal-averaging pass here, which is what freezes the tab right before
	// the first paint after "Generate". Its colors are stale for any mode,
	// but rebuildTerrain recolors in place right after building. Smoothed
	// heightmap colors differ per vertex, and the in-place recolor ignores the
	// worker's face winding flips, so that mode still computes everything here.
	const precomputed = world.precomputedTerrainGeometry
	const {
		positions,
		normals,
		colors,
		contourSides,
		faceToRegion,
	}: TerrainGeometryArrays =
		precomputed && elevationVisible && !usesSmoothedHeightmapColors(colorMode)
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
	CONTOUR_WORKER.prepare({
		world,
		geometry,
		sides: contourSides,
		mapOrder: false,
	})
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
		const satelliteTexture = getSatelliteStyleTexture(world, colorMode)
		shader.uniforms.uSatelliteDetail = {
			value: satelliteTexture ? 1 : 0,
		}
		shader.uniforms.uSatelliteMap = {
			value: satelliteTexture ?? createPlaceholderSatelliteTexture(),
		}
		material.userData.shader = shader
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
			uniform float uSatelliteDetail;
			uniform sampler2D uSatelliteMap;
			void main() {`,
		)
		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <color_fragment>",
			`#include <color_fragment>
			if (uSatelliteDetail > 0.5) {
				vec3 n = normalize(vWorldPos);
				float lon = atan(n.y, n.x);
				float lat = asin(clamp(n.z, -1.0, 1.0));
				vec2 satUv = vec2((lon + 3.14159265) / 6.2831853, 0.5 - lat / 3.14159265);
				diffuseColor.rgb = texture2D(uSatelliteMap, satUv).rgb;
			}
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

	CONTOURS.attach({
		material,
		visible: false,
		fragmentTarget: "#include <opaque_fragment>",
		colorExpression: "outgoingLight",
	})
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
	// the default map center, and rebuildTerrain recolors it in place. Map
	// faces keep their vertex order, so every color mode can reuse it.
	const precomputed = world.precomputedMapGeometry
	const {
		positions,
		colors,
		lonLat,
		contourSides,
		faceToRegion,
	}: MapGeometryArrays =
		precomputed && centerLongitudeDeg === 0 && projectionLatitudeDeg === 0
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
	CONTOUR_WORKER.prepare({
		world,
		geometry,
		sides: contourSides,
		mapOrder: true,
	})
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

	const mapSatelliteTexture = getSatelliteStyleTexture(world, colorMode)
	const material = new THREE.ShaderMaterial({
		side: THREE.DoubleSide,
		uniforms: {
			uAmbient: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
			uSunDirection: { value: new THREE.Vector3(1.0, 0.0, 0.0) },
			uSunLight: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
			uSatelliteDetail: {
				value: mapSatelliteTexture ? 1 : 0,
			},
			uSatelliteMap: {
				value: mapSatelliteTexture ?? createPlaceholderSatelliteTexture(),
			},
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
			uniform float uSatelliteDetail;
			uniform sampler2D uSatelliteMap;
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
				vec3 baseColor = vColor;
				if (uSatelliteDetail > 0.5) {
					vec2 satUv = vec2((vLonLat.x + 3.14159265) / 6.2831853, 0.5 - vLonLat.y / 3.14159265);
					baseColor = texture2D(uSatelliteMap, satUv).rgb;
				}
				vec3 finalColor = baseColor * light;
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

	CONTOURS.attach({
		material,
		visible: false,
		fragmentTarget: "gl_FragColor = linearToOutputTexel",
		colorExpression: "finalColor",
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

export function buildMapCloudMesh({
	mapMeshGeometry,
	material,
}: MapCloudMeshInput): THREE.Mesh {
	const mesh = new THREE.Mesh(mapMeshGeometry, material)
	mesh.renderOrder = 2
	return mesh
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
	const { numSides, s_begin_r, s_inner_t, s_outer_t } = mesh
	const triangleElevationKm = TRIANGLE_VALUES.average({
		mesh,
		values: elevation_km,
	})

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
	const { numSides, s_begin_r, s_inner_t, s_outer_t, r_xyz, t_xyz } = mesh
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const triangleElevationKm = TRIANGLE_VALUES.average({
		mesh,
		values: elevation_km,
	})

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
