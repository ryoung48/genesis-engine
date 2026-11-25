import type {
	BasinLayout,
	BasinLayoutParams,
	BasinOutletsParams,
	BasinVerdict,
	BasinVerdictParams,
	BasinWaterBody,
	EvaporationDeficitParams,
	WaterBodiesParams,
} from "@/model/geography/terrain/endorheic/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG
const MONTHS = 12
const MM_PER_M = 1000

function layout({ basinId, elevation }: BasinLayoutParams): BasinLayout {
	let count = 0
	for (let r = 0; r < basinId.length; r++)
		if (basinId[r] >= count) count = basinId[r] + 1
	const cells: number[][] = Array.from({ length: count }, (): number[] => [])
	const lowest = new Int32Array(count).fill(-1)
	for (let r = 0; r < basinId.length; r++) {
		const bid = basinId[r]
		if (bid < 0) continue
		cells[bid].push(r)
		if (lowest[bid] < 0 || elevation[r] < elevation[lowest[bid]])
			lowest[bid] = r
	}
	return { cells, lowest }
}

function outlets({
	basinId,
	drainTarget,
	basinCount,
}: BasinOutletsParams): number[][] {
	const out: number[][] = Array.from({ length: basinCount }, (): number[] => [])
	for (let r = 0; r < basinId.length; r++) {
		const bid = basinId[r]
		if (bid < 0) continue
		const target = drainTarget[r]
		if (target < 0 || basinId[target] !== bid) out[bid].push(r)
	}
	return out
}

function evaporationDeficit({
	petMonthly,
	rainfallAnnual,
	numRegions,
}: EvaporationDeficitParams): Float32Array {
	const deficit = new Float32Array(numRegions)
	for (let r = 0; r < numRegions; r++) {
		let pet = 0
		for (let m = 0; m < MONTHS; m++) pet += petMonthly[m * numRegions + r]
		deficit[r] = Math.max(0, C.lakeEvapShare * pet - rainfallAnnual[r])
	}
	return deficit
}

function evaporationM3s({
	deficitMm,
	areaM2,
	secondsPerYear,
	region,
}: {
	deficitMm: Float32Array
	areaM2: Float64Array
	secondsPerYear: number
	region: number
}): number {
	return (areaM2[region] * deficitMm[region]) / MM_PER_M / secondsPerYear
}

function verdict({
	inflowM3s,
	cells,
	deficitMm,
	areaM2,
	secondsPerYear,
}: BasinVerdictParams): BasinVerdict {
	let evaporation = 0
	for (const region of cells)
		evaporation += evaporationM3s({ deficitMm, areaM2, secondsPerYear, region })
	return { terminal: inflowM3s < evaporation, evaporationM3s: evaporation }
}

function waterBodies({
	mesh,
	elevation,
	layout: basins,
	terminal,
	inflowM3s,
	sill,
	deficitMm,
	areaM2,
	secondsPerYear,
	floorFraction,
}: WaterBodiesParams): BasinWaterBody[] {
	const { adjOffset, adjList } = mesh
	const stamp = new Int32Array(mesh.numRegions).fill(-1)
	const queued = new Int32Array(mesh.numRegions).fill(-1)
	const out: BasinWaterBody[] = basins.cells.map(
		(): BasinWaterBody => ({ lake: [], pan: [] }),
	)

	for (let bid = 0; bid < basins.cells.length; bid++) {
		if (!terminal[bid]) continue
		const cells = basins.cells[bid]
		const lowest = basins.lowest[bid]
		for (const cell of cells) stamp[cell] = bid

		const frontier: number[] = [lowest]
		queued[lowest] = bid
		const grown: number[] = []
		let used = 0
		while (frontier.length > 0) {
			let best = 0
			for (let i = 1; i < frontier.length; i++) {
				const a = frontier[i]
				const b = frontier[best]
				if (
					elevation[a] < elevation[b] ||
					(elevation[a] === elevation[b] && a < b)
				)
					best = i
			}
			const region = frontier[best]
			const cost = evaporationM3s({ deficitMm, areaM2, secondsPerYear, region })
			if (used + cost > inflowM3s[bid]) break
			used += cost
			grown.push(region)
			frontier.splice(best, 1)
			for (let j = adjOffset[region]; j < adjOffset[region + 1]; j++) {
				const nb = adjList[j]
				if (stamp[nb] !== bid || queued[nb] === bid) continue
				queued[nb] = bid
				frontier.push(nb)
			}
		}
		const lake = grown.length >= C.saltMinRegions ? grown : []

		const floor =
			elevation[lowest] + floorFraction * (sill[bid] - elevation[lowest])
		const inLake = new Set(lake)
		const seen = new Set<number>([lowest])
		const stack = [lowest]
		const pan: number[] = []
		while (stack.length > 0) {
			const region = stack.pop() as number
			if (!inLake.has(region)) pan.push(region)
			for (let j = adjOffset[region]; j < adjOffset[region + 1]; j++) {
				const nb = adjList[j]
				if (stamp[nb] !== bid || seen.has(nb) || elevation[nb] > floor) continue
				seen.add(nb)
				stack.push(nb)
			}
		}
		pan.sort((a, b) => a - b)
		out[bid] = { lake, pan }
	}
	return out
}

export const ENDORHEIC = {
	layout,
	outlets,
	evaporationDeficit,
	verdict,
	waterBodies,
}
