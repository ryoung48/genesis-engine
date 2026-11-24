import { CRUST } from "@/model/geography/tectonics/crust"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import type {
	BasementScores,
	BasementScoresParams,
	MetamorphicShareParams,
} from "@/model/geography/terrain/rocks/basement/types"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MATH } from "@/model/shared/math/core"
import { HASH } from "@/model/shared/random/hash"

const C = SURFACE_CONFIG
const O = CRUST.OROGENY
const GEO = CRUST.GEO

const KINDS = {
	volcanic: 0,
	basalt: 1,
	granite: 2,
	slate: 3,
	gneiss: 4,
	shield: 5,
	ophiolite: 6,
} as const
const COUNT = 7

const ARC_BELTS = new Set<number>([O.ANDEAN, O.ARC])
const COLLISION_BELTS = new Set<number>([O.URAL, O.HIMALAYAN, O.TRANSPRESSION])

function addMetamorphic({
	score,
	base,
	share,
	granite,
	slate,
	gneiss,
}: MetamorphicShareParams): void {
	score[base + KINDS.granite] += share * granite * slate
	score[base + KINDS.slate] +=
		share * (1 - granite * slate) * slate * (1 - gneiss)
	score[base + KINDS.gneiss] += share * (1 - granite * slate) * gneiss
	score[base + KINDS.volcanic] += share * (1 - slate) * C.unwornVolcanic
	score[base + KINDS.slate] += share * (1 - slate) * (1 - C.unwornVolcanic)
}

function scores({ crust, seed }: BasementScoresParams): BasementScores {
	const n = crust.numCells
	const score = new Float32Array(COUNT * n)
	const greenShare = new Float32Array(n)
	const suture = new Float32Array(n)
	const lavaCap = new Float32Array(n)
	const rising = new Float32Array(n)
	const land = new Uint8Array(n)
	for (let c = 0; c < n; c++) {
		const type = crust.type[c]
		if (type === CRUST.TYPE.OCEAN) continue
		land[c] = 1
		const base = COUNT * c
		const geo = crust.geoFlags[c]
		const exhum = crust.exhumKm[c]
		const unroof = crust.unroofKm[c]
		const slate = MATH.ramp({ range: C.gradeSlateKm, x: exhum })
		const gneiss = MATH.ramp({ range: C.gradeGneissKm, x: exhum })
		const belt = crust.oroType[c]
		const live = belt
			? 1 - MATH.ramp({ range: C.arcActiveMyr, x: -crust.oroLast[c] })
			: 0
		const u = Math.min(1, crust.beltU[c])
		rising[c] = live * u
		const volc = crust.volcType[c]
		if (volc === CRUST.VOLCANIC.LIP && crust.volcKm[c] > 0)
			lavaCap[c] = MATH.clamp01(
				(crust.volcKm[c] - crust.volcWornKm[c]) / PRESENT_CONFIG.lipThicknessKm,
			)
		if (volc === CRUST.VOLCANIC.TRACK && crust.volcKm[c] > 0) {
			score[base + KINDS.basalt] = 1
			continue
		}
		const terrane = crust.terrane[c]
		if (type === CRUST.TYPE.CRATON && !belt) {
			score[base + KINDS.shield] = 1
			const share = HASH.unit({ seed, channel: terrane, salt: 1 })
			greenShare[c] =
				(C.greenstoneShare[0] +
					(C.greenstoneShare[1] - C.greenstoneShare[0]) * share) *
				(C.greenstoneBase -
					C.greenstoneWearGain *
						MATH.ramp({ range: C.greenstoneWearKm, x: exhum }))
			continue
		}
		const metamorphic = (share: number, granite: number) =>
			addMetamorphic({ score, base, share, granite, slate, gneiss })
		if (geo & GEO.OPHIOLITE) {
			score[base + KINDS.ophiolite] = C.ophioliteFlag
			metamorphic(1 - C.ophioliteFlag, 0)
			continue
		}
		if (crust.flags[c] & CRUST.FLAG.SUTURE) suture[c] = C.sutureOphiolite
		if (
			ARC_BELTS.has(belt) ||
			belt === O.LARAMIDE ||
			type === CRUST.TYPE.ARC ||
			(geo & GEO.WAS_ARC && !belt)
		) {
			const island = type === CRUST.TYPE.ARC
			const onArc =
				belt === O.ANDEAN
					? MATH.smoothstep({ edge0: 0, edge1: C.arcFront[0], x: u }) *
						(1 -
							MATH.smoothstep({
								edge0: C.arcFront[1] - 0.1,
								edge1: C.arcFront[1] + 0.1,
								x: u,
							}))
					: 1
			const lid =
				belt === O.LARAMIDE
					? 0
					: (1 -
							MATH.ramp({
								range: C.volcanicLidKm,
								x: live > 0.5 ? 0 : Math.max(0, unroof),
							})) *
						Math.max(onArc * Math.max(live, C.arcLiveFloor), island ? 1 : 0)
			if (island && lid > 0) {
				score[base + KINDS.basalt] += lid * C.islandBasalt
				score[base + KINDS.volcanic] += lid * (1 - C.islandBasalt)
			} else score[base + KINDS.volcanic] += lid
			const roots = 1 - lid
			score[base + KINDS.granite] +=
				roots *
				C.arcGranite *
				(1 - MATH.ramp({ range: C.gradeGneissKm, x: exhum }))
			metamorphic(roots * (1 - C.arcGranite), 0)
			if (!ARC_BELTS.has(belt))
				score[base + KINDS.granite] += roots * C.rootGranite
			continue
		}
		if (COLLISION_BELTS.has(belt) || belt === O.RIFT) {
			metamorphic(1, belt === O.RIFT ? C.beltGranite : C.collisionGranite)
			if (belt === O.RIFT) score[base + KINDS.basalt] += C.riftBasalt * live
			continue
		}
		metamorphic(1, C.beltGranite)
	}
	return { score, greenShare, suture, lavaCap, rising, land }
}

export const BASEMENT = { kinds: KINDS, count: COUNT, scores }
