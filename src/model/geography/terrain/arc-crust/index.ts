import { PLATE_FRONTS } from "@/model/geography/tectonics/plate-fronts"
import { PLATE_MOTION } from "@/model/geography/tectonics/plate-motion"
import { SEA_FLOOR } from "@/model/geography/tectonics/sea-floor"
import type {
	ArcCrust,
	ArcCrustRun,
	ArcFrontReport,
	BuildArcCrustParams,
	CellParams,
	DistanceField,
	DistanceFromParams,
	FrontParams,
	FrontReportParams,
	Keep,
	MakeDistanceFromParams,
	RunArcCrustParams,
	SidesOfParams,
	SlotKmParams,
	StageContext,
	StrikeParams,
	TowardTrenchParams,
} from "@/model/geography/terrain/arc-crust/types"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { PriorityHeap } from "@/model/shared/min-heap"
import { RNG } from "@/model/shared/random/rng"

const CRUST = { CONTINENT: 0, ARC: 1, OCEAN: 2 } as const
const ARC_TYPE = { OCEANIC: 1, CONTINENTAL: 2, SUNDA: 3 } as const

const ARC_MIN_RATE_CM_YR = 2
const ARC_MIN_SLAB_MYR = 15
const ARC_MATURE_CONSUMED_KM = 1000
const ARC_ROW_WIDTH_KM = 121
const ARC_WIDEN_SLAB_KM = 500
const ARC_MAX_KM = 280
const ARC_AGE_MYR: [number, number] = [25, 120]
const ARC_NEAR_CHANCE = 0.9
const ARC_FAR_CHANCE = 0.3
const ARC_NEAR_KM = 500
const ARC_FAR_KM = 1800
const ARC_SEG_KM = 900
const ARC_FADE_SHARE = 0.2
const ARC_YOUNG_SHARE = 0.15
const ARC_VARY_KM = 500
const ARC_WIDTH_VARY: [number, number] = [0.45, 1.5]
const ARC_SETBACK_KM: [number, number] = [40, 150]

const BACK_ARC_BASE = 0.35
const BACK_ARC_AGE_GAIN = 0.35
const BACK_ARC_DRIVE_GAIN = 0.12
const BACK_ARC_MAX_CHANCE = 0.85
const BACK_ARC_MIN_CELLS = 4
const BACK_ARC_SEG_KM = 1600
const BACK_ARC_ARC_KM: [number, number] = [120, 220]
const BACK_ARC_SEA_KM: [number, number] = [220, 520]
const BACK_ARC_AGE_MYR: [number, number] = [6, 30]
const BACK_ARC_ISLAND_MYR: [number, number] = [40, 140]

const SUNDA_CHANCE = 0.3
const SUNDA_MAX = 2
const SUNDA_SHELF_KM: [number, number] = [600, 1200]
const SUNDA_BLOCK_KM = 750
const SUNDA_KEEP_SHARE = 0.38
const SUNDA_FADE_KM = 260
const SUNDA_DEEP_KM = 260
const SUNDA_ARC_ISLAND_KM = 700
const SUNDA_STRAIT_SHARE = 0.22
const FRAGMENT_KM = 350
const FRAGMENT_SHARE = 0.14

const SEED_STRIKE = 0xa7c5
const SEED_SPLIT = 0xbac6
const SEED_ARC_AGE = 0xa7c1
const SEED_ARC_ALONG = 0xa7c3
const SEED_SPLIT_SHAPE = 0xbac5
const SEED_SUNDA = 0x5d0a

const SPREAD_SAMPLES = 8192
let spread: Float32Array | null = null

function smooth01(x: number): number {
	const t = Math.min(1, Math.max(0, x))
	return t * t * (3 - 2 * t)
}

function lerpRange(range: [number, number], t: number): number {
	return range[0] + (range[1] - range[0]) * t
}

function uniformOf(v: number): number {
	if (!spread) {
		const ref = new SimplexNoise(0x5eed)
		spread = new Float32Array(SPREAD_SAMPLES)
		for (let i = 0; i < SPREAD_SAMPLES; i++)
			spread[i] = ref.noise3D(
				i * 0.7317 + 0.13,
				i * 0.3191 - 4.7,
				i * 0.5531 + 9.1,
			)
		spread.sort()
	}
	let lo = 0
	let hi = spread.length
	while (lo < hi) {
		const m = (lo + hi) >> 1
		if (spread[m] < v) lo = m + 1
		else hi = m
	}
	return lo / spread.length
}

function slotKmOf({ mesh, radiusKm }: SlotKmParams): Float32Array {
	const km = new Float32Array(mesh.neighborDist.length)
	for (let k = 0; k < km.length; k++)
		km[k] = 2 * Math.asin(Math.min(1, mesh.neighborDist[k] / 2)) * radiusKm
	return km
}

function makeDistanceFrom({
	mesh,
	slotKm,
}: MakeDistanceFromParams): (params: DistanceFromParams) => DistanceField {
	const { numRegions, adjOffset, adjList } = mesh
	return ({ sources, reaches, allowed }) => {
		const km = new Float64Array(numRegions).fill(Infinity)
		const reach = new Float32Array(numRegions)
		const src = new Int32Array(numRegions).fill(-1)
		const heap = new PriorityHeap<number>()
		sources.forEach((c, j) => {
			if (reaches[j] > reach[c] || km[c] > 0) {
				km[c] = 0
				if (reaches[j] > reach[c]) {
					reach[c] = reaches[j]
					src[c] = j
				}
				heap.push(0, c)
			}
		})
		for (let top = heap.pop(); top; top = heap.pop()) {
			const c = top.value
			const dc = top.key
			if (dc > km[c]) continue
			for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
				const nb = adjList[k]
				if (!allowed(nb)) continue
				const nd = dc + slotKm[k]
				if (nd < km[nb] && nd <= reach[c]) {
					km[nb] = nd
					reach[nb] = reach[c]
					src[nb] = src[c]
					heap.push(nd, nb)
				}
			}
		}
		return { km, reach, src }
	}
}

function isOceanPlate({ ctx, cell }: CellParams): boolean {
	return ctx.motion.plates.isOcean.has(ctx.motion.plates.cellPlate[cell])
}

function towardTrenchCmYr({ ctx, over, down }: TowardTrenchParams): number {
	const { r_xyz } = ctx.mesh
	const ox = r_xyz[3 * over]
	const oy = r_xyz[3 * over + 1]
	const oz = r_xyz[3 * over + 2]
	const dx = r_xyz[3 * down] - ox
	const dy = r_xyz[3 * down + 1] - oy
	const dz = r_xyz[3 * down + 2] - oz
	const dp = dx * ox + dy * oy + dz * oz
	const tx = dx - dp * ox
	const ty = dy - dp * oy
	const tz = dz - dp * oz
	const tLen = Math.hypot(tx, ty, tz) || 1
	const v = PLATE_MOTION.velocityCmYr({
		motion: ctx.motion,
		plate: ctx.motion.plates.cellPlate[over],
		x: ox,
		y: oy,
		z: oz,
	})
	return (v[0] * tx + v[1] * ty + v[2] * tz) / tLen
}

function sidesOf({ ctx, edge }: SidesOfParams) {
	const { edges } = ctx.fronts
	const overA = edges.overA[edge] === 1
	return {
		over: overA ? edges.cellA[edge] : edges.cellB[edge],
		down: overA ? edges.cellB[edge] : edges.cellA[edge],
		closingCmYr: edges.closingCmYr[edge],
	}
}

function marginSplits({ ctx, front }: FrontParams): number {
	let drive = 0
	let age = 0
	let m = 0
	for (const edge of front.edges) {
		const { over, down } = sidesOf({ ctx, edge })
		if (isOceanPlate({ ctx, cell: over })) continue
		drive += towardTrenchCmYr({ ctx, over, down })
		age += ctx.seaAgeMyr[down]
		m++
	}
	if (m < BACK_ARC_MIN_CELLS) return 0
	drive /= m
	age /= m
	return Math.min(
		BACK_ARC_MAX_CHANCE,
		Math.max(
			0,
			BACK_ARC_BASE +
				(BACK_ARC_AGE_GAIN * (age - 60)) / 100 -
				BACK_ARC_DRIVE_GAIN * drive,
		),
	)
}

function buildArc({ ctx, front, report }: FrontReportParams): void {
	const { crust, mesh, seed } = ctx
	const cellPlate = ctx.motion.plates.cellPlate
	const sources: { cell: number; slabKm: number }[] = []
	for (const edge of front.edges) {
		const { over, down, closingCmYr } = sidesOf({ ctx, edge })
		if (!isOceanPlate({ ctx, cell: over })) continue
		const slabKm = closingCmYr * 10 * front.activeMyr
		if (
			slabKm > ARC_MATURE_CONSUMED_KM &&
			closingCmYr >= ARC_MIN_RATE_CM_YR &&
			ctx.seaAgeMyr[down] >= ARC_MIN_SLAB_MYR
		)
			sources.push({ cell: over, slabKm })
	}
	if (!sources.length) return
	const plate = cellPlate[sources[0].cell]
	const arcAge = lerpRange(
		ARC_AGE_MYR,
		RNG.makeRng((seed ^ SEED_ARC_AGE) + front.id)(),
	)
	const r = RNG.makeRng((seed ^ SEED_ARC_ALONG) + front.id)
	const off = [1000 * r(), 1000 * r(), 1000 * r()]
	const keep: Keep[] = []
	for (const { cell, slabKm } of sources) {
		const t = smooth01(
			(ARC_FAR_KM - ctx.contKm[cell]) / (ARC_FAR_KM - ARC_NEAR_KM),
		)
		const chance = ARC_FAR_CHANCE + (ARC_NEAR_CHANCE - ARC_FAR_CHANCE) * t
		const here =
			chance - ctx.strike({ cell, waveKm: ARC_SEG_KM, offset: off[0] })
		if (here <= 0) continue
		const grow = smooth01(here / ARC_FADE_SHARE)
		const wide = ctx.strike({ cell, waveKm: ARC_VARY_KM, offset: off[1] })
		const back = ctx.strike({ cell, waveKm: ARC_VARY_KM, offset: off[2] })
		const setback = lerpRange(ARC_SETBACK_KM, back)
		const width =
			Math.min(
				ARC_MAX_KM,
				ARC_ROW_WIDTH_KM *
					(1 + (slabKm - ARC_MATURE_CONSUMED_KM) / ARC_WIDEN_SLAB_KM),
			) *
			lerpRange(ARC_WIDTH_VARY, wide) *
			(0.4 + 0.6 * grow)
		const age =
			Math.min(front.activeMyr, arcAge) *
			(ARC_YOUNG_SHARE + (1 - ARC_YOUNG_SHARE) * grow)
		keep.push({ cell, setback, reach: setback + width, grow, age })
	}
	if (!keep.length) return
	report.arcSources = keep.map((k) => k.cell)
	const d = ctx.distanceFrom({
		sources: report.arcSources,
		reaches: keep.map((k) => k.reach),
		allowed: (c) =>
			cellPlate[c] === plate && crust.crustType[c] === CRUST.OCEAN,
	})
	for (let c = 0; c < mesh.numRegions; c++) {
		if (d.reach[c] <= 0 || d.km[c] > d.reach[c]) continue
		const k = keep[d.src[c]]
		if (d.km[c] < k.setback) continue
		crust.crustType[c] = CRUST.ARC
		crust.arcType[c] = ARC_TYPE.OCEANIC
		crust.formedAtMyr[c] = -k.age
		if (d.km[c] < k.setback + ctx.edgeKm) crust.arcFront[c] = 1
		report.arcCells++
	}
}

function buildSplit({ ctx, front, report }: FrontReportParams): void {
	const { crust, mesh, seed, edgeKm } = ctx
	const cellPlate = ctx.motion.plates.cellPlate
	if (report.splitChance <= 0) return
	const splitOff = 1000 * RNG.makeRng((seed ^ SEED_SPLIT) + front.id)()
	const cells: number[] = []
	const taper: number[] = []
	for (const edge of front.edges) {
		const { over } = sidesOf({ ctx, edge })
		if (isOceanPlate({ ctx, cell: over })) continue
		const here =
			report.splitChance -
			ctx.strike({ cell: over, waveKm: BACK_ARC_SEG_KM, offset: splitOff })
		if (here <= 0) continue
		cells.push(over)
		taper.push(smooth01(here / ARC_FADE_SHARE))
	}
	report.splitSources = cells
	if (!cells.length) return
	const plate = cellPlate[cells[0]]
	const r = RNG.makeRng((seed ^ SEED_SPLIT_SHAPE) + front.id)
	const arcKm = lerpRange(BACK_ARC_ARC_KM, r())
	let seaKm = lerpRange(BACK_ARC_SEA_KM, r())
	const seaAge = lerpRange(BACK_ARC_AGE_MYR, r())
	const islandAge = lerpRange(BACK_ARC_ISLAND_MYR, r())
	const rs = RNG.makeRng((seed ^ SEED_SUNDA) + front.id)
	const sunda = rs() < SUNDA_CHANCE && ctx.sundaFronts < SUNDA_MAX
	if (sunda) {
		ctx.sundaFronts++
		seaKm = lerpRange(SUNDA_SHELF_KM, rs())
	}
	report.sunda = sunda
	const fragOff = 1000 * rs()
	const blockOff = 1000 * rs()
	const d = ctx.distanceFrom({
		sources: cells,
		reaches: taper.map((t) => arcKm + seaKm * t),
		allowed: (c) => cellPlate[c] === plate && !isOceanPlate({ ctx, cell: c }),
	})
	const sundaSea: number[] = []
	for (let c = 0; c < mesh.numRegions; c++) {
		if (d.reach[c] <= 0 || d.km[c] > d.reach[c]) continue
		if (d.km[c] <= arcKm || d.reach[c] - arcKm < 2 * edgeKm) {
			const strait =
				sunda &&
				ctx.strike({
					cell: c,
					waveKm: SUNDA_ARC_ISLAND_KM,
					offset: blockOff + 71.3,
				}) < SUNDA_STRAIT_SHARE
			if (strait) {
				crust.crustType[c] = CRUST.OCEAN
				crust.formedAtMyr[c] = -seaAge
				crust.shelfSea[c] = 1
				sundaSea.push(c)
				report.seaCells++
				continue
			}
			crust.crustType[c] = CRUST.ARC
			crust.arcType[c] = sunda ? ARC_TYPE.SUNDA : ARC_TYPE.CONTINENTAL
			crust.formedAtMyr[c] = -Math.min(front.activeMyr, islandAge)
			report.islandCells++
			if (d.km[c] < edgeKm) crust.arcFront[c] = 1
		} else if (sunda) {
			const edge = smooth01((d.reach[c] - d.km[c]) / SUNDA_FADE_KM)
			const k =
				0.7 *
					ctx.strike({ cell: c, waveKm: SUNDA_BLOCK_KM, offset: blockOff }) +
				0.3 *
					ctx.strike({
						cell: c,
						waveKm: SUNDA_BLOCK_KM / 2.3,
						offset: blockOff + 37.1,
					})
			if (k < (1 - SUNDA_KEEP_SHARE) * edge) {
				crust.crustType[c] = CRUST.OCEAN
				crust.formedAtMyr[c] = -seaAge * (0.4 + 0.6 * k)
				crust.shelfSea[c] = 1
				sundaSea.push(c)
				report.seaCells++
			}
		} else if (
			d.km[c] - arcKm > 1.5 * edgeKm &&
			d.reach[c] - d.km[c] > 1.5 * edgeKm &&
			ctx.strike({ cell: c, waveKm: FRAGMENT_KM, offset: fragOff }) >
				1 - FRAGMENT_SHARE
		) {
			report.fragmentCells++
		} else {
			const w = d.reach[c] - arcKm
			crust.crustType[c] = CRUST.OCEAN
			crust.formedAtMyr[c] =
				-seaAge * Math.min(1, 2 * Math.abs((d.km[c] - arcKm) / w - 0.5) + 0.2)
			report.seaCells++
		}
	}
	if (!sundaSea.length) return
	const { adjOffset, adjList } = mesh
	const rim = sundaSea.filter((c) => {
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++)
			if (crust.crustType[adjList[k]] !== CRUST.OCEAN) return true
		return false
	})
	const dk = ctx.distanceFrom({
		sources: rim,
		reaches: rim.map(() => 4 * SUNDA_DEEP_KM),
		allowed: (c) => crust.shelfSea[c] === 1,
	})
	for (const c of sundaSea) {
		if (dk.km[c] <= SUNDA_DEEP_KM) continue
		crust.shelfSea[c] = 0
		crust.sundaDeep[c] = 1
		report.sundaDeepCells++
	}
}

function build({
	mesh,
	planetRadiusKm,
	seed,
	motion,
	fronts,
	seaAgeMyr,
}: BuildArcCrustParams): ArcCrust {
	const { numRegions, r_xyz } = mesh
	const cellPlate = motion.plates.cellPlate
	const crust: ArcCrust = {
		crustType: new Uint8Array(numRegions),
		arcType: new Uint8Array(numRegions),
		formedAtMyr: new Float32Array(numRegions),
		shelfSea: new Uint8Array(numRegions),
		sundaDeep: new Uint8Array(numRegions),
		arcFront: new Uint8Array(numRegions),
		reports: [],
	}
	const continental: number[] = []
	for (let c = 0; c < numRegions; c++) {
		const land = !motion.plates.isOcean.has(cellPlate[c])
		crust.crustType[c] = land ? CRUST.CONTINENT : CRUST.OCEAN
		if (land) continental.push(c)
	}
	const slotKm = slotKmOf({ mesh, radiusKm: planetRadiusKm })
	let edgeSum = 0
	for (let k = 0; k < slotKm.length; k++) edgeSum += slotKm[k]
	const distanceFrom = makeDistanceFrom({ mesh, slotKm })
	const noise = new SimplexNoise((seed ^ SEED_STRIKE) >>> 0)
	const strike = ({ cell, waveKm, offset }: StrikeParams) => {
		const f = planetRadiusKm / waveKm
		return uniformOf(
			noise.noise3D(
				r_xyz[3 * cell] * f + offset,
				r_xyz[3 * cell + 1] * f - 0.7 * offset,
				r_xyz[3 * cell + 2] * f + 0.3 * offset,
			),
		)
	}
	const contKm = distanceFrom({
		sources: continental,
		reaches: continental.map(() => ARC_FAR_KM),
		allowed: () => true,
	}).km
	const ctx: StageContext = {
		mesh,
		edgeKm: edgeSum / Math.max(1, slotKm.length),
		seed,
		motion,
		fronts,
		seaAgeMyr,
		crust,
		contKm,
		strike,
		distanceFrom,
		sundaFronts: 0,
	}
	for (const front of fronts.subduction) {
		const report: ArcFrontReport = {
			id: front.id,
			activeMyr: front.activeMyr,
			arcSources: [],
			arcCells: 0,
			splitSources: [],
			splitChance: marginSplits({ ctx, front }),
			sunda: false,
			seaCells: 0,
			islandCells: 0,
			fragmentCells: 0,
			sundaDeepCells: 0,
		}
		buildArc({ ctx, front, report })
		buildSplit({ ctx, front, report })
		crust.reports.push(report)
	}
	return crust
}

function run({
	mesh,
	planetRadiusKm,
	seed,
	plates,
}: RunArcCrustParams): ArcCrustRun {
	const motion = PLATE_MOTION.build({ mesh, plates })
	const fronts = PLATE_FRONTS.build({
		mesh,
		motion,
		planetRadiusKm,
		seed,
		durationGroup: (plate) => plate,
	})
	const seaAgeMyr = SEA_FLOOR.build({ mesh, plates, fronts, planetRadiusKm })
	const crust = build({ mesh, planetRadiusKm, seed, motion, fronts, seaAgeMyr })
	return { crust, motion, fronts, seaAgeMyr }
}

export const ARC_CRUST = { CRUST, ARC_TYPE, run }
