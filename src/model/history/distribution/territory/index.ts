import { DISTRIBUTION_TARGETS } from "@/model/history/distribution/targets"
import type {
	ConnectedParams,
	Country,
	CountryParams,
	CutMembersParams,
	EnclosureParams,
	InitializeTerritoryParams,
	PlacementParams,
	PlacementResult,
	SplitParams,
	Territory,
	TerritoryCuts,
	TerritoryParams,
	TransferParams,
	ValidationResult,
} from "@/model/history/distribution/territory/types"
import { GRAPH_PARTITION } from "@/model/history/sim/graph-partition"
import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { RNG } from "@/model/shared/random/rng"
import { HIERARCHY } from "@/model/society/hierarchy"

function place(params: PlacementParams): PlacementResult {
	const { provinces } = params
	const active = Uint8Array.from(provinces.desolate, (value) => (value ? 0 : 1))
	const empty = new Int32Array(provinces.count).fill(-1)
	const components = PLACEMENT.buildOpenComponents({
		active,
		assignment: empty,
		adjOffset: provinces.adjOffset,
		adjList: provinces.adjList,
	})
	const projection = DISTRIBUTION_TARGETS.project({
		capacities: components.sizes,
		year: 2,
	})
	const targets: number[] = [],
		targetComponents: number[] = []
	projection.components.forEach((component, cid) => {
		for (const size of [...component.sizes].sort((a, b) => b - a)) {
			targets.push(size)
			targetComponents.push(cid)
		}
	})
	const placed = PLACEMENT.placeCountries({
		...params,
		active,
		maxSpreadRad: Math.PI,
		targets,
		policy: {
			kind: "distribution",
			ceiling: projection.raw.ceiling,
			componentId: components.componentId,
			targetComponents,
			residualSizes: ({ capacity }) =>
				DISTRIBUTION_TARGETS.projectComponent({
					capacity,
					profile: projection.raw,
				}).sizes,
		},
	})
	const parent = new Int32Array(provinces.count).fill(-1)
	const children = HIERARCHY.buildChildrenCSR({
		parent,
		provinceCount: provinces.count,
	})
	const sovereign = Int32Array.from(placed.assignment, (id) =>
		id < 0 ? -1 : placed.seeds[id],
	)
	return {
		projection,
		nations: {
			assignment: placed.assignment,
			seeds: Int32Array.from(placed.seeds),
			languageSeeds: Int32Array.from(placed.seeds),
			nameSeeds: Int32Array.from(placed.seeds),
			count: placed.seeds.length,
			size: Int32Array.from(placed.sizes),
			colors: placed.seeds.length
				? GRAPH_PARTITION.generatePartitionColors({
						count: placed.seeds.length,
						rng: RNG.createRng({ seed: params.seed }),
					})
				: new Float32Array(0),
			...GRAPH_PARTITION.partitionAdjacency({
				count: placed.seeds.length,
				assignment: placed.assignment,
				adjOffset: provinces.adjOffset,
				adjList: provinces.adjList,
			}),
			parent,
			depth: new Int32Array(provinces.count),
			...children,
			sovereign,
			gravity: new Float32Array(provinces.count),
			titles: {
				count: 0,
				tier: new Uint8Array(0),
				seat: new Int32Array(0),
				holder: new Int32Array(0),
				regionOf: new Int32Array(0),
			},
			governmentType: new Uint8Array(provinces.count),
			organizations: [],
			nationColonizer: new Int32Array(placed.seeds.length).fill(-1),
		},
	}
}

function refresh({ territory: t, country: c }: CountryParams): void {
	c.boundary.clear()
	c.contacts.clear()
	for (const p of c.members)
		for (
			let j = t.provinces.adjOffset[p];
			j < t.provinces.adjOffset[p + 1];
			j++
		) {
			const other = t.owner[t.provinces.adjList[j]]
			if (other >= 0 && other !== c.id) {
				c.boundary.add(p)
				c.contacts.set(other, (c.contacts.get(other) ?? 0) + 1)
			}
		}
}

function initialize({
	provinces,
	nations,
}: InitializeTerritoryParams): Territory {
	const active = Uint8Array.from(provinces.desolate, (d) => (d ? 0 : 1))
	const components = PLACEMENT.buildOpenComponents({
		active,
		assignment: new Int32Array(provinces.count).fill(-1),
		adjOffset: provinces.adjOffset,
		adjList: provinces.adjList,
	})
	const t: Territory = {
		provinces,
		owner: nations.assignment.slice(),
		countries: new Map(),
		nextId: nations.count,
		capacities: components.sizes,
		componentId: components.componentId,
		connectivityScans: 0,
		connectivityMs: 0,
		mutations: 0,
	}
	for (let id = 0; id < nations.count; id++)
		t.countries.set(id, {
			id,
			capital: nations.seeds[id],
			members: new Set(),
			boundary: new Set(),
			contacts: new Map(),
			revision: 0,
			cacheRevision: -1,
			articulations: new Set(),
			cooldown: 0,
		})
	for (let p = 0; p < provinces.count; p++)
		if (t.owner[p] >= 0) t.countries.get(t.owner[p])?.members.add(p)
	for (const country of t.countries.values()) refresh({ territory: t, country })
	return t
}

function articulations({
	territory: t,
	country: c,
}: CountryParams): Set<number> {
	if (c.cacheRevision === c.revision) return c.articulations
	const started = performance.now()
	const discovery = new Map<number, number>(),
		low = new Map<number, number>(),
		parent = new Map<number, number>(),
		children = new Map<number, number>()
	const points = new Set<number>(),
		stack = [c.capital],
		cursor = new Map<number, number>()
	let clock = 0
	discovery.set(c.capital, ++clock)
	low.set(c.capital, clock)
	parent.set(c.capital, -1)
	while (stack.length) {
		const p = stack[stack.length - 1]
		let j = cursor.get(p) ?? t.provinces.adjOffset[p]
		if (j < t.provinces.adjOffset[p + 1]) {
			const q = t.provinces.adjList[j++]
			cursor.set(p, j)
			if (t.owner[q] !== c.id) continue
			if (!discovery.has(q)) {
				parent.set(q, p)
				children.set(p, (children.get(p) ?? 0) + 1)
				discovery.set(q, ++clock)
				low.set(q, clock)
				stack.push(q)
			} else if (q !== parent.get(p))
				low.set(p, Math.min(low.get(p) ?? 0, discovery.get(q) ?? 0))
		} else {
			stack.pop()
			const par = parent.get(p) ?? -1
			if (par >= 0) {
				low.set(par, Math.min(low.get(par) ?? 0, low.get(p) ?? 0))
				if (
					parent.get(par) !== -1 &&
					(low.get(p) ?? 0) >= (discovery.get(par) ?? 0)
				)
					points.add(par)
			} else if ((children.get(p) ?? 0) > 1) points.add(p)
		}
	}
	c.articulations = points
	c.cacheRevision = c.revision
	t.connectivityScans++
	t.connectivityMs += performance.now() - started
	return points
}

function enclosure({
	territory: t,
	attacker,
	province,
}: EnclosureParams): number {
	let owned = 0
	for (
		let j = t.provinces.adjOffset[province];
		j < t.provinces.adjOffset[province + 1];
		j++
	)
		if (t.owner[t.provinces.adjList[j]] === attacker) owned++
	return owned
}

function canTransfer({
	territory: t,
	attacker,
	defender,
	province,
	ceiling,
}: TransferParams): boolean {
	const a = t.countries.get(attacker),
		d = t.countries.get(defender)
	if (
		!a ||
		!d ||
		a === d ||
		t.owner[province] !== defender ||
		a.members.size >= ceiling
	)
		return false
	let adjacent = false
	for (
		let j = t.provinces.adjOffset[province];
		j < t.provinces.adjOffset[province + 1];
		j++
	)
		if (t.owner[t.provinces.adjList[j]] === attacker) adjacent = true
	return (
		adjacent &&
		(d.members.size === 1 ||
			(province !== d.capital &&
				!articulations({ territory: t, country: d }).has(province)))
	)
}

function transfer(params: TransferParams): boolean {
	if (!canTransfer(params)) return false
	const { territory: t, attacker, defender, province } = params
	const a = t.countries.get(attacker),
		d = t.countries.get(defender)
	if (!a || !d) return false
	const touched = new Set([attacker, defender])
	for (
		let j = t.provinces.adjOffset[province];
		j < t.provinces.adjOffset[province + 1];
		j++
	)
		touched.add(t.owner[t.provinces.adjList[j]])
	d.members.delete(province)
	a.members.add(province)
	t.owner[province] = attacker
	a.revision++
	d.revision++
	t.mutations++
	if (d.members.size === 0) t.countries.delete(defender)
	for (const id of touched) {
		const country = t.countries.get(id)
		if (country) refresh({ territory: t, country })
	}
	return true
}

function cuts({ territory: t, country: c }: CountryParams): TerritoryCuts {
	const tree = new Map<number, number[]>(),
		queue = [c.capital],
		seen = new Set(queue)
	for (let i = 0; i < queue.length; i++) {
		const province = queue[i]
		for (
			let j = t.provinces.adjOffset[province];
			j < t.provinces.adjOffset[province + 1];
			j++
		) {
			const q = t.provinces.adjList[j]
			if (t.owner[q] !== c.id || seen.has(q)) continue
			seen.add(q)
			queue.push(q)
			const list = tree.get(province) ?? []
			list.push(q)
			tree.set(province, list)
		}
	}
	const sizes = new Map<number, number>()
	for (let i = queue.length - 1; i >= 0; i--)
		sizes.set(
			queue[i],
			1 +
				(tree.get(queue[i]) ?? []).reduce(
					(total, child) => total + (sizes.get(child) ?? 0),
					0,
				),
		)
	return { roots: queue.slice(1), children: tree, sizes }
}
function cutMembers({ cuts, root }: CutMembersParams): number[] {
	const members = [root]
	for (let i = 0; i < members.length; i++)
		members.push(...(cuts.children.get(members[i]) ?? []))
	return members
}

function connected({ territory: t, members, root }: ConnectedParams): boolean {
	if (!members.has(root)) return false
	const seen = new Set([root]),
		queue = [root]
	for (let i = 0; i < queue.length; i++)
		for (
			let j = t.provinces.adjOffset[queue[i]];
			j < t.provinces.adjOffset[queue[i] + 1];
			j++
		) {
			const p = t.provinces.adjList[j]
			if (members.has(p) && !seen.has(p)) {
				seen.add(p)
				queue.push(p)
			}
		}
	return seen.size === members.size
}

function split({ territory: t, country: c, provinces }: SplitParams): Country {
	if (
		!provinces.length ||
		provinces.includes(c.capital) ||
		provinces.some((p) => t.owner[p] !== c.id)
	)
		throw new Error("Invalid split")
	const detached = new Set(provinces),
		retained = new Set([...c.members].filter((p) => !detached.has(p)))
	if (
		t.countries.get(c.id) !== c ||
		detached.size !== provinces.length ||
		!connected({ territory: t, members: detached, root: provinces[0] }) ||
		!connected({ territory: t, members: retained, root: c.capital })
	)
		throw new Error("Split must preserve both connected countries")
	const id = t.nextId++,
		successor: Country = {
			id,
			capital: provinces[0],
			members: new Set(provinces),
			boundary: new Set(),
			contacts: new Map(),
			revision: 1,
			cacheRevision: -1,
			articulations: new Set(),
			cooldown: 0,
		}
	const touched = new Set<number>([c.id, id])
	for (const p of provinces) {
		c.members.delete(p)
		t.owner[p] = id
		for (
			let j = t.provinces.adjOffset[p];
			j < t.provinces.adjOffset[p + 1];
			j++
		)
			touched.add(t.owner[t.provinces.adjList[j]])
	}
	c.revision++
	t.countries.set(id, successor)
	t.mutations += provinces.length
	for (const other of touched) {
		const country = t.countries.get(other)
		if (country) refresh({ territory: t, country })
	}
	return successor
}

function validate({ territory: t }: TerritoryParams): ValidationResult {
	const result = { ownership: 0, connectivity: 0, capitals: 0 }
	for (let p = 0; p < t.owner.length; p++)
		if (
			t.provinces.desolate[p]
				? t.owner[p] !== -1
				: !t.countries.get(t.owner[p])?.members.has(p)
		)
			result.ownership++
	for (const c of t.countries.values()) {
		if (!c.members.has(c.capital) || t.owner[c.capital] !== c.id)
			result.capitals++
		if (!connected({ territory: t, members: c.members, root: c.capital }))
			result.connectivity++
	}
	return result
}

export const DISTRIBUTION_TERRITORY = {
	place,
	initialize,
	canTransfer,
	enclosure,
	transfer,
	cuts,
	cutMembers,
	split,
	validate,
}
