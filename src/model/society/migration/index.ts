import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { PriorityHeap } from "@/model/shared/min-heap"
import { HASH } from "@/model/shared/random/hash"
import { UNITS } from "@/model/shared/units"
import { SEA_LINKS } from "@/model/society/migration/sea-links"
import type { SeaLink } from "@/model/society/migration/sea-links/types"
import type {
	ActiveCradlesParams,
	CapabilityParams,
	CradleChoice,
	CradleSpacingParams,
	CradlesParams,
	HeldCoreParams,
	HorizonParams,
	IndexLinksParams,
	MatureScoreParams,
	MigrationEdge,
	MigrationParams,
	MigrationResult,
	TargetParams,
	TransitParams,
	WaveParams,
} from "@/model/society/migration/types"
import type { GenesisProvinces } from "@/model/society/types"

const START_YEAR = -79999
const DISPERSAL_START_YEAR = -65000
const SENTINEL = 2147483647
const SHELF_CLOSES_YEAR = -9500
const SHELF_ELEVATION_KM = -0.06
const SUITABILITY_QUANTILE = 0.95
const EARLY_SPEED_KM_PER_YEAR = 0.7
const SUITABILITY_FLOOR = 0.05
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
	const speed = Math.max(SUITABILITY_FLOOR, meanSuitability) * corridorBonus
	const target =
		spreadProgress(sourceArrival) + distance / (EARLY_SPEED_KM_PER_YEAR * speed)
	return yearAtSpreadProgress(target)
}

function transit(input: TransitParams): number {
	const params = {
		...input,
		sourceArrival: Math.max(input.sourceArrival, DISPERSAL_START_YEAR),
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

function compute({
	provinces: all,
	habitability,
	mesh,
	isLand,
	elevationKm,
	planetRadiusKm,
	seed,
	horizonYear,
}: MigrationParams): MigrationResult {
	const p = landGraph(all)
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
	const landmassKm2 = new Float64Array(Math.max(0, ...p.landmassId) + 1)
	for (let i = 0; i < p.count; i++)
		if (active[i]) landmassKm2[p.landmassId[i]] += areas[i]
	let component = -1
	for (let i = 0; i < mass.length; i++)
		if (component < 0 || mass[i] > mass[component]) component = i
	let origin = -1
	let bestScore = -Infinity
	let bestTie = -Infinity
	for (let i = 0; i < p.count; i++) {
		if (!active[i] || components.componentId[i] !== component) continue
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
	const betweenLandmasses = (links: SeaLink[]) =>
		links.filter((link) => p.landmassId[link.a] !== p.landmassId[link.b])
	const seaLinks = indexLinks({
		count: p.count,
		links: betweenLandmasses(open.links),
	})
	const shelfLinks = indexLinks({
		count: p.count,
		links: betweenLandmasses(shelf.links),
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
	let landEdges = 0
	for (let i = 0; i < p.count; i++)
		if (active[i])
			for (let j = p.adjOffset[i]; j < p.adjOffset[i + 1]; j++)
				if (active[p.adjList[j]] && p.adjList[j] > i) landEdges++
	if (origin >= 0) {
		const heap = new PriorityHeap<number>()
		continuousArrival[origin] = START_YEAR
		heap.push(START_YEAR, origin)
		while (heap.size) {
			const entry = heap.pop()!
			const source = entry.value
			if (entry.key !== continuousArrival[source]) continue
			const visit = (edge: MigrationEdge) => {
				const q = edge.destination
				if (!active[q]) return
				const arrival = transit({
					sourceArrival: entry.key,
					distanceKm: edge.distanceKm,
					kind: edge.kind,
					meanSuitability: (suitability[source] + suitability[q]) / 2,
					destinationLandmassKm2: landmassKm2[p.landmassId[q]],
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
					edge.kind === "land" ||
					(edge.kind === "shelf" && entry.key < SHELF_CLOSES_YEAR)
						? arrivalTier[source]
						: seaTier({ distanceKm: edge.distanceKm })
				edgeKind[q] = EDGE_KIND_CODE[edge.kind]
				heap.push(arrival, q)
			}
			for (let j = p.adjOffset[source]; j < p.adjOffset[source + 1]; j++) {
				const q = p.adjList[j]
				visit({
					destination: q,
					distanceKm: provinceDistance(source, q),
					kind: "land",
				})
			}
			for (const link of seaLinks[source])
				visit({
					destination: link.a === source ? link.b : link.a,
					distanceKm: link.distanceKm,
					kind: "sea",
				})
			for (const link of shelfLinks[source])
				visit({
					destination: link.a === source ? link.b : link.a,
					distanceKm: link.distanceKm,
					kind: "shelf",
				})
		}
	}
	const lengths = open.links.map((link) => link.distanceKm)
	const nominalSpacingKm = Math.sqrt(
		(4 * Math.PI * planetRadiusKm ** 2) / Math.max(1, mesh.numRegions),
	)
	return {
		origin,
		continuousArrival,
		areaKm2: Float32Array.from(areas),
		predecessor,
		edgeKind,
		arrivalTier,
		suitability,
		componentId: components.componentId,
		...horizon({ continuousArrival, desolate: p.desolate, horizonYear }),
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
	const selected = new Set<number>()
	for (
		let year = CRADLE_FIRST_REVIEW_YEAR;
		year <= CRADLE_LAST_REVIEW_YEAR && schedule.length < MAX_CRADLES;
		year += CRADLE_REVIEW_STEP
	) {
		while (schedule.length < MAX_CRADLES) {
			let best = -1
			let score = -Infinity
			for (let p = 0; p < provinces.count; p++) {
				if (
					provinces.desolate[p] ||
					selected.has(p) ||
					year - arrivalYear[p] < CRADLE_RESIDENCE_YEARS ||
					nearest[p] < spacingKm
				)
					continue
				const value =
					matureScore({
						siteScore: siteScore[p],
						arrivalYear: arrivalYear[p],
						year,
					}) * Math.min(nearest[p] / spacingKm, 2)
				if (value > score || (value === score && p < best)) {
					best = p
					score = value
				}
			}
			if (best < 0) break
			schedule.push({
				province: best,
				selectionYear: year,
				arrivalYear: arrivalYear[best],
				residenceYears: year - arrivalYear[best],
				nearestDistanceKm: nearest[best],
			})
			selected.add(best)
			for (let p = 0; p < provinces.count; p++)
				nearest[p] = Math.min(
					nearest[p],
					UNITS.regionDistanceKm({
						r_xyz,
						fromRegion: provinces.seeds[p],
						toRegion: provinces.seeds[best],
						planetRadiusKm,
					}),
				)
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

function heldCore({
	provinces,
	suitability,
	settled,
	sources,
	count,
	r_xyz,
	planetRadiusKm,
}: HeldCoreParams): Uint8Array {
	const mask = new Uint8Array(provinces.count)
	const cost = new Float64Array(provinces.count).fill(Infinity)
	const heap = new PriorityHeap<number>()
	for (const source of sources)
		if (settled[source] && cost[source] > 0) {
			cost[source] = 0
			heap.push(0, source)
		}
	let taken = 0
	while (heap.size && taken < count) {
		const entry = heap.pop()!
		const province = entry.value
		if (entry.key !== cost[province] || mask[province]) continue
		mask[province] = 1
		taken++
		for (
			let j = provinces.adjOffset[province];
			j < provinces.adjOffset[province + 1];
			j++
		) {
			const neighbor = provinces.adjList[j]
			if (!settled[neighbor] || mask[neighbor]) continue
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
	return mask
}

export const MIGRATION = {
	startYear: START_YEAR,
	sentinel: SENTINEL,
	compute,
	transit,
	waveOf,
	matureScore,
	cradleSpacingKm,
	cradles,
	activeCradles,
	heldCore,
}
