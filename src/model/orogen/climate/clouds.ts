/**
 * Procedural cloud coverage generation on a sphere mesh.
 *
 * Single cloud type: zonally stretched, domain-warped frontal bands across all latitudes.
 * Pressure controls coverage (not thickness): at 1 bar looks normal, at 0.5 bar sparse,
 * at 10 bar clouds everywhere but not thicker.
 */

import type { OrogenParams, OrogenRainfall } from "../types"
import { SimplexNoise } from "../util/simplex-noise"
import { getSubstellarDir, isTidallyLocked } from "../util/units"

function norm(v: number): number {
	return Math.max(-1, Math.min(1, v))
}

function smoothstep(lo: number, hi: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)))
	return t * t * (3 - 2 * t)
}

function tangentFrame(x: number, y: number, z: number) {
	let ex: number, ey: number, ez: number
	if (Math.abs(z) < 0.99) {
		const m = Math.sqrt(x * x + y * y) || 1
		ex = y / m
		ey = -x / m
		ez = 0
	} else {
		const m = Math.sqrt(z * z + x * x) || 1
		ex = -z / m
		ey = 0
		ez = x / m
	}
	return {
		ex,
		ey,
		ez,
		nx: y * ez - z * ey,
		ny: z * ex - x * ez,
		nz: x * ey - y * ex,
	}
}

const RAD2DEG = 180 / Math.PI
const TEQ_NUM_BINS = 120

/** Cloud density envelope for tidally locked planets as a function of angular distance from substellar. */
function tidalCloudEnvelope(thetaDeg: number): number {
	// Convective cap: dense near substellar, fades by ~40deg
	const cap = 1 - smoothstep(15, 40, thetaDeg) * 0.5

	// Terminator condensation ring: peaks ~85deg
	const ring =
		smoothstep(60, 80, thetaDeg) * (1 - smoothstep(95, 115, thetaDeg))

	// Nightside suppression: sinking air, clear skies
	const nightFade = 1 - smoothstep(95, 130, thetaDeg)

	return Math.max(cap * nightFade, ring * 0.85)
}

function computeTidalClouds(
	mesh: { numRegions: number; r_xyz: Float32Array },
	rainfall: OrogenRainfall,
	isLand: Uint8Array,
	params: OrogenParams,
): Float32Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const seed = params.seed

	const frontNoise = new SimplexNoise(seed + 6000)
	const detailNoise = new SimplexNoise(seed + 6001)
	const warpTanNoise = new SimplexNoise(seed + 6003)
	const warpRadNoise = new SimplexNoise(seed + 6004)
	const coverageNoise = new SimplexNoise(seed + 6008)

	const sub = getSubstellarDir(params.antistellarLon)
	const clouds = new Float32Array(N)

	const pressure = params.pressure ?? 1.0
	let landCount = 0
	for (let r = 0; r < N; r++) if (isLand[r]) landCount++
	const oceanFrac = 1 - landCount / N
	const oceanMoisture = Math.pow(oceanFrac, 0.6)

	const logPressure = Math.log2(Math.max(0.1, pressure))
	const coverageShift = logPressure * 0.1
	const coverageBase = coverageShift - 0.1 * oceanMoisture
	const dryLandMin = Math.min(1, 0.15 * Math.max(0, logPressure))

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		// Angular distance from substellar point
		const cosTheta = norm(x * sub[0] + y * sub[1] + z * sub[2])
		const theta = Math.acos(cosTheta)
		const thetaDeg = theta * RAD2DEG

		const envelope = tidalCloudEnvelope(thetaDeg)
		if (envelope < 0.01) {
			clouds[r] = 0
			continue
		}

		// Radial stretching: compress along substellar axis,
		// stretch perpendicular to create concentric ring patterns
		const stretch = 1.3 + 1.5 * Math.pow(Math.sin(theta + 0.1), 1.2)
		const invS = 1 / stretch
		// Decompose position into substellar-axis and perpendicular components
		const axial = cosTheta // component along substellar axis
		const px = x - axial * sub[0],
			py = y - axial * sub[1],
			pz = z - axial * sub[2]
		// Stretched coords: compress axial, stretch perpendicular
		const sx = sub[0] * axial * invS + px * stretch
		const sy = sub[1] * axial * invS + py * stretch
		const sz = sub[2] * axial * invS + pz * stretch

		// Domain warp in radial/tangential frame relative to substellar axis
		const perpLen = Math.sqrt(px * px + py * py + pz * pz) || 1
		const radX = px / perpLen,
			radY = py / perpLen,
			radZ = pz / perpLen
		// Tangential = cross(position, radial)
		const tanX = y * radZ - z * radY
		const tanY = z * radX - x * radZ
		const tanZ = x * radY - y * radX

		const dTan =
			norm(
				warpTanNoise.fbm(
					sx * 1.8 + 31.7,
					sy * 1.8 + 47.3,
					sz * 1.8 + 19.1,
					4,
					0.5,
				),
			) * 0.28
		const dRad =
			norm(
				warpRadNoise.fbm(
					sx * 1.8 + 73.1,
					sy * 1.8 + 11.9,
					sz * 1.8 + 59.3,
					4,
					0.5,
				),
			) * 0.15

		const wx = sx + tanX * dTan + radX * dRad
		const wy = sy + tanY * dTan + radY * dRad
		const wz = sz + tanZ * dTan + radZ * dRad

		// Cloud shape
		const shape = norm(frontNoise.fbm(wx * 2.5, wy * 2.5, wz * 2.5, 5, 0.5))
		let cloud = smoothstep(-0.15 - coverageBase, 0.4 - coverageBase, shape)

		// Apply tidal envelope
		cloud *= envelope

		// Internal texture
		const detail = norm(detailNoise.fbm(wx * 8, wy * 8, wz * 8, 4, 0.45))
		cloud *= detail * 0.25 + 0.75

		// Coverage variation
		const cov = norm(
			coverageNoise.fbm(x * 1.5 + 100, y * 1.5 + 100, z * 1.5 + 100, 3, 0.5),
		)
		cloud *= smoothstep(
			-0.6 - coverageBase * 0.5,
			0.2 - coverageBase * 0.5,
			cov,
		)

		// Dry-land suppression
		if (isLand[r]) {
			const dryMask = smoothstep(30, 250, rainfall.annual[r])
			cloud *= dryLandMin + (1 - dryLandMin) * dryMask
		}

		clouds[r] = Math.max(0, Math.min(1, cloud))
	}

	return clouds
}

export function computeClouds(
	mesh: { numRegions: number; r_xyz: Float32Array },
	rainfall: OrogenRainfall,
	isLand: Uint8Array,
	params: OrogenParams,
	monthlyTEQ?: Float32Array[],
): Float32Array {
	if (isTidallyLocked(params?.tidallyLocked)) {
		return computeTidalClouds(mesh, rainfall, isLand, params)
	}

	const N = mesh.numRegions
	const { r_xyz } = mesh
	const seed = params.seed

	const frontNoise = new SimplexNoise(seed + 6000)
	const detailNoise = new SimplexNoise(seed + 6001)
	const warpEastNoise = new SimplexNoise(seed + 6003)
	const warpNorthNoise = new SimplexNoise(seed + 6004)
	const coverageNoise = new SimplexNoise(seed + 6008)

	const clouds = new Float32Array(N)

	// Average monthly TEQ into a single annual TEQ (degrees)
	const teqBins = new Float32Array(TEQ_NUM_BINS)
	if (monthlyTEQ && monthlyTEQ.length === 12) {
		for (let b = 0; b < TEQ_NUM_BINS; b++) {
			let sum = 0
			for (let m = 0; m < 12; m++) sum += monthlyTEQ[m][b]
			teqBins[b] = sum / 12
		}
	}

	// Pressure controls coverage area, not thickness
	// At 0.5 bar: coverage threshold rises (sparse), at 10 bar: threshold drops (everywhere)
	const pressure = params.pressure ?? 1.0
	let landCount = 0
	for (let r = 0; r < N; r++) if (isLand[r]) landCount++
	const oceanFrac = 1 - landCount / N
	const oceanMoisture = Math.pow(oceanFrac, 0.6)

	// Coverage threshold: higher = fewer clouds pass, lower = more coverage
	// At p=1: ~0 (normal), p=0.5: ~+0.25 (sparser), p=10: ~-0.35 (everywhere)
	const logPressure = Math.log2(Math.max(0.1, pressure)) // -3.3 at 0.1, 0 at 1, 3.3 at 10
	const coverageShift = logPressure * 0.1 // -0.33 at 0.1, 0 at 1, +0.33 at 10
	const coverageBase = coverageShift - 0.1 * oceanMoisture // wetter worlds → slightly more coverage

	// Dry-land suppression weakens at high pressure
	const dryLandMin = Math.min(1, 0.15 * Math.max(0, logPressure))

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const absLatRad = Math.abs(Math.asin(z))
		const { ex, ey, ez, nx, ny, nz } = tangentFrame(x, y, z)

		// Zonally stretched coords (compress x,y / stretch z — no atan2 seam)
		const stretch = 1.3 + 1.5 * Math.pow(Math.sin(absLatRad + 0.1), 1.2)
		const invS = 1 / stretch
		const sx = x * invS,
			sy = y * invS,
			sz = z * stretch

		// Asymmetric domain warp — streaky along bands, organic across
		const dE =
			norm(
				warpEastNoise.fbm(
					sx * 1.8 + 31.7,
					sy * 1.8 + 47.3,
					sz * 1.8 + 19.1,
					4,
					0.5,
				),
			) * 0.28
		const dN =
			norm(
				warpNorthNoise.fbm(
					sx * 1.8 + 73.1,
					sy * 1.8 + 11.9,
					sz * 1.8 + 59.3,
					4,
					0.5,
				),
			) * 0.15
		const wx = sx + ex * dE + nx * dN
		const wy = sy + ey * dE + ny * dN
		const wz = sz + ez * dE + nz * dN

		// Cloud shape
		const shape = norm(frontNoise.fbm(wx * 2.5, wy * 2.5, wz * 2.5, 5, 0.5))
		let cloud = smoothstep(-0.15 - coverageBase, 0.4 - coverageBase, shape)

		// Internal texture
		const detail = norm(detailNoise.fbm(wx * 8, wy * 8, wz * 8, 4, 0.45))
		cloud *= detail * 0.25 + 0.75

		// Coverage variation — breaks up uniform regions
		const cov = norm(
			coverageNoise.fbm(x * 1.5 + 100, y * 1.5 + 100, z * 1.5 + 100, 3, 0.5),
		)
		cloud *= smoothstep(
			-0.6 - coverageBase * 0.5,
			0.2 - coverageBase * 0.5,
			cov,
		)

		// Dry-land suppression
		if (isLand[r]) {
			const dryMask = smoothstep(30, 250, rainfall.annual[r])
			cloud *= dryLandMin + (1 - dryLandMin) * dryMask
		}

		clouds[r] = Math.max(0, Math.min(1, cloud))
	}

	return clouds
}
