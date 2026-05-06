import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import type { HistoryView } from "../history/history-query"

interface HistoryChildrenIndex {
	childOffset: Int32Array
	childList: Int32Array
}

export interface DisplayNationModel {
	assignment: Int32Array
	counts: Map<number, number>
	colorById: Map<number, [number, number, number]>
	toActualId: (displayNationId: number) => number | null
	toDisplayId: (actualNationId: number) => number | null
}

export function buildSovereignRulerFields(params: {
	world: SerializedOrogenWorld | null | undefined
	fallbackLength?: number
}): {
	leaderDynasty: Int32Array
	leaderNameSeed: Int32Array
	leaderClaim: Int32Array
	leaderBirthYear: Float32Array
} {
	const { world, fallbackLength = 0 } = params
	const provinceCount =
		world?.provinces?.count ??
		world?.nations?.assignment.length ??
		fallbackLength
	const leaderDynasty = new Int32Array(provinceCount).fill(-1)
	const leaderNameSeed = new Int32Array(provinceCount).fill(-1)
	const leaderClaim = new Int32Array(provinceCount)
	const leaderBirthYear = new Float32Array(provinceCount).fill(-1)
	if (!world?.nations) {
		return {
			leaderDynasty,
			leaderNameSeed,
			leaderClaim,
			leaderBirthYear,
		}
	}

	for (let province = 0; province < provinceCount; province++) {
		const isSovereign =
			(world.nations.parent?.[province] ?? -1) < 0 &&
			(world.nations.sovereign?.[province] ?? -1) >= 0
		if (!isSovereign) continue
		leaderDynasty[province] = world.leaderDynasty?.[province] ?? -1
		leaderNameSeed[province] = world.leaderNameSeed?.[province] ?? -1
		leaderClaim[province] = world.leaderClaim?.[province] ?? 0
		leaderBirthYear[province] = world.leaderBirthYear?.[province] ?? -1
	}

	return {
		leaderDynasty,
		leaderNameSeed,
		leaderClaim,
		leaderBirthYear,
	}
}

function buildBaseNationColors(world: SerializedOrogenWorld): Float32Array {
	const provinceCount =
		world.provinces?.count ?? world.nations?.assignment.length ?? 0
	const colors = new Float32Array(provinceCount * 3)
	if (!world.nations) return colors

	const sovereignColorByProvince = new Map<number, [number, number, number]>()
	for (let nation = 0; nation < world.nations.seeds.length; nation++) {
		const sovereign = world.nations.seeds[nation]
		const source = nation * 3
		if (sovereign < 0 || source + 2 >= world.nations.colors.length) continue
		sovereignColorByProvince.set(sovereign, [
			world.nations.colors[source],
			world.nations.colors[source + 1],
			world.nations.colors[source + 2],
		])
	}

	for (let province = 0; province < provinceCount; province++) {
		const sovereign = world.nations.sovereign[province]
		const color = sovereignColorByProvince.get(sovereign)
		if (!color) continue
		const target = province * 3
		colors[target] = color[0]
		colors[target + 1] = color[1]
		colors[target + 2] = color[2]
	}

	return colors
}

export function buildNationAdjacency(
	provinceAssignment: Int32Array,
	world: SerializedOrogenWorld,
): { adjOffset: Int32Array; adjList: Int32Array } {
	const provinceCount = world.provinces?.count ?? provinceAssignment.length
	const neighborSets = new Map<number, Set<number>>()

	for (let province = 0; province < provinceAssignment.length; province++) {
		const nationId = provinceAssignment[province]
		if (nationId < 0) continue
		if (!neighborSets.has(nationId)) neighborSets.set(nationId, new Set())
		for (
			let edge = world.provinces.adjOffset[province];
			edge < world.provinces.adjOffset[province + 1];
			edge++
		) {
			const neighborNation = provinceAssignment[world.provinces.adjList[edge]]
			if (neighborNation < 0 || neighborNation === nationId) continue
			neighborSets.get(nationId)?.add(neighborNation)
		}
	}

	const adjOffset = new Int32Array(provinceCount + 1)
	let totalAdj = 0
	for (let province = 0; province < provinceCount; province++) {
		totalAdj += neighborSets.get(province)?.size ?? 0
		adjOffset[province + 1] = totalAdj
	}
	const adjList = new Int32Array(totalAdj)
	for (let province = 0; province < provinceCount; province++) {
		const neighbors = neighborSets.get(province)
		if (!neighbors) continue
		let writeIdx = adjOffset[province]
		for (const neighbor of neighbors) {
			adjList[writeIdx++] = neighbor
		}
	}

	return { adjOffset, adjList }
}

export function buildHistoryChildrenIndex(
	selectedHistoryView: HistoryView | null,
): HistoryChildrenIndex | null {
	if (!selectedHistoryView) return null
	if (selectedHistoryView.childOffset && selectedHistoryView.childList) {
		return {
			childOffset: selectedHistoryView.childOffset,
			childList: selectedHistoryView.childList,
		}
	}
	const parent = selectedHistoryView.parent
	const childOffset = new Int32Array(parent.length + 1)
	for (let province = 0; province < parent.length; province++) {
		const ancestor = parent[province]
		if (ancestor >= 0) childOffset[ancestor + 1]++
	}
	for (let province = 0; province < parent.length; province++) {
		childOffset[province + 1] += childOffset[province]
	}
	const childList = new Int32Array(childOffset[parent.length])
	const cursor = childOffset.slice()
	for (let province = 0; province < parent.length; province++) {
		const ancestor = parent[province]
		if (ancestor < 0) continue
		childList[cursor[ancestor]++] = province
	}
	selectedHistoryView.childOffset = childOffset
	selectedHistoryView.childList = childList
	return { childOffset, childList }
}

export function buildDisplayWorld(params: {
	world: SerializedOrogenWorld | null
	selectedHistoryView: HistoryView | null
	selectedHistoryChildren: HistoryChildrenIndex | null
}): SerializedOrogenWorld | null {
	const { world, selectedHistoryView, selectedHistoryChildren } = params
	if (!world) return null
	const base = world

	if (!base.nations || !base.provinces) return base

	if (!selectedHistoryView) {
		const sovereignRulerFields = buildSovereignRulerFields({ world: base })
		const assignment = base.nations.sovereign.slice()
		const size = new Int32Array(base.provinces.count)
		for (let province = 0; province < assignment.length; province++) {
			const sovereign = assignment[province]
			if (sovereign >= 0) size[sovereign] += 1
		}
		return {
			...base,
			leaderDynasty: sovereignRulerFields.leaderDynasty,
			leaderNameSeed: sovereignRulerFields.leaderNameSeed,
			leaderClaim: sovereignRulerFields.leaderClaim,
			leaderBirthYear: sovereignRulerFields.leaderBirthYear,
			nations: {
				...base.nations,
				assignment,
				colors: buildBaseNationColors(base),
				size,
			},
		}
	}

	return {
		...base,
		leaderDynasty: selectedHistoryView.leaderDynasty,
		leaderNameSeed: selectedHistoryView.leaderNameSeed,
		leaderClaim: selectedHistoryView.leaderClaim,
		leaderBirthYear: selectedHistoryView.leaderBirthYear,
		nations: {
			...base.nations,
			assignment: selectedHistoryView.assignment,
			parent: selectedHistoryView.parent,
			childOffset:
				selectedHistoryChildren?.childOffset ?? base.nations.childOffset,
			childList: selectedHistoryChildren?.childList ?? base.nations.childList,
			sovereign: selectedHistoryView.sovereign,
			colors: selectedHistoryView.colors,
		},
		population: base.population
			? {
					...base.population,
					population: selectedHistoryView.populationTotal,
				}
			: undefined,
		urbanPopulation: selectedHistoryView.populationUrban,
		development: selectedHistoryView.development,
	}
}

export function buildDisplayNationModel(
	world: SerializedOrogenWorld | null,
): DisplayNationModel | null {
	if (
		!world?.provinces ||
		!world.nations?.assignment ||
		!world.nations.colors
	) {
		return null
	}

	const counts = new Map<number, number>()
	const colorById = new Map<number, [number, number, number]>()
	for (let province = 0; province < world.provinces.count; province++) {
		const nationId = world.nations.assignment[province]
		if (nationId < 0) continue
		counts.set(nationId, (counts.get(nationId) ?? 0) + 1)
		if (!colorById.has(nationId)) {
			const colorIndex = province * 3
			if (colorIndex + 2 < world.nations.colors.length) {
				colorById.set(nationId, [
					world.nations.colors[colorIndex],
					world.nations.colors[colorIndex + 1],
					world.nations.colors[colorIndex + 2],
				])
			}
		}
	}

	return {
		assignment: world.nations.assignment,
		counts,
		colorById,
		toActualId: (displayNationId) =>
			counts.has(displayNationId) ? displayNationId : null,
		toDisplayId: (actualNationId) =>
			counts.has(actualNationId) ? actualNationId : null,
	}
}
