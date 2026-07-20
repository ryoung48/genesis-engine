import * as THREE from "three"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import { getColor } from "../colors"
import { createMapProjection } from "./map-projection"
import type { GenesisViewMode } from "./types"

const TERRAIN_ELEVATION_SCALE = 0.04

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
		regionColors && regionColors.length >= mesh.numRegions * 3
	const isSmoothHeightmap = usesSmoothedHeightmapColors(colorMode)

	const tElevation = new Float32Array(numTriangles)
	const tElevationKm = new Float32Array(numTriangles)
	for (let triangle = 0; triangle < numTriangles; triangle++) {
		const sideOffset = 3 * triangle
		const a = s_begin_r[sideOffset]
		const b = s_begin_r[sideOffset + 1]
		const c = s_begin_r[sideOffset + 2]
		tElevation[triangle] = (elevation[a] + elevation[b] + elevation[c]) / 3
		tElevationKm[triangle] =
			(elevation_km[a] + elevation_km[b] + elevation_km[c]) / 3
	}

	let validSideCount = 0
	for (let side = 0; side < numSides; side++) {
		if (s_outer_t[side] >= 0) validSideCount++
	}

	const faceToRegion = new Int32Array(validSideCount)
	const positions = new Float32Array(validSideCount * 9)
	const colors = new Float32Array(validSideCount * 9)
	let vertexOffset = 0
	let faceIndex = 0

	for (let side = 0; side < numSides; side++) {
		const tInner = s_inner_t[side]
		const tOuter = s_outer_t[side]
		if (tOuter < 0) continue

		const region = s_begin_r[side]
		faceToRegion[faceIndex++] = region
		const vertices = [
			{
				x: t_xyz[3 * tInner],
				y: t_xyz[3 * tInner + 1],
				z: t_xyz[3 * tInner + 2],
				elev: tElevation[tInner],
				colorElev: tElevationKm[tInner],
			},
			{
				x: r_xyz[3 * region],
				y: r_xyz[3 * region + 1],
				z: r_xyz[3 * region + 2],
				elev: elevation[region],
				colorElev: elevation_km[region],
			},
			{
				x: t_xyz[3 * tOuter],
				y: t_xyz[3 * tOuter + 1],
				z: t_xyz[3 * tOuter + 2],
				elev: tElevation[tOuter],
				colorElev: tElevationKm[tOuter],
			},
		]

		for (const vertex of vertices) {
			const elevationFactor = elevationVisible
				? vertex.elev > 0
					? vertex.elev * TERRAIN_ELEVATION_SCALE
					: vertex.elev * TERRAIN_ELEVATION_SCALE * 0.3
				: 0
			const radius = 1 + elevationFactor
			const length = Math.sqrt(
				vertex.x * vertex.x + vertex.y * vertex.y + vertex.z * vertex.z,
			)
			const nx = vertex.x / length
			const ny = vertex.y / length
			const nz = vertex.z / length

			positions[vertexOffset] = nx * radius
			positions[vertexOffset + 1] = ny * radius
			positions[vertexOffset + 2] = nz * radius

			if (useRegionColors) {
				colors[vertexOffset] = regionColors[3 * region]
				colors[vertexOffset + 1] = regionColors[3 * region + 1]
				colors[vertexOffset + 2] = regionColors[3 * region + 2]
			} else {
				const colorElevation = isSmoothHeightmap
					? vertex.colorElev
					: elevation_km[region]
				const [r, g, b] = getColor(colorElevation, colorMode)
				colors[vertexOffset] = r
				colors[vertexOffset + 1] = g
				colors[vertexOffset + 2] = b
			}

			vertexOffset += 3
		}
	}

	for (let face = 0; face < validSideCount; face++) {
		const base = face * 9
		const ax = positions[base]
		const ay = positions[base + 1]
		const az = positions[base + 2]
		const bx = positions[base + 3]
		const by = positions[base + 4]
		const bz = positions[base + 5]
		const cx = positions[base + 6]
		const cy = positions[base + 7]
		const cz = positions[base + 8]

		const e1x = bx - ax
		const e1y = by - ay
		const e1z = bz - az
		const e2x = cx - ax
		const e2y = cy - ay
		const e2z = cz - az
		const fnx = e1y * e2z - e1z * e2y
		const fny = e1z * e2x - e1x * e2z
		const fnz = e1x * e2y - e1y * e2x
		const centerX = (ax + bx + cx) / 3
		const centerY = (ay + by + cy) / 3
		const centerZ = (az + bz + cz) / 3

		if (fnx * centerX + fny * centerY + fnz * centerZ < 0) {
			positions[base + 3] = cx
			positions[base + 4] = cy
			positions[base + 5] = cz
			positions[base + 6] = bx
			positions[base + 7] = by
			positions[base + 8] = bz

			const tr = colors[base + 3]
			const tg = colors[base + 4]
			const tb = colors[base + 5]
			colors[base + 3] = colors[base + 6]
			colors[base + 4] = colors[base + 7]
			colors[base + 5] = colors[base + 8]
			colors[base + 6] = tr
			colors[base + 7] = tg
			colors[base + 8] = tb
		}
	}

	// Smooth normals by averaging face normals at coincident vertex positions.
	// This geometry is non-indexed — each face owns private copies of its 3
	// vertices, even where two faces meet at the same point in space — so
	// THREE's computeVertexNormals() can't tell those copies are "the same"
	// vertex and falls back to a flat per-face normal. Every fragment inside
	// a face then gets an identical normal (true flat shading), which reads
	// as hard-edged brightness steps that exactly trace the mesh's triangle
	// edges — most visible on the huge, sparse triangles coast-density.ts
	// leaves in the open ocean, where it looked like concentric rings. This
	// groups faces by coincident position and averages their face normals,
	// like an indexed mesh's shared vertex normals would be.
	const normals = new Float32Array(positions.length)
	{
		const keyOf = (i: number) =>
			`${Math.round(positions[i] * 1e5)},${Math.round(positions[i + 1] * 1e5)},${Math.round(positions[i + 2] * 1e5)}`
		const accum = new Map<string, [number, number, number]>()
		for (let face = 0; face < validSideCount; face++) {
			const base = face * 9
			const ax = positions[base]
			const ay = positions[base + 1]
			const az = positions[base + 2]
			const bx = positions[base + 3]
			const by = positions[base + 4]
			const bz = positions[base + 5]
			const cx = positions[base + 6]
			const cy = positions[base + 7]
			const cz = positions[base + 8]
			const e1x = bx - ax
			const e1y = by - ay
			const e1z = bz - az
			const e2x = cx - ax
			const e2y = cy - ay
			const e2z = cz - az
			let fnx = e1y * e2z - e1z * e2y
			let fny = e1z * e2x - e1x * e2z
			let fnz = e1x * e2y - e1y * e2x
			const flen = Math.sqrt(fnx * fnx + fny * fny + fnz * fnz) || 1
			fnx /= flen
			fny /= flen
			fnz /= flen
			for (const idx of [base, base + 3, base + 6]) {
				const key = keyOf(idx)
				const acc = accum.get(key)
				if (acc) {
					acc[0] += fnx
					acc[1] += fny
					acc[2] += fnz
				} else {
					accum.set(key, [fnx, fny, fnz])
				}
			}
		}
		for (let i = 0; i < positions.length; i += 3) {
			const acc = accum.get(keyOf(i))!
			const len =
				Math.sqrt(acc[0] * acc[0] + acc[1] * acc[1] + acc[2] * acc[2]) || 1
			normals[i] = acc[0] / len
			normals[i + 1] = acc[1] / len
			normals[i + 2] = acc[2] / len
		}
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3))
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
	geometry.setAttribute(
		"occColor",
		new THREE.BufferAttribute(new Float32Array(validSideCount * 9), 3),
	)
	geometry.setAttribute(
		"occMask",
		new THREE.BufferAttribute(new Float32Array(validSideCount * 3), 1),
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
	const { mesh, elevation_km } = world
	const { numSides, s_begin_r, s_inner_t, s_outer_t, r_xyz, t_xyz } = mesh
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const useRegionColors =
		regionColors && regionColors.length >= mesh.numRegions * 3
	const isSmoothHeightmap = usesSmoothedHeightmapColors(colorMode)

	const triangleElevationKm = new Float32Array(mesh.numTriangles)
	for (let triangle = 0; triangle < mesh.numTriangles; triangle++) {
		const sideOffset = 3 * triangle
		const a = s_begin_r[sideOffset]
		const b = s_begin_r[sideOffset + 1]
		const c = s_begin_r[sideOffset + 2]
		triangleElevationKm[triangle] =
			(elevation_km[a] + elevation_km[b] + elevation_km[c]) / 3
	}

	const positions = new Float32Array(numSides * 18)
	const colors = new Float32Array(numSides * 18)
	const lonLat = new Float32Array(numSides * 12)
	const faceToRegion = new Int32Array(numSides * 2)
	let triangleCount = 0

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

		let lon0 = p0.lon
		let lon1 = p1.lon
		let lon2 = p2.lon
		const maxLon = Math.max(lon0, lon1, lon2)
		const minLon = Math.min(lon0, lon1, lon2)
		const wraps = maxLon - minLon > Math.PI

		const vertexColors = useRegionColors
			? Array.from(
					{ length: 3 },
					() =>
						[
							regionColors[3 * region],
							regionColors[3 * region + 1],
							regionColors[3 * region + 2],
						] as [number, number, number],
				)
			: (isSmoothHeightmap
					? [
							triangleElevationKm[tInner],
							triangleElevationKm[tOuter],
							elevation_km[region],
						]
					: [elevation_km[region], elevation_km[region], elevation_km[region]]
				).map((value) => getColor(value, colorMode))

		const writeTriangle = (
			aLon: number,
			aLat: number,
			bLon: number,
			bLat: number,
			cLon: number,
			cLat: number,
		) => {
			const offset = triangleCount * 9
			faceToRegion[triangleCount] = region
			const a = projection.projectRadians(aLon, aLat, 0)
			const b = projection.projectRadians(bLon, bLat, 0)
			const c = projection.projectRadians(cLon, cLat, 0)
			positions[offset] = projection.clampX(a[0])
			positions[offset + 1] = projection.clampY(a[1])
			positions[offset + 2] = 0
			positions[offset + 3] = projection.clampX(b[0])
			positions[offset + 4] = projection.clampY(b[1])
			positions[offset + 5] = 0
			positions[offset + 6] = projection.clampX(c[0])
			positions[offset + 7] = projection.clampY(c[1])
			positions[offset + 8] = 0
			const lonLatOffset = triangleCount * 6
			lonLat[lonLatOffset] = aLon
			lonLat[lonLatOffset + 1] = aLat
			lonLat[lonLatOffset + 2] = bLon
			lonLat[lonLatOffset + 3] = bLat
			lonLat[lonLatOffset + 4] = cLon
			lonLat[lonLatOffset + 5] = cLat
			for (let vertex = 0; vertex < 3; vertex++) {
				colors[offset + vertex * 3] = vertexColors[vertex][0]
				colors[offset + vertex * 3 + 1] = vertexColors[vertex][1]
				colors[offset + vertex * 3 + 2] = vertexColors[vertex][2]
			}
			triangleCount++
		}

		if (wraps) {
			if (lon0 < 0) lon0 += 2 * Math.PI
			if (lon1 < 0) lon1 += 2 * Math.PI
			if (lon2 < 0) lon2 += 2 * Math.PI
			writeTriangle(lon0, p0.lat, lon1, p1.lat, lon2, p2.lat)
			writeTriangle(
				lon0 - 2 * Math.PI,
				p0.lat,
				lon1 - 2 * Math.PI,
				p1.lat,
				lon2 - 2 * Math.PI,
				p2.lat,
			)
		} else {
			writeTriangle(lon0, p0.lat, lon1, p1.lat, lon2, p2.lat)
		}
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		"position",
		new THREE.BufferAttribute(
			new Float32Array(positions.subarray(0, triangleCount * 9)),
			3,
		),
	)
	geometry.setAttribute(
		"color",
		new THREE.BufferAttribute(
			new Float32Array(colors.subarray(0, triangleCount * 9)),
			3,
		),
	)
	geometry.setAttribute(
		"lonLat",
		new THREE.BufferAttribute(
			new Float32Array(lonLat.subarray(0, triangleCount * 6)),
			2,
		),
	)

	const vertexCount = triangleCount * 3
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
		faceToRegion: new Int32Array(faceToRegion.subarray(0, triangleCount)),
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

export function buildMapWireframe(
	world: SerializedGenesisWorld,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	wireframeVisible: boolean,
	viewMode: GenesisViewMode,
): THREE.LineSegments {
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
