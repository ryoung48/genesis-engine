import type {
	DerivedAtTimeParams,
	DerivedLookupParams,
} from "@/model/history/sim/engine/derive/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

function ensureHierarchyClean(state: HistoryState): void {
	if (!state.hierarchyDirty) return
	const P = state.P
	const parent = state.parentCurrent
	const counts = new Int32Array(P)
	for (let p = 0; p < P; p++) {
		const par = parent[p]
		if (par >= 0) counts[par]++
	}
	const offset = new Int32Array(P + 1)
	for (let p = 0; p < P; p++) offset[p + 1] = offset[p] + counts[p]
	const list = new Int32Array(offset[P])
	const cursor = new Int32Array(P)
	for (let p = 0; p < P; p++) {
		const par = parent[p]
		if (par >= 0) list[offset[par] + cursor[par]++] = p
	}
	state.childOffset = offset
	state.childList = list

	const sov = state.sovereignCurrent
	for (let p = 0; p < P; p++) sov[p] = -1
	for (let p = 0; p < P; p++) {
		if (state.stateless[p]) continue
		if (sov[p] !== -1) continue
		let cur = p
		let steps = 0
		while (parent[cur] >= 0 && sov[cur] === -1) {
			cur = parent[cur]
			steps++
			if (steps > P) {
				throw new Error(
					`Parent cycle detected while rebuilding hierarchy from province ${p}, stuck at ${cur}`,
				)
			}
		}
		const root = sov[cur] !== -1 ? sov[cur] : cur
		let walk = p
		steps = 0
		while (walk !== root && sov[walk] === -1) {
			sov[walk] = root
			walk = parent[walk]
			steps++
			if (steps > P) {
				throw new Error(
					`Parent cycle detected while assigning sovereign for province ${p}, stuck at ${walk}`,
				)
			}
			if (walk < 0) break
		}
		sov[p] = root
	}
	state.hierarchyDirty = false
	state.hierarchyVersion++
}

function sovereign({ state, p }: DerivedLookupParams): number {
	ensureHierarchyClean(state)
	const s = state.sovereignCurrent[p]
	return s >= 0 ? s : p
}

function children({ state, p }: DerivedLookupParams): number[] {
	ensureHierarchyClean(state)
	const start = state.childOffset[p]
	const end = state.childOffset[p + 1]
	const result: number[] = new Array(end - start)
	for (let i = start; i < end; i++) result[i - start] = state.childList[i]
	return result
}

function nationAdjacency({ state }: DerivedAtTimeParams): {
	offset: Int32Array
	list: Int32Array
} {
	ensureHierarchyClean(state)
	if (
		state._nationAdjCache &&
		state._nationAdjCacheVersion === state.hierarchyVersion
	) {
		return state._nationAdjCache
	}

	const P = state.P
	const sov = state.sovereignCurrent
	const desolate = state.desolate
	const adjOffset = state.provinceAdjOffset
	const adjList = state.provinceAdjList
	const memberOffset = new Int32Array(P + 1)
	for (let p = 0; p < P; p++)
		if (!desolate[p]) memberOffset[(sov[p] >= 0 ? sov[p] : p) + 1]++
	for (let p = 0; p < P; p++) memberOffset[p + 1] += memberOffset[p]
	const members = new Int32Array(memberOffset[P])
	const cursor = memberOffset.slice(0, P)
	for (let p = 0; p < P; p++)
		if (!desolate[p]) members[cursor[sov[p] >= 0 ? sov[p] : p]++] = p

	const offset = new Int32Array(P + 1)
	const found = new Int32Array(adjList.length)
	const seenBy = new Int32Array(P).fill(-1)
	let total = 0
	for (let a = 0; a < P; a++) {
		for (let m = memberOffset[a]; m < memberOffset[a + 1]; m++) {
			const p = members[m]
			for (let i = adjOffset[p]; i < adjOffset[p + 1]; i++) {
				const neighbor = adjList[i]
				if (desolate[neighbor]) continue
				const b = sov[neighbor] >= 0 ? sov[neighbor] : neighbor
				if (a === b || seenBy[b] === a) continue
				seenBy[b] = a
				found[total++] = b
			}
		}
		offset[a + 1] = total
	}
	const list = found.slice(0, total)

	const value = { offset, list }
	state._nationAdjCache = value
	state._nationAdjCacheVersion = state.hierarchyVersion
	return value
}

function provinceWars({ state, p }: DerivedLookupParams): number[] {
	return state.provinceWars[p]
}

export const DERIVE = {
	ensureHierarchyClean,
	sovereign,
	children,
	nationAdjacency,
	provinceWars,
}
