// Pure typed-array geometry math shared between the main thread
// (mesh-builders.ts, for on-demand rebuilds/fallbacks) and genesis.worker.ts
// (which precomputes the default-colorMode geometry once, off the main
// thread, so the initial "Generate"/"Load Earth" render doesn't have to run
// this synchronously right before the first paint). No THREE.BufferGeometry/
// Mesh/Material construction here -- callers wrap the returned arrays in
// those themselves, since geometry/material objects aren't worker-safe to
// hand back as-is (only their underlying typed arrays are transferable).
import type { SerializedGenesisWorld } from "@/model/transport/types"
import { getColor } from "@/ui/planet/colors"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"

export const TERRAIN_ELEVATION_SCALE = 0.04

function usesSmoothedHeightmapColors(
	colorMode: Parameters<typeof getColor>[1],
): boolean {
	return colorMode === "landHeightmap"
}

export interface TerrainGeometryArrays {
	positions: Float32Array
	normals: Float32Array
	colors: Float32Array
	faceToRegion: Int32Array
}

export function computeTerrainGeometryArrays(
	world: SerializedGenesisWorld,
	colorMode: Parameters<typeof getColor>[1],
	regionColors: Float32Array | null,
	elevationVisible: boolean,
): TerrainGeometryArrays {
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

	// Smooth normals by averaging face normals at coincident vertex positions
	// -- see mesh-builders.ts's buildTerrainMesh doc comment for why this is
	// needed instead of THREE's computeVertexNormals().
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

	return { positions, normals, colors, faceToRegion }
}

export interface MapGeometryArrays {
	positions: Float32Array
	colors: Float32Array
	lonLat: Float32Array
	faceToRegion: Int32Array
}

export function computeMapGeometryArrays(
	world: SerializedGenesisWorld,
	colorMode: Parameters<typeof getColor>[1],
	regionColors: Float32Array | null,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
): MapGeometryArrays {
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

	// .slice() (copy), not .subarray() (view): these backing arrays are
	// over-allocated for the worst case (every side wraps into 2 triangles),
	// and a view would keep that whole oversized buffer alive/transferred.
	return {
		positions: positions.slice(0, triangleCount * 9),
		colors: colors.slice(0, triangleCount * 9),
		lonLat: lonLat.slice(0, triangleCount * 6),
		faceToRegion: faceToRegion.slice(0, triangleCount),
	}
}
