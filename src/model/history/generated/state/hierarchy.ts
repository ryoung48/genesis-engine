import { DERIVE } from "@/model/history/generated/derive"
import { FIELDS } from "@/model/history/generated/fields"
import { isSovereign } from "@/model/history/generated/state/relations"
import type {
	GetChildrenParams,
	GetNationNeighborsParams,
	GetNationProvincesParams,
	GetProvinceNeighborsParams,
	RebuildAssignmentParams,
	ValidateLiveHierarchyParams,
	ValidateParentArrayParams,
} from "@/model/history/generated/state/types"

export function getChildren({ state, p }: GetChildrenParams): number[] {
	return DERIVE.children({ state, p, t: state.time })
}

export function getNationProvinces({
	state,
	root,
}: GetNationProvincesParams): number[] {
	const result = [root]
	const stack = [root]
	while (stack.length > 0) {
		const current = stack.pop()!
		for (const child of DERIVE.children({ state, p: current, t: state.time })) {
			result.push(child)
			stack.push(child)
		}
	}
	return result
}

export function getNationNeighbors({
	state,
	nation,
}: GetNationNeighborsParams): number[] {
	const adjacency = DERIVE.nationAdjacency({ state, t: state.time })
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

export function rebuildAssignment({
	state,
	time,
}: RebuildAssignmentParams): void {
	DERIVE.ensureHierarchyClean(state)
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const root = state.sovereignCurrent[p]
		FIELDS.prov.assignment.set({ state, p, time, value: root })
	}
}
