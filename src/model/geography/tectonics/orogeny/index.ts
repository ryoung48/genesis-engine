import { BELT_PROFILE } from "@/model/geography/tectonics/belt-profile"
import { CRUST } from "@/model/geography/tectonics/crust"
import type {
	BeltShapeParams,
	BeltWidthParams,
	BuildHeightsParams,
	SpreadBeltParams,
} from "@/model/geography/tectonics/orogeny/types"
import { SIM_MESH } from "@/model/geography/tectonics/sim-mesh"
import { TECTONIC_CONFIG } from "@/model/geography/tectonics/tectonic-config"

const C = TECTONIC_CONFIG
const WEAK = CRUST.FLAG.SUTURE | CRUST.FLAG.FAILED_RIFT | CRUST.FLAG.RIFT_MARGIN

function beltWidthKm({ kind, workKm, rateCmYr }: BeltWidthParams): number {
	const b = C.belts[kind]
	const speed = Math.min(
		C.beltSpeedFactorMax,
		Math.max(
			C.beltSpeedFactorMin,
			(Math.max(0, rateCmYr) / C.beltSpeedRefCmYr) ** C.beltSpeedExponent,
		),
	)
	return Math.min(b.maxKm, b.baseKm + b.perKm * workKm) * speed
}

function beltShape({ headOn, slabAgeMyr }: BeltShapeParams): number {
	const h = Math.min(1, Math.max(0, headOn))
	let k = C.beltObliqueMin + (1 - C.beltObliqueMin) * h * h
	if (slabAgeMyr !== null) {
		const youth =
			1 + C.beltYoungSlabBoost * (1 - slabAgeMyr / C.beltYoungSlabRefMyr)
		k *= Math.min(1 + C.beltYoungSlabBoost, Math.max(C.beltOldSlabMin, youth))
	}
	return k
}

function beltReliefKm({
	type,
	reachKm,
}: {
	type: number
	reachKm: number
}): number {
	const kind = CRUST.OROGENY_KINDS[type]
	const H = C.heights
	return (
		H.reliefKm[kind] *
		(H.youngShare +
			(1 - H.youngShare) * Math.min(1, reachKm / H.fullReachKm[kind]))
	)
}

function buildHeights({
	crust,
	cell,
	type,
	side,
	u,
	reachKm,
	workKm,
	thickenedKm,
	amp,
}: BuildHeightsParams): void {
	const H = C.heights
	const kind = CRUST.OROGENY_KINDS[type]
	crust.rootKm[cell] += thickenedKm * H.rootGain[kind]
	const A = amp * beltReliefKm({ type, reachKm })
	const share = 1 - Math.exp(-workKm / H.upliftBuildKm[kind])
	const own =
		crust.type[cell] === CRUST.TYPE.ARC &&
		(type === CRUST.OROGENY.ANDEAN || type === CRUST.OROGENY.ARC)
			? H.arcUpliftShare
			: 1
	const target =
		own * A * BELT_PROFILE.broad({ type, side, d: u * reachKm, reach: reachKm })
	const up = crust.upliftKm[cell]
	if (target >= 0 ? target > up : target < up)
		crust.upliftKm[cell] += (target - up) * share
	if (A > crust.rugged[cell])
		crust.rugged[cell] += (A - crust.rugged[cell]) * share
}

function spreadBelt({
	space,
	crust,
	sources,
	belt,
	allow,
}: SpreadBeltParams): Int32Array {
	if (!sources.length) return new Int32Array(0)
	const { adjOffset, adjList } = space.mesh
	const n = crust.numCells
	const u = new Float32Array(n).fill(Infinity)
	const src = new Int32Array(n).fill(-1)
	const seaKm = new Float32Array(n)
	const rimKm = new Float32Array(n)
	const seaLimit = C.apronKm * 1.5 + space.edgeKm
	const dist = (a: number, b: number) => SIM_MESH.distanceKm({ space, a, b })
	const queue: number[] = []
	sources.forEach((c, i) => {
		if (belt.widths[i] <= 0 || belt.works[i] <= 0) return
		if (src[c] < 0) queue.push(c)
		else if (belt.widths[i] <= belt.widths[src[c]]) return
		u[c] = 0
		src[c] = i
	})
	for (let head = 0; head < queue.length; head++) {
		const c = queue[head]
		const here = u[c]
		const atSea = crust.type[c] === CRUST.TYPE.OCEAN
		const reach = belt.widths[src[c]]
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (!allow(nb)) continue
			if (crust.type[nb] === CRUST.TYPE.OCEAN) {
				if (!atSea) continue
				const sea = seaKm[c] + dist(c, nb)
				if (sea > seaLimit || u[nb] < Infinity) continue
				u[nb] = 0
				src[nb] = src[c]
				seaKm[nb] = sea
				queue.push(nb)
				continue
			}
			let hop = dist(c, nb) * (crust.flags[nb] & WEAK ? C.weakCellCost : 1)
			let rim = 0
			if (crust.type[nb] === CRUST.TYPE.CRATON) {
				const d = dist(c, nb)
				rim = crust.type[c] === CRUST.TYPE.CRATON ? rimKm[c] + d : 0.5 * d
				if (rim > C.cratonRimKm) continue
				hop *= C.cratonRimCost
			}
			const next = atSea ? 0 : here + hop / reach
			if (next >= u[nb] || next > 1) continue
			u[nb] = next
			src[nb] = src[c]
			rimKm[nb] = rim
			queue.push(nb)
		}
	}
	const reached = Int32Array.from(new Set(queue)).sort()
	for (const c of reached) {
		if (u[c] === Infinity || crust.type[c] === CRUST.TYPE.OCEAN) continue
		const rimCell = crust.type[c] === CRUST.TYPE.CRATON
		if (rimCell && !(C.cratonRimKm > 0)) continue
		const i = src[c]
		const workKm = belt.works[i] * (rimCell ? C.cratonRimShare : 1)
		const work = u[c] === 0 ? workKm : workKm * C.beltWorkShare * (1 - u[c])
		const wasType = crust.oroType[c]
		const wasStart = crust.oroStart[c]
		const wasLast = crust.oroLast[c]
		CRUST.recordOrogeny({
			crust,
			cell: c,
			oroType: belt.type,
			workKm: work,
			time: belt.time,
			quietMyr: C.orogenyQuietMyr,
		})
		if (
			wasType !== CRUST.OROGENY.NONE &&
			crust.beltReach[c] > 0 &&
			(crust.oroType[c] !== wasType || crust.oroStart[c] !== wasStart)
		) {
			crust.prevType[c] = wasType
			crust.prevLast[c] = wasLast
			crust.prevU[c] = crust.beltU[c]
			crust.prevReach[c] = crust.beltReach[c]
			crust.prevSide[c] = crust.beltSide[c]
			crust.prevShear[c] = crust.beltShear[c]
			crust.prevRugged[c] = crust.rugged[c]
			crust.rugged[c] = 0
			crust.beltReach[c] = 0
		}
		if (
			crust.oroType[c] === belt.type &&
			(crust.beltReach[c] === 0 ||
				crust.beltAt[c] < belt.time ||
				u[c] < crust.beltU[c])
		) {
			crust.beltU[c] = u[c]
			crust.beltReach[c] = belt.widths[i]
			crust.beltAt[c] = belt.time
			crust.beltSide[c] = belt.side
			crust.beltShear[c] = Math.max(
				-90,
				Math.min(90, Math.round(belt.shears[i])),
			)
		}
		const thickened = rimCell
			? 0
			: workKm * C.beltWorkShare * (1 - u[c] ** 2) * C.thickeningPerWorkKm
		crust.thickKm[c] += thickened
		buildHeights({
			crust,
			cell: c,
			type: belt.type,
			side: belt.side,
			u: u[c],
			reachKm: belt.widths[i],
			workKm,
			thickenedKm: thickened,
			amp: (rimCell ? C.cratonRimShare : 1) * belt.amps[i],
		})
		if (thickened > 0)
			CRUST.thickenCover({
				crust,
				cell: c,
				thickenedKm: thickened,
				time: belt.time,
				crustKm: C.geology.crustKm,
			})
	}
	return reached
}

export const OROGENY = { beltWidthKm, beltShape, spreadBelt }
