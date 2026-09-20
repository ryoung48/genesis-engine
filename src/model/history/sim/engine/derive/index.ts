import type {
	DerivedAtTimeParams,
	DerivedLookupParams,
	WealthCurrentParams,
} from "@/model/history/sim/engine/derive/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { HIERARCHY } from "@/model/society/hierarchy"

const TRIBUTE = 0.25

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

function isOverextended({ state, p }: DerivedLookupParams): boolean {
	let vassalSeats = 0
	for (const child of children({ state, p }))
		if (state.seatRank[child] > 0) vassalSeats++
	return HIERARCHY.isOverextended({ lordRank: state.seatRank[p], vassalSeats })
}

function gravity({ state, p, cache }: DerivedLookupParams): number {
	const cached = cache?.gravity?.get(p)
	if (cached !== undefined) return cached

	const members = children({ state, p })
	let value = state.habitability[p]
	for (const child of members) {
		value += gravity({ state, p: child, cache }) * TRIBUTE
	}
	if (isOverextended({ state, p })) value *= 0.9
	cache?.gravity?.set(p, value)
	return value
}

function wealthOptimal({ state, p, cache }: DerivedLookupParams): number {
	const cached = cache?.wealthOptimal?.get(p)
	if (cached !== undefined) return cached
	const value = gravity({ state, p, cache })
	cache?.wealthOptimal?.set(p, value)
	return value
}

function wealthCurrent({
	state,
	p,
	cache,
	exclude,
	freedom = false,
}: WealthCurrentParams): number {
	const key = `${p}:${exclude ?? -1}:${freedom ? 1 : 0}`
	const cached = cache?.wealthCurrent?.get(key)
	if (cached !== undefined) return cached

	let collected =
		state.habitability[p] - FIELDS.prov.consumption.get({ state, p })
	const directChildren = children({ state, p })
	for (const child of directChildren) {
		if (child === exclude) continue
		collected +=
			wealthCurrent({ state, p: child, cache, exclude, freedom }) * TRIBUTE
	}
	if (isOverextended({ state, p })) collected *= 0.9
	if (!freedom && FIELDS.prov.parent.get({ state, p }) >= 0)
		collected *= 1 - TRIBUTE

	cache?.wealthCurrent?.set(key, collected)
	return collected
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

	const neighborSets = new Map<number, Set<number>>()
	for (let p = 0; p < state.P; p++) {
		const a = sovereign({ state, p })
		if (state.desolate[p]) continue
		if (!neighborSets.has(a)) neighborSets.set(a, new Set())
		for (
			let i = state.provinceAdjOffset[p];
			i < state.provinceAdjOffset[p + 1];
			i++
		) {
			const b = sovereign({ state, p: state.provinceAdjList[i] })
			if (a !== b) neighborSets.get(a)?.add(b)
		}
	}

	const offset = new Int32Array(state.P + 1)
	let total = 0
	for (let p = 0; p < state.P; p++) {
		total += neighborSets.get(p)?.size ?? 0
		offset[p + 1] = total
	}
	const list = new Int32Array(total)
	for (let p = 0; p < state.P; p++) {
		let index = offset[p]
		for (const nb of neighborSets.get(p) ?? []) list[index++] = nb
	}

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
	wealthOptimal,
	wealthCurrent,
	nationAdjacency,
	provinceWars,
}
