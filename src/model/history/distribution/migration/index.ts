import type {
	DistanceParams,
	HorizonParams,
	MigrationEdge,
	MigrationParams,
	MigrationResult,
	RegionPair,
	SeaLink,
	TransitParams,
} from "@/model/history/distribution/migration/types"
import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { PriorityHeap } from "@/model/shared/min-heap"
import { HASH } from "@/model/shared/random/hash"
import { UNITS } from "@/model/shared/units"

const startYear = -79999
const sentinel = 2147483647
function capabilityYear({ distanceKm }: DistanceParams): number {
	return distanceKm <= 150
		? startYear
		: distanceKm <= 500
			? -2999
			: distanceKm <= 2000
				? -999
				: 1500
}
function transit({
	sourceArrival,
	distanceKm,
	meanSuitability,
	corridorBonus,
	kind,
}: TransitParams): number {
	const distance = Math.max(1, distanceKm)
	if (kind === "sea")
		return (
			Math.max(sourceArrival, capabilityYear({ distanceKm: distance })) +
			100 +
			distance / 10
		)
	const speed = Math.max(0.1, meanSuitability) * corridorBonus
	const earlyDistance = Math.max(0, 1500 - sourceArrival) * speed
	return distance <= earlyDistance
		? sourceArrival + distance / speed
		: Math.max(1500, sourceArrival) + (distance - earlyDistance) / (50 * speed)
}
function horizon({ continuousArrival, desolate }: HorizonParams) {
	const arrivalYear = new Int32Array(continuousArrival.length).fill(sentinel)
	const contextMask = new Uint8Array(continuousArrival.length)
	const migrationWave = new Float32Array(continuousArrival.length).fill(-1)
	const order: number[] = []
	for (let p = 0; p < continuousArrival.length; p++) {
		const arrival = continuousArrival[p]
		if (desolate[p] || !Number.isFinite(arrival)) continue
		migrationWave[p] = Math.max(
			0,
			Math.min(1, (arrival - startYear) / (2025 - startYear)),
		)
		const rounded = Math.ceil(arrival)
		if (rounded > 2025) continue
		arrivalYear[p] = rounded
		contextMask[p] = 1
		order.push(p)
	}
	order.sort((a, b) => arrivalYear[a] - arrivalYear[b] || a - b)
	return {
		arrivalYear,
		contextMask,
		migrationWave,
		order: Int32Array.from(order),
	}
}
function compute({
	provinces: p,
	habitability,
	mesh,
	ocean,
	planetRadiusKm,
	seed,
}: MigrationParams): MigrationResult {
	const started = performance.now()
	const active = Uint8Array.from(p.desolate, (d) => (d ? 0 : 1))
	const components = PLACEMENT.buildOpenComponents({
		active,
		assignment: new Int32Array(p.count).fill(-1),
		adjOffset: p.adjOffset,
		adjList: p.adjList,
	})
	const raw = Float64Array.from({ length: p.count }, (_, i) =>
		active[i] ? habitability[i] / Math.max(1, p.size[i]) : 0,
	)
	let maxRaw = 0
	for (const value of raw) maxRaw = Math.max(maxRaw, value)
	const suitability = Float64Array.from(raw, (v, i) =>
		active[i] ? (maxRaw > 0 ? Math.max(0, Math.min(1, v / maxRaw)) : 1) : 0,
	)
	const mass = new Float64Array(components.sizes.length)
	const areas = new Float64Array(p.count)
	for (let r = 0; r < mesh.numRegions; r++) {
		const province = p.regionProvince[r]
		if (province >= 0)
			areas[province] += mesh.regionArea[r] * planetRadiusKm ** 2
	}
	p.areaKm2 = Float32Array.from(areas)
	for (let i = 0; i < p.count; i++)
		if (active[i]) mass[components.componentId[i]] += raw[i]
	let component = -1
	for (let i = 0; i < mass.length; i++)
		if (component < 0 || mass[i] > mass[component]) component = i
	let origin = -1,
		bestScore = -Infinity,
		bestTie = -Infinity
	for (let i = 0; i < p.count; i++) {
		if (!active[i] || components.componentId[i] !== component) continue
		let area = 0,
			score = 0,
			wet = 0
		const neighbors = [
			i,
			...p.adjList.subarray(p.adjOffset[i], p.adjOffset[i + 1]),
		]
		for (const q of neighbors)
			if (active[q]) {
				const weight = areas[q]
				area += weight
				score += weight * suitability[q]
				if (p.waterAccess[q]) wet += weight
			}
		const value = area > 0 ? (score / area) * (1 + wet / area) : suitability[i]
		const tie = HASH.unit({ seed, channel: 0, salt: i })
		if (
			value > bestScore ||
			(value === bestScore &&
				(tie > bestTie || (tie === bestTie && i < origin)))
		) {
			origin = i
			bestScore = value
			bestTie = tie
		}
	}
	const distance = (regions: RegionPair) =>
		UNITS.regionDistanceKm({
			r_xyz: mesh.r_xyz,
			fromRegion: regions.a,
			toRegion: regions.b,
			planetRadiusKm,
		})
	const continuousArrival = new Float64Array(p.count).fill(Infinity)
	const predecessor = new Int32Array(p.count).fill(-1)
	const edgeKind = new Uint8Array(p.count)
	const arrivalTier = new Uint8Array(p.count)
	const sea = new Map<string, SeaLink>()
	const oceanLengths: number[] = []
	if (origin >= 0) {
		const shore = new Int32Array(mesh.numRegions).fill(-1),
			parent = new Int32Array(mesh.numRegions).fill(-1)
		const costs = new Float64Array(mesh.numRegions).fill(Infinity),
			heap = new PriorityHeap<number>()
		for (let r = 0; r < mesh.numRegions; r++)
			if (ocean[r]) {
				for (let j = mesh.adjOffset[r]; j < mesh.adjOffset[r + 1]; j++) {
					const q = mesh.adjList[j],
						province = p.regionProvince[q]
					if (ocean[q]) {
						if (q > r) oceanLengths.push(distance({ a: r, b: q }))
						continue
					}
					if (province < 0 || !active[province]) continue
					const cost = distance({ a: r, b: q })
					if (cost < costs[r] || (cost === costs[r] && province < shore[r])) {
						costs[r] = cost
						shore[r] = province
						parent[r] = q
					}
				}
				if (shore[r] >= 0) heap.push(costs[r], r)
			}
		while (heap.size) {
			const entry = heap.pop()!
			const r = entry.value
			if (entry.key !== costs[r]) continue
			for (let j = mesh.adjOffset[r]; j < mesh.adjOffset[r + 1]; j++) {
				const q = mesh.adjList[j]
				if (!ocean[q]) continue
				const next = entry.key + distance({ a: r, b: q })
				if (next < costs[q]) {
					costs[q] = next
					shore[q] = shore[r]
					parent[q] = r
					heap.push(next, q)
				}
			}
		}
		const retain = (link: SeaLink) => {
			const a = Math.min(link.a, link.b),
				b = Math.max(link.a, link.b),
				key = `${a}:${b}`
			if (link.distanceKm < (sea.get(key)?.distanceKm ?? Infinity))
				sea.set(key, { a, b, distanceKm: Math.max(1, link.distanceKm) })
		}
		for (let r = 0; r < mesh.numRegions; r++)
			if (ocean[r] && shore[r] >= 0)
				for (let j = mesh.adjOffset[r]; j < mesh.adjOffset[r + 1]; j++) {
					const q = mesh.adjList[j]
					if (ocean[q]) {
						if (q <= r || shore[q] < 0 || shore[r] === shore[q]) continue
						retain({
							a: shore[r],
							b: shore[q],
							distanceKm: costs[r] + distance({ a: r, b: q }) + costs[q],
						})
					} else {
						const province = p.regionProvince[q]
						if (province < 0 || !active[province] || province === shore[r])
							continue
						retain({
							a: shore[r],
							b: province,
							distanceKm: costs[r] + distance({ a: r, b: q }),
						})
					}
					if (parent[r] < 0) throw new Error("Invalid ocean corridor")
				}
	}
	const links: SeaLink[][] = Array.from(
		{ length: p.count },
		(): SeaLink[] => [],
	)
	for (const link of sea.values()) {
		links[link.a].push(link)
		links[link.b].push(link)
	}
	let landEdges = 0
	for (let i = 0; i < p.count; i++)
		if (active[i])
			for (let j = p.adjOffset[i]; j < p.adjOffset[i + 1]; j++)
				if (active[p.adjList[j]] && p.adjList[j] > i) landEdges++
	if (origin >= 0) {
		const heap = new PriorityHeap<number>()
		continuousArrival[origin] = startYear
		heap.push(startYear, origin)
		while (heap.size) {
			const entry = heap.pop()!,
				source = entry.value
			if (entry.key !== continuousArrival[source]) continue
			const visit = (edge: MigrationEdge) => {
				const q = edge.destination
				if (!active[q]) return
				const arrival = transit({
					sourceArrival: entry.key,
					distanceKm: edge.distanceKm,
					kind: edge.kind,
					meanSuitability: (suitability[source] + suitability[q]) / 2,
					corridorBonus:
						(p.riverAccess[source] || p.waterAccess[source] === 2) &&
						(p.riverAccess[q] || p.waterAccess[q] === 2)
							? 1.25
							: 1,
				})
				if (arrival >= continuousArrival[q]) return
				continuousArrival[q] = arrival
				predecessor[q] = source
				arrivalTier[q] =
					edge.kind === "land"
						? arrivalTier[source]
						: edge.distanceKm <= 150
							? 1
							: edge.distanceKm <= 500
								? 2
								: edge.distanceKm <= 2000
									? 3
									: 4
				edgeKind[q] = edge.kind === "land" ? 1 : 2
				heap.push(arrival, q)
			}
			for (let j = p.adjOffset[source]; j < p.adjOffset[source + 1]; j++) {
				const q = p.adjList[j]
				visit({
					destination: q,
					distanceKm: distance({ a: p.seeds[source], b: p.seeds[q] }),
					kind: "land",
				})
			}
			for (const link of links[source])
				visit({
					destination: link.a === source ? link.b : link.a,
					distanceKm: link.distanceKm,
					kind: "sea",
				})
		}
	}
	const lengths = [...sea.values()]
		.map((e) => e.distanceKm)
		.sort((a, b) => a - b)
	oceanLengths.sort((a, b) => a - b)
	const quantiles = (values: number[]) =>
		[0, 0.25, 0.5, 0.75, 1].map((q) =>
			values.length ? values[Math.floor(q * (values.length - 1))] : 0,
		)
	const nominalSpacingKm = Math.sqrt(
		(4 * Math.PI * planetRadiusKm ** 2) / Math.max(1, mesh.numRegions),
	)
	return {
		origin,
		continuousArrival,
		predecessor,
		edgeKind,
		arrivalTier,
		componentId: components.componentId,
		...horizon({ continuousArrival, desolate: p.desolate }),
		diagnostics: {
			initializationMs: performance.now() - started,
			seaCorridorBuildRuns: origin >= 0 ? 1 : 0,
			arrivalPathfindingRuns: origin >= 0 ? 1 : 0,
			landEdges,
			seaEdges: sea.size,
			seaLengthQuantiles: quantiles(lengths),
			oceanEdgeQuantiles: quantiles(oceanLengths),
			nominalSpacingKm,
			gateSensitivityCounts: [150, 500, 2000].map(
				(gate) =>
					lengths.filter((v) => Math.abs(v - gate) <= nominalSpacingKm).length,
			),
		},
	}
}
export const DISTRIBUTION_MIGRATION = {
	compute,
	transit,
	horizon,
	capabilityYear,
	sentinel,
	startYear,
}
