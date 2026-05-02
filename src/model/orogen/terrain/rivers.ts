import type {
	OrogenClimate,
	OrogenHydrology,
	OrogenParams,
	OrogenRainfall,
	OrogenRivers,
	SphereMesh,
} from "../types"
import { MinHeap } from "../util/heap"
import { smoothstep } from "../util/math"

function polylineLengthKm(
	line: [number, number, number, number][],
	radiusKm: number,
): number {
	let sum = 0
	for (let i = 1; i < line.length; i++) {
		const [lon0, lat0] = line[i - 1]
		const [lon1, lat1] = line[i]
		const phi0 = (lat0 * Math.PI) / 180
		const phi1 = (lat1 * Math.PI) / 180
		const lam0 = (lon0 * Math.PI) / 180
		const lam1 = (lon1 * Math.PI) / 180
		const sin0 = Math.sin(phi0),
			cos0 = Math.cos(phi0)
		const sin1 = Math.sin(phi1),
			cos1 = Math.cos(phi1)
		const cosTheta = sin0 * sin1 + cos0 * cos1 * Math.cos(lam1 - lam0)
		sum += Math.acos(Math.max(-1, Math.min(1, cosTheta))) * radiusKm
	}
	return sum
}

function computeSubgraphNeighborCount(
	numRegions: number,
	adjOffset: Int32Array,
	adjList: Int32Array,
	cells: number[],
): Uint8Array {
	const inSubgraph = new Uint8Array(numRegions)
	const neighborCount = new Uint8Array(numRegions)
	for (const cell of cells) inSubgraph[cell] = 1
	for (const cell of cells) {
		let count = 0
		for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
			if (inSubgraph[adjList[j]]) count++
		}
		neighborCount[cell] = count
	}
	return neighborCount
}

function computeLakeSurface(
	lakeCells: number[],
	elevation: Float32Array,
): number {
	let lakeSurface = elevation[lakeCells[0]]
	for (const cell of lakeCells) {
		lakeSurface = Math.max(lakeSurface, elevation[cell])
	}
	return lakeSurface + 1e-7
}

function estimateSubgraphDiameter(
	numRegions: number,
	adjOffset: Int32Array,
	adjList: Int32Array,
	cells: number[],
): number {
	if (cells.length <= 1) return 0

	const inSubgraph = new Uint8Array(numRegions)
	const distance = new Int32Array(numRegions)
	const queue = new Int32Array(cells.length)
	for (const cell of cells) inSubgraph[cell] = 1

	const bfs = (start: number) => {
		distance.fill(-1)
		let head = 0
		let tail = 0
		queue[tail++] = start
		distance[start] = 0
		let farthest = start

		while (head < tail) {
			const cell = queue[head++]
			if (distance[cell] > distance[farthest]) farthest = cell
			for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
				const nb = adjList[j]
				if (!inSubgraph[nb] || distance[nb] >= 0) continue
				distance[nb] = distance[cell] + 1
				queue[tail++] = nb
			}
		}

		return { farthest, distance: distance[farthest] }
	}

	const first = bfs(cells[0])
	return bfs(first.farthest).distance
}

function selectCompactLakeFallback(
	numRegions: number,
	adjOffset: Int32Array,
	adjList: Int32Array,
	elevation: Float32Array,
	lakeCells: number[],
	targetCellCount: number,
): number[] {
	if (lakeCells.length === 0 || targetCellCount <= 0) return []

	const allowed = new Uint8Array(numRegions)
	const queued = new Uint8Array(numRegions)
	const selected = new Uint8Array(numRegions)
	const frontierKey = new Float32Array(numRegions)
	frontierKey.fill(Number.POSITIVE_INFINITY)

	for (const cell of lakeCells) allowed[cell] = 1

	let seed = lakeCells[0]
	for (const cell of lakeCells) {
		if (elevation[cell] < elevation[seed]) seed = cell
	}

	const heap = new MinHeap(frontierKey)
	const compactCells: number[] = [seed]
	selected[seed] = 1

	for (let j = adjOffset[seed]; j < adjOffset[seed + 1]; j++) {
		const nb = adjList[j]
		if (!allowed[nb] || queued[nb]) continue
		queued[nb] = 1
		frontierKey[nb] = elevation[nb]
		heap.push(nb)
	}

	while (heap.size > 0 && compactCells.length < targetCellCount) {
		const cell = heap.pop()
		if (selected[cell]) continue
		selected[cell] = 1
		compactCells.push(cell)

		for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
			const nb = adjList[j]
			if (!allowed[nb] || queued[nb]) continue
			queued[nb] = 1
			frontierKey[nb] = elevation[nb]
			heap.push(nb)
		}
	}

	return compactCells
}

function trimLakeCorridors(
	numRegions: number,
	adjOffset: Int32Array,
	adjList: Int32Array,
	elevation: Float32Array,
	basinCells: number[],
	lakeCells: number[],
): { lakeCells: number[]; lakeSurface: number } {
	if (lakeCells.length === 0) return { lakeCells: [], lakeSurface: 0 }
	if (lakeCells.length <= 3) {
		return { lakeCells, lakeSurface: computeLakeSurface(lakeCells, elevation) }
	}

	const basinNeighborCount = computeSubgraphNeighborCount(
		numRegions,
		adjOffset,
		adjList,
		basinCells,
	)
	const inLake = new Uint8Array(numRegions)
	const isCorridor = new Uint8Array(numRegions)
	for (const cell of lakeCells) inLake[cell] = 1
	for (const cell of lakeCells) {
		if (basinNeighborCount[cell] <= 2) isCorridor[cell] = 1
	}

	const pruned = new Uint8Array(numRegions)
	const seen = new Uint8Array(numRegions)

	for (const start of lakeCells) {
		if (!isCorridor[start] || seen[start]) continue

		const stack = [start]
		const component: number[] = []
		const attachments = new Set<number>()
		seen[start] = 1

		while (stack.length > 0) {
			const cell = stack.pop()!
			component.push(cell)
			for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
				const nb = adjList[j]
				if (!inLake[nb]) continue
				if (!isCorridor[nb]) {
					attachments.add(nb)
					continue
				}
				if (seen[nb]) continue
				seen[nb] = 1
				stack.push(nb)
			}
		}

		if (component.length >= 3 && attachments.size <= 2) {
			for (const cell of component) pruned[cell] = 1
		}
	}

	const elongatedSeen = new Uint8Array(numRegions)
	for (const start of lakeCells) {
		if (pruned[start] || elongatedSeen[start] || basinNeighborCount[start] > 3)
			continue

		const stack = [start]
		const component: number[] = []
		const attachments = new Set<number>()
		let basinNeighborSum = 0
		elongatedSeen[start] = 1

		while (stack.length > 0) {
			const cell = stack.pop()!
			component.push(cell)
			basinNeighborSum += basinNeighborCount[cell]

			for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
				const nb = adjList[j]
				if (!inLake[nb] || pruned[nb]) continue
				if (basinNeighborCount[nb] > 3) {
					attachments.add(nb)
					continue
				}
				if (elongatedSeen[nb]) continue
				elongatedSeen[nb] = 1
				stack.push(nb)
			}
		}

		if (component.length >= lakeCells.length) continue
		if (component.length < 5 || attachments.size > 2) continue

		const diameter = estimateSubgraphDiameter(
			numRegions,
			adjOffset,
			adjList,
			component,
		)
		const averageBasinNeighbors = basinNeighborSum / component.length
		const widthEstimate = component.length / Math.max(1, diameter + 1)

		if (
			diameter >= 4 &&
			widthEstimate <= 1.6 &&
			averageBasinNeighbors <= 2.75
		) {
			for (const cell of component) pruned[cell] = 1
		}
	}

	const trimmedLakeCells = lakeCells.filter((cell) => !pruned[cell])
	if (trimmedLakeCells.length === lakeCells.length) {
		return { lakeCells, lakeSurface: computeLakeSurface(lakeCells, elevation) }
	}
	if (trimmedLakeCells.length === 0) {
		const fallbackTarget =
			lakeCells.length <= 3 ? lakeCells.length : Math.min(2, lakeCells.length)
		const fallbackLakeCells = selectCompactLakeFallback(
			numRegions,
			adjOffset,
			adjList,
			elevation,
			lakeCells,
			fallbackTarget,
		)
		return {
			lakeCells: fallbackLakeCells,
			lakeSurface: computeLakeSurface(fallbackLakeCells, elevation),
		}
	}

	return {
		lakeCells: trimmedLakeCells,
		lakeSurface: computeLakeSurface(trimmedLakeCells, elevation),
	}
}

export function selectConnectedLakeCells(
	numRegions: number,
	adjOffset: Int32Array,
	adjList: Int32Array,
	elevation: Float32Array,
	basinCells: number[],
	targetCellCount: number,
): { lakeCells: number[]; lakeSurface: number } {
	if (basinCells.length === 0 || targetCellCount <= 0) {
		return { lakeCells: [], lakeSurface: 0 }
	}

	const inBasin = new Uint8Array(numRegions)
	const queued = new Uint8Array(numRegions)
	const selected = new Uint8Array(numRegions)
	const frontierKey = new Float32Array(numRegions)
	frontierKey.fill(Number.POSITIVE_INFINITY)

	for (const cell of basinCells) inBasin[cell] = 1
	const basinNeighborCount = computeSubgraphNeighborCount(
		numRegions,
		adjOffset,
		adjList,
		basinCells,
	)

	let seed = basinCells[0]
	for (const cell of basinCells) {
		if (elevation[cell] < elevation[seed]) seed = cell
	}

	const heap = new MinHeap(frontierKey)
	queued[seed] = 1
	frontierKey[seed] = elevation[seed]
	heap.push(seed)

	const lakeCells: number[] = []

	while (heap.size > 0 && lakeCells.length < targetCellCount) {
		const cell = heap.pop()
		if (selected[cell]) continue
		selected[cell] = 1
		lakeCells.push(cell)

		for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
			const nb = adjList[j]
			if (!inBasin[nb] || queued[nb]) continue
			queued[nb] = 1
			const corridorDeficit = Math.max(0, 4 - basinNeighborCount[nb])
			const narrowPenalty = corridorDeficit * corridorDeficit * 0.035
			frontierKey[nb] = elevation[nb] + narrowPenalty
			heap.push(nb)
		}
	}

	return trimLakeCorridors(
		numRegions,
		adjOffset,
		adjList,
		elevation,
		basinCells,
		lakeCells,
	)
}

export function computeRivers(
	mesh: SphereMesh,
	elevation: Float32Array,
	rainfall: OrogenRainfall,
	climate: OrogenClimate,
	hydrology: OrogenHydrology,
	isLand: Uint8Array,
	params?: Pick<OrogenParams, "planetRadiusKm" | "daysPerYear" | "hoursPerDay">,
): OrogenRivers {
	const N = mesh.numRegions
	const { adjOffset, adjList, r_xyz } = mesh
	const DEG = 180 / Math.PI
	const radiusKm = params?.planetRadiusKm ?? 6371
	const radiusM = radiusKm * 1000
	const cellAreaM2 = (4 * Math.PI * radiusM * radiusM) / Math.max(1, N)
	const secondsPerYear =
		(params?.daysPerYear ?? 365) * (params?.hoursPerDay ?? 24) * 3600

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

	const land = isLand

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

	// ── 2. Flow accumulation (per-month) ───────────────────────────
	// Use the Pasta AET (actual evapotranspiration) soil-water balance model
	// to compute runoff = rainfall - AET. This accounts for temperature-driven
	// PET, soil moisture storage (500mm bucket), and saturation excess.
	const flow_monthly = new Float32Array(12 * N)
	const flow = new Float32Array(N)
	const secondsPerMonth = secondsPerYear / 12
	const hydro = hydrology
	const aetMonthly = hydro.aet_monthly
	const aridityMonthly = hydro.aridity_monthly
	const baseflowMonthly = hydro.baseflow_monthly
	const runoffBoost = new Float32Array(N)
	const passThroughElevBoost = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const elev = smoothstep(0, 0.5, elevation[r])
		runoffBoost[r] = 1 + elev * 0.5
		passThroughElevBoost[r] = elev * 0.003
	}

	// Per-cell pass-through: gentle loss from riparian ET, scaled by monthly PET.
	// This keeps hot/dry months leakier than cool/wet months instead of using one annual value.
	const monthlyPetHigh = 2000 / 12
	const passThroughMonth = new Float32Array(N)
	const flowToTarget = new Float32Array(N)

	for (let month = 0; month < 12; month++) {
		const mOff = month * N
		for (let r = 0; r < N; r++) {
			const idx = mOff + r
			if (!land[r]) {
				passThroughMonth[r] = 0
				flowToTarget[r] = 0
				continue
			}
			const runoffMm =
				Math.max(0, rainfall.monthly[idx] - aetMonthly[idx]) * runoffBoost[r]
			const baseflowMm = baseflowMonthly[idx]
			const totalMm = runoffMm + baseflowMm
			flowToTarget[r] =
				totalMm > 0 ? ((totalMm / 1000) * cellAreaM2) / secondsPerMonth : 0
			const pet = climate.pet_monthly[idx]
			const loss = 0.001 + smoothstep(0, monthlyPetHigh, pet) * 0.004
			passThroughMonth[r] = Math.min(0.999, 1 - loss + passThroughElevBoost[r])
		}

		// Downstream accumulation for this month
		for (let i = processOrder.length - 1; i >= 0; i--) {
			const r = processOrder[i]
			const target = drainTarget[r]
			if (target >= 0) {
				const temp = climate.temperature_monthly[mOff + target]
				let pt = passThroughMonth[target]
				pt *= 0.9 + 0.1 * smoothstep(0.2, 0.9, aridityMonthly[mOff + target])
				if (temp <= 0) pt *= smoothstep(-20, 0, temp)
				else if (temp >= 90) pt *= smoothstep(150, 90, temp)
				flowToTarget[target] += flowToTarget[r] * pt
			}
		}

		for (let r = 0; r < N; r++) flow_monthly[mOff + r] = flowToTarget[r]
	}

	// Annual average flow (mean of monthly)
	for (let r = 0; r < N; r++) {
		let sum = 0
		for (let month = 0; month < 12; month++) sum += flow_monthly[month * N + r]
		flow[r] = sum / 12
	}

	// ── 2b. Flow-based lake filling ─────────────────────────────────
	// Identify enclosed basins (cells where priority-flood water level > ground)
	// then fill each basin from the bottom up based on actual inflow vs evaporation.
	const lakes = new Uint8Array(N)
	const basinId = new Int32Array(N).fill(-1)
	let nextBasin = 0

	// Flood-fill to label connected basin components
	for (let r = 0; r < N; r++) {
		if (!land[r] || waterLevel[r] <= elevation[r] + 1e-6 || basinId[r] >= 0)
			continue
		const id = nextBasin++
		const stack = [r]
		basinId[r] = id
		while (stack.length > 0) {
			const c = stack.pop()!
			for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
				const nb = adjList[j]
				if (
					basinId[nb] < 0 &&
					land[nb] &&
					waterLevel[nb] > elevation[nb] + 1e-6
				) {
					basinId[nb] = id
					stack.push(nb)
				}
			}
		}
	}

	if (nextBasin > 0) {
		// Collect cells per basin, sum LOCAL rainfall (not upstream river flow)
		const basinCells: number[][] = Array.from(
			{ length: nextBasin },
			(): number[] => [],
		)
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
			const allCells = basinCells[bid]
			const cells = allCells.filter(
				(cell) => rainfall.annual[cell] > DESERT_THRESHOLD,
			)
			if (cells.length === 0) {
				for (const cell of allCells) waterLevel[cell] = elevation[cell]
				continue
			}

			const inflow = basinRain[bid]
			if (inflow <= 0) {
				for (const cell of allCells) waterLevel[cell] = elevation[cell]
				continue
			}

			// Skip basins in arid regions
			const avgRain = inflow / cells.length
			if (avgRain < DESERT_THRESHOLD) {
				for (const cell of allCells) waterLevel[cell] = elevation[cell]
				continue
			}

			// For each basin, grow a connected lake out from the basin floor
			// until lake surface area × evaporation rate >= basin rainfall.
			const targetCellCount = Math.ceil(inflow / EVAP_RATE)
			const { lakeCells, lakeSurface } = selectConnectedLakeCells(
				N,
				adjOffset,
				adjList,
				elevation,
				cells,
				targetCellCount,
			)

			for (const c of lakeCells) {
				lakes[c] = 1
				waterLevel[c] = lakeSurface
			}
			// Clear waterLevel for basin cells NOT in the lake
			for (const cell of allCells) {
				if (!lakes[cell]) waterLevel[cell] = elevation[cell]
			}
		}
	}

	// ── 3. Threshold (top 5% of land flow) ──────────────────────────
	const landCount = processOrder.length
	const landFlows = new Float32Array(landCount)
	for (let i = 0; i < landCount; i++) landFlows[i] = flow[processOrder[i]]
	landFlows.sort()

	const landCoverage = landCount / N
	const majorRiverFraction = (() => {
		if (landCoverage <= 0.3) return 0.05
		if (landCoverage >= 0.9) return 0.01
		const t = (landCoverage - 0.3) / 0.6
		return 0.05 + (0.01 - 0.05) * t
	})()
	const thresholdIdx = Math.floor(landCount * (1 - majorRiverFraction))
	const threshold = landFlows[thresholdIdx] || 1

	// ── 4. Extract river polylines with per-vertex flow + elevation ──
	const riverCells = processOrder
		.filter((r) => flow[r] >= threshold)
		.sort((a, b) => elevation[b] - elevation[a])

	const traced = new Uint8Array(N)
	const visible = new Uint8Array(N)
	const lines: [number, number, number, number][][] = []
	const riverId = new Int32Array(N).fill(-1)
	const riverLengthKm = new Float32Array(N)
	const terminal = new Uint8Array(N)
	const terminalCoastal = new Uint8Array(N)
	const terminalInterior = new Uint8Array(N)
	const terminalSeen = new Int32Array(N)
	const riverSystemLengths: number[] = []
	let nextRiverId = 0
	let maxFlow = 0
	let terminalStamp = 1

	for (const start of riverCells) {
		if (traced[start]) continue
		const line: [number, number, number, number][] = []
		const lineCells: number[] = []
		let cur = start

		while (cur >= 0) {
			const x = r_xyz[3 * cur],
				y = r_xyz[3 * cur + 1],
				z = r_xyz[3 * cur + 2]
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
			if (land[next] && flow[next] < threshold) break
			if (!land[next]) {
				const ox = r_xyz[3 * next],
					oy = r_xyz[3 * next + 1],
					oz = r_xyz[3 * next + 2]
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
				const ox = r_xyz[3 * next],
					oy = r_xyz[3 * next + 1],
					oz = r_xyz[3 * next + 2]
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
			// Assign river ID: if this polyline merges into an already-IDed river,
			// adopt that river's ID (same river system). Otherwise assign a new one.
			const lastCell = lineCells[lineCells.length - 1]
			const id = riverId[lastCell] >= 0 ? riverId[lastCell] : nextRiverId++
			const lineLengthKm = polylineLengthKm(line, radiusKm)
			lines.push(line)
			riverSystemLengths[id] = (riverSystemLengths[id] ?? 0) + lineLengthKm
			for (const cell of lineCells) {
				if (land[cell]) visible[cell] = 1
				if (riverId[cell] < 0) riverId[cell] = id
			}
		}
	}

	for (let r = 0; r < N; r++) {
		const id = riverId[r]
		if (id >= 0) riverLengthKm[r] = riverSystemLengths[id] ?? 0
	}

	for (let r = 0; r < N; r++) {
		if (!visible[r]) continue
		const next = drainTarget[r]
		if (
			next >= 0 &&
			land[next] &&
			visible[next] &&
			riverId[next] === riverId[r]
		)
			continue

		let cur = next
		const stamp = terminalStamp++
		while (cur >= 0 && land[cur] && terminalSeen[cur] !== stamp) {
			terminalSeen[cur] = stamp
			if (lakes[cur] || basinId[cur] >= 0) {
				terminal[r] = 1
				terminalInterior[r] = 1
				break
			}
			cur = drainTarget[cur]
		}
		if (!terminal[r] && (cur < 0 || !land[cur])) {
			terminal[r] = 1
			terminalCoastal[r] = 1
		}
	}

	return {
		lines,
		maxFlow,
		minFlow: threshold,
		flow,
		flow_monthly,
		riverId,
		riverLengthKm,
		terminal,
		terminalCoastal,
		terminalInterior,
		visible,
		lakes,
		basinId,
		waterLevel,
	}
}
