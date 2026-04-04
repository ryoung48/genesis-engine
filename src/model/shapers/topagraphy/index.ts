import { WORLD } from "../.."
import { CELL } from "../../cells"
import { Cell } from "../../cells/types"
import { RegionAddBordersParams, RegionBorders } from "./types"

const regions: Cell[] = []
const boundaries: Record<number, number> = {}
const coasts: Record<number, number> = {}

const addBorder = ({ borders, r1, r2, c1, c2 }: RegionAddBordersParams) => {
	if (!borders[r1][r2]) borders[r1][r2] = new Set()
	borders[r1][r2].add(c2)
	if (!borders[r2][r1]) borders[r2][r1] = new Set()
	borders[r2][r1].add(c1)
}

// ── Random-Walk Mountain Chains ───────────────────────────────────────
//
// Approach: scatter seeds across land, then grow each seed into a
// wandering chain that branches occasionally. This produces organic
// linear ranges without any noise or simulation. We keep spawning
// chains until we hit a target mountain fraction of land.

let chainCounter = 0

const walkChain = (start: Cell, length: number) => {
	const chainId = chainCounter++
	const peak = 2.0
	let placed = 0

	const nearForeignChain = (cell: Cell) =>
		CELL.neighbors(cell, 2).some(
			(n) => n.isMountains && n.chain !== undefined && n.chain !== chainId,
		)

	const stamp = (cell: Cell, h: number) => {
		if (cell.isWater) return false
		cell.elevation = h
		cell.isMountains = true
		cell.chain = chainId
		placed++
		return true
	}

	// walk a chain of fixed length from the start cell
	if (!stamp(start, peak)) return 0
	let curr = start
	for (let step = 0; step < length; step++) {
		const candidates = window.dice
			.shuffle(CELL.neighbors(curr))
			.filter(
				(c) =>
					!c.isWater &&
					!c.isCoast &&
					!c.isMountains &&
					!nearForeignChain(c) &&
					!CELL.neighbors(c).some((n) => n.isWater),
			)
		if (candidates.length === 0) break
		const next = candidates[0]
		stamp(next, peak - window.dice.uniform(0, 0.3))
		// occasionally branch sideways to thicken the range
		if (window.dice.random < 0.4 && candidates.length > 1) {
			stamp(candidates[1], peak - window.dice.uniform(0.2, 0.6))
		}
		curr = next
	}

	return placed
}

const scatterMountains = () => {
	chainCounter = 0
	const land = WORLD.cells.land()
	const target = Math.floor(land.length * 0.1)
	let total = 0

	const seeds: Cell[] = []

	const spacing = 1

	const tryPlace = (cell: Cell): boolean => {
		if (cell.isMountains) return false
		const tooClose = seeds.some((s) => CELL.distance(cell, s) < spacing)
		if (tooClose) return false
		seeds.push(cell)
		return true
	}

	// guarantee minimum mountain clusters per landmark:
	//   continents: at least 3, islands: at least 1
	const seen = new Set<number>()
	const landmarkCounts: Record<number, number> = {}

	for (const [idStr, lm] of Object.entries(window.world.landmarks)) {
		const id = parseInt(idStr)
		if (lm.water) continue
		if (lm.type !== "continent" && lm.type !== "island") continue
		const minClusters = lm.type === "continent" ? 3 : 1
		const cells = window.dice.shuffle(
			land.filter(
				(c) =>
					c.landmark === id && !c.isCoast && !c.isWater && c.oceanDist >= 2,
			),
		)
		// fallback to any non-water cell on this landmark
		const fallback =
			cells.length > 0
				? cells
				: window.dice.shuffle(
						land.filter((c) => c.landmark === id && !c.isWater),
					)

		const minChainSize = lm.type === "continent" ? 30 : 4
		landmarkCounts[id] = 0
		for (const cell of fallback) {
			if (landmarkCounts[id] >= minClusters) break
			if (!tryPlace(cell)) continue
			const chainLen = window.dice.randint(6, 14) * 3
			let placed = walkChain(cell, chainLen)
			// if chain terminated too short on a continent, retry from nearby cells
			if (placed < minChainSize) {
				const nearby = window.dice.shuffle(
					CELL.neighbors(cell, 3).filter(
						(c) => !c.isWater && !c.isCoast && !c.isMountains,
					),
				)
				for (const alt of nearby) {
					if (placed >= minChainSize) break
					placed += walkChain(alt, minChainSize - placed)
				}
			}
			total += placed
			landmarkCounts[id]++
			seen.add(id)
		}
	}

	// fill remaining budget with random inland seeds
	const minOceanDist = Math.max(2, Math.round(160 / window.world.cell.length))
	const eligible = window.dice.shuffle(
		land.filter((c) => !c.isCoast && !c.isWater && c.oceanDist >= minOceanDist),
	)
	for (const cell of eligible) {
		if (total >= target) break
		if (!tryPlace(cell)) continue
		const chainLen = window.dice.randint(6, 14)
		total += walkChain(cell, chainLen)
	}

	// coastal-arc seeds (1-2, for variety)
	const coastNear = window.dice.shuffle(
		land.filter(
			(c) => !c.isCoast && !c.isWater && c.oceanDist >= 2 && c.oceanDist <= 5,
		),
	)
	const coastalTarget = Math.floor(target * 0.1)
	for (const cell of coastNear) {
		if (total >= target + coastalTarget) break
		if (!tryPlace(cell)) continue
		const chainLen = window.dice.randint(4, 8)
		total += walkChain(cell, chainLen)
	}

	return total
}

// ── Range Classification ──────────────────────────────────────────────

const classifyRanges = () => {
	let idx = window.world.mountains.length
	let mountains = WORLD.cells.land().filter((p) => p.isMountains)

	while (mountains.length > 0) {
		let queue = [mountains[0].idx]
		window.world.mountains.push({ size: 0, cell: mountains[0].idx })
		while (queue.length > 0) {
			const current = window.world.cells[queue.shift()!]
			current.mountain = idx
			window.world.mountains[idx].size += 1
			queue = queue.concat(
				CELL.neighbors(current)
					.filter(
						(p) =>
							p.isMountains &&
							p.mountain === undefined &&
							!queue.includes(p.idx),
					)
					.map((p) => p.idx),
			)
		}
		mountains = mountains.filter((poly) => poly.mountain === undefined)
		idx += 1
	}

	const tallCount = Math.max(1, Math.floor(window.world.landFraction / 0.22))
	const sortedRanges = window.world.mountains
		.map((m, i) => ({ size: m.size, idx: i }))
		.sort((a, b) => b.size - a.size)
	const nonTall = sortedRanges.slice(tallCount)
	const mediumCount = Math.max(1, Math.ceil(nonTall.length * 0.35))
	const allMountainCells = WORLD.cells.land().filter((c) => c.isMountains)
	const rangePeaks: Record<number, number> = {}

	sortedRanges.forEach((range, rank) => {
		const cells = allMountainCells.filter((c) => c.mountain === range.idx)
		if (cells.length === 0) return
		const maxH = Math.max(...cells.map((c) => c.elevation))
		let peak: number
		if (rank < tallCount) {
			peak = window.dice.uniform(3.8, 4.8)
		} else if (rank < tallCount + mediumCount) {
			peak = window.dice.uniform(1.8, 3.5)
		} else {
			peak = window.dice.uniform(0.8, 2)
		}
		rangePeaks[range.idx] = peak
		const scale = peak / maxH
		cells.forEach((c) => {
			c.elevation = c.elevation * scale
			c.isMountains = c.elevation > WORLD.elevation.mountains
		})
	})

	return rangePeaks
}

// ── Plateaus ──────────────────────────────────────────────────────────

const growPlateaus = (rangePeaks: Record<number, number>) => {
	const plateaus: Record<number, number> = {}
	const land = WORLD.cells.land()
	const target = Math.floor(land.length * 0.05)
	let placed = 0

	// seeds: non-mountain, non-coast land within 2 hops of mountains
	const seeds = window.dice.shuffle(
		land.filter((c) => {
			if (c.isMountains || c.isCoast || c.isWater) return false
			const ring1 = CELL.neighbors(c)
			if (ring1.some((n) => n.isMountains)) return true
			return ring1.some((n) => CELL.neighbors(n).some((m) => m.isMountains))
		}),
	)

	// grow plateau blobs from seeds via BFS until we hit 5%
	const used = new Set<number>()
	for (const seed of seeds) {
		if (placed >= target) break
		if (used.has(seed.idx)) continue

		// determine elevation from nearby range
		const nearbyPeaks = CELL.neighbors(seed)
			.filter((n) => n.isMountains)
			.map((n) => rangePeaks[n.mountain] || 0)
		const maxPeak = Math.max(0, ...nearbyPeaks)
		const h =
			maxPeak > 3 ? window.dice.uniform(1.5, 3) : window.dice.uniform(0.5, 1.5)

		// floodfill a cluster from this seed
		const maxSize = window.dice.randint(3, 12)
		const queue = [seed]
		used.add(seed.idx)
		let clusterSize = 0

		while (queue.length > 0 && clusterSize < maxSize && placed < target) {
			const curr = queue.shift()!
			curr.plateau = true
			plateaus[curr.idx] = h
			clusterSize++
			placed++

			// expand to random eligible neighbors
			const neighbors = window.dice
				.shuffle(CELL.neighbors(curr))
				.filter(
					(n) => !used.has(n.idx) && !n.isMountains && !n.isCoast && !n.isWater,
				)
			for (const n of neighbors) {
				if (clusterSize + queue.length >= maxSize) break
				used.add(n.idx)
				queue.push(n)
			}
		}
	}

	return plateaus
}

// ── Mountain Distance BFS ─────────────────────────────────────────────

const computeHighlandDist = () => {
	// reset all land cells
	WORLD.cells.land().forEach((c) => {
		c.highlandDist = -1
	})
	// seed from mountains, hills, and plateaus
	const queue = WORLD.cells
		.land()
		.filter((p) => p.isMountains || p.plateau || p.topography === "hills")
	queue.forEach((c) => {
		c.highlandDist = 0
	})
	while (queue.length > 0) {
		const curr = queue.shift()!
		CELL.neighbors(curr)
			.filter((n) => n.highlandDist === -1 && !n.ocean)
			.forEach((n) => {
				n.highlandDist = curr.highlandDist + 1
				queue.push(n)
			})
	}
}

// ── Non-Mountain Elevation ────────────────────────────────────────────

// ── Exported Module ───────────────────────────────────────────────────

export const SHAPER_MOUNTAINS = {
	boundaries,
	_centers: () => {
		const land = WORLD.cells.land()
		land.forEach((poly) => {
			poly.score = (1 - poly.elevation) * 5 + (poly.beach ? 1 : 0)
		})

		const totalArea = land.length * window.world.cell.area
		const size = 335.5e3 * (window.world.cell.length / 126) * 4
		const count = totalArea / size
		const spacing = WORLD.placement.autoSpacing(
			count,
			land.length * window.world.cell.area,
		)
		const capitals = WORLD.placement
			.run({
				count,
				spacing,
				whitelist: WORLD.cells.land().sort((a, b) => b.score - a.score),
			})
			.filter((poly) => window.world.landmarks[poly.landmark])
		capitals.forEach((poly) => {
			regions.push(poly)
		})
	},
	_mountains: () => {
		// clear boundaries, then populate with landmark ids
		Object.keys(boundaries).forEach((k) => delete boundaries[parseInt(k)])
		window.world.cells.forEach((c) => {
			boundaries[c.idx] = c.landmark || 0
		})

		// scatter random-walk mountain chains across land
		scatterMountains()

		// classify connected ranges and rescale heights
		const rangePeaks = classifyRanges()

		// place plateaus near mountain ranges
		growPlateaus(rangePeaks)

		// initial highland distance (mountains + plateaus only, hills added later in _topography)
		computeHighlandDist()
	},
	_spheres: (
		mountainProspects: RegionBorders,
		regionBorders: RegionBorders,
	) => {
		regions.forEach((_, i) => {
			mountainProspects[i] = {}
			regionBorders[i] = {}
		})
		const queue = regions.map((cell, i) => ({ cell, idx: i }))
		queue.forEach(({ cell, idx }) => {
			boundaries[cell.idx] = idx
		})
		while (queue.length > 0) {
			const { cell, idx } = queue.shift()!
			let power = 0.75
			if (cell.shallow || cell.isMountains) {
				power /= 30
			}
			if (window.dice.random > power) {
				queue.push({ cell, idx })
				continue
			}
			CELL.neighbors(cell).forEach((n) => {
				if (boundaries[n.idx] === undefined) {
					boundaries[n.idx] = idx
					queue.push({ cell: n, idx })
					if (n.isCoast) coasts[idx] = (coasts[idx] || 0) + 1
				} else if (boundaries[n.idx] !== boundaries[cell.idx]) {
					addBorder({
						borders: regionBorders,
						r1: boundaries[cell.idx],
						r2: boundaries[n.idx],
						c1: cell.idx,
						c2: n.idx,
					})
					if (!n.isWater && !n.isCoast) {
						addBorder({
							borders: mountainProspects,
							r1: boundaries[cell.idx],
							r2: boundaries[n.idx],
							c1: cell.idx,
							c2: n.idx,
						})
					}
				}
			})
		}
	},
	_topography: () => {
		// Target distribution (of non-mountain, non-coastal land):
		//   flat ~50%, hills ~15%, marsh ~5%, plateau ~3%
		// Mountains are already tagged (~10%). Coastal is all beach cells.
		const land = WORLD.cells.land()

		// 1) mountains — already marked
		land.forEach((c) => {
			if (c.isMountains) c.topography = "mountains"
		})

		// 2) small isles — chance to be mountainous or hilly instead of coastal
		land.forEach((c) => {
			if (c.topography) return
			const lm = window.world.landmarks[c.landmark]
			if (!lm || lm.type !== "isle") return
			const roll = window.dice.random
			if (roll < 0.12) {
				c.topography = "mountains"
				c.isMountains = true
				c.elevation = window.dice.uniform(0.8, 1.8)
			} else if (roll < 0.35) {
				c.topography = "hills"
			}
		})

		// 3) coastal — beach coast cells (non-isle marsh chance)
		land.forEach((c) => {
			if (c.topography) return
			if (c.isCoast && c.beach) {
				const lm = window.world.landmarks[c.landmark]
				if (
					lm &&
					lm.type !== "isle" &&
					window.dice.random > 0.75 &&
					c.vegetation !== "desert"
				) {
					c.topography = "marsh"
				} else {
					c.topography = "coastal"
				}
			}
		})

		// 4) plateau — already marked from growPlateaus
		land.forEach((c) => {
			if (c.topography) return
			if (c.plateau) c.topography = "plateau"
		})

		// 5) marsh — non-beach coast cells
		land.forEach((c) => {
			if (c.topography) return
			if (c.isCoast && !c.beach && window.dice.random > 0.4) {
				c.topography = "marsh"
			}
		})

		// 6) hills — immediate ring around mountains
		land.forEach((c) => {
			if (c.topography) return
			if (c.highlandDist === 1 && !c.isCoast) {
				c.topography = "hills"
			}
		})

		// 7) grow clustered hills + plateaus (plateaus get a hill ring)
		const hillTarget = Math.floor(land.length * 0.2)
		const plateauTarget = Math.floor(land.length * 0.05)
		let hillCount = land.filter((c) => c.topography === "hills").length
		let plateauCount = land.filter((c) => c.topography === "plateau").length
		const claimed = new Set<number>(
			land.filter((c) => c.topography).map((c) => c.idx),
		)

		// helper: grow a BFS blob of a given topography type
		// minSize: cluster must reach this size or it gets reverted
		const growBlob = (
			seed: Cell,
			type: "hills" | "plateau",
			minSize: number,
			maxSize: number,
		) => {
			const queue = [seed]
			claimed.add(seed.idx)
			let size = 0
			const cluster: Cell[] = []
			while (queue.length > 0 && size < maxSize) {
				const curr = queue.shift()!
				curr.topography = type
				if (type === "plateau") {
					curr.plateau = true
					plateauCount++
				} else {
					hillCount++
				}
				size++
				cluster.push(curr)
				const neighbors = window.dice
					.shuffle(CELL.neighbors(curr))
					.filter(
						(n) =>
							!claimed.has(n.idx) &&
							!n.topography &&
							!n.isMountains &&
							!n.isWater,
					)
				for (const n of neighbors) {
					if (size + queue.length >= maxSize) break
					claimed.add(n.idx)
					queue.push(n)
				}
			}
			// revert if cluster is too small
			if (size < minSize) {
				cluster.forEach((c) => {
					c.topography = undefined
					if (type === "plateau") {
						c.plateau = false
						plateauCount--
					} else {
						hillCount--
					}
				})
				return []
			}
			return cluster
		}

		// helper: ring hills around a plateau cluster
		const ringWithHills = (cluster: Cell[], maxRing: number) => {
			let added = 0
			for (const c of cluster) {
				for (const n of window.dice.shuffle(CELL.neighbors(c))) {
					if (added >= maxRing) return
					if (claimed.has(n.idx) || n.topography || n.isMountains || n.isWater)
						continue
					claimed.add(n.idx)
					n.topography = "hills"
					hillCount++
					added++
				}
			}
		}

		// find mountainless landmarks (continent/island) — prioritize these
		const mountainlessFeatures = new Set<number>()
		for (const [idStr, lm] of Object.entries(window.world.landmarks)) {
			if (lm.water) continue
			if (lm.type !== "continent" && lm.type !== "island" && lm.type !== "isle")
				continue
			const id = parseInt(idStr)
			const hasMtn = land.some((c) => c.landmark === id && c.isMountains)
			if (!hasMtn) mountainlessFeatures.add(id)
		}

		// first pass: seed clusters on mountainless features
		const featureSeeds = window.dice.shuffle(
			land.filter(
				(c) =>
					!claimed.has(c.idx) &&
					!c.topography &&
					mountainlessFeatures.has(c.landmark) &&
					!c.isWater,
			),
		)
		for (const seed of featureSeeds) {
			if (hillCount >= hillTarget && plateauCount >= plateauTarget) break
			if (claimed.has(seed.idx)) continue
			// alternate between plateau+hill-ring and hill clusters
			if (plateauCount < plateauTarget && window.dice.random < 0.4) {
				const cluster = growBlob(seed, "plateau", 3, window.dice.randint(4, 8))
				ringWithHills(cluster, window.dice.randint(4, 10))
			} else if (hillCount < hillTarget) {
				growBlob(seed, "hills", 3, window.dice.randint(5, 12))
			}
		}

		// second pass: seed clusters anywhere on unassigned land
		const anySeeds = window.dice.shuffle(
			land.filter((c) => !claimed.has(c.idx) && !c.topography && !c.isWater),
		)
		for (const seed of anySeeds) {
			if (hillCount >= hillTarget && plateauCount >= plateauTarget) break
			if (claimed.has(seed.idx)) continue
			if (plateauCount < plateauTarget && window.dice.random < 0.3) {
				const cluster = growBlob(seed, "plateau", 3, window.dice.randint(4, 8))
				ringWithHills(cluster, window.dice.randint(4, 10))
			} else if (hillCount < hillTarget) {
				growBlob(seed, "hills", 3, window.dice.randint(5, 12))
			}
		}

		// 8) everything else is flat
		land.forEach((c) => {
			if (!c.topography) c.topography = "flat"
		})

		// recompute highland distance now that hills + plateaus are placed
		computeHighlandDist()

		// 9) assign elevations per topography type (km)
		//    use WORLD.elevation.compute for natural gradient where appropriate
		land.forEach((c) => {
			const raw = Math.min(WORLD.elevation.compute(c), 0.5)
			switch (c.topography) {
				case "flat":
					// scale compute's 0–0.5 range down to 0.01–0.15 for a gentle gradient
					c.elevation = WORLD.elevation.seaLevel + (raw / 0.5) * 0.14
					break
				case "coastal":
					c.elevation = window.dice.uniform(0.0, 0.05)
					break
				case "marsh":
					c.elevation = window.dice.uniform(0.0, 0.03)
					break
				case "hills":
					c.elevation = window.dice.uniform(0.2, 0.5)
					break
				case "plateau":
					if (c.elevation < 0.4 || c.elevation > 2.5)
						c.elevation = window.dice.uniform(0.5, 1.8)
					break
				case "mountains":
					// mountains already have elevation from walkChain + classifyRanges
					if (c.elevation < WORLD.elevation.mountains)
						c.elevation = window.dice.uniform(0.7, 1.5)
					break
			}
		})

		// ── Stats per land feature ──────────────────────────────────────
		const topoTypes = [
			"mountains",
			"hills",
			"plateau",
			"flat",
			"coastal",
			"marsh",
		] as const
		const featureStats: {
			id: number
			name: string
			type: string
			total: number
			counts: Record<string, number>
		}[] = []

		for (const [idStr, lm] of Object.entries(window.world.landmarks)) {
			if (lm.water || lm.type === "isle") continue
			const id = parseInt(idStr)
			const cells = land.filter((c) => c.landmark === id)
			if (cells.length === 0) continue
			const counts: Record<string, number> = {}
			for (const t of topoTypes) counts[t] = 0
			cells.forEach((c) => {
				const t = c.topography || "flat"
				counts[t] = (counts[t] || 0) + 1
			})
			featureStats.push({
				id,
				name: lm.name || `#${id}`,
				type: lm.type,
				total: cells.length,
				counts,
			})
		}

		featureStats.sort(
			(a, b) => b.counts.mountains / b.total - a.counts.mountains / a.total,
		)

		const pct = (n: number, tot: number) => `${((n / tot) * 100).toFixed(1)}%`
		console.groupCollapsed(
			`[topo] distribution per feature (${featureStats.length} features)`,
		)
		for (const f of featureStats) {
			const parts = topoTypes
				.map((t) => `${t}: ${pct(f.counts[t], f.total)}`)
				.join("  ")
			console.log(`${f.type} "${f.name}" (${f.total} cells)  ${parts}`)
		}
		console.groupEnd()
	},
	build: () => {
		SHAPER_MOUNTAINS._mountains()
	},
}
