import { CRUST } from "@/model/geography/tectonics/crust"
import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import type {
	KeepParams,
	RecordField,
	RecordFields,
	RecordParams,
	WindowParams,
} from "@/model/geography/terrain/deposits/record/types"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MATH } from "@/model/shared/math/core"
import { HASH } from "@/model/shared/random/hash"

const C = DEPOSIT_CONFIG
const H = C.halfLifeMyr
const O = CRUST.OROGENY
const GEO = CRUST.GEO
const FLAG = CRUST.FLAG
const TYPE = CRUST.TYPE
const ARC_BELTS = new Set<number>([O.ANDEAN, O.ARC])
const COLLISION_BELTS = new Set<number>([O.URAL, O.HIMALAYAN, O.TRANSPRESSION])
const FIELDS: readonly RecordField[] = [
	"porphyry",
	"epithermal",
	"orogenicGold",
	"vms",
	"skarn",
	"mvt",
	"sedex",
	"tin",
	"iocg",
	"ioa",
	"ironVein",
	"magmatic",
	"nativeCopper",
	"kimberlite",
	"greenstone",
	"bif",
	"reef",
	"oil",
	"shelfOil",
	"shelfGas",
	"gas",
	"bitumen",
	"oilShale",
	"coal",
	"ironstone",
	"shale",
	"pegmatite",
	"marble",
	"hotspot",
	"lip",
	"foldShale",
	"coverNow",
	"craton",
]
const SALT = {
	reef: 0x3175,
	ancient: 0xa7c1,
	endow: 0xe11d,
	diamond: 0xd1a3,
	diamondRich: 0xd1a4,
	bif: 0xb1f0,
	bifRich: 0xb1f1,
	iocg: 0x10c6,
}

function windowKm({ wear, top, bottom, width }: WindowParams): number {
	return (
		MATH.smoothstep({ edge0: top - width, edge1: top + width, x: wear }) *
		(1 -
			MATH.smoothstep({
				edge0: bottom - width,
				edge1: bottom + width,
				x: wear,
			}))
	)
}

function keep({ age, half }: KeepParams): number {
	return 0.5 ** (Math.max(0, age) / half)
}

function potential({ crust, seed, granite }: RecordParams): RecordFields {
	const n = crust.numCells
	const P = Object.fromEntries(
		FIELDS.map((key) => [key, new Float32Array(n)]),
	) as RecordFields
	const hash = (terrane: number, salt: number) =>
		HASH.unit({ seed, channel: terrane, salt })
	let reefTerrane = -1
	let reefDraw = -1
	for (let c = 0; c < n; c++) {
		if (crust.type[c] !== TYPE.CRATON) continue
		const draw = hash(crust.terrane[c], SALT.reef)
		if (draw > reefDraw) {
			reefDraw = draw
			reefTerrane = crust.terrane[c]
		}
	}
	for (let c = 0; c < n; c++) {
		const type = crust.type[c]
		if (type === TYPE.OCEAN) continue
		const flags = crust.flags[c]
		const geo = crust.geoFlags[c]
		const belt = crust.oroType[c]
		const prevBelt = crust.prevType[c]
		const terrane = crust.terrane[c]
		const ex = crust.exhumKm[c]
		const un = Math.max(0, crust.unroofKm[c])
		const arcMyr = crust.arcMyr[c]
		const cover = crust.coverKm[c]
		const coverMax = crust.coverMaxKm[c]
		const maxAgo = Math.max(0, -crust.coverMaxAt[c])
		const carb = crust.coverCarb[c]
		const salt = crust.coverSalt[c]
		const coal = crust.coverCoal[c]
		const organic = crust.coverOrganic[c]
		const quiet = belt ? -crust.oroLast[c] : Infinity
		const prevQuiet = prevBelt ? -crust.prevLast[c] : Infinity
		const arcBelt = ARC_BELTS.has(belt) || belt === O.LARAMIDE
		const arcAge = arcBelt
			? quiet
			: Math.max(0, Math.min(-crust.formedAt[c], C.historyMyr) - arcMyr)
		const orogenAge = Math.min(quiet, prevQuiet, C.historyMyr)
		const live = belt
			? 1 - MATH.ramp({ range: SURFACE_CONFIG.arcActiveMyr, x: quiet })
			: 0
		const beltAge = belt ? -crust.oroStart[c] : 0
		const u = Math.min(1, crust.beltU[c])
		const thick = crust.thickKm[c]
		const lip = crust.volcType[c] === CRUST.VOLCANIC.LIP && crust.volcKm[c] > 0
		const lipLeft = lip ? Math.max(0, crust.volcKm[c] - crust.volcWornKm[c]) : 0
		const lipWorn = lip
			? MATH.clamp01(crust.volcWornKm[c] / Math.max(0.05, crust.volcKm[c]))
			: 0
		const rift = !!(
			geo & GEO.RIFT_BASIN ||
			flags & FLAG.FAILED_RIFT ||
			belt === O.RIFT
		)
		P.craton[c] = type === TYPE.CRATON ? 1 : 0
		P.coverNow[c] = cover
		const arcLike =
			arcBelt || type === TYPE.ARC || geo & GEO.WAS_ARC || arcMyr > 0
		if (arcLike) {
			const island = type === TYPE.ARC
			const arcLive = arcBelt ? live : 0
			const wear =
				arcLive > 0.5 ? 0.5 + C.liveWearKmPerMyr * Math.min(arcMyr, 25) : un + 1
			const epiWear = arcLive > 0.5 ? 0.3 : un + 0.3
			const young =
				arcLive > 0.5
					? 1
					: arcBelt
						? 1 - MATH.ramp({ range: [25, 70], x: quiet })
						: 0
			const onArc =
				belt === O.ANDEAN
					? MATH.ramp({ range: [0.03, 0.15], x: u }) *
						(1 - MATH.ramp({ range: [0.45, 0.6], x: u }))
					: belt === O.LARAMIDE
						? 0.3
						: 1
			const fert =
				MATH.ramp({ range: [2, 24], x: arcMyr + 6 * live }) *
				(0.55 + 0.45 * MATH.ramp({ range: [3, 20], x: thick })) *
				(geo & GEO.SLAB_CHANGE ? 1.35 : 1) *
				(island ? 0.8 : 1)
			P.porphyry[c] =
				fert *
				onArc *
				windowKm({ wear: wear, top: 0.8, bottom: 5.5, width: 0.6 }) *
				keep({ age: arcAge, half: H.porphyry })
			P.epithermal[c] =
				fert *
				Math.max(onArc, 0.5) *
				(1 - MATH.ramp({ range: [0.7, 1.6], x: epiWear })) *
				young *
				keep({ age: arcAge, half: H.epithermal })
			if (geo & GEO.WAS_ARC && COLLISION_BELTS.has(belt))
				P.porphyry[c] = Math.max(
					P.porphyry[c],
					0.6 *
						live *
						windowKm({ wear: ex, top: 0.8, bottom: 6, width: 0.6 }) *
						keep({ age: quiet, half: H.porphyry }),
				)
			if (belt === O.ANDEAN)
				P.iocg[c] = Math.max(
					P.iocg[c],
					0.6 *
						MATH.ramp({ range: [0, 0.05], x: u }) *
						(1 - MATH.ramp({ range: [0.1, 0.2], x: u })) *
						windowKm({ wear: un + 2, top: 1, bottom: 8, width: 0.5 }),
				)
			P.ioa[c] =
				fert *
				(belt === O.ANDEAN
					? MATH.ramp({ range: [0, 0.05], x: u }) *
						(1 - MATH.ramp({ range: [0.25, 0.4], x: u }))
					: 0.5) *
				windowKm({ wear: wear, top: 0.5, bottom: 8, width: 0.6 }) *
				keep({ age: arcAge, half: H.ioa })
		}
		const beltWear =
			live > 0.5
				? 1 + C.liveWearKmPerMyr * Math.min(Math.max(0, beltAge), 40)
				: un + 4
		if (COLLISION_BELTS.has(belt) && belt !== O.TRANSPRESSION)
			P.tin[c] =
				MATH.ramp({ range: [12, 30], x: thick }) *
				windowKm({ wear: beltWear, top: 3, bottom: 12, width: 1 }) *
				MATH.ramp({ range: [0.35, 0.6], x: u }) *
				keep({ age: quiet, half: H.tin })
		if (belt === O.ANDEAN)
			P.tin[c] = Math.max(
				P.tin[c],
				MATH.ramp({ range: [0.6, 0.78], x: u }) *
					MATH.ramp({ range: [8, 22], x: thick }) *
					windowKm({ wear: beltWear, top: 2.5, bottom: 12, width: 1 }) *
					keep({ age: quiet, half: H.tin }),
			)
		const collided = COLLISION_BELTS.has(belt) || COLLISION_BELTS.has(prevBelt)
		const collAge = COLLISION_BELTS.has(belt)
			? quiet
			: COLLISION_BELTS.has(prevBelt)
				? prevQuiet
				: C.historyMyr
		if (collided || flags & FLAG.SUTURE)
			P.orogenicGold[c] =
				(flags & FLAG.SUTURE ? 0.9 : 0.7) *
				MATH.ramp({ range: [30, 70], x: beltAge }) *
				windowKm({ wear: beltWear, top: 2, bottom: 18, width: 1 }) *
				keep({ age: collAge, half: H.orogenicGold })
		if (belt || prevBelt)
			P.ironVein[c] =
				(collided ? 1 : arcBelt ? 0.8 : 0.6) *
				windowKm({
					wear: Math.max(ex, beltWear),
					top: 0.3,
					bottom: 14,
					width: 0.8,
				}) *
				keep({ age: orogenAge, half: H.ironVein })
		if (type === TYPE.ARC || geo & GEO.WAS_ARC || geo & GEO.OPHIOLITE) {
			const docked = type !== TYPE.ARC ? 1 : 0.6
			P.vms[c] =
				docked *
				(geo & GEO.OPHIOLITE ? 0.75 : 1) *
				MATH.ramp({ range: [0, 0.6], x: ex + un + 0.3 }) *
				(1 - MATH.ramp({ range: [12, 18], x: ex })) *
				keep({ age: Math.min(arcAge, orogenAge), half: H.vms })
		}
		P.skarn[c] =
			MATH.ramp({ range: [0.04, 0.25], x: granite[c] }) *
			MATH.ramp({
				range: [0.05, 0.3],
				x: Math.max(carb, geo & (GEO.SHELF | GEO.EPEIRIC) ? 0.25 : 0),
			}) *
			windowKm({ wear: beltWear, top: 0.5, bottom: 10, width: 0.8 }) *
			keep({ age: Math.min(arcAge, orogenAge), half: H.skarn })
		if (cover > 0.2) {
			P.mvt[c] =
				MATH.ramp({ range: [0.15, 0.5], x: carb }) *
				(geo & GEO.FORELAND ? 1 : 0.4) *
				(0.75 + 0.5 * MATH.ramp({ range: [0.05, 0.3], x: salt })) *
				keep({ age: maxAgo, half: H.mvt })
			if (rift || flags & FLAG.RIFT_MARGIN)
				P.sedex[c] =
					MATH.ramp({ range: [0.4, 1.5], x: coverMax }) *
					(0.5 + 0.5 * MATH.ramp({ range: [0.05, 0.35], x: organic })) *
					(1 - 0.6 * carb) *
					keep({ age: maxAgo, half: H.sedex })
		}
		if (lip) {
			P.magmatic[c] =
				MATH.ramp({ range: C.magmaticWorn, x: lipWorn }) *
				(0.7 + 0.3 * MATH.ramp({ range: [0.05, 0.3], x: salt + 0.25 * coal }))
			if (rift || flags & FLAG.RIFT_MARGIN)
				P.nativeCopper[c] = MATH.ramp({ range: [0.05, 0.4], x: lipLeft })
		}
		if (type === TYPE.CRATON) {
			const ancient = hash(terrane, SALT.ancient) < C.ancientCratonShare
			const endow = 0.3 + hash(terrane, SALT.endow)
			P.greenstone[c] = Math.min(1.2, endow)
			if (ancient && hash(terrane, SALT.diamond) < C.diamondCratonShare)
				P.kimberlite[c] = 0.6 + 0.4 * hash(terrane, SALT.diamondRich)
			if (hash(terrane, SALT.bif) < C.bifCratonShare)
				P.bif[c] = 0.6 + 0.4 * hash(terrane, SALT.bifRich)
			if (terrane === reefTerrane) P.reef[c] = 1
			if (belt || prevBelt || lip)
				P.iocg[c] = Math.max(P.iocg[c], 0.5 + 0.5 * hash(terrane, SALT.iocg))
		} else if (prevBelt || belt)
			P.iocg[c] = Math.max(
				P.iocg[c],
				0.25 * keep({ age: orogenAge, half: H.iocg }),
			)
		if (coverMax > 0.5) {
			const grad = rift
				? 40
				: geo & GEO.WAS_ARC || ARC_BELTS.has(belt)
					? 34
					: geo & GEO.FORELAND || type === TYPE.CRATON
						? 22
						: 28
			const T = 15 + grad * 0.85 * coverMax
			const removed = Math.max(0, coverMax - cover)
			const oilWindow =
				MATH.ramp({ range: [55, 75], x: T }) *
				(1 - 0.6 * MATH.ramp({ range: [190, 260], x: T }))
			const gasWindow = MATH.ramp({ range: [120, 155], x: T })
			const source =
				MATH.ramp({ range: [0.02, 0.15], x: organic }) *
				MATH.ramp({ range: [0.8, 2], x: coverMax })
			const coalSource =
				MATH.ramp({ range: [0.06, 0.3], x: coal }) *
				MATH.ramp({ range: [1, 3], x: coverMax })
			const fold = belt || geo & GEO.FORELAND ? 1 : 0
			const trap = Math.min(
				1,
				Math.max(
					0.5,
					0.95 * fold,
					2.5 * salt,
					rift ? 0.8 : 0,
					0.7 * MATH.ramp({ range: [0.2, 0.5], x: carb }),
				),
			)
			const tau = 180 + 300 * MATH.ramp({ range: [0.08, 0.3], x: salt })
			const kept = Math.exp(-maxAgo / tau)
			P.oil[c] =
				source *
				oilWindow *
				trap *
				kept *
				(1 - MATH.ramp({ range: [1, 3], x: removed }))
			if (geo & (GEO.SHELF | GEO.EPEIRIC) || rift) {
				P.shelfOil[c] = source * oilWindow * trap * kept
				P.shelfGas[c] =
					Math.max(
						source * gasWindow,
						coalSource * MATH.ramp({ range: [100, 140], x: T }),
					) *
					trap *
					Math.sqrt(kept)
			}
			P.gas[c] =
				Math.max(
					source * gasWindow,
					coalSource * MATH.ramp({ range: [100, 140], x: T }),
				) *
				trap *
				Math.sqrt(kept) *
				(1 - MATH.ramp({ range: [2, 4], x: removed }))
			P.bitumen[c] =
				source *
				Math.max(oilWindow, 0.4) *
				MATH.ramp({ range: [0.6, 2], x: removed }) *
				MATH.ramp({ range: [0.1, 0.5], x: cover })
			P.oilShale[c] =
				MATH.ramp({ range: [0.04, 0.2], x: organic }) *
				(1 - MATH.ramp({ range: [50, 70], x: T })) *
				MATH.ramp({ range: [0.2, 0.6], x: cover })
		}
		P.coal[c] =
			MATH.ramp({ range: [0.06, 0.3], x: coal }) *
			MATH.ramp({ range: [0.2, 1.2], x: cover })
		if (geo & (GEO.SHELF | GEO.EPEIRIC))
			P.ironstone[c] =
				MATH.ramp({ range: [4, 30], x: crust.floodMyr[c] }) *
				(0.5 + 0.5 * MATH.ramp({ range: [0.1, 0.35], x: carb })) *
				MATH.ramp({ range: [0.1, 0.5], x: cover })
		P.shale[c] = MATH.ramp({ range: [0.02, 0.15], x: organic })
		let pegmatite = 0
		if (COLLISION_BELTS.has(belt) && belt !== O.TRANSPRESSION)
			pegmatite =
				MATH.ramp({ range: [10, 25], x: thick }) *
				windowKm({ wear: beltWear, top: 3, bottom: 14, width: 1 }) *
				MATH.ramp({ range: [0.15, 0.45], x: u }) *
				keep({ age: quiet, half: H.pegmatite })
		if (COLLISION_BELTS.has(prevBelt))
			pegmatite = Math.max(
				pegmatite,
				0.7 *
					windowKm({ wear: ex, top: 3, bottom: 16, width: 1 }) *
					keep({ age: prevQuiet, half: H.pegmatite }),
			)
		P.pegmatite[c] = pegmatite
		const platform = Math.max(
			MATH.ramp({ range: [0.1, 0.4], x: carb }),
			geo & (GEO.SHELF | GEO.EPEIRIC) ? 0.6 : 0,
			flags & FLAG.RIFT_MARGIN ? 0.7 : 0,
		)
		const beltK = collided ? 1 : belt || prevBelt ? 0.45 : 0
		if (beltK > 0 && platform > 0)
			P.marble[c] =
				beltK *
				platform *
				windowKm({
					wear: Math.max(ex, beltWear),
					top: 4,
					bottom: 24,
					width: 1.5,
				}) *
				keep({ age: Math.min(collAge, orogenAge), half: H.marble })
		if (crust.volcType[c] === CRUST.VOLCANIC.TRACK && type !== TYPE.ARC)
			P.hotspot[c] =
				MATH.ramp({
					range: [0.05, 0.4],
					x: Math.max(0, crust.volcKm[c] - crust.volcWornKm[c]),
				}) * keep({ age: -crust.volcAt[c], half: H.basaltGems })
		if (lip) P.lip[c] = MATH.ramp({ range: [0.1, 0.6], x: lipLeft })
		if (belt && cover > 0.3)
			P.foldShale[c] =
				MATH.ramp({ range: [0.04, 0.2], x: organic }) *
				(arcBelt ? 1 : 0.6) *
				keep({ age: quiet, half: H.foldShale })
	}
	return P
}

export const RECORD = { fields: FIELDS, potential }
