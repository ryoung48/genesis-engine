import type { SerializedGenesisWorld } from "@/model/transport"

export interface DisplayNationModel {
	assignment: Int32Array
	counts: Map<number, number>
	colorById: Map<number, [number, number, number]>
	toActualId: (displayNationId: number) => number | null
	toDisplayId: (actualNationId: number) => number | null
}

function buildBaseNationColors(world: SerializedGenesisWorld): Float32Array {
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
	world: SerializedGenesisWorld,
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

export function buildDisplayWorld(params: {
	world: SerializedGenesisWorld | null
}): SerializedGenesisWorld | null {
	const { world } = params
	if (!world) return null
	const base = world

	if (!base.nations || !base.provinces) return base

	// `assignment` and `colors` are province-indexed for display: each province
	// carries its sovereign's province index and that sovereign's color.
	//
	// `size` is deliberately NOT rebuilt here. It is nation-indexed
	// (GenesisPartition.size, length nations.count) and nation-label-overlay's
	// nationProvinceCount reads size[nationIdx] as the label scale input,
	// keyed by position in nations.seeds. Writing a province-indexed count
	// array over it scales every label by an unrelated nation's province
	// count -- and because those values are usually positive, the
	// assignment-scan fallback never kicks in to correct it.
	return {
		...base,
		nations: {
			...base.nations,
			assignment: base.nations.sovereign.slice(),
			colors: buildBaseNationColors(base),
		},
	}
}

export function buildDisplayNationModel(
	world: SerializedGenesisWorld | null,
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
