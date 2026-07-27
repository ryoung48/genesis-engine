/**
 * Super plates: groups connected same-type plates into ~20 larger tectonic
 * units that move cohesively, producing broad genesisic belts while preserving
 * fine-grained detail from individual plate interactions.
 * Faithful port of genesis's super-plates.js.
 */
import type { PlateVec, SuperPlateData } from ".."
import type { BuildSuperPlatesParams } from "./types"

export function buildSuperPlates({
	mesh,
	r_plate,
	plateSeeds,
	plateVec,
	plateIsOcean,
	plateDensity,
}: BuildSuperPlatesParams): SuperPlateData {
	const { numRegions, adjOffset, adjList } = mesh
	const numPlates = plateSeeds.length

	// 1. Count regions per plate
	const plateArea = new Map<number, number>()
	for (const pid of plateSeeds) plateArea.set(pid, 0)
	for (let r = 0; r < numRegions; r++) {
		const pid = r_plate[r]
		plateArea.set(pid, (plateArea.get(pid) || 0) + 1)
	}

	// 2. Build plate adjacency graph
	const plateNeighbors = new Map<number, Set<number>>()
	for (const pid of plateSeeds) plateNeighbors.set(pid, new Set())
	for (let r = 0; r < numRegions; r++) {
		const myPlate = r_plate[r]
		for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
			const nbPlate = r_plate[adjList[ni]]
			if (nbPlate !== myPlate) {
				plateNeighbors.get(myPlate)!.add(nbPlate)
			}
		}
	}

	// 3. Connected components of same-type plates (BFS on plate graph)
	const plateVisited = new Set<number>()
	const components: number[][] = []
	for (const pid of plateSeeds) {
		if (plateVisited.has(pid)) continue
		const isOcean = plateIsOcean.has(pid)
		const comp: number[] = []
		const queue = [pid]
		plateVisited.add(pid)
		let head = 0
		while (head < queue.length) {
			const cur = queue[head++]
			comp.push(cur)
			for (const nb of plateNeighbors.get(cur)!) {
				if (!plateVisited.has(nb) && plateIsOcean.has(nb) === isOcean) {
					plateVisited.add(nb)
					queue.push(nb)
				}
			}
		}
		components.push(comp)
	}

	// 4. Split large components to reach target count
	const target = Math.max(2, Math.min(20, Math.round(numPlates / 4)))
	const plateToSuperPlate = new Map<number, number>()
	let nextSuperPlate = 0

	for (const comp of components) {
		const k = Math.max(1, Math.round((target * comp.length) / numPlates))

		if (k <= 1) {
			const spId = nextSuperPlate++
			for (const pid of comp) plateToSuperPlate.set(pid, spId)
		} else {
			// Farthest-point seeding on plate graph with area-weighted distances
			const compSet = new Set(comp)
			const localAdj = new Map<number, number[]>()
			for (const pid of comp) {
				const adj: number[] = []
				for (const nb of plateNeighbors.get(pid)!) {
					if (compSet.has(nb)) adj.push(nb)
				}
				localAdj.set(pid, adj)
			}

			const edgeWeight = new Map<number, number>()
			for (const pid of comp) {
				edgeWeight.set(pid, Math.sqrt(plateArea.get(pid) || 1))
			}

			// Dijkstra from source set
			const dist = new Map<number, number>()
			const dijkstraFrom = (startPids: number[]) => {
				for (const pid of comp) dist.set(pid, Infinity)
				const visited = new Set<number>()
				for (const s of startPids) dist.set(s, 0)
				for (let iter = 0; iter < comp.length; iter++) {
					let cur = -1,
						minD = Infinity
					for (const pid of comp) {
						if (!visited.has(pid) && dist.get(pid)! < minD) {
							minD = dist.get(pid)!
							cur = pid
						}
					}
					if (cur === -1) break
					visited.add(cur)
					for (const nb of localAdj.get(cur)!) {
						const nd = dist.get(cur)! + edgeWeight.get(nb)!
						if (nd < dist.get(nb)!) dist.set(nb, nd)
					}
				}
			}

			// Farthest-point seeding
			const seeds = [comp[0]]
			dijkstraFrom([comp[0]])

			for (let si = 1; si < k; si++) {
				let farthest = comp[0],
					maxDist = -1
				for (const pid of comp) {
					if (dist.get(pid)! > maxDist) {
						maxDist = dist.get(pid)!
						farthest = pid
					}
				}
				seeds.push(farthest)
				dijkstraFrom(seeds)
			}

			// Multi-source Dijkstra assignment
			const assignment = new Map<number, number>()
			const d = new Map<number, number>()
			for (const pid of comp) {
				assignment.set(pid, -1)
				d.set(pid, Infinity)
			}
			const visited = new Set<number>()
			for (let si = 0; si < seeds.length; si++) {
				const spId = nextSuperPlate + si
				assignment.set(seeds[si], spId)
				d.set(seeds[si], 0)
			}
			for (let iter = 0; iter < comp.length; iter++) {
				let cur = -1,
					minD = Infinity
				for (const pid of comp) {
					if (!visited.has(pid) && d.get(pid)! < minD) {
						minD = d.get(pid)!
						cur = pid
					}
				}
				if (cur === -1) break
				visited.add(cur)
				for (const nb of localAdj.get(cur)!) {
					const nd = d.get(cur)! + edgeWeight.get(nb)!
					if (nd < d.get(nb)!) {
						d.set(nb, nd)
						assignment.set(nb, assignment.get(cur)!)
					}
				}
			}

			for (const pid of comp) {
				plateToSuperPlate.set(pid, assignment.get(pid)!)
			}
			nextSuperPlate += seeds.length
		}
	}

	const numSuperPlates = nextSuperPlate

	// 5. Build r_superPlate: region → super plate ID
	const r_superPlate = new Int32Array(numRegions)
	for (let r = 0; r < numRegions; r++) {
		r_superPlate[r] = plateToSuperPlate.get(r_plate[r]) ?? 0
	}

	// 6. Compute super plate Euler poles (area-weighted)
	const spLx = new Float64Array(numSuperPlates)
	const spLy = new Float64Array(numSuperPlates)
	const spLz = new Float64Array(numSuperPlates)
	const spOmegaSum = new Float64Array(numSuperPlates)
	const spAreaSum = new Float64Array(numSuperPlates)
	const spLargestPlate: (null | { pid: number; area: number })[] = new Array(
		numSuperPlates,
	).fill(null)

	for (const pid of plateSeeds) {
		const spId = plateToSuperPlate.get(pid)!
		const pv = plateVec.get(pid)
		if (!pv) continue
		const area = plateArea.get(pid) || 0
		const omega = pv.omega
		const px = pv.pole[0],
			py = pv.pole[1],
			pz = pv.pole[2]

		spLx[spId] += area * omega * px
		spLy[spId] += area * omega * py
		spLz[spId] += area * omega * pz
		spOmegaSum[spId] += area * Math.abs(omega)
		spAreaSum[spId] += area

		if (!spLargestPlate[spId] || area > spLargestPlate[spId]!.area) {
			spLargestPlate[spId] = { pid, area }
		}
	}

	const superPlateVec = new Map<number, PlateVec>()
	for (let sp = 0; sp < numSuperPlates; sp++) {
		const lx = spLx[sp],
			ly = spLy[sp],
			lz = spLz[sp]
		const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz)

		if (lLen < 1e-8 || spAreaSum[sp] < 1) {
			const largest = spLargestPlate[sp]
			if (largest) {
				const pv = plateVec.get(largest.pid)
				if (pv) {
					superPlateVec.set(sp, {
						pole: [...pv.pole] as [number, number, number],
						omega: pv.omega,
					})
					continue
				}
			}
			superPlateVec.set(sp, { pole: [0, 1, 0], omega: 0 })
			continue
		}

		const pole: [number, number, number] = [lx / lLen, ly / lLen, lz / lLen]
		const omega = spOmegaSum[sp] / spAreaSum[sp]
		superPlateVec.set(sp, { pole, omega })
	}

	// 7. Super plate ocean/land type: majority area
	const superPlateIsOcean = new Set<number>()
	const spOceanArea = new Float64Array(numSuperPlates)
	const spTotalArea = new Float64Array(numSuperPlates)
	for (const pid of plateSeeds) {
		const spId = plateToSuperPlate.get(pid)!
		const area = plateArea.get(pid) || 0
		spTotalArea[spId] += area
		if (plateIsOcean.has(pid)) spOceanArea[spId] += area
	}
	for (let sp = 0; sp < numSuperPlates; sp++) {
		if (spOceanArea[sp] > spTotalArea[sp] * 0.5) {
			superPlateIsOcean.add(sp)
		}
	}

	// 8. Super plate density: area-weighted average
	const superPlateDensity = new Map<number, number>()
	const spDensitySum = new Float64Array(numSuperPlates)
	const spDensityArea = new Float64Array(numSuperPlates)
	for (const pid of plateSeeds) {
		const spId = plateToSuperPlate.get(pid)!
		const area = plateArea.get(pid) || 0
		const density = plateDensity.get(pid)
		if (density !== undefined) {
			spDensitySum[spId] += area * density
			spDensityArea[spId] += area
		}
	}
	for (let sp = 0; sp < numSuperPlates; sp++) {
		superPlateDensity.set(
			sp,
			spDensityArea[sp] > 0 ? spDensitySum[sp] / spDensityArea[sp] : 2.7,
		)
	}

	return {
		r_superPlate,
		superPlateVec,
		superPlateIsOcean,
		superPlateDensity,
		numSuperPlates,
	}
}
