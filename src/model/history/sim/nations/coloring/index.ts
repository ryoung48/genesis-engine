import { GRAPH_PARTITION } from "@/model/history/sim/graph-partition"
import type {
	ColorDistanceParams,
	GroupByNationParams,
	NationColorForParams,
	NationColorsFromProvincesParams,
} from "@/model/history/sim/nations/coloring/types"

function groupByNation({
	assignment,
	nationCount,
	provinceCount,
}: GroupByNationParams): number[][] {
	const members: number[][] = new Array(nationCount)
	for (let i = 0; i < nationCount; i++) members[i] = []
	for (let province = 0; province < provinceCount; province++) {
		const nation = assignment[province]
		if (nation >= 0) members[nation].push(province)
	}
	return members
}

function nationColorsFromProvinces(
	params: NationColorsFromProvincesParams,
): Float32Array {
	const { nationCount, seeds, provinceColors, adjOffset, adjList } = params
	const colors = new Float32Array(nationCount * 3)
	if (nationCount === 0) return colors

	const baseColors = new Array<[number, number, number]>(nationCount)
	for (let nation = 0; nation < nationCount; nation++) {
		const province = seeds[nation]
		baseColors[nation] = [
			provinceColors[3 * province],
			provinceColors[3 * province + 1],
			provinceColors[3 * province + 2],
		]
	}

	const order = Array.from({ length: nationCount }, (_, nation) => nation).sort(
		(a, b) => {
			const degreeDelta =
				adjOffset[b + 1] - adjOffset[b] - (adjOffset[a + 1] - adjOffset[a])
			if (degreeDelta !== 0) return degreeDelta
			return a - b
		},
	)
	const assigned = new Uint8Array(nationCount)

	for (const nation of order) {
		const neighborColors: [number, number, number][] = []
		for (
			let edge = adjOffset[nation], end = adjOffset[nation + 1];
			edge < end;
			edge++
		) {
			const neighbor = adjList[edge]
			if (!assigned[neighbor]) continue
			neighborColors.push([
				colors[3 * neighbor],
				colors[3 * neighbor + 1],
				colors[3 * neighbor + 2],
			])
		}
		const bestColor = nationColorFor({
			baseColor: baseColors[nation],
			neighborColors,
		})
		colors[3 * nation] = bestColor[0]
		colors[3 * nation + 1] = bestColor[1]
		colors[3 * nation + 2] = bestColor[2]
		const province = seeds[nation]
		provinceColors[3 * province] = bestColor[0]
		provinceColors[3 * province + 1] = bestColor[1]
		provinceColors[3 * province + 2] = bestColor[2]
		assigned[nation] = 1
	}

	return colors
}

function nationColorFor({
	baseColor,
	neighborColors,
}: NationColorForParams): [number, number, number] {
	const candidates = buildNationColorCandidates(baseColor)
	let bestColor = baseColor
	let bestScore = -Infinity
	for (const candidate of candidates) {
		let neighborPenalty = 0
		let minNeighborDistance = Infinity
		for (const neighborColor of neighborColors) {
			const distance = colorDistance({ a: candidate, b: neighborColor })
			minNeighborDistance = Math.min(minNeighborDistance, distance)
			if (distance < 0.32) neighborPenalty += (0.32 - distance) * 4
		}
		const baseDistance = colorDistance({ a: candidate, b: baseColor })
		const score =
			(minNeighborDistance === Infinity ? 0.6 : minNeighborDistance * 3) -
			baseDistance * 0.9 -
			neighborPenalty
		if (score > bestScore) {
			bestScore = score
			bestColor = candidate
		}
	}
	return bestColor
}

function buildNationColorCandidates(
	baseColor: [number, number, number],
): [number, number, number][] {
	const [baseHue, baseSat, baseLight] = GRAPH_PARTITION.rgbToHsl({
		r: baseColor[0],
		g: baseColor[1],
		b: baseColor[2],
	})
	const hueOffsets = [0, -0.08, 0.08, -0.16, 0.16, 0.32, 0.5]
	const satOffsets = [0, 0.08, -0.06]
	const lightOffsets = [0, -0.08, 0.06]
	const candidates: [number, number, number][] = []
	for (const hueOffset of hueOffsets) {
		for (const satOffset of satOffsets) {
			for (const lightOffset of lightOffsets) {
				const hue = (baseHue + hueOffset + 1) % 1
				const sat = GRAPH_PARTITION.clamp01(baseSat + satOffset)
				const light = GRAPH_PARTITION.clamp01(baseLight + lightOffset)
				candidates.push(
					GRAPH_PARTITION.hslToRgb({ h: hue * 360, s: sat, l: light }),
				)
			}
		}
	}
	return candidates
}

function colorDistance({ a, b }: ColorDistanceParams): number {
	const dr = a[0] - b[0]
	const dg = a[1] - b[1]
	const db = a[2] - b[2]
	return Math.sqrt(dr * dr + dg * dg + db * db)
}

export const COLORING = {
	groupByNation,
	nationColorsFromProvinces,
	nationColorFor,
}
