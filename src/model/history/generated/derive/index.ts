import type {
	CacheKeyParams,
	DerivedAtTimeParams,
	DerivedLookupParams,
	NationMemberCountParams,
	NationMembersParams,
	WealthCurrentParams,
} from "@/model/history/generated/derive/types"
import { FIELDS } from "@/model/history/generated/fields"
import type { HistoryState } from "@/model/history/generated/state/types"
import { HIERARCHY } from "@/model/society/hierarchy"

const TRIBUTE = 0.25

function cacheKey({ p, t }: CacheKeyParams): string {
	return `${p}@${t}`
}

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

function sovereign({
	state,
	p,
	t = state.time,
	cache,
}: DerivedLookupParams): number {
	if (t === state.time) {
		ensureHierarchyClean(state)
		const s = state.sovereignCurrent[p]
		return s >= 0 ? s : p
	}
	const key = cacheKey({ p, t })
	const cached = cache?.sovereign?.get(key)
	if (cached !== undefined) return cached

	let current = p
	let parent = FIELDS.prov.parent.get({ state, p: current, time: t })
	let steps = 0
	while (parent >= 0) {
		current = parent
		parent = FIELDS.prov.parent.get({ state, p: current, time: t })
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

function children({
	state,
	p,
	t = state.time,
	cache,
}: DerivedLookupParams): number[] {
	if (t === state.time) {
		ensureHierarchyClean(state)
		const start = state.childOffset[p]
		const end = state.childOffset[p + 1]
		const result: number[] = new Array(end - start)
		for (let i = start; i < end; i++) result[i - start] = state.childList[i]
		return result
	}
	const key = cacheKey({ p, t })
	const cached = cache?.children?.get(key)
	if (cached) return cached

	const result: number[] = []
	for (let i = 0; i < state.P; i++) {
		if (FIELDS.prov.parent.get({ state, p: i, time: t }) === p) result.push(i)
	}
	cache?.children?.set(key, result)
	return result
}

function gravity({
	state,
	p,
	t = state.time,
	cache,
}: DerivedLookupParams): number {
	const key = cacheKey({ p, t })
	const cached = cache?.gravity?.get(key)
	if (cached !== undefined) return cached

	const members = children({ state, p, t, cache })
	let value = state.habitability[p]
	for (const child of members) {
		value += gravity({ state, p: child, t, cache }) * TRIBUTE
	}
	const memberCount = nationMemberCount({ state, root: p, t })
	if (members.length > HIERARCHY.maxFanoutForNationSize(memberCount))
		value *= 0.9
	cache?.gravity?.set(key, value)
	return value
}

function nationMembers({
	state,
	root,
	t,
	cache,
}: NationMembersParams): number[] {
	const result = [root]
	const stack = [root]
	while (stack.length > 0) {
		const current = stack.pop()!
		for (const child of children({ state, p: current, t, cache })) {
			result.push(child)
			stack.push(child)
		}
	}
	return result
}

function nationMemberCount({
	state,
	root,
	t,
}: NationMemberCountParams): number {
	if (t !== state.time) return nationMembers({ state, root, t }).length
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

function wealthOptimal({
	state,
	p,
	t = state.time,
	cache,
}: DerivedLookupParams): number {
	const key = cacheKey({ p, t })
	const cached = cache?.wealthOptimal?.get(key)
	if (cached !== undefined) return cached
	const value = gravity({ state, p, t, cache })
	cache?.wealthOptimal?.set(key, value)
	return value
}

function wealthCurrent({
	state,
	p,
	t = state.time,
	cache,
	exclude,
	freedom = false,
}: WealthCurrentParams): number {
	const key = `${cacheKey({ p, t })}:${exclude ?? -1}:${freedom ? 1 : 0}`
	const cached = cache?.wealthCurrent?.get(key)
	if (cached !== undefined) return cached

	let collected =
		state.habitability[p] - FIELDS.prov.consumption.get({ state, p, time: t })
	const directChildren = children({ state, p, t, cache })
	for (const child of directChildren) {
		if (child === exclude) continue
		collected +=
			wealthCurrent({ state, p: child, t, cache, exclude, freedom }) * TRIBUTE
	}
	if (
		directChildren.length >
		HIERARCHY.maxFanoutForNationSize(nationMemberCount({ state, root: p, t }))
	)
		collected *= 0.9
	if (!freedom && FIELDS.prov.parent.get({ state, p, time: t }) >= 0)
		collected *= 1 - TRIBUTE

	cache?.wealthCurrent?.set(key, collected)
	return collected
}

function nationAdjacency({
	state,
	t = state.time,
	cache,
}: DerivedAtTimeParams): { offset: Int32Array; list: Int32Array } {
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
		const a = sovereign({ state, p, t, cache })
		if (state.desolate[p]) continue
		if (!neighborSets.has(a)) neighborSets.set(a, new Set())
		for (
			let i = state.provinceAdjOffset[p];
			i < state.provinceAdjOffset[p + 1];
			i++
		) {
			const b = sovereign({ state, p: state.provinceAdjList[i], t, cache })
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

function provinceWars({
	state,
	p,
	t = state.time,
	cache,
}: DerivedLookupParams): number[] {
	if (t === state.time) return state.provinceWars[p]
	const key = cacheKey({ p, t })
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

export const DERIVE = {
	ensureHierarchyClean,
	sovereign,
	children,
	wealthOptimal,
	wealthCurrent,
	nationAdjacency,
	provinceWars,
}
