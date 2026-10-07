import { DERIVE } from "@/model/history/sim/engine/derive"
import { isSovereign } from "@/model/history/sim/engine/state/relations"
import type {
	GetChildrenParams,
	GetNationNeighborsParams,
	GetNationProvincesParams,
	GetProvinceNeighborsParams,
	OccupiedLandParams,
	RebuildAssignmentParams,
	ValidateLiveHierarchyParams,
	ValidateParentArrayParams,
} from "@/model/history/sim/engine/state/types"

export function getChildren({ state, p }: GetChildrenParams): number[] {
	return DERIVE.children({ state, p })
}

export function getNationProvinces({
	state,
	root,
}: GetNationProvincesParams): number[] {
	DERIVE.ensureHierarchyClean(state)
	const result = [root]
	const stack = [root]
	while (stack.length > 0) {
		const current = stack.pop()!
		for (
			let i = state.childOffset[current];
			i < state.childOffset[current + 1];
			i++
		) {
			const child = state.childList[i]
			result.push(child)
			stack.push(child)
		}
	}
	return result
}

// A marked province counts for the war its mark names; an unmarked one follows
// its parent, except under the defender's root, which covers only itself.
export function occupiedLand({ state, war }: OccupiedLandParams): number[] {
	if (!war.occupied.some((p) => state.occupationCurrent[p] === war.idx))
		return []
	DERIVE.ensureHierarchyClean(state)
	const root = war.defender
	const result: number[] = []
	if (state.occupationCurrent[root] === war.idx) result.push(root)
	const stack = [root]
	const covered = [false]
	while (stack.length > 0) {
		const current = stack.pop()!
		const parentCovered = covered.pop()!
		for (
			let i = state.childOffset[current];
			i < state.childOffset[current + 1];
			i++
		) {
			const child = state.childList[i]
			const mark = state.occupationCurrent[child]
			const held = mark >= 0 ? mark === war.idx : parentCovered
			if (held) result.push(child)
			stack.push(child)
			covered.push(held)
		}
	}
	return result
}

export function getNationPopulation({
	state,
	root,
}: GetNationProvincesParams): number {
	let total = 0
	for (const p of getNationProvinces({ state, root }))
		total += state.popRuralCurrent[p] + state.popUrbanCurrent[p]
	return total
}

export function getNationNeighbors({
	state,
	nation,
}: GetNationNeighborsParams): number[] {
	const adjacency = DERIVE.nationAdjacency({ state })
	const result: number[] = []
	for (
		let i = adjacency.offset[nation];
		i < adjacency.offset[nation + 1];
		i++
	) {
		const nb = adjacency.list[i]
		if (nb !== nation && isSovereign({ state, p: nb })) result.push(nb)
	}
	return result
}

export function getProvinceNeighbors({
	state,
	p,
}: GetProvinceNeighborsParams): number[] {
	const result: number[] = []
	for (
		let i = state.provinceAdjOffset[p];
		i < state.provinceAdjOffset[p + 1];
		i++
	) {
		result.push(state.provinceAdjList[i])
	}
	return result
}

function validateParentArray({
	parent,
	provinceCount,
	context,
}: ValidateParentArrayParams): void {
	for (let p = 0; p < provinceCount; p++) {
		let current = p
		let steps = 0
		while (current >= 0) {
			current = parent[current]
			steps++
			if (steps > provinceCount) {
				throw new Error(
					`Parent cycle detected in ${context} while validating province ${p}, stuck at ${current}`,
				)
			}
		}
	}
}

export function validateLiveHierarchy({
	state,
	context,
}: ValidateLiveHierarchyParams): void {
	validateParentArray({
		parent: state.parentCurrent,
		provinceCount: state.P,
		context,
	})
}

export function rebuildAssignment({ state }: RebuildAssignmentParams): void {
	DERIVE.ensureHierarchyClean(state)
	const { desolate, sovereignCurrent, assignmentCurrent } = state
	for (let p = 0; p < state.P; p++)
		if (!desolate[p]) assignmentCurrent[p] = sovereignCurrent[p]
}
