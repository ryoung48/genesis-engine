import { DISTRIBUTION_STATUS } from "@/model/history/distribution/status"
import type {
	ClaimParams,
	ConnectedParams,
	Country,
	CountryParams,
	DistanceParams,
	EmptyNationsParams,
	EnclosureParams,
	FoundParams,
	InitializeTerritoryParams,
	PocketParams,
	ProvinceParams,
	SplitParams,
	StretchParams,
	Territory,
	TerritoryParams,
	TransferParams,
	ValidationResult,
} from "@/model/history/distribution/territory/types"
import { GRAPH_PARTITION } from "@/model/history/sim/graph-partition"
import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { HIERARCHY } from "@/model/society/hierarchy"
import type { GenesisNationHierarchy } from "@/model/society/types"

const MAX_POCKET_SHARE = 0.25

function emptyNations({
	provinces,
}: EmptyNationsParams): GenesisNationHierarchy {
	const parent = new Int32Array(provinces.count).fill(-1)
	const children = HIERARCHY.buildChildrenCSR({
		parent,
		provinceCount: provinces.count,
	})
	return {
		assignment: new Int32Array(provinces.count).fill(-1),
		seeds: new Int32Array(0),
		languageSeeds: new Int32Array(0),
		nameSeeds: new Int32Array(0),
		count: 0,
		size: new Int32Array(0),
		colors: new Float32Array(0),
		...GRAPH_PARTITION.partitionAdjacency({
			count: 0,
			assignment: new Int32Array(provinces.count).fill(-1),
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		}),
		parent,
		depth: new Int32Array(provinces.count),
		...children,
		sovereign: new Int32Array(provinces.count).fill(-1),
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
		nationColonizer: new Int32Array(0),
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

function distance({ territory: t, a, b }: DistanceParams): number {
	return Math.hypot(
		t.positions[3 * a] - t.positions[3 * b],
		t.positions[3 * a + 1] - t.positions[3 * b + 1],
		t.positions[3 * a + 2] - t.positions[3 * b + 2],
	)
}

function initialize({
	provinces,
	r_xyz,
}: InitializeTerritoryParams): Territory {
	const positions = new Float64Array(provinces.count * 3)
	for (let p = 0; p < provinces.count; p++) {
		const region = provinces.seeds[p]
		const length =
			Math.hypot(
				r_xyz[3 * region],
				r_xyz[3 * region + 1],
				r_xyz[3 * region + 2],
			) || 1
		for (let k = 0; k < 3; k++)
			positions[3 * p + k] = r_xyz[3 * region + k] / length
	}
	const active = Uint8Array.from(provinces.desolate, (d) => (d ? 0 : 1))
	const components = PLACEMENT.buildOpenComponents({
		active,
		assignment: new Int32Array(provinces.count).fill(-1),
		adjOffset: provinces.adjOffset,
		adjList: provinces.adjList,
	})
	const t: Territory = {
		provinces,
		positions,
		owner: new Int32Array(provinces.count).fill(
			DISTRIBUTION_STATUS.uninhabited,
		),
		countries: new Map(),
		nextId: 0,
		capacities: components.sizes,
		componentId: components.componentId,
		connectivityScans: 0,
		connectivityMs: 0,
		mutations: 0,
	}
	return t
}

function found({ territory: t, province }: FoundParams): Country {
	const id = t.nextId++,
		country: Country = {
			id,
			capital: province,
			members: new Set([province]),
			boundary: new Set(),
			contacts: new Map(),
			revision: 1,
			cacheRevision: -1,
			articulations: new Map(),
			cooldown: 0,
		}
	t.owner[province] = id
	t.countries.set(id, country)
	t.mutations++
	refreshAround({ territory: t, province })
	return country
}

function claim({ territory: t, country: c, province }: ClaimParams): void {
	t.owner[province] = c.id
	c.members.add(province)
	c.revision++
	t.mutations++
	refreshAround({ territory: t, province })
}

function refreshAround({ territory: t, province }: ProvinceParams): void {
	const touched = new Set([t.owner[province]])
	for (
		let j = t.provinces.adjOffset[province];
		j < t.provinces.adjOffset[province + 1];
		j++
	)
		touched.add(t.owner[t.provinces.adjList[j]])
	for (const id of touched) {
		const country = t.countries.get(id)
		if (country) refresh({ territory: t, country })
	}
}

function articulations({
	territory: t,
	country: c,
}: CountryParams): Map<number, number> {
	if (c.cacheRevision === c.revision) return c.articulations
	const started = performance.now()
	const discovery = new Map<number, number>(),
		low = new Map<number, number>(),
		parent = new Map<number, number>(),
		children = new Map<number, number>(),
		subtree = new Map<number, number>()
	const points = new Map<number, number>(),
		stack = [c.capital],
		cursor = new Map<number, number>()
	let clock = 0
	discovery.set(c.capital, ++clock)
	low.set(c.capital, clock)
	parent.set(c.capital, -1)
	subtree.set(c.capital, 1)
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
				subtree.set(q, 1)
				stack.push(q)
			} else if (q !== parent.get(p))
				low.set(p, Math.min(low.get(p) ?? 0, discovery.get(q) ?? 0))
		} else {
			stack.pop()
			const par = parent.get(p) ?? -1
			if (par >= 0) {
				low.set(par, Math.min(low.get(par) ?? 0, low.get(p) ?? 0))
				subtree.set(par, (subtree.get(par) ?? 0) + (subtree.get(p) ?? 0))
				if (
					parent.get(par) !== -1 &&
					(low.get(p) ?? 0) >= (discovery.get(par) ?? 0)
				)
					points.set(par, (points.get(par) ?? 0) + (subtree.get(p) ?? 0))
			} else if ((children.get(p) ?? 0) > 1) points.set(p, 0)
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

function pocketSize({
	territory: t,
	country: d,
	province,
}: PocketParams): number {
	if (d.members.size === 1) return 0
	if (province === d.capital) return -1
	const pocket = articulations({ territory: t, country: d }).get(province) ?? 0
	return pocket > Math.max(1, Math.floor(MAX_POCKET_SHARE * d.members.size))
		? -1
		: pocket
}

function pocketMembers({
	territory: t,
	country: d,
	province,
}: PocketParams): number[] {
	const reached = new Set([d.capital, province]),
		queue = [d.capital]
	for (let i = 0; i < queue.length; i++)
		for (
			let j = t.provinces.adjOffset[queue[i]];
			j < t.provinces.adjOffset[queue[i] + 1];
			j++
		) {
			const q = t.provinces.adjList[j]
			if (t.owner[q] === d.id && !reached.has(q)) {
				reached.add(q)
				queue.push(q)
			}
		}
	return [...d.members].filter((q) => !reached.has(q))
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
	if (!a || !d || a === d || t.owner[province] !== defender) return false
	let adjacent = false
	for (
		let j = t.provinces.adjOffset[province];
		j < t.provinces.adjOffset[province + 1];
		j++
	)
		if (t.owner[t.provinces.adjList[j]] === attacker) adjacent = true
	if (!adjacent) return false
	const pocket = pocketSize({ territory: t, country: d, province })
	return pocket >= 0 && a.members.size + 1 + pocket <= ceiling
}

function transfer(params: TransferParams): boolean {
	if (!canTransfer(params)) return false
	const { territory: t, attacker, defender, province } = params
	const a = t.countries.get(attacker),
		d = t.countries.get(defender)
	if (!a || !d) return false
	const moved =
		pocketSize({ territory: t, country: d, province }) > 0
			? [province, ...pocketMembers({ territory: t, country: d, province })]
			: [province]
	const touched = new Set([attacker, defender])
	for (const p of moved) {
		for (
			let j = t.provinces.adjOffset[p];
			j < t.provinces.adjOffset[p + 1];
			j++
		)
			touched.add(t.owner[t.provinces.adjList[j]])
		d.members.delete(p)
		a.members.add(p)
		t.owner[p] = attacker
	}
	a.revision++
	d.revision++
	t.mutations += moved.length
	if (d.members.size === 0) t.countries.delete(defender)
	for (const id of touched) {
		const country = t.countries.get(id)
		if (country) refresh({ territory: t, country })
	}
	return true
}

function spacing({ territory: t }: TerritoryParams): number {
	return Math.sqrt((4 * Math.PI) / t.provinces.count)
}

function stretch({
	territory: t,
	country: c,
	province,
}: StretchParams): number {
	return (
		distance({ territory: t, a: c.capital, b: province }) /
		(spacing({ territory: t }) * Math.sqrt((c.members.size + 1) / Math.PI))
	)
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
			articulations: new Map(),
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
				? t.owner[p] !== DISTRIBUTION_STATUS.uninhabited
				: DISTRIBUTION_STATUS.isOwned({ owner: t.owner[p] })
					? !t.countries.get(t.owner[p])?.members.has(p)
					: !DISTRIBUTION_STATUS.isUninhabited({ owner: t.owner[p] }) &&
						!DISTRIBUTION_STATUS.isStateless({ owner: t.owner[p] })
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
	emptyNations,
	initialize,
	found,
	claim,
	canTransfer,
	enclosure,
	distance,
	transfer,
	spacing,
	stretch,
	articulations,
	split,
	validate,
}
