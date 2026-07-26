import type { SphereMesh } from ".."
import { MinHeap, SimplexNoise, smoothstep } from "../shared"
import type {
	BuildGlacialBuffersParams,
	WarpTerrainParams,
	SmoothElevationParams,
	SharpenRidgesParams,
	ApplySoilCreepParams,
} from "./types"

/**
 * Core iteration kernel shared by smoothElevation, sharpenRidges, and applySoilCreep.
 * For each cell in `cells`, calls `compute(r)` and batch-writes the result back to `elev`.
 */
function diffuseIteration(
	cells: ArrayLike<number>,
	elev: Float32Array,
	N: number,
	iterations: number,
	compute: (r: number) => number,
): void {
	const tmp = new Float32Array(N)
	const n = cells.length
	for (let iter = 0; iter < iterations; iter++) {
		for (let i = 0; i < n; i++) {
			tmp[cells[i]] = compute(cells[i])
		}
		for (let i = 0; i < n; i++) {
			elev[cells[i]] = tmp[cells[i]]
		}
	}
}

// ----------------------------------------------------------------
//  Priority-flood pit resolution with canyon carving (genesis port)
// ----------------------------------------------------------------
function priorityFloodCarve(
	mesh: SphereMesh,
	elev: Float32Array,
	r_isOcean: Uint8Array,
	carveStrength: number,
): void {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const EPS = 1e-7

	// Main ocean body via BFS
	const oceanLabel = new Int32Array(N).fill(-1)
	const componentSizes: number[] = []
	for (let r = 0; r < N; r++) {
		if (!r_isOcean[r] || oceanLabel[r] >= 0) continue
		const label = componentSizes.length
		let size = 0
		const queue = [r]
		oceanLabel[r] = label
		while (queue.length > 0) {
			const cur = queue.pop()!
			size++
			for (let i = adjOffset[cur]; i < adjOffset[cur + 1]; i++) {
				const nb = adjList[i]
				if (r_isOcean[nb] && oceanLabel[nb] < 0) {
					oceanLabel[nb] = label
					queue.push(nb)
				}
			}
		}
		componentSizes.push(size)
	}
	let mainOceanLabel = 0
	for (let i = 1; i < componentSizes.length; i++) {
		if (componentSizes[i] > componentSizes[mainOceanLabel]) mainOceanLabel = i
	}
	const isOpenOcean = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		if (r_isOcean[r] && oceanLabel[r] === mainOceanLabel) isOpenOcean[r] = 1
	}

	// Deterministic hash for noise perturbation (meander paths)
	const NOISE_AMP = 0.01
	function cellNoise(r: number): number {
		let h = (r * 2654435761) >>> 0
		h = (((h >>> 16) ^ h) * 0x45d9f3b) >>> 0
		h = ((h >>> 16) ^ h) >>> 0
		return (h / 0xffffffff) * NOISE_AMP
	}

	const surface = new Float32Array(elev)
	const drainTo = new Int32Array(N).fill(-1)
	const visited = new Uint8Array(N)

	const key = new Float32Array(N)
	for (let r = 0; r < N; r++) key[r] = elev[r] + cellNoise(r)

	const heap = new MinHeap(key)

	// Seed: land cells adjacent to open ocean
	for (let r = 0; r < N; r++) {
		if (r_isOcean[r]) {
			visited[r] = 1
			continue
		}
		for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
			if (isOpenOcean[adjList[i]]) {
				visited[r] = 1
				drainTo[r] = adjList[i]
				heap.push(r)
				break
			}
		}
	}

	// Pass 1: priority-flood fill
	while (heap.size > 0) {
		const r = heap.pop()
		const surfR = surface[r]
		for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
			const nb = adjList[i]
			if (visited[nb]) continue
			visited[nb] = 1
			drainTo[nb] = r
			if (elev[nb] < surfR + EPS) {
				surface[nb] = surfR + EPS
				key[nb] = surface[nb] + cellNoise(nb)
			}
			heap.push(nb)
		}
	}

	// Pass 2: carve-bias redistribution
	for (let r = 0; r < N; r++) {
		if (r_isOcean[r]) continue
		const deficit = surface[r] - elev[r]
		if (deficit <= EPS) continue

		const path: number[] = []
		let peakIdx = -1
		let peakElev = -Infinity
		let cur = r
		while (cur >= 0 && !r_isOcean[cur]) {
			path.push(cur)
			if (elev[cur] > peakElev) {
				peakElev = elev[cur]
				peakIdx = path.length - 1
			}
			cur = drainTo[cur]
		}

		if (peakIdx < 0 || path.length === 0) continue

		const carveAmount = deficit * carveStrength
		const radius = Math.max(3, Math.ceil(path.length * 0.3))
		const startIdx = Math.max(0, peakIdx - radius)
		const endIdx = Math.min(path.length - 1, peakIdx + radius)

		let kernelSum = 0
		for (let k = startIdx; k <= endIdx; k++) {
			kernelSum += 1 - Math.abs(k - peakIdx) / (radius + 1)
		}
		if (kernelSum > 0) {
			for (let k = startIdx; k <= endIdx; k++) {
				const dist = Math.abs(k - peakIdx)
				const weight = (1 - dist / (radius + 1)) / kernelSum
				elev[path[k]] -= carveAmount * weight
				if (elev[path[k]] < 0) elev[path[k]] = 0
			}
		}

		const fillAmount = deficit * (1 - carveStrength)
		elev[r] += fillAmount
	}

	// Pass 3: enforce monotonic drainage
	const order: number[] = []
	for (let r = 0; r < N; r++) {
		if (!r_isOcean[r]) order.push(r)
	}
	order.sort((a, b) => surface[a] - surface[b])

	for (const r of order) {
		const target = drainTo[r]
		if (target < 0) continue
		const targetElev = r_isOcean[target] ? 0 : elev[target]
		if (elev[r] <= targetElev) {
			elev[r] = targetElev + EPS
		}
	}
}

// ----------------------------------------------------------------
//  Domain warping via FBM simplex noise with greedy mesh walk (genesis port)
// ----------------------------------------------------------------
export function warpTerrain({
	mesh,
	elev,
	seed,
	strength,
	r_hotspot,
}: WarpTerrainParams): Float32Array {
	if (strength <= 0) return elev

	const N = mesh.numRegions
	const { adjOffset, adjList, r_xyz } = mesh
	const noise = new SimplexNoise(seed + 9999)
	const freq = 4
	const octaves = 5
	const maxAmp = 0.12 * strength

	const out = new Float32Array(elev)

	// FBM helper — uses default persistence (2/3) matching source
	function fbm(x: number, y: number, z: number): number {
		return noise.fbm(x, y, z, octaves)
	}

	for (let r = 0; r < N; r++) {
		const px = r_xyz[3 * r],
			py = r_xyz[3 * r + 1],
			pz = r_xyz[3 * r + 2]

		// Tangent frame: east = normalize(cross([0,1,0], pos))
		let ex = -pz,
			ey = 0,
			ez = px
		const elen = Math.sqrt(ex * ex + ez * ez)
		if (elen > 1e-10) {
			ex /= elen
			ez /= elen
		} else {
			ex = 1
			ez = 0
		}

		// north = cross(pos, east)
		const nx = py * ez
		const ny = pz * ex - px * ez
		const nz = -py * ex
		const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
		const nnx = nx / nlen,
			nny = ny / nlen,
			nnz = nz / nlen

		const d1 = fbm(px * freq, py * freq, pz * freq) * maxAmp
		const d2 =
			fbm(px * freq + 31.7, py * freq + 47.3, pz * freq + 19.1) * maxAmp

		// Displace and re-project onto unit sphere
		let wx = px + ex * d1 + nnx * d2
		let wy = py + ey * d1 + nny * d2
		let wz = pz + ez * d1 + nnz * d2
		const wlen = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1
		wx /= wlen
		wy /= wlen
		wz /= wlen

		// Greedy mesh walk toward displaced point
		let cur = r
		let bestDot = wx * px + wy * py + wz * pz
		for (;;) {
			let moved = false
			for (let i = adjOffset[cur], iEnd = adjOffset[cur + 1]; i < iEnd; i++) {
				const nb = adjList[i]
				const dot =
					wx * r_xyz[3 * nb] + wy * r_xyz[3 * nb + 1] + wz * r_xyz[3 * nb + 2]
				if (dot > bestDot) {
					bestDot = dot
					cur = nb
					moved = true
				}
			}
			if (!moved) break
		}

		out[r] = elev[cur]
	}

	// Weighted blend: biased by strength, dampened near hotspots
	const warpBias = 0.25 + 0.5 * strength
	for (let r = 0; r < N; r++) {
		const orig = elev[r]
		const warped = out[r]
		let bias = warpBias
		if (r_hotspot) {
			const hotFrac = Math.min(
				1,
				Math.abs(r_hotspot[r]) / (Math.abs(orig) || 1),
			)
			bias *= 1 - 0.8 * hotFrac
		}
		if (warped > orig) {
			elev[r] = orig + (warped - orig) * bias
		} else {
			elev[r] = warped + (orig - warped) * (1 - bias)
		}
	}

	return elev
}

// ----------------------------------------------------------------
//  Bilateral smoothing with coastline locking (genesis port)
// ----------------------------------------------------------------
export function smoothElevation({
	mesh,
	elev,
	r_isOcean,
	iterations,
	strength,
}: SmoothElevationParams): void {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh

	// Coastline lock: land cells adjacent to ocean
	const locked = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		if (r_isOcean[r]) continue
		for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
			if (r_isOcean[adjList[i]]) {
				locked[r] = 1
				break
			}
		}
	}

	const allCells = new Uint32Array(N).map((_, i) => i)
	diffuseIteration(allCells, elev, N, iterations, (r) => {
		if (locked[r]) return elev[r]
		const h = elev[r]
		let wSum = 0,
			hSum = 0
		for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
			const nh = elev[adjList[i]]
			const diff = Math.abs(nh - h)
			const w = 1 / (1 + diff * 8)
			wSum += w
			hSum += nh * w
		}
		if (wSum > 0) {
			const avg = hSum / wSum
			return h + (avg - h) * strength
		}
		return h
	})
}

interface GlacialBuffers {
	glacIdx: Float32Array
	iceTarget: Int32Array
	iceFlow: Float32Array
	numIceUpstream: Uint8Array
}

function buildGlacialBuffers({
	N,
	r_xyz,
	r_isOcean,
	elev,
	glacialStrength,
}: BuildGlacialBuffersParams): GlacialBuffers {
	const glacIdx = new Float32Array(N)
	// At strength=1 glaciation starts at ~50° latitude; at 0.5 it starts at ~70°
	const thresholdLat = Math.PI / 2 - (glacialStrength * Math.PI) / 4.5
	for (let r = 0; r < N; r++) {
		if (r_isOcean[r]) continue
		const z = r_xyz[3 * r + 2]
		const polarDist = Math.abs(Math.asin(Math.max(-1, Math.min(1, z))))
		const latFactor = smoothstep(thresholdLat, Math.PI / 2, polarDist)
		const elevFactor = smoothstep(0.5, 0.9, elev[r])
		const latScale = smoothstep(Math.PI / 8, Math.PI / 3, polarDist)
		glacIdx[r] =
			Math.max(latFactor, elevFactor * 0.3 * (0.3 + 0.7 * latScale)) *
			glacialStrength
	}

	return {
		glacIdx,
		iceTarget: new Int32Array(N),
		iceFlow: new Float32Array(N),
		numIceUpstream: new Uint8Array(N),
	}
}

// ----------------------------------------------------------------
//  Composite erosion: hydraulic (stream power) + thermal (genesis port)
// ----------------------------------------------------------------
export function erodeComposite(
	mesh: SphereMesh,
	elev: Float32Array,
	r_isOcean: Uint8Array,
	hIters: number,
	K: number,
	m: number,
	dt: number,
	tIters: number,
	talusSlope: number,
	kThermal: number,
	gIters: number = 0,
	glacialStrength: number = 0,
): void {
	const totalIters = Math.max(hIters, tIters, gIters)
	if (totalIters <= 0) return

	const N = mesh.numRegions
	const { adjOffset, adjList, neighborDist } = mesh

	const landCells: number[] = []
	for (let r = 0; r < N; r++) {
		if (!r_isOcean[r]) landCells.push(r)
	}
	const landCount = landCells.length
	if (landCount === 0) return

	const drainTarget = new Int32Array(N)
	const cellDist = new Float32Array(N)
	const flow = new Float32Array(N)
	const delta = new Float32Array(N)

	// Initial priority-flood pit resolution
	if (hIters > 0) {
		priorityFloodCarve(mesh, elev, r_isOcean, 0.5)
	}

	// ---- Glacial precomputation (once — index is position-based) ----
	let glacialBuffers: GlacialBuffers | null = null
	if (gIters > 0 && glacialStrength > 0) {
		glacialBuffers = buildGlacialBuffers({
			N,
			r_xyz: mesh.r_xyz,
			r_isOcean,
			elev,
			glacialStrength,
		})
	}
	const glacIdx = glacialBuffers?.glacIdx ?? null
	const iceTarget = glacialBuffers?.iceTarget ?? null
	const iceFlow = glacialBuffers?.iceFlow ?? null
	const numIceUpstream = glacialBuffers?.numIceUpstream ?? null

	// Per-iteration glacial rates (scaled so total effect ~ same regardless of iter count)
	const gScale = gIters > 0 ? 1.0 / gIters : 0
	const gCarveRate = 0.02 * gScale
	const gConvergenceBonus = 0.01 * gScale
	const gDepositAmount = 0.005 * gScale
	const gFjordCarve = 0.015 * gScale
	const gFlowThreshold = 0.1
	const gFjordThreshold = 0.5

	// Mid-loop drain fix
	const midFloodIter = Math.round(totalIters * 0.75)
	let midFloodDone = false

	// Pre-allocate thermal buffers
	let maxDeg = 0
	for (let r = 0; r < N; r++) {
		const deg = adjOffset[r + 1] - adjOffset[r]
		if (deg > maxDeg) maxDeg = deg
	}
	const excNb = new Int32Array(maxDeg)
	const excVal = new Float32Array(maxDeg)

	// Pre-allocated bucket sort (512 buckets over [0,1] elevation range)
	const SORT_BUCKETS = 512
	const sortBuckets: number[][] = Array.from(
		{ length: SORT_BUCKETS },
		(): number[] => [],
	)
	function bucketSortLandDesc(): void {
		for (let b = 0; b < SORT_BUCKETS; b++) sortBuckets[b].length = 0
		for (let i = 0; i < landCount; i++) {
			const r = landCells[i]
			const b = Math.min(
				SORT_BUCKETS - 1,
				Math.max(0, Math.floor(elev[r] * SORT_BUCKETS)),
			)
			sortBuckets[b].push(r)
		}
		let idx = 0
		for (let b = SORT_BUCKETS - 1; b >= 0; b--) {
			for (const r of sortBuckets[b]) landCells[idx++] = r
		}
	}

	for (let iter = 0; iter < totalIters; iter++) {
		if (!midFloodDone && iter >= midFloodIter) {
			midFloodDone = true
			priorityFloodCarve(mesh, elev, r_isOcean, 0.85)
		}

		const glacialThisIter = iter < gIters && glacIdx !== null
		const hydraulicThisIter = iter < hIters

		// Sort land cells by descending elevation — needed by glacial and hydraulic
		if (glacialThisIter || hydraulicThisIter) {
			bucketSortLandDesc()
		}

		// ---- Glacial step ----
		if (glacialThisIter) {
			// Rebuild ice drainage from current elevations
			iceTarget!.fill(-1)
			numIceUpstream!.fill(0)

			for (let i = 0; i < landCount; i++) {
				const r = landCells[i]
				if (glacIdx![r] <= 0) continue
				const h = elev[r]
				let bestNb = -1,
					bestDrop = 0
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					const drop = h - elev[nb]
					if (drop > bestDrop) {
						bestDrop = drop
						bestNb = nb
					}
				}
				if (bestNb >= 0) iceTarget![r] = bestNb
			}

			// Accumulate ice flow downstream
			for (let r = 0; r < N; r++) iceFlow![r] = glacIdx![r]
			for (let i = 0; i < landCount; i++) {
				const r = landCells[i]
				const target = iceTarget![r]
				if (target >= 0 && iceFlow![r] > 0) {
					iceFlow![target] += iceFlow![r]
					numIceUpstream![target]++
				}
			}

			// Carving: deepening + widening + over-deepening
			for (let i = 0; i < landCount; i++) {
				const r = landCells[i]
				if (iceFlow![r] <= gFlowThreshold) continue

				const deepening =
					gCarveRate * Math.pow(iceFlow![r], 0.6) * glacialStrength
				elev[r] -= deepening

				// Valley widening for U-shape
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (r_isOcean[nb]) continue
					const d = neighborDist[j] || 1e-6
					const slope = Math.abs(elev[r] - elev[nb]) / d
					elev[nb] -= deepening * 0.4 * Math.max(0, 1 - slope)
				}

				// Over-deepening at convergence zones
				if (numIceUpstream![r] >= 2) {
					elev[r] -= gConvergenceBonus * Math.pow(iceFlow![r], 0.4)
				}
			}

			// Moraine deposition at glacier termini
			for (let i = 0; i < landCount; i++) {
				const r = landCells[i]
				if (iceFlow![r] <= gFlowThreshold) continue
				const target = iceTarget![r]
				if (target < 0 || r_isOcean[target]) continue
				if (glacIdx![target] < glacIdx![r] * 0.3) {
					elev[target] += gDepositAmount * Math.pow(iceFlow![r], 0.3)
				}
			}

			// Fjord enhancement on coastal glaciated cells
			for (let r = 0; r < N; r++) {
				if (r_isOcean[r]) continue
				if (glacIdx![r] <= 0.2 || iceFlow![r] <= gFjordThreshold) continue
				let isCoastal = false
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					if (r_isOcean[adjList[j]]) {
						isCoastal = true
						break
					}
				}
				if (isCoastal) {
					elev[r] -= gFjordCarve * Math.pow(iceFlow![r], 0.5)
					if (elev[r] < 0) elev[r] = 0
				}
			}

			// Clamp: land stays land
			for (let r = 0; r < N; r++) {
				if (!r_isOcean[r] && elev[r] < 0) elev[r] = 0
			}
		}

		// ---- Hydraulic step ----
		if (hydraulicThisIter) {
			// Re-sort if glacial step modified elevations this iteration
			if (glacialThisIter) {
				bucketSortLandDesc()
			}

			// Build drainage graph
			drainTarget.fill(-1)
			for (let i = 0; i < landCount; i++) {
				const r = landCells[i]
				const h = elev[r]
				let bestNb = -1,
					bestDrop = -Infinity,
					bestJ = -1
				for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
					const nb = adjList[j]
					const drop = h - elev[nb]
					if (drop > bestDrop) {
						bestDrop = drop
						bestNb = nb
						bestJ = j
					}
				}
				if (bestDrop <= 0) {
					let minAscent = Infinity
					for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
						const nb = adjList[j]
						const ascent = elev[nb] - h
						if (ascent < minAscent) {
							minAscent = ascent
							bestNb = nb
							bestJ = j
						}
					}
				}
				if (bestNb >= 0) {
					drainTarget[r] = bestNb
					cellDist[r] = neighborDist[bestJ] || 1e-6
				}
			}

			// Flow accumulation
			flow.fill(0)
			for (let i = 0; i < landCount; i++) flow[landCells[i]] = 1
			for (let i = 0; i < landCount; i++) {
				const r = landCells[i]
				const target = drainTarget[r]
				if (target >= 0) flow[target] += flow[r]
			}

			// Implicit stream power + sediment deposition
			for (let i = landCount - 1; i >= 0; i--) {
				const r = landCells[i]
				const target = drainTarget[r]
				if (target < 0 || cellDist[r] <= 0) continue

				const factor = (K * Math.pow(flow[r], m) * dt) / cellDist[r]
				const h_receiver = Math.max(elev[target], 0)
				let h_new = (elev[r] + factor * h_receiver) / (1 + factor)
				if (h_new < h_receiver) h_new = h_receiver
				if (h_new < 0) h_new = 0

				// Sediment deposition
				const eroded = elev[r] - h_new
				if (eroded > 0 && !r_isOcean[target]) {
					const drainOfTarget = drainTarget[target]
					let receiverSlope = 0
					if (drainOfTarget >= 0 && cellDist[target] > 0) {
						receiverSlope =
							Math.abs(elev[target] - elev[drainOfTarget]) / cellDist[target]
					}
					const depositFrac = 0.5 / (1 + receiverSlope * 50)
					const deposit = eroded * depositFrac
					elev[target] += deposit
					if (elev[target] > h_new) elev[target] = h_new
				}

				elev[r] = h_new
			}
		}

		// Thermal step
		if (iter < tIters) {
			delta.fill(0)
			for (let i = 0; i < landCount; i++) {
				const r = landCells[i]
				const h = elev[r]
				let totalExcess = 0
				let excCount = 0

				for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
					const nb = adjList[j]
					if (r_isOcean[nb]) continue
					const nh = elev[nb]
					if (nh >= h) continue
					const d = neighborDist[j] || 1e-6
					const slope = (h - nh) / d
					if (slope > talusSlope) {
						const excess = (slope - talusSlope) * d
						excNb[excCount] = nb
						excVal[excCount] = excess
						excCount++
						totalExcess += excess
					}
				}

				if (totalExcess <= 0) continue
				const transfer = kThermal * totalExcess * 0.5
				for (let k = 0; k < excCount; k++) {
					const share = (excVal[k] / totalExcess) * transfer
					delta[r] -= share
					delta[excNb[k]] += share
				}
			}
			for (let i = 0; i < landCount; i++) {
				elev[landCells[i]] += delta[landCells[i]]
			}
		}
	}

	// Post-loop: light Laplacian smooth on glaciated cells to blend carving edges
	if (glacIdx) {
		const tmp = new Float32Array(elev)
		for (let r = 0; r < N; r++) {
			if (r_isOcean[r] || glacIdx[r] <= 0) continue
			let sum = 0,
				count = 0
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				if (!r_isOcean[adjList[j]]) {
					sum += elev[adjList[j]]
					count++
				}
			}
			if (count > 0) {
				const avg = sum / count
				tmp[r] = elev[r] + (avg - elev[r]) * 0.3
			}
		}
		for (let r = 0; r < N; r++) {
			if (!r_isOcean[r] && glacIdx[r] > 0) elev[r] = tmp[r]
		}
	}
}

// ----------------------------------------------------------------
//  Ridge sharpening (genesis port)
// ----------------------------------------------------------------
export function sharpenRidges({
	mesh,
	elev,
	r_isOcean,
	iterations,
	strength,
}: SharpenRidgesParams): void {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh

	const landCells: number[] = []
	for (let r = 0; r < N; r++) {
		if (!r_isOcean[r]) landCells.push(r)
	}

	const original = new Float32Array(elev)
	diffuseIteration(landCells, elev, N, iterations, (r) => {
		const h = elev[r]
		const count = adjOffset[r + 1] - adjOffset[r]
		if (count === 0) return h
		let sum = 0
		for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
			sum += elev[adjList[i]]
		}
		const avg = sum / count
		if (h > avg) {
			const h_new = h + (h - avg) * strength
			const cap = original[r] * 1.5
			return h_new > cap ? cap : h_new
		}
		return h
	})
}

// ----------------------------------------------------------------
//  Soil creep — Laplacian diffusion (genesis port)
// ----------------------------------------------------------------
export function applySoilCreep({
	mesh,
	elev,
	r_isOcean,
	iterations,
	strength,
}: ApplySoilCreepParams): void {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh

	const interiorLand: number[] = []
	for (let r = 0; r < N; r++) {
		if (r_isOcean[r]) continue
		let coastal = false
		for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
			if (r_isOcean[adjList[i]]) {
				coastal = true
				break
			}
		}
		if (!coastal) interiorLand.push(r)
	}

	diffuseIteration(interiorLand, elev, N, iterations, (r) => {
		const h = elev[r]
		let sum = 0,
			count = 0
		for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
			if (!r_isOcean[adjList[i]]) {
				sum += elev[adjList[i]]
				count++
			}
		}
		if (count === 0) return h
		const avg = sum / count
		return h + (avg - h) * strength
	})
}
