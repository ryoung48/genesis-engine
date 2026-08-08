// Rasterizes a full-resolution equirectangular texture for the
// vegetationSatellite color mode -- unlike the mesh's per-face vertex
// colors (one flat color per triangle), this samples fractal noise and a
// heightmap-derived relief shade per output pixel, independent of mesh
// resolution. Mirrors the raster approach an earlier version of this app's
// satellite worker used, minus the river-glow pass.
import * as THREE from "three"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import { vegetationSatelliteColor } from "@/ui/genesis/shared/colors/vegetation"

const TEX_WIDTH = 1536
const TEX_HEIGHT = 768

// Ashima Arts public-domain simplex noise, ported from GLSL to plain JS --
// this runs once per world (on the CPU, at texture-build time) rather than
// per-fragment on the GPU, since the noise only needs to be baked into the
// raster once and then sampled like any other texture.
function mod289(x: number): number {
	return x - Math.floor(x * (1 / 289)) * 289
}

function permute(x: number): number {
	return mod289((x * 34 + 1) * x)
}

function snoise3(x: number, y: number, z: number): number {
	const C1 = 1 / 6
	const C2 = 1 / 3

	const s = (x + y + z) * C2
	let i = Math.floor(x + s)
	let j = Math.floor(y + s)
	let k = Math.floor(z + s)
	const t = (i + j + k) * C1
	const x0 = x - (i - t)
	const y0 = y - (j - t)
	const z0 = z - (k - t)

	let i1: number, j1: number, k1: number
	let i2: number, j2: number, k2: number
	if (x0 >= y0) {
		if (y0 >= z0) {
			i1 = 1
			j1 = 0
			k1 = 0
			i2 = 1
			j2 = 1
			k2 = 0
		} else if (x0 >= z0) {
			i1 = 1
			j1 = 0
			k1 = 0
			i2 = 1
			j2 = 0
			k2 = 1
		} else {
			i1 = 0
			j1 = 0
			k1 = 1
			i2 = 1
			j2 = 0
			k2 = 1
		}
	} else {
		if (y0 < z0) {
			i1 = 0
			j1 = 0
			k1 = 1
			i2 = 0
			j2 = 1
			k2 = 1
		} else if (x0 < z0) {
			i1 = 0
			j1 = 1
			k1 = 0
			i2 = 0
			j2 = 1
			k2 = 1
		} else {
			i1 = 0
			j1 = 1
			k1 = 0
			i2 = 1
			j2 = 1
			k2 = 0
		}
	}

	const x1 = x0 - i1 + C1
	const y1 = y0 - j1 + C1
	const z1 = z0 - k1 + C1
	const x2 = x0 - i2 + C2
	const y2 = y0 - j2 + C2
	const z2 = z0 - k2 + C2
	const x3 = x0 - 1 + 0.5
	const y3 = y0 - 1 + 0.5
	const z3 = z0 - 1 + 0.5

	i = mod289(i)
	j = mod289(j)
	k = mod289(k)
	const p0 = permute(permute(permute(k) + j) + i)
	const p1 = permute(permute(permute(k + k1) + j + j1) + i + i1)
	const p2 = permute(permute(permute(k + k2) + j + j2) + i + i2)
	const p3 = permute(permute(permute(k + 1) + j + 1) + i + 1)

	const grad = (p: number, gx: number, gy: number, gz: number): number => {
		// 12-gradient set matching the GLSL Ashima Arts vec4(A[o..]) lookup.
		const gradients = GRADIENTS[Math.floor(mod289(p)) % 12]
		return gradients[0] * gx + gradients[1] * gy + gradients[2] * gz
	}

	let n0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
	if (n0 > 0) {
		n0 *= n0
		n0 = n0 * n0 * grad(p0, x0, y0, z0)
	} else n0 = 0
	let n1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
	if (n1 > 0) {
		n1 *= n1
		n1 = n1 * n1 * grad(p1, x1, y1, z1)
	} else n1 = 0
	let n2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
	if (n2 > 0) {
		n2 *= n2
		n2 = n2 * n2 * grad(p2, x2, y2, z2)
	} else n2 = 0
	let n3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
	if (n3 > 0) {
		n3 *= n3
		n3 = n3 * n3 * grad(p3, x3, y3, z3)
	} else n3 = 0

	return 32 * (n0 + n1 + n2 + n3)
}

const GRADIENTS: [number, number, number][] = [
	[1, 1, 0],
	[-1, 1, 0],
	[1, -1, 0],
	[-1, -1, 0],
	[1, 0, 1],
	[-1, 0, 1],
	[1, 0, -1],
	[-1, 0, -1],
	[0, 1, 1],
	[0, -1, 1],
	[0, 1, -1],
	[0, -1, -1],
]

function fractalDetail(x: number, y: number, z: number): number {
	let n = 0
	n += snoise3(x * 5, y * 5, z * 5) * 0.3
	n += snoise3(x * 10, y * 10, z * 10) * 0.2
	n += snoise3(x * 20, y * 20, z * 20) * 0.15
	n += snoise3(x * 60, y * 60, z * 60) * 0.15
	n += snoise3(x * 100, y * 100, z * 100) * 0.1
	n += snoise3(x * 200, y * 200, z * 200) * 0.1
	return n * 0.5
}

let placeholderTexture: THREE.DataTexture | null = null

/** A 1x1 stand-in bound to uSatelliteMap before the real texture (built
 * lazily on first switch to vegetationSatellite, see satellite-texture
 * cache below) is ready -- avoids sampling an unset/null sampler. */
export function createPlaceholderSatelliteTexture(): THREE.DataTexture {
	if (placeholderTexture) return placeholderTexture
	const data = new Uint8ClampedArray([0, 0, 0, 255])
	const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
	texture.needsUpdate = true
	placeholderTexture = texture
	return texture
}

// Keyed by mode too, not just world -- an Earth import can carry both
// pastaClimate (any generation-side rerun) and realPastaClimate (observed),
// and "Satellite" vs "Satellite (Real)" must not share a cached texture.
const satelliteTextureCache = new WeakMap<
	SerializedGenesisWorld,
	Map<string, THREE.DataTexture>
>()

export function getSatelliteTexture(
	world: SerializedGenesisWorld,
	colorMode: string,
): THREE.DataTexture | null {
	let byMode = satelliteTextureCache.get(world)
	if (!byMode) {
		byMode = new Map()
		satelliteTextureCache.set(world, byMode)
	}
	const cached = byMode.get(colorMode)
	if (cached) return cached
	const texture = buildSatelliteTexture(world, colorMode)
	if (texture) byMode.set(colorMode, texture)
	return texture
}

/** The "Satellite" vegetation submode's raster texture -- both the
 * generated-world ("vegetationSatellite") and Earth-import observed-data
 * ("realVegetationSatellite") variants. Returns null for every other color
 * mode ("Maps" stays on its original flat per-region palette from
 * region-colors.ts), or if the world is missing the relevant climate array. */
export function getSatelliteStyleTexture(
	world: SerializedGenesisWorld,
	colorMode: string,
): THREE.DataTexture | null {
	if (
		colorMode === "vegetationSatellite" ||
		colorMode === "realVegetationSatellite"
	) {
		return getSatelliteTexture(world, colorMode)
	}
	return null
}

function buildSatelliteTexture(
	world: SerializedGenesisWorld,
	colorMode: string,
): THREE.DataTexture | null {
	const { mesh, elevation_km } = world
	const pastaClimate =
		colorMode === "realVegetationSatellite"
			? world.realPastaClimate
			: world.pastaClimate
	if (!pastaClimate) return null
	const temperature_avg =
		colorMode === "realVegetationSatellite"
			? (world.climate.real_temperature_avg ?? world.climate.temperature_avg)
			: world.climate.temperature_avg
	const rainfallAnnual =
		colorMode === "realVegetationSatellite"
			? (world.rainfall.real_annual ?? world.rainfall.annual)
			: world.rainfall.annual

	const W = TEX_WIDTH
	const H = TEX_HEIGHT
	const colorBuf = new Uint8ClampedArray(W * H * 3)
	const elevBuf = new Float32Array(W * H)
	const filled = new Uint8Array(W * H)

	const projection = createMapProjection(0, 0)
	const {
		numSides,
		numTriangles,
		s_begin_r,
		s_inner_t,
		s_outer_t,
		t_xyz,
		r_xyz,
	} = mesh

	const triangleElevationKm = new Float32Array(numTriangles)
	for (let triangle = 0; triangle < numTriangles; triangle++) {
		const sideOffset = 3 * triangle
		const a = s_begin_r[sideOffset]
		const b = s_begin_r[sideOffset + 1]
		const c = s_begin_r[sideOffset + 2]
		triangleElevationKm[triangle] =
			(elevation_km[a] + elevation_km[b] + elevation_km[c]) / 3
	}

	const regionColorCache = new Map<number, [number, number, number]>()
	const colorForRegion = (region: number): [number, number, number] => {
		const cached = regionColorCache.get(region)
		if (cached) return cached
		const [r, g, b] = vegetationSatelliteColor(
			world.isLand[region] !== 0,
			temperature_avg[region],
			rainfallAnnual[region],
		)
		const rgb: [number, number, number] = [
			Math.round(r * 255),
			Math.round(g * 255),
			Math.round(b * 255),
		]
		regionColorCache.set(region, rgb)
		return rgb
	}

	const pxOf = (lon: number) => ((lon + Math.PI) / (2 * Math.PI)) * W
	const pyOf = (lat: number) => (0.5 - lat / Math.PI) * H

	function fillTriangle(
		lon0: number,
		lat0: number,
		lon1: number,
		lat1: number,
		lon2: number,
		lat2: number,
		color: [number, number, number],
		e0: number,
		e1: number,
		e2: number,
	) {
		const x0 = pxOf(lon0)
		const y0 = pyOf(lat0)
		const x1 = pxOf(lon1)
		const y1 = pyOf(lat1)
		const x2 = pxOf(lon2)
		const y2 = pyOf(lat2)
		const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
		const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)))
		const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
		const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)))
		if (minX > maxX || minY > maxY) return
		const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
		if (Math.abs(denom) < 1e-9) return
		for (let y = minY; y <= maxY; y++) {
			const py = y + 0.5
			for (let x = minX; x <= maxX; x++) {
				const px = x + 0.5
				const w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom
				const w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom
				const w2 = 1 - w0 - w1
				if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue
				const idx = y * W + x
				colorBuf[idx * 3] = color[0]
				colorBuf[idx * 3 + 1] = color[1]
				colorBuf[idx * 3 + 2] = color[2]
				elevBuf[idx] = e0 * w0 + e1 * w1 + e2 * w2
				filled[idx] = 1
			}
		}
	}

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

		const color = colorForRegion(region)
		const e0 = triangleElevationKm[tInner]
		const e1 = triangleElevationKm[tOuter]
		const e2 = elevation_km[region]

		if (wraps) {
			if (lon0 < 0) lon0 += 2 * Math.PI
			if (lon1 < 0) lon1 += 2 * Math.PI
			if (lon2 < 0) lon2 += 2 * Math.PI
			fillTriangle(lon0, p0.lat, lon1, p1.lat, lon2, p2.lat, color, e0, e1, e2)
			fillTriangle(
				lon0 - 2 * Math.PI,
				p0.lat,
				lon1 - 2 * Math.PI,
				p1.lat,
				lon2 - 2 * Math.PI,
				p2.lat,
				color,
				e0,
				e1,
				e2,
			)
		} else {
			fillTriangle(lon0, p0.lat, lon1, p1.lat, lon2, p2.lat, color, e0, e1, e2)
		}
	}

	// Dilation fill for the sliver of unpainted pixels along seams/near the
	// poles, where the mesh's dual-triangle fan doesn't tile perfectly onto
	// an equirectangular grid.
	for (let pass = 0; pass < 4; pass++) {
		let remaining = 0
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const idx = y * W + x
				if (filled[idx]) continue
				remaining++
				let r = 0
				let g = 0
				let b = 0
				let e = 0
				let n = 0
				for (let dy = -1; dy <= 1; dy++) {
					const ny = y + dy
					if (ny < 0 || ny >= H) continue
					for (let dx = -1; dx <= 1; dx++) {
						const nx = (x + dx + W) % W
						const nIdx = ny * W + nx
						if (!filled[nIdx]) continue
						r += colorBuf[nIdx * 3]
						g += colorBuf[nIdx * 3 + 1]
						b += colorBuf[nIdx * 3 + 2]
						e += elevBuf[nIdx]
						n++
					}
				}
				if (n > 0) {
					colorBuf[idx * 3] = r / n
					colorBuf[idx * 3 + 1] = g / n
					colorBuf[idx * 3 + 2] = b / n
					elevBuf[idx] = e / n
				}
			}
		}
		if (remaining === 0) break
	}
	for (let idx = 0; idx < W * H; idx++) filled[idx] = 1

	const out = new Uint8ClampedArray(W * H * 4)
	for (let y = 0; y < H; y++) {
		const lat = (0.5 - y / H) * Math.PI
		const cosLat = Math.cos(lat)
		for (let x = 0; x < W; x++) {
			const idx = y * W + x
			const lon = (x / W) * 2 * Math.PI - Math.PI
			const sx = cosLat * Math.cos(lon)
			const sy = cosLat * Math.sin(lon)
			const sz = Math.sin(lat)

			const detail = fractalDetail(sx, sy, sz)
			const detailMul =
				(1 + detail * 0.35) * reliefMultiplier(elevBuf, W, H, x, y)

			out[idx * 4] = colorBuf[idx * 3] * detailMul
			out[idx * 4 + 1] = colorBuf[idx * 3 + 1] * detailMul
			out[idx * 4 + 2] = colorBuf[idx * 3 + 2] * detailMul
			out[idx * 4 + 3] = 255
		}
	}

	return packDataTexture(out, W, H)
}

function packDataTexture(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
): THREE.DataTexture {
	const texture = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.wrapS = THREE.RepeatWrapping
	texture.wrapT = THREE.ClampToEdgeWrapping
	texture.minFilter = THREE.LinearMipmapLinearFilter
	texture.magFilter = THREE.LinearFilter
	texture.generateMipmaps = true
	texture.needsUpdate = true
	return texture
}

const SUN_DIR = normalize3([-0.4, 0.3, 1])

function normalize3(v: [number, number, number]): [number, number, number] {
	const len = Math.hypot(v[0], v[1], v[2])
	return [v[0] / len, v[1] / len, v[2] / len]
}

/** Lambert relief multiplier from a fake heightmap normal (central
 * differences on elevBuf), 1 over flat/ocean pixels. Shared by both the
 * PASTA-table and insp-formula texture builders. */
function reliefMultiplier(
	elevBuf: Float32Array,
	W: number,
	H: number,
	x: number,
	y: number,
): number {
	const idx = y * W + x
	const elevKm = elevBuf[idx]
	if (elevKm <= 0) return 1
	const xm1 = (x - 1 + W) % W
	const xp1 = (x + 1) % W
	const ym1 = Math.max(0, y - 1)
	const yp1 = Math.min(H - 1, y + 1)
	const eL = elevBuf[ym1 * W + x] > 0 ? elevBuf[ym1 * W + x] : elevKm
	const eR = elevBuf[yp1 * W + x] > 0 ? elevBuf[yp1 * W + x] : elevKm
	const eU = elevBuf[y * W + xm1] > 0 ? elevBuf[y * W + xm1] : elevKm
	const eD = elevBuf[y * W + xp1] > 0 ? elevBuf[y * W + xp1] : elevKm
	const dHdx = (eD - eU) * 0.6
	const dHdy = (eR - eL) * 0.6
	const nx = -dHdx
	const ny = -dHdy
	const nz = 1
	const nLen = Math.hypot(nx, ny, nz)
	const shade = Math.max(
		0,
		(nx / nLen) * SUN_DIR[0] +
			(ny / nLen) * SUN_DIR[1] +
			(nz / nLen) * SUN_DIR[2],
	)
	return 0.7 + shade * 0.6
}
