import type {
	AffiliationParams,
	RealmTransition,
	ResolveAffiliationParams,
	TerritorialChange,
	TerritorialRootParams,
	TerritoryNode,
	TransitionParams,
} from "@/model/history/record/people/query/affiliation/types"

function rootOf({
	province,
	cache,
	origin,
	nodeOf,
	identityOf,
}: TerritorialRootParams): number {
	const seen = new Set<number>()
	let location = province
	let realm = -1
	while (location >= 0 && !seen.has(location)) {
		const cached = cache?.get(location)
		if (cached !== undefined) {
			realm = cached
			break
		}
		seen.add(location)
		const node = nodeOf(location)
		if (!node) break
		if (node.parent >= 0) location = node.parent
		else {
			realm =
				node.owner < 0
					? -1
					: origin === "procedural"
						? identityOf(location)
						: node.owner
			break
		}
	}
	if (cache) for (const location of seen) cache.set(location, realm)
	return realm
}

function resolve({
	record,
	province,
	timeMs,
	inclusive,
}: ResolveAffiliationParams): number {
	if (timeMs < record.minTimeMs || (!inclusive && timeMs === record.minTimeMs))
		return -1
	return rootOf({
		province,
		cache: null,
		origin: record.origin,
		identityOf: (location) =>
			record.events.nationEvents.findIndex(
				(nation) => nation?.base.capitalProvinceId === location,
			),
		nodeOf: (location) => {
			const log = record.events.provinceEvents.get(location)
			if (!log) return undefined
			let owner = log.base.ownerId
			let parent = log.base.parentId
			for (const event of log.events) {
				if (event.timeMs > timeMs || (!inclusive && event.timeMs === timeMs))
					continue
				if (event.kind === "owner")
					owner = (event.payload.nationId as number | null) ?? -1
				if (event.kind === "parent")
					parent = (event.payload.parentId as number | null) ?? -1
			}
			return { owner, parent }
		},
	})
}

function at(params: AffiliationParams): number {
	return resolve({ ...params, inclusive: true })
}

function transitions({
	record,
}: TransitionParams): Map<number, RealmTransition[]> {
	const nodes = new Map<number, TerritoryNode>()
	const identities = new Map(
		record.events.nationEvents.flatMap((nation, id) =>
			nation ? [[nation.base.capitalProvinceId, id] as const] : [],
		),
	)
	const children = new Map<number, Set<number>>()
	const changes: TerritorialChange[] = []
	const timelines = new Map<number, RealmTransition[]>()
	const roots = new Map<number, number>()
	const linkOf = (province: number) => {
		const node = nodes.get(province)
		return node?.parent ?? -1
	}
	const realmOf = (province: number) =>
		rootOf({
			province,
			cache: roots,
			origin: record.origin,
			nodeOf: (location) => nodes.get(location),
			identityOf: (location) => identities.get(location) ?? -1,
		})
	const descendants = (sources: number[]) => {
		const found = new Set<number>()
		const pending = [...sources]
		while (pending.length > 0) {
			const province = pending.pop() as number
			if (found.has(province)) continue
			found.add(province)
			pending.push(...(children.get(province) ?? []))
		}
		return found
	}
	for (const [province, log] of record.events.provinceEvents) {
		nodes.set(province, { owner: log.base.ownerId, parent: log.base.parentId })
		for (const event of log.events)
			if (event.kind === "parent" || event.kind === "owner")
				changes.push({
					province,
					timeMs: event.timeMs,
					kind: event.kind,
					value:
						(event.payload[event.kind === "parent" ? "parentId" : "nationId"] as
							| number
							| null) ?? -1,
				})
	}
	for (const province of nodes.keys()) {
		const link = linkOf(province)
		if (link < 0) continue
		const members = children.get(link) ?? new Set<number>()
		members.add(province)
		children.set(link, members)
	}
	changes.sort((a, b) => a.timeMs - b.timeMs)
	for (let index = 0; index < changes.length; ) {
		const timeMs = changes[index].timeMs
		const group: TerritorialChange[] = []
		while (index < changes.length && changes[index].timeMs === timeMs)
			group.push(changes[index++])
		if (timeMs > record.maxTimeMs) break
		const sources = group.map((change) => change.province)
		const before = new Map(
			[...descendants(sources)].map((province) => [
				province,
				realmOf(province),
			]),
		)
		roots.clear()
		for (const change of group) {
			const node = nodes.get(change.province)
			if (!node) continue
			children.get(linkOf(change.province))?.delete(change.province)
			node[change.kind] = change.value
			const link = linkOf(change.province)
			if (link >= 0) {
				const members = children.get(link) ?? new Set<number>()
				members.add(change.province)
				children.set(link, members)
			}
		}
		if (timeMs <= record.minTimeMs) continue
		for (const province of descendants(sources)) {
			const previous = before.get(province) ?? -1
			const after = realmOf(province)
			if (previous === after) continue
			const rows = timelines.get(province) ?? []
			rows.push({ timeMs, before: previous, after })
			timelines.set(province, rows)
		}
		roots.clear()
	}
	return timelines
}

export const AFFILIATION = { at, transitions }
