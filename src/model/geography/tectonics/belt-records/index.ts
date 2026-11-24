import type {
	BeltLists,
	BeltRecords,
	BuildBeltRecordsParams,
	DownCellParams,
	FrontContext,
	FrontMotionParams,
	InitCrustParams,
	PushBeltParams,
	SegOfParams,
	SpreadFrontParams,
} from "@/model/geography/tectonics/belt-records/types"
import { CRUST } from "@/model/geography/tectonics/crust"
import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import { OROGENY } from "@/model/geography/tectonics/orogeny"
import { PLATE_MOTION } from "@/model/geography/tectonics/plate-motion"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import { TECTONIC_CONFIG } from "@/model/geography/tectonics/tectonic-config"
import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import type { SimFront } from "@/model/geography/tectonics/world-sample/types"
import { RNG } from "@/model/shared/random/rng"

const C = TECTONIC_CONFIG
const DEG = 180 / Math.PI
const F = TERRAIN_FEATURES.genesisTerrainFeature
const bit = (feature: number) => 2 ** (feature - 1)
const LAND_BITS =
	bit(F.FOLD_RIDGES) |
	bit(F.PLATEAU_UPLIFT) |
	bit(F.RIFT_VALLEY) |
	bit(F.PULL_APART_BASIN)
const TRENCH_BIT = bit(F.TRENCH)
const KIND_ORDER = ["rift", "subduction", "collision", "transform"] as const
const COUPLING_CM_YR = [-0.5, 2.0] as const
const ROLLBACK_SHARE = 0.25
const FLAT_SLAB_MYR = 20
const RIFT_SHOULDER_SHARE = 0.6

function initCrust({
	space,
	plate,
	crustType,
	seaAgeMyr,
	arc,
}: InitCrustParams): CrustRaster {
	const n = space.mesh.numRegions
	const crust = CRUST.create(n)
	crust.plate.set(plate)
	for (let c = 0; c < n; c++) {
		crust.type[c] = crustType[c]
		if (crustType[c] === CRUST.TYPE.CONTINENT) crust.formedAt[c] = -2000
		else if (crustType[c] === CRUST.TYPE.OCEAN)
			crust.formedAt[c] =
				arc.formedAtMyr[c] < 0 ? arc.formedAtMyr[c] : -seaAgeMyr[c]
		else crust.formedAt[c] = arc.formedAtMyr[c]
		crust.shelfSea[c] = arc.shelfSea[c]
		if (crustType[c] === CRUST.TYPE.OCEAN && arc.formedAtMyr[c] < 0)
			crust.riftAt[c] = arc.formedAtMyr[c]
	}
	return crust
}

function arcRecords({ space, crust, arc }: BuildBeltRecordsParams): void {
	const { adjOffset, adjList } = space.mesh
	const n = crust.numCells
	const hops = new Int32Array(n).fill(-1)
	const queue: number[] = []
	for (let c = 0; c < n; c++)
		if (crust.type[c] === CRUST.TYPE.ARC && arc.arcFront[c]) {
			hops[c] = 0
			queue.push(c)
		}
	for (let head = 0; head < queue.length; head++) {
		const c = queue[head]
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (crust.type[nb] !== CRUST.TYPE.ARC || hops[nb] >= 0) continue
			hops[nb] = hops[c] + 1
			queue.push(nb)
		}
	}
	let deepest = 0
	for (const c of queue) deepest = Math.max(deepest, hops[c])
	const reach = Math.min(C.arcBeltMaxKm, (deepest + 1) * space.edgeKm)
	for (const c of queue) {
		CRUST.recordOrogeny({
			crust,
			cell: c,
			oroType: CRUST.OROGENY.ARC,
			workKm: 0,
			time: crust.formedAt[c],
			quietMyr: C.orogenyQuietMyr,
		})
		crust.oroLast[c] = 0
		crust.beltU[c] = hops[c] / (deepest + 1)
		crust.beltReach[c] = reach
		crust.beltAt[c] = 0
		crust.geoFlags[c] |= CRUST.GEO.WAS_ARC
	}
	for (let c = 0; c < n; c++)
		if (crust.type[c] === CRUST.TYPE.ARC && hops[c] < 0) {
			CRUST.recordOrogeny({
				crust,
				cell: c,
				oroType: CRUST.OROGENY.ARC,
				workKm: 0,
				time: crust.formedAt[c],
				quietMyr: C.orogenyQuietMyr,
			})
			crust.oroLast[c] = 0
			crust.beltU[c] = 1
			crust.beltReach[c] = reach
			crust.geoFlags[c] |= CRUST.GEO.WAS_ARC
		}
}

function spreadFront({
	ctx,
	plate,
	type,
	side,
	cells,
	widths,
	works,
	shears,
	amps,
	oceanBits,
}: SpreadFrontParams): void {
	const { space, crust, featureMask } = ctx.params
	const mask = oceanBits ? LAND_BITS | TRENCH_BIT : LAND_BITS
	const allow = (c: number) =>
		crust.plate[c] === plate && (featureMask[c] & mask) !== 0
	const keep: number[] = []
	cells.forEach((c, i) => {
		if (allow(c)) keep.push(i)
	})
	const reached = OROGENY.spreadBelt({
		space,
		crust,
		sources: keep.map((i) => cells[i]),
		belt: {
			type,
			time: 0,
			side,
			widths: keep.map((i) => widths[i]),
			works: keep.map((i) => works[i]),
			shears: keep.map((i) => shears[i]),
			amps: keep.map((i) => amps[i]),
		},
		allow,
	})
	for (const c of reached)
		if (
			crust.oroStart[c] === 0 &&
			crust.oroLast[c] === 0 &&
			crust.oroType[c] !== CRUST.OROGENY.NONE
		)
			crust.oroStart[c] = -ctx.front.activeMyr
	ctx.reports.push({
		kind: ctx.front.kind,
		id: ctx.front.id,
		sources: keep.length,
		reached: reached.length,
	})
}

function downCell({ ctx, cell, plate }: DownCellParams): number {
	const { r_xyz } = ctx.params.space.mesh
	let best = -1
	let bestDot = -2
	for (const other of ctx.front.cells) {
		if (ctx.params.crust.plate[other] === plate) continue
		const d =
			r_xyz[3 * cell] * r_xyz[3 * other] +
			r_xyz[3 * cell + 1] * r_xyz[3 * other + 1] +
			r_xyz[3 * cell + 2] * r_xyz[3 * other + 2]
		if (d > bestDot) {
			bestDot = d
			best = other
		}
	}
	return best
}

function frontMotion({ ctx, i }: FrontMotionParams) {
	const closing = ctx.front.cellClosingCmYr[i]
	const along = ctx.front.cellAlongCmYr[i]
	const speed = Math.hypot(closing, along)
	return {
		closing,
		headOn: speed > 1e-9 ? Math.max(0, closing) / speed : 0,
		shear: Math.atan2(along, Math.max(1e-9, Math.abs(closing))) * DEG,
	}
}

function subduction(ctx: FrontContext): void {
	const { crust, motion, space, seaAgeMyr, arc } = ctx.params
	const { front } = ctx
	const T = front.activeMyr
	const over = front.overPlate
	if (motion.plates.isOcean.has(over)) return
	const { r_xyz } = space.mesh
	const andean = emptyBelt()
	const laramide = emptyBelt()
	front.cells.forEach((c, i) => {
		if (crust.plate[c] !== over) return
		if (
			crust.type[c] === CRUST.TYPE.ARC ||
			(crust.type[c] === CRUST.TYPE.OCEAN && arc.formedAtMyr[c] < 0)
		)
			return
		const down = downCell({ ctx, cell: c, plate: over })
		if (down < 0) return
		const m = frontMotion({ ctx, i })
		const rateCmYr = Math.abs(m.closing)
		const slabKm = rateCmYr * 10 * T
		const slabAge = seaAgeMyr[down]
		const shape = OROGENY.beltShape({ headOn: m.headOn, slabAgeMyr: slabAge })
		const flatShape = OROGENY.beltShape({ headOn: m.headOn, slabAgeMyr: null })
		const x = r_xyz[3 * c]
		const y = r_xyz[3 * c + 1]
		const z = r_xyz[3 * c + 2]
		const v = PLATE_MOTION.velocityCmYr({ motion, plate: over, x, y, z })
		let tx = r_xyz[3 * down] - x
		let ty = r_xyz[3 * down + 1] - y
		let tz = r_xyz[3 * down + 2] - z
		const radial = tx * x + ty * y + tz * z
		tx -= radial * x
		ty -= radial * y
		tz -= radial * z
		const tl = Math.hypot(tx, ty, tz) || 1
		const toward = -((v[0] * tx + v[1] * ty + v[2] * tz) / tl)
		const coupling =
			ROLLBACK_SHARE +
			(1 - ROLLBACK_SHARE) *
				Math.min(
					1,
					Math.max(
						0,
						(toward - COUPLING_CM_YR[0]) /
							(COUPLING_CM_YR[1] - COUPLING_CM_YR[0]),
					),
				)
		const work =
			slabKm *
			C.andeanWorkShare *
			coupling *
			segOf({ crust, seed: ctx.params.seed, cell: c })
		const flat = slabAge < C.flatSlabMaxAgeMyr && toward > C.flatSlabAdvanceCmYr
		const steep =
			OROGENY.beltWidthKm({ kind: "andean", workKm: work, rateCmYr }) * shape
		if (flat) {
			const flatKm = toward * 10 * Math.min(T, FLAT_SLAB_MYR)
			push({
				list: laramide,
				cell: c,
				work: work * flatShape,
				shear: m.shear,
				width: Math.min(
					C.belts.laramide.maxKm,
					Math.max(
						steep,
						OROGENY.beltWidthKm({ kind: "laramide", workKm: flatKm, rateCmYr }),
					) * shape,
				),
			})
		} else {
			push({
				list: andean,
				cell: c,
				work: work * flatShape,
				shear: m.shear,
				width: Math.min(C.belts.andean.maxKm, steep),
			})
		}
	})
	if (andean.cells.length)
		spreadFront({
			ctx,
			plate: over,
			type: CRUST.OROGENY.ANDEAN,
			side: CRUST.SIDE.NONE,
			...andean,
			oceanBits: true,
		})
	if (laramide.cells.length)
		spreadFront({
			ctx,
			plate: over,
			type: CRUST.OROGENY.LARAMIDE,
			side: CRUST.SIDE.NONE,
			...laramide,
			oceanBits: true,
		})
}

function segOf({ crust, seed, cell }: SegOfParams): number {
	const terrane = crust.terrane[cell]
	if (terrane <= 0) return 1
	return (
		1 -
		PRESENT_CONFIG.segmentVary * RNG.makeRng((seed ^ 0x5e63) + terrane * 7919)()
	)
}

function emptyBelt(): BeltLists {
	return { cells: [], widths: [], works: [], shears: [], amps: [] }
}

function push({ list, cell, work, shear, width }: PushBeltParams): void {
	list.cells.push(cell)
	list.works.push(work)
	list.shears.push(shear)
	list.widths.push(width)
	list.amps.push(1)
}

function collision(ctx: FrontContext): void {
	const { crust, space } = ctx.params
	const { front } = ctx
	const T = front.activeMyr
	const landOf = (p: number) => ctx.landCells.get(p) ?? 0
	const upper =
		landOf(front.plateA) >= landOf(front.plateB) ? front.plateA : front.plateB
	const lower = upper === front.plateA ? front.plateB : front.plateA
	const lengthKm = (front.cells.length / 2) * space.edgeKm
	const ural = lengthKm < C.sutureMinContactKm
	for (const [p, side] of [
		[upper, CRUST.SIDE.UPPER],
		[lower, CRUST.SIDE.LOWER],
	] as const) {
		const belt = emptyBelt()
		front.cells.forEach((c, i) => {
			if (crust.plate[c] !== p || crust.type[c] === CRUST.TYPE.OCEAN) return
			const m = frontMotion({ ctx, i })
			const rate = Math.abs(m.closing)
			const W0 = rate * 10 * T
			const kind = ural
				? "ural"
				: side === CRUST.SIDE.UPPER
					? "himalayan"
					: "foreland"
			const shape = OROGENY.beltShape({ headOn: m.headOn, slabAgeMyr: null })
			push({
				list: belt,
				cell: c,
				work: W0 * shape * segOf({ crust, seed: ctx.params.seed, cell: c }),
				shear: m.shear,
				width: Math.min(
					C.belts[kind].maxKm,
					OROGENY.beltWidthKm({ kind, workKm: W0, rateCmYr: rate }) * shape,
				),
			})
		})
		if (!belt.cells.length) continue
		spreadFront({
			ctx,
			plate: p,
			type: ural ? CRUST.OROGENY.URAL : CRUST.OROGENY.HIMALAYAN,
			side: ural ? CRUST.SIDE.NONE : side,
			...belt,
			oceanBits: false,
		})
		for (const c of belt.cells)
			if (crust.oroType[c] !== CRUST.OROGENY.NONE)
				crust.flags[c] |= CRUST.FLAG.SUTURE
	}
}

function transpression(ctx: FrontContext): void {
	const { crust } = ctx.params
	const { front } = ctx
	const T = front.activeMyr
	for (const p of [front.plateA, front.plateB]) {
		const belt = emptyBelt()
		front.cells.forEach((c, i) => {
			if (crust.plate[c] !== p || crust.type[c] === CRUST.TYPE.OCEAN) return
			const m = frontMotion({ ctx, i })
			if (m.closing <= 0) return
			const W0 = m.closing * 10 * T
			push({
				list: belt,
				cell: c,
				work: W0 * segOf({ crust, seed: ctx.params.seed, cell: c }),
				shear: m.shear,
				width: Math.min(
					C.belts.transpression.maxKm,
					OROGENY.beltWidthKm({
						kind: "transpression",
						workKm: W0,
						rateCmYr: m.closing,
					}),
				),
			})
		})
		if (!belt.cells.length) continue
		spreadFront({
			ctx,
			plate: p,
			type: CRUST.OROGENY.TRANSPRESSION,
			side: CRUST.SIDE.NONE,
			...belt,
			oceanBits: false,
		})
	}
}

function rift(ctx: FrontContext): void {
	const { crust, motion } = ctx.params
	const { front } = ctx
	if (
		motion.plates.isOcean.has(front.plateA) ||
		motion.plates.isOcean.has(front.plateB)
	)
		return
	for (const p of [front.plateA, front.plateB]) {
		const belt = emptyBelt()
		for (const c of front.cells) {
			if (crust.plate[c] !== p || crust.type[c] === CRUST.TYPE.OCEAN) continue
			push({
				list: belt,
				cell: c,
				work: C.riftShoulderWorkKm * RIFT_SHOULDER_SHARE,
				shear: 0,
				width: C.riftShoulderKm,
			})
		}
		if (!belt.cells.length) continue
		spreadFront({
			ctx,
			plate: p,
			type: CRUST.OROGENY.RIFT,
			side: CRUST.SIDE.NONE,
			...belt,
			oceanBits: false,
		})
		for (const c of belt.cells)
			if (crust.oroType[c] === CRUST.OROGENY.RIFT) {
				crust.flags[c] |= CRUST.FLAG.RIFT_MARGIN
				crust.riftAt[c] = -front.activeMyr
			}
	}
}

function build(params: BuildBeltRecordsParams): BeltRecords {
	const { crust, featureMask, simFronts } = params
	const n = crust.numCells
	arcRecords(params)
	const landCells = new Map<number, number>()
	for (let c = 0; c < n; c++)
		if (crust.type[c] !== CRUST.TYPE.OCEAN)
			landCells.set(crust.plate[c], (landCells.get(crust.plate[c]) ?? 0) + 1)
	const footprint = new Uint8Array(n)
	for (let c = 0; c < n; c++)
		if (featureMask[c] & (LAND_BITS | TRENCH_BIT)) footprint[c] = 1
	const reports: BeltRecords["reports"] = []
	const order = (a: SimFront, b: SimFront) =>
		KIND_ORDER.indexOf(a.kind as (typeof KIND_ORDER)[number]) -
			KIND_ORDER.indexOf(b.kind as (typeof KIND_ORDER)[number]) || a.id - b.id
	const fronts = simFronts.filter((f) => f.kind !== "ridge").sort(order)
	for (const front of fronts) {
		const ctx: FrontContext = { params, front, footprint, landCells, reports }
		if (front.kind === "rift") rift(ctx)
		else if (front.kind === "subduction") subduction(ctx)
		else if (front.kind === "collision") collision(ctx)
		else transpression(ctx)
	}
	return { footprint, reports }
}

export const BELT_RECORDS = { initCrust, build }
