import type { SphereMesh, OrogenClimate, OrogenRainfall, OrogenRivers } from "./types"

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

	for (let r = 0; r < N; r++) {
		if (elevation[r] <= 0) visited[r] = 1
	}

	for (let r = 0; r < N; r++) {
		if (visited[r]) continue
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			if (elevation[adjList[j]] <= 0) {
				visited[r] = 1
				drainTarget[r] = adjList[j]
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
	const lines: [number, number, number, number][][] = []
	let maxFlow = 0

	for (const start of riverCells) {
		if (traced[start]) continue
		const line: [number, number, number, number][] = []
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

			if (elevation[cur] <= 0) break
			if (cur !== start && traced[cur]) break // include this junction cell, then stop
			traced[cur] = 1

			const next = drainTarget[cur]
			if (next < 0) break
			if (elevation[next] <= 0) {
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
				break
			}
			cur = next
		}

		if (line.length >= 2) lines.push(line)
	}

	return { lines, maxFlow, minFlow: threshold }
}
