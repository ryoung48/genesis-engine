import type {
	OrogenClimate,
	OrogenHydrology,
	OrogenParams,
	OrogenRainfall,
	OrogenRivers,
	SphereMesh,
} from ".."
import { smoothstep } from "../shared/math"
import { MinHeap } from "../shared/min-heap"

function polylineLengthKm(
	line: [number, number, number, number][],
	radiusKm: number,
): number {
	let sum = 0
	for (let i = 1; i < line.length; i++) {
		const [lon0, lat0] = line[i - 1]
		const [lon1, lat1] = line[i]
		const lam0 = (lon0 * Math.PI) / 180
		const phi0 = (lat0 * Math.PI) / 180
		const lam1 = (lon1 * Math.PI) / 180
		const phi1 = (lat1 * Math.PI) / 180
		const sin0 = Math.sin(phi0),
			cos0 = Math.cos(phi0)
		const sin1 = Math.sin(phi1),
			cos1 = Math.cos(phi1)
		const cosTheta = sin0 * sin1 + cos0 * cos1 * Math.cos(lam1 - lam0)
		sum += Math.acos(Math.max(-1, Math.min(1, cosTheta))) * radiusKm
	}
	return sum
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

	// ── 2b. Basin identification ─────────────────────────────────────
	// Label connected components where priority-flood water level > ground.
	// computeLakes (lakes.ts) uses basinId to determine lake cells after this returns.
	const basinId = new Int32Array(N).fill(-1)
	let nextBasin = 0

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

	const MIN_VISIBLE_RIVER_LENGTH_KM = 500

	// ── 4. Extract river polylines with per-vertex flow + elevation ──
	const riverCells: number[] = []
	for (let i = 0; i < landCount; i++) {
		const r = processOrder[i]
		if (flow[r] >= threshold) riverCells.push(r)
	}
	riverCells.sort((a, b) => elevation[b] - elevation[a])

	const traced = new Uint8Array(N)
	const visible = new Uint8Array(N)
	const lines: [number, number, number, number][][] = []
	const lineRiverIds: number[] = []
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
	const lineCells: number[] = []

	for (const start of riverCells) {
		if (traced[start]) continue
		const line: [number, number, number, number][] = []
		lineCells.length = 0
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
			lineRiverIds.push(id)
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

	// Filter: only show river systems >= MIN_VISIBLE_RIVER_LENGTH_KM
	for (let r = 0; r < N; r++) {
		if (visible[r] && riverLengthKm[r] < MIN_VISIBLE_RIVER_LENGTH_KM) {
			visible[r] = 0
		}
	}
	const visibleLines = lines.filter(
		(_, i) =>
			(riverSystemLengths[lineRiverIds[i]] ?? 0) >= MIN_VISIBLE_RIVER_LENGTH_KM,
	)

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
			if (basinId[cur] >= 0) {
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
		lines: visibleLines,
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
		basinId,
		waterLevel,
	}
}
