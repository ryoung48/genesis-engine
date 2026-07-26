/**
 * Plate generation and ocean/land assignment — faithful port of genesis's
 * plates.js + ocean-land.js.
 *
 * Key source-matching details:
 * - Dual RNG streams: makeRng(seed+0.5) for floats, makeRandInt(seed) for ints
 * - Two-at-a-time fused seed placement
 * - Region-index plate IDs (r_plate[pid] = pid)
 * - Internal smoothAndReconnectPlates call before Euler pole assignment
 * - assignOceanLand creates its own makeRng(seed+42)
 */

import type { PlateVec, SphereMesh } from ".."
import { makeRandInt, makeRng } from "../shared"

interface GeneratePlatesResult {
	r_plate: Int32Array
	plateSeeds: Set<number>
	plateVec: Map<number, PlateVec>
}

/**
 * Generate tectonic plates via farthest-point seeding + round-robin flood fill.
 * Matches source's generatePlates exactly: dual RNG, two-at-a-time seeding,
 * region-index IDs, internal smoothing + Euler pole assignment.
 */
export function generatePlates(
	mesh: SphereMesh,
	numPlates: number,
	seed: number,
): GeneratePlatesResult {
	const { numRegions, r_xyz, adjOffset, adjList } = mesh
	const r_plate = new Int32Array(numRegions).fill(-1)
	const rng = makeRng(seed + 0.5)
	const randInt = makeRandInt(seed)

	// Farthest-point seed distribution with top-3 jitter
	const plateSeeds = new Set<number>()
	const isSeed = new Uint8Array(numRegions)
	const minDistToSeed = new Float32Array(numRegions).fill(Infinity)

	const firstSeed = randInt(numRegions)
	plateSeeds.add(firstSeed)
	isSeed[firstSeed] = 1
	const fsx = r_xyz[3 * firstSeed],
		fsy = r_xyz[3 * firstSeed + 1],
		fsz = r_xyz[3 * firstSeed + 2]
	for (let r = 0; r < numRegions; r++) {
		minDistToSeed[r] =
			1 - (r_xyz[3 * r] * fsx + r_xyz[3 * r + 1] * fsy + r_xyz[3 * r + 2] * fsz)
	}
	minDistToSeed[firstSeed] = 0

	while (plateSeeds.size < numPlates && plateSeeds.size < numRegions) {
		// Find top-3 farthest regions
		let t0r = -1,
			t0d = -1,
			t1r = -1,
			t1d = -1,
			t2r = -1,
			t2d = -1
		for (let r = 0; r < numRegions; r++) {
			if (isSeed[r]) continue
			const d = minDistToSeed[r]
			if (d > t2d) {
				if (d > t0d) {
					t2r = t1r
					t2d = t1d
					t1r = t0r
					t1d = t0d
					t0r = r
					t0d = d
				} else if (d > t1d) {
					t2r = t1r
					t2d = t1d
					t1r = r
					t1d = d
				} else {
					t2r = r
					t2d = d
				}
			}
		}
		const validCount =
			(t0r !== -1 ? 1 : 0) + (t1r !== -1 ? 1 : 0) + (t2r !== -1 ? 1 : 0)
		if (!validCount) break
		const pick = randInt(validCount)
		const newSeed = pick === 0 ? t0r : pick === 1 ? t1r : t2r
		plateSeeds.add(newSeed)
		isSeed[newSeed] = 1
		const nsx = r_xyz[3 * newSeed],
			nsy = r_xyz[3 * newSeed + 1],
			nsz = r_xyz[3 * newSeed + 2]

		// Fused pass: update minDistToSeed AND find next top-3
		if (plateSeeds.size < numPlates) {
			t0r = -1
			t0d = -1
			t1r = -1
			t1d = -1
			t2r = -1
			t2d = -1
			for (let r = 0; r < numRegions; r++) {
				const d =
					1 -
					(r_xyz[3 * r] * nsx + r_xyz[3 * r + 1] * nsy + r_xyz[3 * r + 2] * nsz)
				if (d < minDistToSeed[r]) minDistToSeed[r] = d
				if (isSeed[r]) continue
				const md = minDistToSeed[r]
				if (md > t2d) {
					if (md > t0d) {
						t2r = t1r
						t2d = t1d
						t1r = t0r
						t1d = t0d
						t0r = r
						t0d = md
					} else if (md > t1d) {
						t2r = t1r
						t2d = t1d
						t1r = r
						t1d = md
					} else {
						t2r = r
						t2d = md
					}
				}
			}
			const validCount2 =
				(t0r !== -1 ? 1 : 0) + (t1r !== -1 ? 1 : 0) + (t2r !== -1 ? 1 : 0)
			if (!validCount2) break
			const pick2 = randInt(validCount2)
			const newSeed2 = pick2 === 0 ? t0r : pick2 === 1 ? t1r : t2r
			plateSeeds.add(newSeed2)
			isSeed[newSeed2] = 1
			const ns2x = r_xyz[3 * newSeed2],
				ns2y = r_xyz[3 * newSeed2 + 1],
				ns2z = r_xyz[3 * newSeed2 + 2]
			for (let r = 0; r < numRegions; r++) {
				const d =
					1 -
					(r_xyz[3 * r] * ns2x +
						r_xyz[3 * r + 1] * ns2y +
						r_xyz[3 * r + 2] * ns2z)
				if (d < minDistToSeed[r]) minDistToSeed[r] = d
			}
		} else {
			// Last seed — just update distances
			for (let r = 0; r < numRegions; r++) {
				const d =
					1 -
					(r_xyz[3 * r] * nsx + r_xyz[3 * r + 1] * nsy + r_xyz[3 * r + 2] * nsz)
				if (d < minDistToSeed[r]) minDistToSeed[r] = d
			}
		}
	}

	// Interpolation factor: more cragginess at low plate counts
	const lowPlateT = Math.max(0, Math.min(1, (80 - numPlates) / 60))

	// Per-plate growth properties
	const plateGrowthRate: Record<number, number> = {}
	const plateGrowthDir: Record<number, [number, number, number]> = {}
	const plateDirStrength: Record<number, number> = {}

	const rateMin = 0.7 - 0.4 * lowPlateT
	const rateRange = 2.3 + 2.4 * lowPlateT
	const dirBase = 0.15 + 0.25 * lowPlateT
	const dirScale = 0.25 + 0.25 * lowPlateT

	for (const center of plateSeeds) {
		plateGrowthRate[center] = rateMin + rng() * rng() * rateRange

		const px = r_xyz[3 * center],
			py = r_xyz[3 * center + 1],
			pz = r_xyz[3 * center + 2]
		const pLen = Math.sqrt(px * px + py * py + pz * pz) || 1
		const nx = px / pLen,
			ny = py / pLen,
			nz = pz / pLen
		const rx = rng() - 0.5,
			ry = rng() - 0.5,
			rz = rng() - 0.5
		const d = rx * nx + ry * ny + rz * nz
		const tx = rx - d * nx,
			ty = ry - d * ny,
			tz = rz - d * nz
		const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1
		plateGrowthDir[center] = [tx / tLen, ty / tLen, tz / tLen]

		plateDirStrength[center] = Math.min(
			0.85,
			rng() * (dirBase + dirScale / plateGrowthRate[center]),
		)
	}

	// Per-plate frontiers — round-robin ensures every plate advances
	const plateIds = Array.from(plateSeeds)
	const frontiers = new Map<number, number[]>()
	const plateAreaCount: Record<number, number> = {}
	for (const pid of plateIds) {
		r_plate[pid] = pid
		frontiers.set(pid, [pid])
		plateAreaCount[pid] = 1
	}

	let remaining = numRegions - plateIds.length
	const COMPACT_WEIGHT = 0.3 - 0.22 * lowPlateT
	const expectedArea = Math.max(1, (numRegions - plateIds.length) / numPlates)
	const areaGovernorMult = 2.0 + 2.0 * lowPlateT
	const invNumRegions = 1 / numRegions

	while (remaining > 0) {
		let anyProgress = false
		for (const pid of plateIds) {
			const frontier = frontiers.get(pid)!
			if (frontier.length === 0) continue

			const rate = plateGrowthRate[pid]
			const dir = plateGrowthDir[pid]
			const d0 = dir[0],
				d1 = dir[1],
				d2 = dir[2]
			const dirStr = plateDirStrength[pid]
			const dirStrHalf = dirStr * 0.5
			let steps = Math.max(1, Math.ceil(rate * (0.5 + rng())))

			// Governor: halve steps for plates exceeding threshold
			if (plateAreaCount[pid] > expectedArea * areaGovernorMult) {
				steps = Math.max(1, Math.ceil(steps * 0.5))
			}

			// Compactness: expected chord distance for a circular plate of current area
			const expectedChordDist =
				Math.sqrt(((plateAreaCount[pid] || 1) * invNumRegions) / Math.PI) * 2
			const compactThreshold = expectedChordDist * 1.8

			// Precompute seed coordinates
			const sx = r_xyz[3 * pid],
				sy = r_xyz[3 * pid + 1],
				sz = r_xyz[3 * pid + 2]

			for (let s = 0; s < steps && frontier.length > 0; s++) {
				let bestIdx = 0,
					bestScore = -Infinity
				const samples = Math.min(frontier.length, 3 + Math.floor(dirStr * 5))
				for (let i = 0; i < samples; i++) {
					const idx = randInt(frontier.length)
					const cell = frontier[idx]
					const ci = 3 * cell
					const dx = r_xyz[ci] - sx,
						dy = r_xyz[ci + 1] - sy,
						dz = r_xyz[ci + 2] - sz
					const dLenSq = dx * dx + dy * dy + dz * dz
					const dLen = Math.sqrt(dLenSq) || 1
					const alignment = (dx * d0 + dy * d1 + dz * d2) / dLen

					const excess = Math.max(0, dLenSq * 0.5 - compactThreshold)
					const compactPenalty = excess * (COMPACT_WEIGHT * 4)

					const score =
						alignment * dirStr + rng() * (1 - dirStrHalf) - compactPenalty
					if (score > bestScore) {
						bestScore = score
						bestIdx = idx
					}
				}

				const current = frontier[bestIdx]
				frontier[bestIdx] = frontier[frontier.length - 1]
				frontier.pop()

				for (
					let j = adjOffset[current], jEnd = adjOffset[current + 1];
					j < jEnd;
					j++
				) {
					const nb = adjList[j]
					if (r_plate[nb] === -1) {
						r_plate[nb] = pid
						frontier.push(nb)
						plateAreaCount[pid]++
						remaining--
						anyProgress = true
					}
				}
			}
		}
		if (!anyProgress) break
	}

	// Cleanup: assign orphaned regions to nearest claimed neighbor
	let orphans = true
	while (orphans) {
		orphans = false
		for (let r = 0; r < numRegions; r++) {
			if (r_plate[r] === -1) {
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (r_plate[nb] !== -1) {
						r_plate[r] = r_plate[nb]
						orphans = true
						break
					}
				}
			}
		}
	}

	smoothAndReconnectPlates(
		mesh,
		r_plate,
		plateIds,
		Math.round(3 - 2 * lowPlateT),
	)

	// Assign an Euler pole + angular velocity per plate
	const plateVec = new Map<number, PlateVec>()
	for (const center of plateSeeds) {
		const theta = rng() * 2 * Math.PI
		const cosP = 2 * rng() - 1
		const sinP = Math.sqrt(1 - cosP * cosP)
		const pole: [number, number, number] = [
			sinP * Math.cos(theta),
			sinP * Math.sin(theta),
			cosP,
		]
		const omega = (0.5 + rng() * 1.5) * (rng() < 0.5 ? -1 : 1)
		plateVec.set(center, { pole, omega })
	}

	return { r_plate, plateSeeds, plateVec }
}

/**
 * Assign ocean/land via farthest-point continent seeding with round-robin
 * growth, separation guarantees, and trapped sea absorption.
 * Creates its own RNG from makeRng(seed + 42) matching source ocean-land.js.
 */
export function assignOceanLand(
	mesh: SphereMesh,
	r_plate: Int32Array,
	plateSeeds: Set<number>,
	seed: number,
	landDistribution: number,
	continentSizeVariety: number = 0,
	landCoverage: number = 0.3,
): Set<number> {
	const rng = makeRng(seed + 42)
	const { numRegions, r_xyz, adjOffset, adjList } = mesh
	const plateIds = Array.from(plateSeeds)
	const numPlates = plateIds.length

	// 1. Plate areas and centroids
	const plateArea: Record<number, number> = {}
	const plateCentroid: Record<number, [number, number, number]> = {}
	for (const pid of plateIds) {
		plateArea[pid] = 0
		plateCentroid[pid] = [0, 0, 0]
	}
	for (let r = 0; r < numRegions; r++) {
		const p = r_plate[r]
		if (!plateCentroid[p]) {
			plateArea[p] = 0
			plateCentroid[p] = [0, 0, 0]
		}
		plateArea[p]++
		plateCentroid[p][0] += r_xyz[3 * r]
		plateCentroid[p][1] += r_xyz[3 * r + 1]
		plateCentroid[p][2] += r_xyz[3 * r + 2]
	}
	for (const pid of plateIds) {
		const a = plateArea[pid] || 1
		plateCentroid[pid][0] /= a
		plateCentroid[pid][1] /= a
		plateCentroid[pid][2] /= a
	}

	// 2. Plate adjacency graph + perimeter + compactness
	const plateAdj: Record<number, Set<number>> = {}
	const platePerim: Record<number, number> = {}
	for (const pid of plateIds) {
		plateAdj[pid] = new Set()
		platePerim[pid] = 0
	}
	for (let r = 0; r < numRegions; r++) {
		const myPlate = r_plate[r]
		let isBoundary = false
		for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
			const nbPlate = r_plate[adjList[ni]]
			if (myPlate !== nbPlate) {
				if (plateAdj[myPlate]) plateAdj[myPlate].add(nbPlate)
				isBoundary = true
			}
		}
		if (isBoundary && platePerim[myPlate] !== undefined) platePerim[myPlate]++
	}

	const plateCompact: Record<number, number> = {}
	let maxCompact = 0
	for (const pid of plateIds) {
		const c = Math.sqrt(plateArea[pid] || 1) / (platePerim[pid] || 1)
		plateCompact[pid] = c
		if (c > maxCompact) maxCompact = c
	}
	if (maxCompact > 0) {
		for (const pid of plateIds) plateCompact[pid] /= maxCompact
	}

	const sparseIsLand = landCoverage <= 0.5
	const targetSparseArea =
		(sparseIsLand ? landCoverage : 1 - landCoverage) * numRegions
	if (targetSparseArea <= 0) {
		const plateIsOcean = new Set<number>()
		if (landCoverage <= 0) {
			for (const pid of plateIds) plateIsOcean.add(pid)
		}
		return plateIsOcean
	}
	const sparseCoverage = Math.min(landCoverage, 1 - landCoverage)
	const maxSeedCount = Math.max(
		1,
		Math.min(
			numPlates,
			Math.round(1 + Math.sqrt(numPlates) * (0.6 + sparseCoverage * 1.6)),
		),
	)
	const targetSeedCount = Math.max(
		1,
		Math.min(
			maxSeedCount,
			Math.round(1 + landDistribution * (maxSeedCount - 1)),
		),
	)

	// 3. Pick sparse-phase seeds via farthest-point sampling
	const sparseSeeds: number[] = []
	const chosen = new Set<number>()

	const first = plateIds[Math.floor(rng() * numPlates)]
	sparseSeeds.push(first)
	chosen.add(first)

	for (let s = 1; s < targetSeedCount; s++) {
		const candidates: { pid: number; score: number }[] = []
		for (const pid of plateIds) {
			if (chosen.has(pid)) continue
			const cx = plateCentroid[pid]
			let minDist = Infinity
			for (const existing of sparseSeeds) {
				const ex = plateCentroid[existing]
				const dx = cx[0] - ex[0],
					dy = cx[1] - ex[1],
					dz = cx[2] - ex[2]
				const d = dx * dx + dy * dy + dz * dz
				if (d < minDist) minDist = d
			}
			const rawAreaFactor =
				Math.sqrt(numRegions / numPlates) / Math.sqrt(plateArea[pid] || 1)
			const areaFactor =
				1 + (rawAreaFactor - 1) * (1 - continentSizeVariety * 0.5)
			const compact = 0.3 + 0.7 * plateCompact[pid]
			const spreadWeight = 0.35 + landDistribution * 1.15
			candidates.push({
				pid,
				score: minDist * spreadWeight * areaFactor * compact,
			})
		}
		if (candidates.length === 0) break
		candidates.sort((a, b) => b.score - a.score)
		const topK = Math.min(candidates.length, 3)
		const pick = candidates[Math.floor(rng() * topK)]
		sparseSeeds.push(pick.pid)
		chosen.add(pick.pid)
	}

	// Trim seeds if they exceed the sparse-phase budget
	let seedArea = 0
	for (const pid of sparseSeeds) seedArea += plateArea[pid]
	while (sparseSeeds.length > 1 && seedArea > targetSparseArea) {
		let maxIdx = 0
		for (let i = 1; i < sparseSeeds.length; i++) {
			if (plateArea[sparseSeeds[i]] > plateArea[sparseSeeds[maxIdx]]) maxIdx = i
		}
		seedArea -= plateArea[sparseSeeds[maxIdx]]
		chosen.delete(sparseSeeds[maxIdx])
		sparseSeeds.splice(maxIdx, 1)
	}

	// 4. Initialize sparse-phase assignment
	const plateCluster: Record<number, number | undefined> = {}
	for (let c = 0; c < sparseSeeds.length; c++) {
		plateCluster[sparseSeeds[c]] = c
	}
	let sparseArea = seedArea

	// 5. Round-robin growth with per-cluster targets
	const growTarget = targetSparseArea
	const numC = sparseSeeds.length
	const clusterTarget = new Float64Array(numC)
	const clusterArea = new Float64Array(numC)
	for (let c = 0; c < numC; c++) {
		clusterArea[c] = plateArea[sparseSeeds[c]]
	}

	if (continentSizeVariety > 0 && numC > 1) {
		const weights: number[] = []
		for (let c = 0; c < numC; c++) {
			const logWeight = (rng() - 0.5) * continentSizeVariety * 2.5
			weights.push(Math.exp(logWeight))
		}
		const totalWeight = weights.reduce((a, b) => a + b, 0)
		for (let c = 0; c < numC; c++) {
			clusterTarget[c] = (growTarget * weights[c]) / totalWeight
		}
	} else {
		const equal = growTarget / Math.max(numC, 1)
		for (let c = 0; c < numC; c++) clusterTarget[c] = equal
	}

	let progress = true
	while (progress && sparseArea < growTarget) {
		progress = false
		for (let c = 0; c < numC && sparseArea < growTarget; c++) {
			if (clusterArea[c] >= clusterTarget[c]) continue

			const candidates: { pid: number; score: number }[] = []
			for (const pid of plateIds) {
				if (plateCluster[pid] !== undefined) continue
				let touchesSelf = false,
					touchesOther = false
				let sameCount = 0
				for (const adj of plateAdj[pid] || []) {
					const ac = plateCluster[adj]
					if (ac === c) {
						touchesSelf = true
						sameCount++
					} else if (ac !== undefined) {
						touchesOther = true
						break
					}
				}
				if (touchesSelf && !touchesOther) {
					const areaBias = 1 / Math.sqrt(Math.max(1, plateArea[pid]))
					const compactBias =
						landDistribution < 0.5
							? plateCompact[pid] * (1.8 - landDistribution * 1.6)
							: (1 - plateCompact[pid]) * ((landDistribution - 0.5) * 1.6)
					candidates.push({
						pid,
						score: sameCount + compactBias + areaBias + rng() * 0.5,
					})
				}
			}
			if (candidates.length === 0) continue

			candidates.sort((a, b) => b.score - a.score)
			const topK = Math.min(candidates.length, 3)
			const pick = candidates[Math.floor(rng() * topK)]

			plateCluster[pick.pid] = c
			clusterArea[c] += plateArea[pick.pid]
			sparseArea += plateArea[pick.pid]
			progress = true
		}
	}

	// 6. Light cleanup for land-sparse worlds: absorb enclosed inland seas into land.
	if (sparseIsLand) {
		const oceanComponents: number[][] = []
		const visited = new Set<number>()
		for (const pid of plateIds) {
			if (plateCluster[pid] !== undefined || visited.has(pid)) continue
			const component = [pid]
			visited.add(pid)
			for (let qi = 0; qi < component.length; qi++) {
				for (const adj of plateAdj[component[qi]] || []) {
					if (plateCluster[adj] === undefined && !visited.has(adj)) {
						visited.add(adj)
						component.push(adj)
					}
				}
			}
			oceanComponents.push(component)
		}

		let mainIdx = 0
		for (let i = 1; i < oceanComponents.length; i++) {
			let areaI = 0,
				areaM = 0
			for (const p of oceanComponents[i]) areaI += plateArea[p]
			for (const p of oceanComponents[mainIdx]) areaM += plateArea[p]
			if (areaI > areaM) mainIdx = i
		}

		for (let i = 0; i < oceanComponents.length; i++) {
			if (i === mainIdx) continue
			const component = oceanComponents[i]
			const bordering = new Set<number>()
			for (const op of component) {
				for (const adj of plateAdj[op] || []) {
					if (plateCluster[adj] !== undefined) bordering.add(plateCluster[adj]!)
				}
				if (bordering.size > 1) break
			}
			if (bordering.size === 1) {
				const c = bordering.values().next().value!
				for (const op of component) plateCluster[op] = c
			}
		}
	}

	// 7. Build plateIsOcean set from the sparse-phase assignment.
	const plateIsOcean = new Set<number>()
	for (const pid of plateIds) {
		const inSparsePhase = plateCluster[pid] !== undefined
		const isOcean = sparseIsLand ? !inSparsePhase : inSparsePhase
		if (isOcean) plateIsOcean.add(pid)
	}
	return plateIsOcean
}

/**
 * Smooth plate boundaries via majority-vote and reconnect disconnected fragments.
 * Faithful port of genesis's smoothAndReconnectPlates.
 */
export function smoothAndReconnectPlates(
	mesh: SphereMesh,
	r_plate: Int32Array,
	plateSeeds: number[],
	numPasses: number,
): void {
	const { numRegions, adjOffset, adjList } = mesh

	// Build seed lookup for protection during smoothing.
	// Protects plate seed regions from being reassigned by majority-vote.
	// After coarse→hi-res projection the seed IDs are coarse-mesh indices
	// that won't satisfy r_plate[pid] === pid on the hi-res mesh, so the
	// protection is effectively skipped — this is intentional.
	const isSeed = new Uint8Array(numRegions)
	for (const pid of plateSeeds) {
		if (pid < numRegions && r_plate[pid] === pid) isSeed[pid] = 1
	}

	// Find max degree for working arrays
	let maxDeg = 0
	for (let r = 0; r < numRegions; r++) {
		const deg = adjOffset[r + 1] - adjOffset[r]
		if (deg > maxDeg) maxDeg = deg
	}
	const cntPlates = new Int32Array(maxDeg)
	const cntValues = new Uint8Array(maxDeg)

	// Majority-vote smoothing
	for (let pass = 0; pass < numPasses; pass++) {
		const threshold = pass === 0 ? 0.4 : 0.5
		for (let r = 0; r < numRegions; r++) {
			const rStart = adjOffset[r],
				rEnd = adjOffset[r + 1]
			const deg = rEnd - rStart
			let nDistinct = 0
			for (let j = rStart; j < rEnd; j++) {
				const p = r_plate[adjList[j]]
				let found = false
				for (let k = 0; k < nDistinct; k++) {
					if (cntPlates[k] === p) {
						cntValues[k]++
						found = true
						break
					}
				}
				if (!found) {
					cntPlates[nDistinct] = p
					cntValues[nDistinct] = 1
					nDistinct++
				}
			}
			let bestPlate = r_plate[r],
				bestCount = 0
			for (let k = 0; k < nDistinct; k++) {
				if (cntValues[k] > bestCount) {
					bestCount = cntValues[k]
					bestPlate = cntPlates[k]
				}
			}
			if (bestCount > deg * threshold && !isSeed[r]) {
				r_plate[r] = bestPlate
			}
		}
	}

	// Reconnect: keep largest connected component per plate, reassign orphans
	{
		const visited = new Uint8Array(numRegions)
		const bestComponent = new Map<number, number[]>()

		for (let r = 0; r < numRegions; r++) {
			if (visited[r]) continue
			const pid = r_plate[r]
			const bfs = [r]
			visited[r] = 1
			for (let qi = 0; qi < bfs.length; qi++) {
				for (
					let ni = adjOffset[bfs[qi]], niEnd = adjOffset[bfs[qi] + 1];
					ni < niEnd;
					ni++
				) {
					const nb = adjList[ni]
					if (!visited[nb] && r_plate[nb] === pid) {
						visited[nb] = 1
						bfs.push(nb)
					}
				}
			}
			const existing = bestComponent.get(pid)
			if (!existing || bfs.length > existing.length) {
				bestComponent.set(pid, bfs)
			}
		}

		// Mark regions in largest component per plate
		const inMain = new Uint8Array(numRegions)
		for (const comp of bestComponent.values()) {
			for (const r of comp) inMain[r] = 1
		}

		// Reassign orphans via BFS from main-component boundary
		const queue: number[] = []
		for (let r = 0; r < numRegions; r++) {
			if (!inMain[r]) {
				for (
					let ni = adjOffset[r], niEnd = adjOffset[r + 1];
					ni < niEnd;
					ni++
				) {
					if (inMain[adjList[ni]]) {
						r_plate[r] = r_plate[adjList[ni]]
						inMain[r] = 1
						queue.push(r)
						break
					}
				}
			}
		}
		for (let qi = 0; qi < queue.length; qi++) {
			const r = queue[qi]
			for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
				const nb = adjList[ni]
				if (!inMain[nb]) {
					r_plate[nb] = r_plate[r]
					inMain[nb] = 1
					queue.push(nb)
				}
			}
		}
	}
}
