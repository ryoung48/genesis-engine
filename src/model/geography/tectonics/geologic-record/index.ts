import { CRUST } from "@/model/geography/tectonics/crust"
import type {
	BuildGeologicRecordParams,
	FaciesMix,
	GeologicRecord,
	LayParams,
	OldFloodBasalts,
	OldFloodParams,
} from "@/model/geography/tectonics/geologic-record/types"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import { SIM_MESH } from "@/model/geography/tectonics/sim-mesh"
import { MATH } from "@/model/shared/math/core"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { VEC3 } from "@/model/shared/math/vec3"
import { RNG } from "@/model/shared/random/rng"

const P = PRESENT_CONFIG
const G = P.geology
const O = CRUST.OROGENY
const DEG = 180 / Math.PI
const LIVE_ARC = new Set<number>([O.ANDEAN, O.ARC, O.LARAMIDE])
const COLLIDES = new Set<number>([O.URAL, O.HIMALAYAN, O.TRANSPRESSION])
const FORELAND_BELTS = new Set<number>([
	O.ANDEAN,
	O.LARAMIDE,
	O.URAL,
	O.HIMALAYAN,
	O.INTRAPLATE,
])

function smooth({ a, b, x }: { a: number; b: number; x: number }): number {
	return MATH.smoothstep({ edge0: a, edge1: b, x })
}

function lerpPair({
	pair,
	t,
}: {
	pair: readonly [number, number]
	t: number
}): number {
	return pair[0] + (pair[1] - pair[0]) * t
}

function warmShare(lat: number): number {
	return 1 - smooth({ a: G.warmLat[0], b: G.warmLat[1], x: lat })
}

function aridShare(lat: number): number {
	return (
		smooth({ a: G.aridLat[0], b: G.aridLat[1], x: lat }) *
		(1 - smooth({ a: G.aridLat[2], b: G.aridLat[3], x: lat }))
	)
}

function wetShare(lat: number): number {
	return Math.max(
		1 - smooth({ a: G.wetLat[0], b: G.wetLat[1], x: lat }),
		smooth({ a: G.wetLat[2], b: G.wetLat[3], x: lat }) *
			(1 - smooth({ a: G.wetLat[4], b: G.wetLat[5], x: lat })),
	)
}

function lay({ mix, km, carb, salt, coal, organic }: LayParams): void {
	if (!(km > 0)) return
	const sum = carb + salt + coal + organic
	const f = sum > 1 ? 1 / sum : 1
	const w = km / (km + G.faciesMixKm)
	mix.carb += (carb * f - mix.carb) * w
	mix.salt += (salt * f - mix.salt) * w
	mix.coal += (coal * f - mix.coal) * w
	mix.organic += (organic * f - mix.organic) * w
	mix.km += km
}

function oldFloodBasalts({
	space,
	crust,
	isLand,
	toSea,
	seed,
}: OldFloodParams): OldFloodBasalts {
	const n = crust.numCells
	const { r_xyz } = space.mesh
	const R = space.radiusKm
	const rng = RNG.makeRng((seed ^ 0x01d1) >>> 0)
	const noise = new SimplexNoise((seed ^ 0x01d2) >>> 0)
	const age = new Float32Array(n)
	const worn = new Float32Array(n)
	const inland = (c: number) =>
		isLand(c) &&
		toSea[c] > P.recOldLipCoastKm &&
		crust.volcType[c] === CRUST.VOLCANIC.NONE
	const count = Math.round(lerpPair({ pair: P.recOldLipCount, t: rng() }))
	let cells = 0
	let provinces = 0
	for (let i = 0; i < count; i++) {
		const pr = RNG.makeRng(((seed ^ 0x01d3) + i * 7919) >>> 0)
		let c0 = -1
		for (let t = 0; t < 400 && c0 < 0; t++) {
			const z = 2 * pr() - 1
			const th = 2 * Math.PI * pr()
			const r = Math.sqrt(1 - z * z)
			const c = space.nearest({ x: r * Math.cos(th), y: r * Math.sin(th), z })
			if (inland(c)) c0 = c
		}
		if (c0 < 0) continue
		provinces++
		const a = lerpPair({ pair: P.recOldLipAgeMyr, t: pr() })
		const r0 = Math.sqrt(
			(P.recOldLipAreaKm2[0] *
				Math.exp(
					Math.log(P.recOldLipAreaKm2[1] / P.recOldLipAreaKm2[0]) * pr(),
				)) /
				Math.PI,
		)
		const w = Math.min(1, lerpPair({ pair: P.recOldLipWornShare, t: pr() }))
		const off = 10 * pr()
		const centre = VEC3.at({ xyz: r_xyz, cell: c0 })
		for (let c = 0; c < n; c++) {
			if (!isLand(c) || crust.volcType[c] !== CRUST.VOLCANIC.NONE || age[c] > 0)
				continue
			const d = VEC3.greatCircleKm({
				a: VEC3.at({ xyz: r_xyz, cell: c }),
				b: centre,
				radiusKm: R,
			})
			if (d > 1.6 * r0) continue
			const f = R / (0.6 * r0)
			const edge =
				r0 *
				(0.8 +
					0.45 *
						noise.noise3D(
							r_xyz[3 * c] * f + off,
							r_xyz[3 * c + 1] * f,
							r_xyz[3 * c + 2] * f - off,
						))
			if (d > edge) continue
			age[c] = a
			worn[c] = w
			cells++
		}
	}
	return { age, worn, cells, provinces }
}

function build({
	space,
	crust,
	seed,
	land,
}: BuildGeologicRecordParams): GeologicRecord {
	const n = crust.numCells
	const { adjOffset, adjList, r_xyz } = space.mesh
	const R = space.radiusKm
	const noise = new SimplexNoise((seed ^ 0x6e0c) >>> 0)
	const nAt = (c: number, km: number, off: number) => {
		const f = R / km
		return noise.noise3D(
			r_xyz[3 * c] * f + off,
			r_xyz[3 * c + 1] * f - off,
			r_xyz[3 * c + 2] * f + 0.5 * off,
		)
	}
	const isLand = (c: number) =>
		land[c] === 1 && crust.type[c] !== CRUST.TYPE.OCEAN
	const live = (c: number) =>
		crust.oroType[c] !== O.NONE && crust.oroLast[c] === 0
	const isCoast = (c: number) => {
		if (!isLand(c)) return false
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++)
			if (!isLand(adjList[k])) return true
		return false
	}
	const reach = ({
		isSource,
		canEnter,
		maxKm,
		carry,
	}: {
		isSource: (c: number) => boolean
		canEnter: (c: number) => boolean
		maxKm: number
		carry?: (c: number) => number
	}) =>
		SIM_MESH.dijkstra({
			space,
			isSource,
			canEnter,
			maxKm,
			carry: carry ?? (() => 0),
		})

	const toSea = reach({
		isSource: (c) => !isLand(c),
		canEnter: isLand,
		maxKm: Infinity,
	}).km
	const supply = reach({
		isSource: (c) =>
			isLand(c) &&
			crust.baseKm[c] + crust.upliftKm[c] + 0.5 * crust.rugged[c] >=
				G.supplyHighKm,
		canEnter: () => true,
		maxKm: 4 * G.supplyKm,
	}).km
	const liveArc = (c: number) => live(c) && LIVE_ARC.has(crust.oroType[c])
	const arcBehind = reach({
		isSource: (c) => isLand(c) && liveArc(c),
		canEnter: (c) => isLand(c) && !liveArc(c),
		maxKm: P.recOldArcKm,
	}).km
	const edgeOf = (c: number) =>
		FORELAND_BELTS.has(crust.oroType[c]) && crust.beltU[c] >= G.forelandEdgeU
			? -crust.oroLast[c]
			: FORELAND_BELTS.has(crust.prevType[c]) &&
					crust.prevU[c] >= G.forelandEdgeU
				? -crust.prevLast[c]
				: -1
	const foreward = reach({
		isSource: (c) => isLand(c) && edgeOf(c) >= 0,
		canEnter: (c) =>
			isLand(c) &&
			!(
				live(c) &&
				FORELAND_BELTS.has(crust.oroType[c]) &&
				crust.beltU[c] < G.forelandEdgeU
			),
		maxKm: G.forelandKm,
		carry: edgeOf,
	})
	const toFore = foreward.km
	const foreFrom = foreward.carried
	const active = reach({
		isSource: (c) => isLand(c) && live(c) && crust.oroType[c] !== O.RIFT,
		canEnter: isLand,
		maxKm: P.recActiveCoastKm,
	}).km
	const toRift = reach({
		isSource: (c) =>
			isLand(c) &&
			!!(crust.flags[c] & (CRUST.FLAG.FAILED_RIFT | CRUST.FLAG.RIFT_MARGIN)),
		canEnter: isLand,
		maxKm: P.recRiftKm * 3,
	}).km
	const toMargin = reach({
		isSource: (c) => isCoast(c) && active[c] === Infinity,
		canEnter: isLand,
		maxKm: P.recMarginKm * 3,
	}).km

	const terraneHash = new Map<number, number>()
	const hashOf = (t: number, salt: number) => {
		const k = t * 8 + salt
		let v = terraneHash.get(k)
		if (v === undefined) {
			v = RNG.makeRng((seed ^ 0x5e1d) + t * 7919 + salt * 131)()
			terraneHash.set(k, v)
		}
		return v
	}
	const stats: Record<string, number> = {
		land: 0,
		covered: 0,
		shield: 0,
		foreland: 0,
		shelf: 0,
		epeiric: 0,
		rift: 0,
		ophiolite: 0,
		arc: 0,
		accreted: 0,
		belted: 0,
		oldArc: 0,
	}
	const mix: FaciesMix = { km: 0, carb: 0, salt: 0, coal: 0, organic: 0 }
	const stand = P.recSeaStand

	for (let c = 0; c < n; c++) {
		if (!isLand(c)) continue
		stats.land++
		const type = crust.type[c]
		const oro = crust.oroType[c]
		const u = Math.min(1, crust.beltU[c])
		const core = 1 - smooth({ a: P.recCoreU[0], b: P.recCoreU[1], x: u })
		const isLive = live(c)
		const age = oro && !isLive ? -crust.oroLast[c] : 0
		const wobble = 1 + 0.25 * nAt(c, 500, 9.3)
		let flags = crust.geoFlags[c]
		const terrane = crust.terrane[c]
		const accreted =
			type !== CRUST.TYPE.CRATON &&
			type !== CRUST.TYPE.ARC &&
			!isLive &&
			hashOf(terrane, 2) < P.recAccretedArcShare
		let exhum = 0
		let since = 0
		if (type === CRUST.TYPE.CRATON)
			exhum =
				lerpPair({ pair: P.recShieldExhumKm, t: hashOf(terrane, 1) }) * wobble
		else if (accreted)
			exhum = lerpPair({ pair: P.recAccretedExhumKm, t: hashOf(terrane, 3) })
		else if (type !== CRUST.TYPE.ARC)
			exhum = lerpPair({ pair: G.beltExhumKm, t: hashOf(terrane, 1) }) * wobble
		if (oro && !isLive)
			since =
				lerpPair({
					pair: P.recPastExhumKm,
					t: 1 - Math.exp(-age / P.recExhumMyr),
				}) *
				(P.recBeltOuterWear + (1 - P.recBeltOuterWear) * core) *
				wobble
		else if (isLive && oro !== O.RIFT)
			since =
				Math.min(
					P.recLiveExhumMaxKm,
					P.recLiveExhumPerKm * (crust.upliftKm[c] + crust.rugged[c]),
				) * core
		const behind =
			arcBehind[c] > 0 && arcBehind[c] < Infinity
				? (1 -
						smooth({
							a: 0.6 * P.recOldArcKm,
							b: P.recOldArcKm,
							x: arcBehind[c],
						})) *
					smooth({
						a: -0.15,
						b: 0.15,
						x: nAt(c, 700, 41.9) + P.recOldArcShare - 0.5,
					})
				: 0
		const arcEnd = P.recOldArcMyrPerKm * arcBehind[c]
		if (accreted && !oro) since = 0
		else if (type !== CRUST.TYPE.ARC)
			exhum +=
				P.recUplandWearKm *
				(1 -
					smooth({
						a: P.recSwellKm[1],
						b: P.recSwellKm[0],
						x: crust.baseKm[c],
					})) *
				wobble
		exhum = Math.min(P.recExhumMaxKm, exhum + since)

		mix.km = 0
		mix.carb = 0
		mix.salt = 0
		mix.coal = 0
		mix.organic = 0
		const latNow = Math.abs(
			Math.asin(Math.max(-1, Math.min(1, r_xyz[3 * c + 2]))) * DEG,
		)
		const latAt = (driftDeg: number, off: number) =>
			Math.min(90, Math.abs(latNow + driftDeg * nAt(c, 3000, off)))
		const basin = smooth({
			a: P.recSwellKm[1],
			b: P.recSwellKm[0],
			x: crust.baseKm[c],
		})
		const pk = R / G.platformNoiseKm
		const sag = smooth({
			a: -0.1,
			b: 0.5,
			x:
				1.6 *
					noise.fbm(
						r_xyz[3 * c] * pk + 3.7,
						r_xyz[3 * c + 1] * pk + 0.4,
						r_xyz[3 * c + 2] * pk + 6.2,
						3,
						0.5,
					) +
				G.platformLowGain * (basin - G.platformLowMid),
		})
		let platform =
			P.recPlatformKm[1] * sag * (1 + P.recCoverVary * nAt(c, 900, 3.1))
		let bare = 0
		if (type === CRUST.TYPE.CRATON) {
			bare = smooth({
				a: -0.15,
				b: 0.15,
				x: nAt(c, P.recShieldPatchKm, 7.7) + P.recShieldBare - 0.6 * basin,
			})
			platform *= P.recShieldCover * (1 - bare)
			if (bare > 0.5) stats.shield++
		}
		if (accreted && !oro) platform *= P.recAccretedCover
		if (type === CRUST.TYPE.ARC) platform *= P.recArcCover
		platform = Math.max(0, platform)
		{
			const lat = latAt(P.recOldDriftDeg, 13.7)
			lay({
				mix,
				km: platform,
				carb: 0.7 * warmShare(lat),
				salt: 0.15 * aridShare(lat),
				coal: 0.03 * wetShare(lat),
				organic: 0.03,
			})
		}
		let cover = platform
		const rfIn = toRift[c] < Infinity ? Math.exp(-toRift[c] / P.recRiftKm) : 0
		const rfMargin =
			toMargin[c] < Infinity
				? Math.exp(-toMargin[c] / P.recMarginKm) *
					smooth({
						a: -0.2,
						b: 0.2,
						x: nAt(c, P.recMarginPatchKm, 31.7) + P.recMarginShare - 0.5,
					})
				: 0
		const rf =
			Math.max(rfIn, rfMargin) * (type === CRUST.TYPE.ARC || accreted ? 0.2 : 1)
		if (rf > 0.02) {
			const lat = latAt(P.recDriftDeg, 19.3)
			const arid = aridShare(lat)
			lay({
				mix,
				km: P.recRiftCoverKm * rf,
				carb: 0,
				salt: G.saltShare * arid,
				coal: G.coalShare * 0.5 * wetShare(lat),
				organic: G.organicShare * (1 - arid),
			})
			cover += P.recRiftCoverKm * rf
			if (rf > 0.5) {
				flags |= CRUST.GEO.RIFT_BASIN
				stats.rift++
			}
		}
		const fd = toFore[c]
		const fAge = foreFrom[c]
		const fs =
			fd < G.forelandKm ? 1 - smooth({ a: 0, b: G.forelandKm, x: fd }) : 0
		if (fs > 0.3) {
			flags |= CRUST.GEO.FORELAND
			stats.foreland++
		}
		if (fs > 0 && fAge > 0) {
			const km = P.recForelandKm * fs * Math.exp(-fAge / P.recForelandWearMyr)
			const lat = latAt(P.recDriftDeg, 23.9)
			lay({
				mix,
				km,
				carb: 0,
				salt: 0,
				coal: G.coalShare * wetShare(lat),
				organic: 0,
			})
			cover += km
		}
		if (oro && oro !== O.RIFT)
			cover *=
				(1 +
					P.recBeltThicken *
						smooth({ a: P.recCoreU[0], b: P.recCoreU[1], x: u })) *
				(1 - core)
		const low =
			basin *
			(1 - bare) *
			smooth({
				a: P.recFloodFromKm,
				b: P.recFloodFromKm * 0.4,
				x:
					toSea[c] < P.recFloodCoastKm
						? 0
						: crust.upliftKm[c] + crust.rugged[c],
			})
		const coastal =
			active[c] < Infinity
				? 0
				: Math.exp(-toSea[c] / P.recShelfKm) *
					smooth({
						a: P.recShelfHighKm,
						b: 0,
						x: crust.baseKm[c] + crust.upliftKm[c],
					})
		const flood = low * (0.5 + 0.5 * nAt(c, 1400, 11.3) ** 2 * 4)
		const floodMyr = P.recFloodMyr * Math.max(flood, coastal * 0.6)
		const sup = Math.exp(-supply[c] / G.supplyKm)
		const restricted = smooth({
			a: G.restrictedKm[0],
			b: G.restrictedKm[1],
			x: toSea[c],
		})
		if (low > 0.45 && floodMyr > 20) {
			const lat = latAt(P.recDriftDeg, 17.9)
			const warm = warmShare(lat)
			const km = G.epeiricRateKmPerMyr * floodMyr
			lay({
				mix,
				km,
				carb: (warm + G.coolCarbonate * (1 - warm)) * (1 - 0.5 * sup),
				salt: G.saltShare * aridShare(lat) * restricted,
				coal: 0,
				organic:
					G.organicShare *
					restricted *
					(0.4 + 0.6 * P.recSeaStandHigh) *
					(G.organicCool + (1 - G.organicCool) * warm),
			})
			cover += km
			flags |= CRUST.GEO.EPEIRIC
			stats.epeiric++
		}
		if (coastal > 0.02) {
			const lat = latAt(0.5 * P.recDriftDeg, 27.1)
			const warm = warmShare(lat)
			const km = P.recShelfCoverKm * coastal
			const shelfStand = Math.min(
				1,
				Math.max(0, stand + 0.8 * nAt(c, 1800, 51.3)),
			)
			lay({
				mix,
				km,
				carb: (warm + G.coolCarbonate * (1 - warm)) * (1 - sup),
				salt: 0,
				coal:
					coastal < 0.5 ? G.coalShare * wetShare(lat) * P.recParalicCoal : 0,
				organic:
					G.organicShare *
					G.organicShelf *
					shelfStand *
					(G.organicCool + (1 - G.organicCool) * warm),
			})
			cover += km
			if (coastal > 0.35) {
				flags |= CRUST.GEO.SHELF
				stats.shelf++
			}
		}
		if (fs > 0 && fAge === 0) {
			const lat = latAt(0, 0)
			const km = P.recForelandKm * fs
			lay({
				mix,
				km,
				carb: 0,
				salt: 0,
				coal: G.coalShare * wetShare(lat),
				organic: 0,
			})
			cover += km
		}
		if (isLive && (oro === O.ANDEAN || oro === O.ARC))
			cover *=
				P.recArcCover +
				(1 - P.recArcCover) *
					smooth({ a: P.recArcBandU[0], b: P.recArcBandU[1], x: u })
		const floodLast = -lerpPair({
			pair: P.recFloodAgoMyr,
			t: (0.5 + 0.5 * nAt(c, 2000, 5.5)) ** 2,
		})
		const sinking = Math.max(
			fAge === 0 ? fs : 0,
			coastal,
			isLive && oro === O.RIFT ? 1 : 0,
		)
		const exposedMyr =
			(1 - sinking) *
			(low > 0.45 && floodMyr > 20
				? -floodLast
				: Math.max(-floodLast, P.recCoverExposedMyr))
		const coverWorn = Math.min(
			cover,
			P.recCoverWearKmPerMyr *
				exposedMyr *
				(P.recCoverWearLow + (1 - P.recCoverWearLow) * (1 - basin)),
		)
		cover -= coverWorn
		crust.coverCarb[c] = mix.carb
		crust.coverSalt[c] = mix.salt
		crust.coverCoal[c] = mix.coal
		crust.coverOrganic[c] = mix.organic
		crust.coverKm[c] = cover
		const stripped = oro && oro !== O.RIFT ? P.recPlatformKm[1] * core : 0
		crust.coverMaxKm[c] = Math.max(
			cover + stripped,
			cover + coverWorn,
			cover + 0.5 * platform * (1 - sinking),
		)
		crust.coverMaxAt[c] =
			stripped > 0.5
				? isLive
					? crust.oroStart[c]
					: -age
				: sinking > 0.5
					? 0
					: floodLast * (1 - sinking)
		crust.exhumKm[c] = exhum
		crust.unroofKm[c] = isLive ? 0 : (oro ? since : exhum) - cover
		crust.floodMyr[c] = floodMyr
		crust.floodLast[c] = floodLast
		if (isLive && LIVE_ARC.has(oro)) {
			crust.arcMyr[c] = Math.max(
				crust.arcMyr[c],
				-crust.oroStart[c] * (1 - smooth({ a: 0.4, b: 0.8, x: u })),
			)
			if (oro === O.LARAMIDE || hashOf(terrane, 5) < P.recSlabChangeShare)
				flags |= CRUST.GEO.SLAB_CHANGE
		}
		if (type === CRUST.TYPE.ARC) {
			flags |= CRUST.GEO.WAS_ARC
			crust.arcMyr[c] = Math.max(
				crust.arcMyr[c],
				Math.min(P.recArcMaxMyr, -crust.formedAt[c]),
			)
			stats.arc++
		} else if (accreted) {
			flags |= CRUST.GEO.WAS_ARC
			crust.arcMyr[c] = Math.max(
				crust.arcMyr[c],
				lerpPair({ pair: P.recAccretedArcMyr, t: hashOf(terrane, 4) }),
			)
		}
		if (
			behind > 0.5 &&
			type === CRUST.TYPE.CONTINENT &&
			!isLive &&
			!(flags & CRUST.GEO.WAS_ARC)
		) {
			const arcMyr = lerpPair({
				pair: P.recAccretedArcMyr,
				t: 0.5 * (1 + nAt(c, 1500, 47.3)),
			})
			flags |= CRUST.GEO.WAS_ARC
			crust.arcMyr[c] = Math.max(crust.arcMyr[c], arcMyr)
			stats.oldArc++
			if (!oro) {
				crust.unroofKm[c] = P.recOldArcWearKmPerMyr * arcEnd - cover
				crust.exhumKm[c] = Math.min(
					exhum,
					Math.max(0, P.recOldArcWearKmPerMyr * arcEnd),
				)
				cover *= P.recAccretedCover
				crust.coverKm[c] = cover
			}
		}
		if (accreted) stats.accreted++
		if (oro) stats.belted++
		if (oro && COLLIDES.has(oro) && nAt(c, 1100, 57.1) > P.recBeltShelfAbove)
			flags |= CRUST.GEO.SHELF
		if (
			crust.flags[c] & CRUST.FLAG.SUTURE &&
			type !== CRUST.TYPE.CRATON &&
			nAt(c, P.recOphioliteKm, 23.3) > P.recOphioliteAbove
		) {
			flags |= CRUST.GEO.OPHIOLITE
			stats.ophiolite++
		}
		crust.geoFlags[c] = flags
		if (cover > 0.05) stats.covered++
	}
	const oldLip = oldFloodBasalts({ space, crust, isLand, toSea, seed })
	const shares: Record<string, number> = { land: stats.land }
	for (const [k, v] of Object.entries(stats))
		if (k !== "land") shares[k] = v / Math.max(1, stats.land)
	shares.oldLipCells = oldLip.cells
	return { oldLip, shares }
}

export const GEOLOGIC_RECORD = { build }
