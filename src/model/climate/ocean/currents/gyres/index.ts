import type {
	GyreInput,
	OceanGyres,
} from "@/model/climate/ocean/currents/gyres/types"

const ISLAND_FRACTION = 0.012

function solve({
	grid,
	forceU,
	forceV,
	omega,
	radius,
	drag,
}: GyreInput): OceanGyres {
	const n = grid.mesh.numRegions
	const result: OceanGyres = {
		u: new Float32Array(n * 12),
		v: new Float32Array(n * 12),
		residual: 0,
	}
	const coefficientA = new Float64Array(grid.a.length),
		coefficientB = new Float64Array(grid.a.length)
	const diagonal = new Float64Array(n)
	for (let e = 0; e < grid.a.length; e++) {
		const a = grid.a[e],
			b = grid.b[e]
		const betaA =
			(2 *
				omega *
				Math.sqrt(Math.max(0, 1 - grid.mesh.r_xyz[3 * a + 2] ** 2))) /
			radius
		const betaB =
			(2 *
				omega *
				Math.sqrt(Math.max(0, 1 - grid.mesh.r_xyz[3 * b + 2] ** 2))) /
			radius
		const diffusion = (drag * grid.width[e]) / grid.distance[e]
		coefficientA[e] =
			diffusion + Math.max(0, betaA * grid.eastA[e]) * grid.width[e]
		coefficientB[e] =
			diffusion + Math.max(0, -betaB * grid.eastB[e]) * grid.width[e]
		diagonal[a] += coefficientA[e]
		diagonal[b] += coefficientB[e]
	}
	// A coast holds one streamfunction value along its whole length. Pinning
	// every coast to the same value forbids net flow between two landmasses, so
	// instead each landmass carries its own unknown and only the largest is
	// pinned -- the island rule, which is what lets a circumpolar current exist.
	const shore = new Int32Array(n).fill(-1)
	const land = new Int32Array(n).fill(-1)
	const landQueue = new Int32Array(n)
	const landSize = new Map<number, number>()
	for (let seed = 0; seed < n; seed++) {
		if (grid.ocean[seed] || land[seed] >= 0) continue
		let head = 0,
			tail = 1
		landQueue[0] = seed
		land[seed] = seed
		while (head < tail) {
			const r = landQueue[head++]
			for (
				let j = grid.mesh.adjOffset[r];
				j < grid.mesh.adjOffset[r + 1];
				j++
			) {
				const nb = grid.mesh.adjList[j]
				if (!grid.ocean[nb] && land[nb] < 0) {
					land[nb] = seed
					landQueue[tail++] = nb
				}
			}
		}
		landSize.set(seed, tail)
	}
	const merged = new Map<number, number>()
	const resolve = (mass: number): number => {
		let root = mass
		while (merged.has(root)) root = merged.get(root) as number
		return root
	}
	for (let r = 0; r < n; r++) {
		if (!grid.ocean[r]) continue
		for (let j = grid.mesh.adjOffset[r]; j < grid.mesh.adjOffset[r + 1]; j++) {
			const nb = grid.mesh.adjList[j]
			if (grid.ocean[nb]) continue
			const mass = resolve(land[nb])
			if (shore[r] < 0) {
				shore[r] = mass
				continue
			}
			// One cell touching two landmasses closes the gap between them: at this
			// resolution nothing can flow through, so they act as one obstacle.
			const held = resolve(shore[r])
			if (held !== mass) {
				merged.set(mass, held)
				landSize.set(
					held,
					(landSize.get(held) ?? 0) + (landSize.get(mass) ?? 0),
				)
			}
		}
	}
	let anchor = -1
	for (const [mass, size] of landSize)
		if (
			!merged.has(mass) &&
			(anchor < 0 || size > (landSize.get(anchor) as number))
		)
			anchor = mass
	// An island whose surrounding passage the mesh cannot resolve carries no
	// throughflow of its own, so it shares the anchor's value rather than
	// adding a free constant the solve would have to invent a transport for.
	const smallestIsland = n * ISLAND_FRACTION
	for (const [mass, size] of landSize)
		if (!merged.has(mass) && mass !== anchor && size < smallestIsland)
			merged.set(mass, anchor)
	const coasts = new Map<number, number[]>()
	for (let r = 0; r < n; r++) {
		if (!grid.ocean[r] || shore[r] < 0) continue
		shore[r] = resolve(shore[r])
		if (shore[r] === anchor) continue
		const cells = coasts.get(shore[r])
		if (cells) cells.push(r)
		else coasts.set(shore[r], [r])
	}
	const pinned = new Uint8Array(n)
	for (let r = 0; r < n; r++) {
		if (!grid.ocean[r] || (shore[r] >= 0 && shore[r] === anchor)) pinned[r] = 1
		// A barrier too narrow to survive downsampling leaves a cell short of
		// edges without a landmass to attribute it to; it still walls off flow.
		else if (
			shore[r] < 0 &&
			grid.bodyOffset[r + 1] - grid.bodyOffset[r] <
				grid.mesh.adjOffset[r + 1] - grid.mesh.adjOffset[r]
		)
			pinned[r] = 1
	}
	// A body with no coast at all -- a global ocean, or a fully periodic belt --
	// has no obstacle to close a gyre against, so it carries no interior flow.
	const coastal = new Set<number>()
	for (let r = 0; r < n; r++)
		if (grid.ocean[r] && shore[r] >= 0) coastal.add(grid.body[r])
	for (let r = 0; r < n; r++)
		if (grid.ocean[r] && !coastal.has(grid.body[r])) pinned[r] = 1
	const curl = new Float64Array(n)
	const stream = new Float64Array(n)
	for (let month = 0; month < 12; month++) {
		curl.fill(0)
		for (let e = 0; e < grid.a.length; e++) {
			const a = grid.a[e],
				b = grid.b[e],
				ia = month * n + a,
				ib = month * n + b
			const tangentA = -forceU[ia] * grid.northA[e] + forceV[ia] * grid.eastA[e]
			const tangentB = -forceU[ib] * grid.northB[e] + forceV[ib] * grid.eastB[e]
			const circulation = 0.5 * grid.width[e] * (tangentA + tangentB)
			curl[a] += circulation
			curl[b] -= circulation
		}
		// Stommel balance: drag * Laplacian(psi) + beta * d(psi)/dx = curl(stress).
		let residual = Infinity
		for (let iteration = 0; iteration < 3000; iteration++) {
			let squared = 0,
				area = 0
			for (let k = 0; k < n; k++) {
				const r = iteration % 2 === 0 ? k : n - 1 - k
				if (pinned[r] || shore[r] >= 0 || diagonal[r] <= 0) continue
				let weighted = -curl[r]
				for (let j = grid.bodyOffset[r]; j < grid.bodyOffset[r + 1]; j++) {
					const e = grid.bodyEdges[j]
					weighted +=
						grid.a[e] === r
							? coefficientA[e] * stream[grid.b[e]]
							: coefficientB[e] * stream[grid.a[e]]
				}
				const next = weighted / diagonal[r]
				const change = next - stream[r]
				stream[r] = next
				squared += change * change
				area += grid.area[r]
			}
			// Summing a coast's rows leaves one equation for its shared value.
			for (const cells of coasts.values()) {
				let weighted = 0,
					total = 0
				for (const r of cells) {
					weighted -= curl[r]
					total += diagonal[r]
					for (let j = grid.bodyOffset[r]; j < grid.bodyOffset[r + 1]; j++) {
						const e = grid.bodyEdges[j]
						const own = grid.a[e] === r
						const nb = own ? grid.b[e] : grid.a[e]
						const coefficient = own ? coefficientA[e] : coefficientB[e]
						if (shore[nb] === shore[r]) total -= coefficient
						else weighted += coefficient * stream[nb]
					}
				}
				if (!(total > 0)) continue
				const next = weighted / total
				const change = next - stream[cells[0]]
				squared += change * change * cells.length
				for (const r of cells) {
					stream[r] = next
					area += grid.area[r]
				}
			}
			residual = Math.sqrt(squared / Math.max(1, area))
			if (residual < 1e-6) break
		}
		result.residual = Math.max(result.residual, residual)
		for (let e = 0; e < grid.a.length; e++) {
			const a = grid.a[e],
				b = grid.b[e]
			const gradient = (stream[b] - stream[a]) * grid.width[e] * 0.5
			result.u[month * n + a] -= (gradient * grid.northA[e]) / grid.area[a]
			result.v[month * n + a] += (gradient * grid.eastA[e]) / grid.area[a]
			result.u[month * n + b] -= (gradient * grid.northB[e]) / grid.area[b]
			result.v[month * n + b] += (gradient * grid.eastB[e]) / grid.area[b]
		}
	}
	return result
}

export const OCEAN_GYRES = { solve }
