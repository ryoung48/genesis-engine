import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { PriorityHeap } from "@/model/shared/min-heap"
import { HASH } from "@/model/shared/random/hash"
import { UNITS } from "@/model/shared/units"
import { SEA_LINKS } from "@/model/society/migration/sea-links"
import type { SeaLink } from "@/model/society/migration/sea-links/types"
import type {
	ActiveCradlesParams,
	AddNearestParams,
	ApportionParams,
	BestSpacedParams,
	CapabilityParams,
	CoreSeedsParams,
	CradleChoice,
	CradleSpacingParams,
	CradlesParams,
	DisplayTree,
	DisplayTreeParams,
	GrowHeldParams,
	HeldCoreParams,
	HorizonParams,
	IndexLinksParams,
	MatureScoreParams,
	MigrationEdge,
	MigrationOutput,
	MigrationParams,
	MigrationResult,
	MigrationRoutes,
	MigrationTrunk,
	OriginHint,
	RampYearsParams,
	RoutesParams,
	TargetParams,
	TransitParams,
	WalkGraph,
	WaveParams,
} from "@/model/society/migration/types"
import type { GenesisProvinces } from "@/model/society/types"

const START_YEAR = -79999
const DISPERSAL_START_YEAR = -65000
const SENTINEL = 2147483647
const RAMP_LAST_YEAR = 1300
const TRUNK_MIN_SHARE = 0.006
const LANDFALL_MIN_SHARE = 0.00012
const DISPLAY_SEA_PENALTY = 4
const ORIGIN_MIN_TEMPERATURE_C = 20
const ORIGIN_MIN_RAINFALL_MM = 600
const ORIGIN_MAX_RAINFALL_MM = 1500
const SHELF_CLOSES_YEAR = -9500
const SHELF_ELEVATION_KM = -0.06
const SUITABILITY_QUANTILE = 0.95
const EARLY_SPEED_KM_PER_YEAR = 0.55
const SUITABILITY_FLOOR = 0.3
const HOMELAND_RADIUS_KM = 1000
const ISLAND_OPEN_AREA_KM2 = 30000
const ISLAND_OPEN_YEAR = -11700
const ISLAND_FLOOR_AREA_KM2 = 2000
const ISLAND_FLOOR_YEAR = -500
const SEA_LANDING_YEARS = 100
const LATE_SPEED_KM_PER_YEAR = 50
const SPREAD_GROWTH_START_YEAR = -10000
const SPREAD_GROWTH_END_YEAR = 1500
const SPREAD_GROWTH_FACTOR = LATE_SPEED_KM_PER_YEAR / EARLY_SPEED_KM_PER_YEAR
const TARGET_REFERENCE_KM2 = 1_000_000
const TARGET_GAIN = 2

const SEA_VOYAGE_KNOTS = [
	{ km: 130, year: DISPERSAL_START_YEAR },
	{ km: 185, year: -5000 },
	{ km: 850, year: -1000 },
	{ km: 3000, year: 800 },
]

const EDGE_KIND_CODE = { land: 1, sea: 2, shelf: 3 }

const MAX_CRADLES = 8
const CRADLE_SPACING_KM = 2000
const CRADLE_RESIDENCE_YEARS = 2000
const CRADLE_FIRST_REVIEW_YEAR = -3300
const CRADLE_REVIEW_STEP = 100
const CRADLE_LAST_REVIEW_YEAR = 2025

function seaTier({ distanceKm }: CapabilityParams) {
	const index = SEA_VOYAGE_KNOTS.findIndex((knot) => distanceKm <= knot.km)
	return index < 0 ? SEA_VOYAGE_KNOTS.length : index + 1
}

function seaCapabilityYear({ distanceKm }: CapabilityParams): number {
	const last = SEA_VOYAGE_KNOTS[SEA_VOYAGE_KNOTS.length - 1]
	if (distanceKm >= last.km) return last.year
	const upper = SEA_VOYAGE_KNOTS.findIndex((knot) => distanceKm <= knot.km)
	if (upper === 0) return SEA_VOYAGE_KNOTS[0].year
	const from = SEA_VOYAGE_KNOTS[upper - 1]
	const to = SEA_VOYAGE_KNOTS[upper]
	const fraction = Math.log(distanceKm / from.km) / Math.log(to.km / from.km)
	return from.year + fraction * (to.year - from.year)
}

function targetReach({ destinationLandmassKm2 }: TargetParams): number {
	return (
		1 +
		TARGET_GAIN *
			Math.log10(Math.max(1, destinationLandmassKm2 / TARGET_REFERENCE_KM2))
	)
}

function islandOpenYear({ destinationLandmassKm2 }: TargetParams): number {
	if (destinationLandmassKm2 >= ISLAND_OPEN_AREA_KM2) return -Infinity
	const fraction = Math.min(
		1,
		Math.log(ISLAND_OPEN_AREA_KM2 / Math.max(1, destinationLandmassKm2)) /
			Math.log(ISLAND_OPEN_AREA_KM2 / ISLAND_FLOOR_AREA_KM2),
	)
	return ISLAND_OPEN_YEAR + fraction * (ISLAND_FLOOR_YEAR - ISLAND_OPEN_YEAR)
}

function seaTransit({
	sourceArrival,
	distanceKm,
	destinationLandmassKm2,
}: Pick<
	TransitParams,
	"sourceArrival" | "distanceKm" | "destinationLandmassKm2"
>): number {
	const distance = Math.max(1, distanceKm)
	const effectiveKm = distance / targetReach({ destinationLandmassKm2 })
	return (
		Math.max(sourceArrival, seaCapabilityYear({ distanceKm: effectiveKm })) +
		SEA_LANDING_YEARS +
		distance / 10
	)
}

function spreadProgress(year: number): number {
	const width = SPREAD_GROWTH_END_YEAR - SPREAD_GROWTH_START_YEAR
	const x = (year - SPREAD_GROWTH_START_YEAR) / width
	if (x <= 0) return year
	const accumulated =
		x >= 1
			? width * 0.5 + (year - SPREAD_GROWTH_END_YEAR)
			: width * (x ** 3 - x ** 4 / 2)
	return year + (SPREAD_GROWTH_FACTOR - 1) * accumulated
}

function yearAtSpreadProgress(progress: number): number {
	if (progress <= SPREAD_GROWTH_START_YEAR) return progress
	const endProgress = spreadProgress(SPREAD_GROWTH_END_YEAR)
	if (progress >= endProgress)
		return (
			SPREAD_GROWTH_END_YEAR + (progress - endProgress) / SPREAD_GROWTH_FACTOR
		)
	let low = SPREAD_GROWTH_START_YEAR
	let high = SPREAD_GROWTH_END_YEAR
	for (let i = 0; i < 50; i++) {
		const mid = (low + high) / 2
		if (spreadProgress(mid) < progress) low = mid
		else high = mid
	}
	return high
}

function landTransit({
	sourceArrival,
	distanceKm,
	meanSuitability,
	corridorBonus,
}: Omit<TransitParams, "kind">): number {
	const distance = Math.max(1, distanceKm)
	const speed =
		(SUITABILITY_FLOOR + (1 - SUITABILITY_FLOOR) * meanSuitability) *
		corridorBonus
	const target =
		spreadProgress(sourceArrival) + distance / (EARLY_SPEED_KM_PER_YEAR * speed)
	return yearAtSpreadProgress(target)
}

function transit(input: TransitParams): number {
	const params = {
		...input,
		sourceArrival:
			input.sourceOriginKm <= HOMELAND_RADIUS_KM
				? input.sourceArrival
				: Math.max(input.sourceArrival, DISPERSAL_START_YEAR),
	}
	if (params.kind === "land") return landTransit(params)
	if (params.kind === "sea") return seaTransit(params)
	return params.sourceArrival < SHELF_CLOSES_YEAR
		? Math.min(landTransit(params), seaTransit(params))
		: seaTransit(params)
}

function waveOf({ year, horizonYear }: WaveParams): number {
	return Math.max(
		0,
		Math.min(1, (year - START_YEAR) / (horizonYear - START_YEAR)),
	)
}

function horizon({ continuousArrival, desolate, horizonYear }: HorizonParams) {
	const arrivalYear = new Int32Array(continuousArrival.length).fill(SENTINEL)
	const migrationWave = new Float32Array(continuousArrival.length).fill(-1)
	const order: number[] = []
	for (let p = 0; p < continuousArrival.length; p++) {
		const arrival = Math.ceil(continuousArrival[p])
		if (desolate[p] || !Number.isFinite(arrival) || arrival > horizonYear)
			continue
		arrivalYear[p] = arrival
		migrationWave[p] = waveOf({ year: arrival, horizonYear })
		order.push(p)
	}
	order.sort((a, b) => arrivalYear[a] - arrivalYear[b] || a - b)
	return { arrivalYear, migrationWave, order: Int32Array.from(order) }
}

function rampYears({ arrivalYear, desolate }: RampYearsParams): Int32Array {
	const years = new Int32Array(arrivalYear.length).fill(SENTINEL)
	const ranked: number[] = []
	for (let p = 0; p < arrivalYear.length; p++)
		if (!desolate[p] && arrivalYear[p] !== SENTINEL) ranked.push(p)
	ranked.sort((a, b) => arrivalYear[a] - arrivalYear[b] || a - b)
	const steps = Math.max(1, ranked.length - 2)
	ranked.forEach((p, rank) => {
		years[p] =
			rank === 0
				? START_YEAR
				: Math.ceil(
						DISPERSAL_START_YEAR +
							((rank - 1) / steps) * (RAMP_LAST_YEAR - DISPERSAL_START_YEAR),
					)
	})
	return years
}

function displayTree({
	provinces,
	r_xyz,
	predecessor,
	reached,
}: DisplayTreeParams): DisplayTree {
	const land = landGraph(provinces)
	const hops: number[][] = Array.from(
		{ length: provinces.count },
		(): number[] => [],
	)
	for (let q = 0; q < provinces.count; q++) {
		const from = predecessor[q]
		if (!reached[q] || from < 0) continue
		if (provinces.landmassId[q] === provinces.landmassId[from]) continue
		hops[from].push(q)
		hops[q].push(from)
	}
	const angle = (a: number, b: number) => {
		const ra = provinces.seeds[a] * 3
		const rb = provinces.seeds[b] * 3
		const dot =
			r_xyz[ra] * r_xyz[rb] +
			r_xyz[ra + 1] * r_xyz[rb + 1] +
			r_xyz[ra + 2] * r_xyz[rb + 2]
		const norms =
			Math.hypot(r_xyz[ra], r_xyz[ra + 1], r_xyz[ra + 2]) *
			Math.hypot(r_xyz[rb], r_xyz[rb + 1], r_xyz[rb + 2])
		return Math.acos(Math.max(-1, Math.min(1, dot / Math.max(1e-12, norms))))
	}
	const cost = new Float64Array(provinces.count).fill(Infinity)
	const parent = new Int32Array(provinces.count).fill(-1)
	const order: number[] = []
	const heap = new PriorityHeap<number>()
	for (let q = 0; q < provinces.count; q++)
		if (reached[q] && predecessor[q] < 0) {
			cost[q] = 0
			heap.push(0, q)
		}
	while (heap.size) {
		const entry = heap.pop()!
		const source = entry.value
		if (entry.key !== cost[source]) continue
		order.push(source)
		const relax = (q: number, penalty: number) => {
			if (!reached[q]) return
			const next = entry.key + angle(source, q) * penalty
			if (next >= cost[q]) return
			cost[q] = next
			parent[q] = source
			heap.push(next, q)
		}
		for (let j = land.adjOffset[source]; j < land.adjOffset[source + 1]; j++)
			relax(land.adjList[j], 1)
		for (const q of hops[source]) relax(q, DISPLAY_SEA_PENALTY)
	}
	return { parent, order }
}

function routes({
	provinces,
	r_xyz,
	arrivalYear,
	predecessor,
}: RoutesParams): MigrationRoutes {
	const reached = Uint8Array.from(arrivalYear, (year, p) =>
		!provinces.desolate[p] && year !== SENTINEL ? 1 : 0,
	)
	const { parent, order } = displayTree({
		provinces,
		r_xyz,
		predecessor,
		reached,
	})
	const size = new Float64Array(provinces.count)
	let total = 0
	for (const p of order) {
		size[p] = provinces.size[p]
		total += size[p]
	}
	for (let i = order.length - 1; i >= 0; i--) {
		const p = order[i]
		if (parent[p] >= 0) size[parent[p]] += size[p]
	}
	const minSize = TRUNK_MIN_SHARE * total
	const landfallSize = LANDFALL_MIN_SHARE * total
	const heavy = new Int32Array(provinces.count).fill(-1)
	for (const p of order) {
		const q = parent[p]
		if (
			size[p] >= minSize &&
			q >= 0 &&
			(heavy[q] < 0 || size[p] > size[heavy[q]])
		)
			heavy[q] = p
	}
	const trunks: MigrationTrunk[] = []
	for (const p of order) {
		const q = parent[p]
		const landfall =
			q >= 0 &&
			provinces.landmassId[p] !== provinces.landmassId[q] &&
			size[p] >= landfallSize
		if (size[p] < minSize && !landfall) continue
		if (q >= 0 && heavy[q] === p) continue
		const provincesOnTrunk = q >= 0 ? [q] : []
		for (let c = p; c >= 0; c = heavy[c]) provincesOnTrunk.push(c)
		let latest = -Infinity
		const years = provincesOnTrunk.map((c) => {
			latest = Math.max(latest, arrivalYear[c])
			return latest
		})
		trunks.push({
			provinces: provincesOnTrunk,
			sizes: provincesOnTrunk.map((c, i) => (i === 0 ? size[p] : size[c])),
			years,
		})
	}
	const origin = order.find((p) => parent[p] < 0)
	const milestones = [
		...(origin === undefined ? [] : [{ province: origin, weight: Infinity }]),
		...trunks.map((trunk) => ({
			province: trunk.provinces[trunk.provinces.length - 1],
			weight: trunk.sizes[0],
		})),
	]
		.sort((a, b) => b.weight - a.weight)
		.map(({ province }) => ({ province, year: arrivalYear[province] }))
	return { trunks, milestones }
}

function indexLinks({ count, links }: IndexLinksParams): SeaLink[][] {
	const indexed: SeaLink[][] = Array.from(
		{ length: count },
		(): SeaLink[] => [],
	)
	for (const link of links) {
		indexed[link.a].push(link)
		indexed[link.b].push(link)
	}
	return indexed
}

function quantiles(values: number[]): number[] {
	const sorted = [...values].sort((a, b) => a - b)
	return [0, 0.25, 0.5, 0.75, 1].map((q) =>
		sorted.length ? sorted[Math.floor(q * (sorted.length - 1))] : 0,
	)
}

function suitabilityScale(raw: Float64Array, active: Uint8Array): number {
	const values: number[] = []
	for (let i = 0; i < raw.length; i++) if (active[i]) values.push(raw[i])
	values.sort((a, b) => a - b)
	if (!values.length) return 0
	return values[Math.floor(SUITABILITY_QUANTILE * (values.length - 1))]
}

function landGraph(provinces: GenesisProvinces): GenesisProvinces {
	const offsets = new Int32Array(provinces.count + 1)
	const list: number[] = []
	for (let i = 0; i < provinces.count; i++) {
		for (let j = provinces.adjOffset[i]; j < provinces.adjOffset[i + 1]; j++) {
			const q = provinces.adjList[j]
			if (provinces.landmassId[i] === provinces.landmassId[q]) list.push(q)
		}
		offsets[i + 1] = list.length
	}
	return { ...provinces, adjOffset: offsets, adjList: Int32Array.from(list) }
}

function walkGraph(provinces: GenesisProvinces): WalkGraph {
	const offsets = new Int32Array(provinces.count + 1)
	const list: number[] = []
	for (let i = 0; i < provinces.count; i++) {
		for (let j = provinces.adjOffset[i]; j < provinces.adjOffset[i + 1]; j++) {
			const q = provinces.adjList[j]
			if (
				provinces.desolate[i] ||
				provinces.desolate[q] ||
				provinces.landmassId[i] === provinces.landmassId[q]
			)
				list.push(q)
		}
		offsets[i + 1] = list.length
	}
	const adjList = Int32Array.from(list)
	const { componentId, sizes } = PLACEMENT.buildOpenComponents({
		active: new Uint8Array(provinces.count).fill(1),
		assignment: new Int32Array(provinces.count).fill(-1),
		adjOffset: offsets,
		adjList,
	})
	return {
		adjOffset: offsets,
		adjList,
		componentId,
		componentCount: sizes.length,
	}
}

function unitVector({ lonDeg, latDeg }: OriginHint): [number, number, number] {
	const lon = (lonDeg * Math.PI) / 180
	const lat = (latDeg * Math.PI) / 180
	return [
		Math.cos(lat) * Math.cos(lon),
		Math.cos(lat) * Math.sin(lon),
		Math.sin(lat),
	]
}

function compute({
	provinces: all,
	habitability,
	mesh,
	isLand,
	elevationKm,
	temperatureC,
	rainfallMm,
	originHint,
	planetRadiusKm,
	seed,
	horizonYear,
}: MigrationParams): MigrationOutput {
	const p = landGraph(all)
	const walk = walkGraph(all)
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
	const scale = suitabilityScale(raw, active)
	const suitability = Float64Array.from(raw, (v, i) =>
		active[i] ? (scale > 0 ? Math.max(0, Math.min(1, v / scale)) : 1) : 0,
	)
	const mass = new Float64Array(components.sizes.length)
	const areas = new Float64Array(p.count)
	const regionAreas = UNITS.regionAreasKm2({ mesh, planetRadiusKm })
	for (let r = 0; r < mesh.numRegions; r++) {
		const province = p.regionProvince[r]
		if (province >= 0) areas[province] += regionAreas[r]
	}
	for (let i = 0; i < p.count; i++)
		if (active[i]) mass[components.componentId[i]] += raw[i]
	const landmassKm2 = new Float64Array(walk.componentCount)
	for (let i = 0; i < p.count; i++)
		if (active[i]) landmassKm2[walk.componentId[i]] += areas[i]
	let component = -1
	for (let i = 0; i < mass.length; i++)
		if (component < 0 || mass[i] > mass[component]) component = i
	const warm = Uint8Array.from({ length: p.count }, (_, i) =>
		temperatureC[all.seeds[i]] >= ORIGIN_MIN_TEMPERATURE_C &&
		rainfallMm[all.seeds[i]] >= ORIGIN_MIN_RAINFALL_MM &&
		rainfallMm[all.seeds[i]] <= ORIGIN_MAX_RAINFALL_MM
			? 1
			: 0,
	)
	let anyWarm = false
	for (let i = 0; i < p.count && !anyWarm; i++)
		anyWarm =
			!!active[i] && components.componentId[i] === component && !!warm[i]
	const hint = originHint ? unitVector(originHint) : null
	let origin = -1
	let bestScore = -Infinity
	let bestTie = -Infinity
	for (let i = 0; i < p.count; i++) {
		if (!active[i]) continue
		if (hint) {
			const r = all.seeds[i] * 3
			const value =
				mesh.r_xyz[r] * hint[0] +
				mesh.r_xyz[r + 1] * hint[1] +
				mesh.r_xyz[r + 2] * hint[2]
			if (value > bestScore) {
				origin = i
				bestScore = value
			}
			continue
		}
		if (components.componentId[i] !== component) continue
		if (anyWarm && !warm[i]) continue
		let area = 0
		let score = 0
		let wet = 0
		const neighbors = [
			i,
			...p.adjList.subarray(p.adjOffset[i], p.adjOffset[i + 1]),
		]
		for (const q of neighbors)
			if (active[q]) {
				area += areas[q]
				score += areas[q] * suitability[q]
				if (p.waterAccess[q]) wet += areas[q]
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

	const open = SEA_LINKS.build({
		mesh,
		water: Uint8Array.from(isLand, (land) => (land ? 0 : 1)),
		regionProvince: p.regionProvince,
		active,
		planetRadiusKm,
	})
	const shelf = SEA_LINKS.build({
		mesh,
		water: Uint8Array.from(isLand, (land, r) =>
			!land && elevationKm[r] >= SHELF_ELEVATION_KM ? 1 : 0,
		),
		regionProvince: p.regionProvince,
		active,
		planetRadiusKm,
	})
	const between = (ids: Int32Array) => (links: SeaLink[]) =>
		links.filter((link) => ids[link.a] !== ids[link.b])
	const betweenLandmasses = between(p.landmassId)
	const betweenComponents = between(walk.componentId)
	const seaLinks = indexLinks({
		count: p.count,
		links: betweenLandmasses(open.links),
	})
	const walkSeaLinks = indexLinks({
		count: p.count,
		links: betweenComponents(open.links),
	})
	const walkShelfLinks = indexLinks({
		count: p.count,
		links: betweenComponents(shelf.links),
	})

	const provinceDistance = (a: number, b: number) =>
		UNITS.regionDistanceKm({
			r_xyz: mesh.r_xyz,
			fromRegion: p.seeds[a],
			toRegion: p.seeds[b],
			planetRadiusKm,
		})
	const continuousArrival = new Float64Array(p.count).fill(Infinity)
	const predecessor = new Int32Array(p.count).fill(-1)
	const edgeKind = new Uint8Array(p.count)
	const arrivalTier = new Uint8Array(p.count)
	const contact = new Float64Array(p.count).fill(Infinity)
	let landEdges = 0
	for (let i = 0; i < p.count; i++)
		if (active[i])
			for (let j = p.adjOffset[i]; j < p.adjOffset[i + 1]; j++)
				if (active[p.adjList[j]] && p.adjList[j] > i) landEdges++
	const originKm = new Float64Array(p.count)
	if (origin >= 0)
		for (let i = 0; i < p.count; i++) originKm[i] = provinceDistance(origin, i)
	if (origin >= 0) {
		const heap = new PriorityHeap<number>()
		continuousArrival[origin] = START_YEAR
		contact[origin] = START_YEAR
		heap.push(START_YEAR, origin)
		while (heap.size) {
			const entry = heap.pop()!
			const source = entry.value
			if (entry.key !== continuousArrival[source]) continue
			const visit = (edge: MigrationEdge) => {
				const q = edge.destination
				const crossing = !active[source] || !active[q]
				const arrival = transit({
					sourceArrival: entry.key,
					sourceOriginKm: originKm[source],
					distanceKm: edge.distanceKm,
					kind: edge.kind,
					meanSuitability: crossing
						? 0
						: (suitability[source] + suitability[q]) / 2,
					destinationLandmassKm2: landmassKm2[walk.componentId[q]],
					corridorBonus:
						!crossing &&
						(p.riverAccess[source] || p.waterAccess[source] === 2) &&
						(p.riverAccess[q] || p.waterAccess[q] === 2)
							? 1.25
							: 1,
				})
				if (arrival >= continuousArrival[q]) return
				continuousArrival[q] = arrival
				predecessor[q] = source
				const overland =
					edge.kind === "land" ||
					(edge.kind === "shelf" && entry.key < SHELF_CLOSES_YEAR)
				arrivalTier[q] = overland
					? arrivalTier[source]
					: seaTier({ distanceKm: edge.distanceKm })
				contact[q] = overland
					? contact[source]
					: Math.max(
							contact[source],
							seaCapabilityYear({ distanceKm: edge.distanceKm }),
						)
				edgeKind[q] = EDGE_KIND_CODE[edge.kind]
				heap.push(arrival, q)
			}
			for (
				let j = walk.adjOffset[source];
				j < walk.adjOffset[source + 1];
				j++
			) {
				const q = walk.adjList[j]
				visit({
					destination: q,
					distanceKm: provinceDistance(source, q),
					kind: "land",
				})
			}
			for (const link of walkSeaLinks[source])
				visit({
					destination: link.a === source ? link.b : link.a,
					distanceKm: link.distanceKm,
					kind: "sea",
				})
			for (const link of walkShelfLinks[source])
				visit({
					destination: link.a === source ? link.b : link.a,
					distanceKm: link.distanceKm,
					kind: "shelf",
				})
		}
	}
	if (origin >= 0) {
		const reachedProvinces: number[] = []
		for (let i = 0; i < p.count; i++)
			if (Number.isFinite(continuousArrival[i])) reachedProvinces.push(i)
		const first = new Float64Array(landmassKm2.length).fill(Infinity)
		for (const i of reachedProvinces) {
			const lm = walk.componentId[i]
			first[lm] = Math.min(first[lm], continuousArrival[i])
		}
		const kept = Uint8Array.from(landmassKm2, (area) =>
			area >= ISLAND_OPEN_AREA_KM2 ? 1 : 0,
		)
		kept[walk.componentId[origin]] = 1
		for (let changed = true; changed; ) {
			changed = false
			for (const i of reachedProvinces) {
				const from = predecessor[i]
				if (from < 0) continue
				const lm = walk.componentId[i]
				const fromLm = walk.componentId[from]
				if (kept[lm] && !kept[fromLm] && first[lm] > first[fromLm]) {
					kept[fromLm] = 1
					changed = true
				}
			}
		}
		const delay = Float64Array.from(first, (year, lm) =>
			kept[lm] || !Number.isFinite(year)
				? 0
				: Math.max(
						0,
						islandOpenYear({ destinationLandmassKm2: landmassKm2[lm] }) - year,
					),
		)
		for (const i of reachedProvinces)
			continuousArrival[i] += delay[walk.componentId[i]]
		for (const i of reachedProvinces) {
			while (
				predecessor[i] >= 0 &&
				continuousArrival[predecessor[i]] > continuousArrival[i]
			)
				predecessor[i] = predecessor[predecessor[i]]
		}
	}
	const settledPredecessor = new Int32Array(p.count).fill(-1)
	for (let i = 0; i < p.count; i++) {
		if (!active[i]) continue
		let from = predecessor[i]
		while (from >= 0 && !active[from]) from = predecessor[from]
		settledPredecessor[i] = from
	}
	for (let i = 0; i < p.count; i++)
		if (!active[i]) continuousArrival[i] = Infinity
	const lengths = open.links.map((link) => link.distanceKm)
	const nominalSpacingKm = Math.sqrt(
		(4 * Math.PI * planetRadiusKm ** 2) / Math.max(1, mesh.numRegions),
	)
	const reached = horizon({
		continuousArrival,
		desolate: p.desolate,
		horizonYear,
	})
	const result: MigrationResult = {
		origin,
		continuousArrival,
		areaKm2: Float32Array.from(areas),
		predecessor: settledPredecessor,
		edgeKind,
		arrivalTier,
		suitability,
		componentId: components.componentId,
		...reached,
		contactYear: Int32Array.from(reached.arrivalYear, (year, i) =>
			year === SENTINEL ? SENTINEL : Math.ceil(contact[i]),
		),
		diagnostics: {
			seaEdges: open.links.length,
			shelfEdges: shelf.links.length,
			landEdges,
			seaLengthQuantiles: quantiles(lengths),
			waterEdgeQuantiles: quantiles(open.waterEdgeLengths),
			nominalSpacingKm,
			gateSensitivityCounts: SEA_VOYAGE_KNOTS.slice(0, 3).map(
				(tier) =>
					lengths.filter((v) => Math.abs(v - tier.km) <= nominalSpacingKm)
						.length,
			),
			suitabilityScale: scale,
		},
	}
	return { result, landGraph: p, seaLinks }
}

function matureScore({
	siteScore,
	arrivalYear,
	year,
}: MatureScoreParams): number {
	const age = year - arrivalYear
	return age < CRADLE_RESIDENCE_YEARS
		? 0
		: siteScore * Math.min(age / CRADLE_RESIDENCE_YEARS, 2)
}

function cradleSpacingKm({ planetRadiusKm }: CradleSpacingParams): number {
	return (CRADLE_SPACING_KM * planetRadiusKm) / UNITS.defaultPlanetRadiusKm
}

function cradles({
	provinces,
	arrivalYear,
	siteScore,
	r_xyz,
	planetRadiusKm,
}: CradlesParams): CradleChoice[] {
	const spacingKm = cradleSpacingKm({ planetRadiusKm })
	const nearest = new Float64Array(provinces.count).fill(Infinity)
	const schedule: CradleChoice[] = []
	for (
		let year = CRADLE_FIRST_REVIEW_YEAR;
		year <= CRADLE_LAST_REVIEW_YEAR && schedule.length < MAX_CRADLES;
		year += CRADLE_REVIEW_STEP
	) {
		while (schedule.length < MAX_CRADLES) {
			const best = bestSpaced({
				provinces,
				nearest,
				spacingKm,
				value: (p) =>
					year - arrivalYear[p] < CRADLE_RESIDENCE_YEARS
						? -Infinity
						: matureScore({
								siteScore: siteScore[p],
								arrivalYear: arrivalYear[p],
								year,
							}),
			})
			if (best < 0) break
			schedule.push({
				province: best,
				selectionYear: year,
				arrivalYear: arrivalYear[best],
				residenceYears: year - arrivalYear[best],
				nearestDistanceKm: nearest[best],
			})
			addNearest({ provinces, nearest, site: best, r_xyz, planetRadiusKm })
		}
	}
	return schedule
}

function activeCradles({
	cradles: schedule,
	year,
}: ActiveCradlesParams): number[] {
	return schedule
		.filter((choice) => choice.selectionYear <= year)
		.map((choice) => choice.province)
}

function bestSpaced({
	provinces,
	nearest,
	spacingKm,
	value,
}: BestSpacedParams): number {
	let best = -1
	let score = -Infinity
	for (let p = 0; p < provinces.count; p++) {
		if (provinces.desolate[p] || nearest[p] < spacingKm) continue
		const v = value(p) * Math.min(nearest[p] / spacingKm, 2)
		if (v > score || (v === score && best >= 0 && p < best)) {
			best = p
			score = v
		}
	}
	return best
}

function addNearest({
	provinces,
	nearest,
	site,
	r_xyz,
	planetRadiusKm,
}: AddNearestParams): void {
	for (let p = 0; p < provinces.count; p++)
		nearest[p] = Math.min(
			nearest[p],
			UNITS.regionDistanceKm({
				r_xyz,
				fromRegion: provinces.seeds[p],
				toRegion: provinces.seeds[site],
				planetRadiusKm,
			}),
		)
}

function coreSeeds({
	provinces,
	settled,
	siteScore,
	activeCradles,
	r_xyz,
	planetRadiusKm,
}: CoreSeedsParams): number[] {
	const spacingKm = cradleSpacingKm({ planetRadiusKm })
	const nearest = new Float64Array(provinces.count).fill(Infinity)
	const seeds = activeCradles.filter((cradle) => settled[cradle])
	for (const site of seeds)
		addNearest({ provinces, nearest, site, r_xyz, planetRadiusKm })
	for (;;) {
		const site = bestSpaced({
			provinces,
			nearest,
			spacingKm,
			value: (p) => (settled[p] ? siteScore[p] : -Infinity),
		})
		if (site < 0) return seeds
		seeds.push(site)
		addNearest({ provinces, nearest, site, r_xyz, planetRadiusKm })
	}
}

function apportion({ weights, count }: ApportionParams): Int32Array {
	const sum = weights.reduce((total, weight) => total + weight, 0)
	const budgets = new Int32Array(weights.length)
	if (sum <= 0) return budgets
	const remainders = weights.map((weight, i) => {
		const exact = (count * weight) / sum
		budgets[i] = Math.floor(exact)
		return { i, rest: exact - budgets[i] }
	})
	let left = count - budgets.reduce((total, budget) => total + budget, 0)
	remainders.sort((x, y) => y.rest - x.rest || x.i - y.i)
	for (const { i } of remainders) {
		if (left <= 0) break
		budgets[i]++
		left--
	}
	return budgets
}

function growHeld({
	provinces,
	suitability,
	settled,
	mask,
	sources,
	budgets,
	count,
	r_xyz,
	planetRadiusKm,
}: GrowHeldParams): void {
	const cost = new Float64Array(provinces.count).fill(Infinity)
	const expanded = new Uint8Array(provinces.count)
	const used = new Int32Array(budgets.length)
	const full = (province: number) =>
		budgets.length > 0 &&
		used[provinces.landmassId[province]] >=
			budgets[provinces.landmassId[province]]
	const heap = new PriorityHeap<number>()
	let taken = mask.reduce((total, held) => total + held, 0)
	for (const source of sources)
		if (settled[source] && cost[source] > 0) {
			cost[source] = 0
			heap.push(0, source)
		}
	while (heap.size && taken < count) {
		const entry = heap.pop()!
		const province = entry.value
		if (entry.key !== cost[province] || expanded[province]) continue
		if (!mask[province]) {
			if (full(province)) continue
			mask[province] = 1
			taken++
			if (budgets.length) used[provinces.landmassId[province]]++
		}
		expanded[province] = 1
		for (
			let j = provinces.adjOffset[province];
			j < provinces.adjOffset[province + 1];
			j++
		) {
			const neighbor = provinces.adjList[j]
			if (!settled[neighbor] || mask[neighbor] || full(neighbor)) continue
			const next =
				entry.key +
				UNITS.regionDistanceKm({
					r_xyz,
					fromRegion: provinces.seeds[province],
					toRegion: provinces.seeds[neighbor],
					planetRadiusKm,
				}) /
					Math.max(0.1, suitability[neighbor])
			if (next < cost[neighbor]) {
				cost[neighbor] = next
				heap.push(next, neighbor)
			}
		}
	}
}

function heldCore({
	provinces,
	suitability,
	settled,
	siteScore,
	heldWeight,
	activeCradles,
	fallbackSource,
	count,
	r_xyz,
	planetRadiusKm,
}: HeldCoreParams): Uint8Array {
	const seeds = coreSeeds({
		provinces,
		settled,
		siteScore,
		activeCradles,
		r_xyz,
		planetRadiusKm,
	})
	const weights = new Array<number>(
		provinces.landmassId.reduce((max, id) => Math.max(max, id), -1) + 1,
	).fill(0)
	for (let p = 0; p < provinces.count; p++)
		if (settled[p] && provinces.landmassId[p] >= 0)
			weights[provinces.landmassId[p]] += heldWeight[p]
	const mask = new Uint8Array(provinces.count)
	const shared = {
		provinces,
		suitability,
		settled,
		mask,
		count,
		r_xyz,
		planetRadiusKm,
	}
	growHeld({
		...shared,
		sources: seeds.length ? seeds : [fallbackSource],
		budgets: apportion({ weights, count }),
	})
	const held: number[] = []
	for (let p = 0; p < provinces.count; p++) if (mask[p]) held.push(p)
	growHeld({
		...shared,
		sources: held.length ? held : [fallbackSource],
		budgets: new Int32Array(0),
	})
	return mask
}

export const MIGRATION = {
	startYear: START_YEAR,
	sentinel: SENTINEL,
	compute,
	transit,
	waveOf,
	matureScore,
	rampYears,
	routes,
	cradleSpacingKm,
	cradles,
	activeCradles,
	heldCore,
}
