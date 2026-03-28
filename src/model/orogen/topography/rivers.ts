import type { SphereMesh, OrogenClimate, OrogenRainfall, OrogenRivers } from "../types"

/**
 * Min-heap keyed on an external Float32Array.
 */
class MinHeap {
	private _key: Float32Array
	private _data: number[] = []

	constructor(keyArray: Float32Array) {
		this._key = keyArray
	}
	get size() {
		return this._data.length
	}
	push(cell: number) {
		this._data.push(cell)
		let i = this._data.length - 1
		while (i > 0) {
			const parent = (i - 1) >> 1
			if (this._key[this._data[i]] >= this._key[this._data[parent]]) break
			const tmp = this._data[i]
			this._data[i] = this._data[parent]
			this._data[parent] = tmp
			i = parent
		}
	}
	pop(): number {
		const top = this._data[0]
		const last = this._data.pop()!
		if (this._data.length > 0) {
			this._data[0] = last
			let i = 0
			const n = this._data.length
			for (;;) {
				let smallest = i
				const l = 2 * i + 1,
					r = 2 * i + 2
				if (l < n && this._key[this._data[l]] < this._key[this._data[smallest]])
					smallest = l
				if (r < n && this._key[this._data[r]] < this._key[this._data[smallest]])
					smallest = r
				if (smallest === i) break
				const tmp = this._data[i]
				this._data[i] = this._data[smallest]
				this._data[smallest] = tmp
				i = smallest
			}
		}
		return top
	}
}

export function computeRivers(
	mesh: SphereMesh,
	elevation: Float32Array,
	rainfall: OrogenRainfall,
	climate: OrogenClimate,
	isLand?: Uint8Array,
): OrogenRivers {
	const N = mesh.numRegions
	const { adjOffset, adjList, r_xyz } = mesh
	const DEG = 180 / Math.PI

	// ── 1. Priority-flood drainage ──────────────────────────────────
	const drainTarget = new Int32Array(N).fill(-1)
	const visited = new Uint8Array(N)
	const processOrder: number[] = []

	const key = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		let h = (r * 2654435761) >>> 0
		h = (((h >>> 16) ^ h) * 0x45d9f3b) >>> 0
		h = ((h >>> 16) ^ h) >>> 0
		key[r] = elevation[r] + (h / 0xffffffff) * 1e-7
	}
	const heap = new MinHeap(key)

	// Use provided land mask, or fall back to elevation-based classification
	const land: Uint8Array = isLand ?? (() => {
		const mask = new Uint8Array(N)
		for (let r = 0; r < N; r++) {
			if (elevation[r] > 0) mask[r] = 1
		}
		return mask
	})()

	// Track effective water surface for lake detection
	const waterLevel = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (!land[r]) visited[r] = 1
	}

	for (let r = 0; r < N; r++) {
		if (visited[r]) continue
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			if (!land[adjList[j]]) {
				visited[r] = 1
				drainTarget[r] = adjList[j]
				waterLevel[r] = elevation[r]
				heap.push(r)
				processOrder.push(r)
				break
			}
		}
	}

	while (heap.size > 0) {
		const r = heap.pop()
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			const nb = adjList[j]
			if (visited[nb]) continue
			visited[nb] = 1
			drainTarget[nb] = r
			// Water level = max of parent's water level and own elevation
			// In basins, parent's water level (the rim) exceeds the cell's elevation
			waterLevel[nb] = Math.max(waterLevel[r], elevation[nb])
			heap.push(nb)
			processOrder.push(nb)
		}
	}

	// ── 2. Flow accumulation ────────────────────────────────────────
	const flow = new Float32Array(N)
	for (let i = 0; i < processOrder.length; i++) {
		const r = processOrder[i]
		let thawedRain = 0
		for (let month = 0; month < 12; month++) {
			const idx = month * N + r
			if (climate.temperature_monthly[idx] > 0) thawedRain += rainfall.monthly[idx]
		}
		flow[r] = thawedRain
	}
	for (let i = processOrder.length - 1; i >= 0; i--) {
		const r = processOrder[i]
		const target = drainTarget[r]
		if (target >= 0) flow[target] += flow[r]
	}

	// ── 2b. Flow-based lake filling ─────────────────────────────────
	// Identify enclosed basins (cells where priority-flood water level > ground)
	// then fill each basin from the bottom up based on actual inflow vs evaporation.
	const lakes = new Uint8Array(N)
	const basinId = new Int32Array(N).fill(-1)
	let nextBasin = 0

	// Flood-fill to label connected basin components
	for (let r = 0; r < N; r++) {
		if (!land[r] || waterLevel[r] <= elevation[r] + 1e-6 || basinId[r] >= 0) continue
		const id = nextBasin++
		const stack = [r]
		basinId[r] = id
		while (stack.length > 0) {
			const c = stack.pop()!
			for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
				const nb = adjList[j]
				if (basinId[nb] < 0 && land[nb] && waterLevel[nb] > elevation[nb] + 1e-6) {
					basinId[nb] = id
					stack.push(nb)
				}
			}
		}
	}

	if (nextBasin > 0) {
		// Collect cells per basin, sum LOCAL rainfall (not upstream river flow)
		const basinCells: number[][] = Array.from({ length: nextBasin }, () => [])
		const basinRain = new Float32Array(nextBasin)

		for (let r = 0; r < N; r++) {
			const bid = basinId[r]
			if (bid < 0) continue
			basinCells[bid].push(r)
			basinRain[bid] += rainfall.annual[r]
		}

		// For each basin, sort cells by elevation and fill from bottom
		// until lake surface area × evaporation rate >= basin rainfall.
		// Only rain falling on the basin itself counts — not upstream rivers.
		const EVAP_RATE = 1200 // mm/cell/yr — hot open-water evaporation

		const DESERT_THRESHOLD = 250 // mm/yr — below this, too arid for lakes

		for (let bid = 0; bid < nextBasin; bid++) {
			const cells = basinCells[bid]
			if (cells.length === 0) continue

			const inflow = basinRain[bid]
			if (inflow <= 0) continue

			// Skip basins in arid regions
			const avgRain = inflow / cells.length
			if (avgRain < DESERT_THRESHOLD) continue

			// Sort by elevation ascending (fill from bottom)
			cells.sort((a, b) => elevation[a] - elevation[b])

			// Fill cells until surface area × evap balances inflow
			let filledCount = 0
			let lakeElev = elevation[cells[0]]

			for (let i = 0; i < cells.length; i++) {
				lakeElev = elevation[cells[i]]
				filledCount = i + 1
				if (filledCount * EVAP_RATE >= inflow) break
			}

			// The lake level is at the elevation of the last filled cell
			const lakeSurface = lakeElev + 1e-7

			for (let i = 0; i < filledCount; i++) {
				const c = cells[i]
				lakes[c] = 1
				waterLevel[c] = lakeSurface
			}
			// Clear waterLevel for basin cells NOT in the lake
			for (let i = filledCount; i < cells.length; i++) {
				waterLevel[cells[i]] = elevation[cells[i]]
			}
		}
	}

	// ── 3. Threshold (top 5% of land flow) ──────────────────────────
	const landCount = processOrder.length
	const landFlows = new Float32Array(landCount)
	for (let i = 0; i < landCount; i++) landFlows[i] = flow[processOrder[i]]
	landFlows.sort()

	const thresholdIdx = Math.floor(landCount * (1 - 0.05))
	const threshold = landFlows[thresholdIdx] || 1

	// ── 4. Extract river polylines with per-vertex flow + elevation ──
	const riverCells = processOrder
		.filter(r => flow[r] >= threshold)
		.sort((a, b) => elevation[b] - elevation[a])

	const traced = new Uint8Array(N)
	const visible = new Uint8Array(N)
	const lines: [number, number, number, number][][] = []
	let maxFlow = 0

	for (const start of riverCells) {
		if (traced[start]) continue
		const line: [number, number, number, number][] = []
		const lineCells: number[] = []
		let cur = start

		while (cur >= 0) {
			const x = r_xyz[3 * cur], y = r_xyz[3 * cur + 1], z = r_xyz[3 * cur + 2]
			const f = flow[cur]
			if (f > maxFlow) maxFlow = f
			line.push([
				Math.atan2(y, x) * DEG,
				Math.asin(Math.max(-1, Math.min(1, z))) * DEG,
				f,
				elevation[cur],
			])
			lineCells.push(cur)

			if (!land[cur]) break
			if (cur !== start && traced[cur]) break // include this junction cell, then stop
			traced[cur] = 1

			const next = drainTarget[cur]
			if (next < 0) break
			if (!land[next]) {
				const ox = r_xyz[3 * next], oy = r_xyz[3 * next + 1], oz = r_xyz[3 * next + 2]
				line.push([
					Math.atan2(oy, ox) * DEG,
					Math.asin(Math.max(-1, Math.min(1, oz))) * DEG,
					f,
					elevation[next],
				])
				break
			}
			// If next cell was already traced, add it for visual junction then stop
			if (traced[next]) {
				const ox = r_xyz[3 * next], oy = r_xyz[3 * next + 1], oz = r_xyz[3 * next + 2]
				line.push([
					Math.atan2(oy, ox) * DEG,
					Math.asin(Math.max(-1, Math.min(1, oz))) * DEG,
					flow[next],
					elevation[next],
				])
				lineCells.push(next)
				break
			}
			cur = next
		}

		if (line.length >= 2) {
			lines.push(line)
			for (const cell of lineCells) {
				if (land[cell]) visible[cell] = 1
			}
		}
	}

	return { lines, maxFlow, minFlow: threshold, visible, lakes, waterLevel }
}
