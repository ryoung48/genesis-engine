import { maxFanoutForNationSize } from "../society/hierarchy"
import { PROV } from "./fields"
import { ensureHierarchyClean, type HistoryState } from "./state"

const TRIBUTE = 0.25

export interface DerivedCache {
	children?: Map<string, number[]>
	sovereign?: Map<string, number>
	gravity?: Map<string, number>
	wealthCurrent?: Map<string, number>
	wealthOptimal?: Map<string, number>
	nationAdjacency?: Map<number, { offset: Int32Array; list: Int32Array }>
	provinceWars?: Map<string, number[]>
}

function cacheKey(p: number, t: number): string {
	return `${p}@${t}`
}

export function sovereign(
	state: HistoryState,
	p: number,
	t = state.time,
	cache?: DerivedCache,
): number {
	if (t === state.time) {
		ensureHierarchyClean(state)
		const s = state.sovereignCurrent[p]
		return s >= 0 ? s : p
	}
	const key = cacheKey(p, t)
	const cached = cache?.sovereign?.get(key)
	if (cached !== undefined) return cached

	let current = p
	let parent = PROV.parent.get(state, current, t)
	let steps = 0
	while (parent >= 0) {
		current = parent
		parent = PROV.parent.get(state, current, t)
		steps++
		if (steps > state.P) {
			throw new Error(
				`Parent cycle detected while resolving sovereign for province ${p} at time ${t}, stuck at ${current}`,
			)
		}
	}

	cache?.sovereign?.set(key, current)
	return current
}

export function children(
	state: HistoryState,
	p: number,
	t = state.time,
	cache?: DerivedCache,
): number[] {
	if (t === state.time) {
		ensureHierarchyClean(state)
		const start = state.childOffset[p]
		const end = state.childOffset[p + 1]
		const result: number[] = new Array(end - start)
		for (let i = start; i < end; i++) result[i - start] = state.childList[i]
		return result
	}
	const key = cacheKey(p, t)
	const cached = cache?.children?.get(key)
	if (cached) return cached

	const result: number[] = []
	for (let i = 0; i < state.P; i++) {
		if (PROV.parent.get(state, i, t) === p) result.push(i)
	}
	cache?.children?.set(key, result)
	return result
}

function gravity(
	state: HistoryState,
	p: number,
	t = state.time,
	cache?: DerivedCache,
): number {
	const key = cacheKey(p, t)
	const cached = cache?.gravity?.get(key)
	if (cached !== undefined) return cached

	const members = children(state, p, t, cache)
	let value = state.habitability[p]
	for (const child of members) {
		value += gravity(state, child, t, cache) * TRIBUTE
	}
	const memberCount = nationMemberCount(state, p, t)
	if (members.length > maxFanoutForNationSize(memberCount)) value *= 0.9
	cache?.gravity?.set(key, value)
	return value
}

function nationMembers(
	state: HistoryState,
	root: number,
	t: number,
	cache?: DerivedCache,
): number[] {
	const result = [root]
	const stack = [root]
	while (stack.length > 0) {
		const current = stack.pop()!
		for (const child of children(state, current, t, cache)) {
			result.push(child)
			stack.push(child)
		}
	}
	return result
}

/** Count nation members without allocating result array. Uses live CSR at current time. */
function nationMemberCount(
	state: HistoryState,
	root: number,
	t: number,
): number {
	if (t !== state.time) return nationMembers(state, root, t).length
	let count = 1
	const stack: number[] = [root]
	while (stack.length > 0) {
		const current = stack.pop() as number
		const start = state.childOffset[current]
		const end = state.childOffset[current + 1]
		count += end - start
		for (let i = start; i < end; i++) stack.push(state.childList[i])
	}
	return count
}

export function wealthOptimal(
	state: HistoryState,
	p: number,
	t = state.time,
	cache?: DerivedCache,
): number {
	const key = cacheKey(p, t)
	const cached = cache?.wealthOptimal?.get(key)
	if (cached !== undefined) return cached
	const value = gravity(state, p, t, cache)
	cache?.wealthOptimal?.set(key, value)
	return value
}

export function wealthCurrent(
	state: HistoryState,
	p: number,
	t = state.time,
	cache?: DerivedCache,
	exclude?: number,
	freedom = false,
): number {
	const key = `${cacheKey(p, t)}:${exclude ?? -1}:${freedom ? 1 : 0}`
	const cached = cache?.wealthCurrent?.get(key)
	if (cached !== undefined) return cached

	let collected = state.habitability[p] - PROV.consumption.get(state, p, t)
	const directChildren = children(state, p, t, cache)
	for (const child of directChildren) {
		if (child === exclude) continue
		collected += wealthCurrent(state, child, t, cache, exclude) * TRIBUTE
	}
	if (
		directChildren.length >
		maxFanoutForNationSize(nationMemberCount(state, p, t))
	)
		collected *= 0.9
	if (!freedom && PROV.parent.get(state, p, t) >= 0) collected *= 1 - TRIBUTE

	cache?.wealthCurrent?.set(key, collected)
	return collected
}

export function nationAdjacency(
	state: HistoryState,
	t = state.time,
	cache?: DerivedCache,
): { offset: Int32Array; list: Int32Array } {
	if (t === state.time) {
		ensureHierarchyClean(state)
		if (
			state._nationAdjCache &&
			state._nationAdjCacheVersion === state.hierarchyVersion
		) {
			return state._nationAdjCache
		}
	}
	const cached = cache?.nationAdjacency?.get(t)
	if (cached) return cached

	const neighborSets = new Map<number, Set<number>>()
	for (let p = 0; p < state.P; p++) {
		const a = sovereign(state, p, t, cache)
		if (state.desolate[p]) continue
		if (!neighborSets.has(a)) neighborSets.set(a, new Set())
		for (
			let i = state.provinceAdjOffset[p];
			i < state.provinceAdjOffset[p + 1];
			i++
		) {
			const b = sovereign(state, state.provinceAdjList[i], t, cache)
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
	cache?.nationAdjacency?.set(t, value)
	if (t === state.time) {
		state._nationAdjCache = value
		state._nationAdjCacheVersion = state.hierarchyVersion
	}
	return value
}

export function provinceWars(
	state: HistoryState,
	p: number,
	t = state.time,
	cache?: DerivedCache,
): number[] {
	if (t === state.time) return state.provinceWars[p]
	const key = cacheKey(p, t)
	const cached = cache?.provinceWars?.get(key)
	if (cached) return cached
	const result = state.wars
		.filter((war) => {
			const active =
				war.startTime <= t && (war.endTime ?? Number.POSITIVE_INFINITY) > t
			return active && (war.attacker === p || war.defender === p)
		})
		.map((war) => war.idx)
	cache?.provinceWars?.set(key, result)
	return result
}
