import { Cell } from "../../types"
import { aridity } from "./aridity"
import { evaporationRatio } from "./evaporation-ratio"
import { GDDTotals, gddTotals } from "./gdd"
import { growthSupply } from "./growth-supply"
import { iceCover } from "./ice"

// ────────────────────────────────────────────────────────────
// Zone colors [R, G, B]
// ────────────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, [number, number, number]> = {
	// Tropical — Eutropical
	TUr: [0, 0, 255],
	TUrp: [4, 0, 191],
	TUf: [41, 112, 255],
	TUfp: [26, 80, 188],
	TUs: [145, 180, 255],
	TUsp: [95, 125, 196],
	TUA: [199, 216, 255],
	TUAp: [136, 157, 206],
	// Tropical — Quasitropical
	TQf: [55, 210, 192],
	TQfp: [48, 141, 130],
	TQs: [117, 245, 230],
	TQsp: [114, 197, 188],
	TQA: [186, 253, 245],
	TQAp: [174, 219, 213],
	// Tropical — Marginal / Barren
	TF: [83, 83, 147],
	TG: [30, 28, 109],
	// Cold — Subtropical
	CTf: [84, 218, 34],
	CTfp: [54, 158, 16],
	CTs: [167, 253, 129],
	CTsp: [120, 192, 89],
	// Cold — Temperate
	CDa: [14, 251, 93],
	CDap: [0, 194, 65],
	CDb: [0, 219, 117],
	CDbp: [5, 158, 66],
	// Cold — Boreal
	CEa: [172, 251, 214],
	CEap: [133, 214, 176],
	CEb: [112, 240, 186],
	CEbp: [54, 171, 120],
	CEc: [65, 251, 251],
	CEcp: [4, 182, 185],
	// Cold — Submediterranean
	CMa: [180, 240, 51],
	CMb: [172, 209, 44],
	// Cold — Mediterranean Semiarid
	CAMa: [251, 255, 0],
	CAMb: [162, 172, 27],
	// Cold — Semiarid
	CAa: [215, 194, 117],
	CAap: [161, 139, 54],
	CAb: [197, 219, 118],
	CAbp: [132, 171, 84],
	// Cold — Tundra / Barren / Ice
	CFa: [172, 203, 210],
	CFb: [180, 188, 192],
	CG: [153, 153, 153],
	CI: [94, 94, 94],
	// Hot — Supertropical
	HTf: [255, 102, 0],
	HTfp: [147, 59, 1],
	HTs: [253, 151, 83],
	HTsp: [198, 89, 16],
	// Hot — Swelter
	HDa: [255, 66, 66],
	HDap: [223, 48, 48],
	HDb: [255, 0, 0],
	HDbp: [199, 0, 0],
	HDc: [181, 33, 48],
	HDcp: [137, 11, 26],
	// Hot — Subparamediterranean
	HMa: [253, 157, 30],
	HMb: [217, 137, 18],
	HMc: [184, 107, 0],
	// Hot — Paramediterranean Semiarid
	HAMa: [255, 187, 0],
	HAMb: [212, 160, 17],
	HAMc: [177, 137, 27],
	// Hot — Semiarid
	HAa: [245, 200, 163],
	HAap: [209, 161, 122],
	HAb: [230, 164, 148],
	HAbp: [202, 129, 109],
	HAc: [210, 121, 121],
	HAcp: [178, 83, 83],
	// Hot — Parch / Barren
	HFa: [154, 106, 106],
	HFb: [136, 89, 89],
	HFc: [119, 60, 60],
	HG: [71, 31, 31],
	// Extraseasonal — Extratropical
	ETf: [128, 0, 255],
	ETfp: [99, 0, 199],
	ETs: [181, 115, 247],
	ETsp: [143, 90, 196],
	// Extraseasonal — Extracontinental
	EDa: [225, 0, 255],
	EDap: [158, 0, 179],
	EDb: [249, 108, 218],
	EDbp: [181, 79, 159],
	// Extraseasonal — Subextramediterranean
	EMa: [255, 26, 205],
	EMb: [209, 10, 166],
	// Extraseasonal — Extramediterranean Semiarid
	EAMa: [255, 0, 123],
	EAMb: [178, 31, 102],
	// Extraseasonal — Semiarid
	EAa: [193, 139, 159],
	EAap: [160, 106, 125],
	EAb: [255, 184, 248],
	EAbp: [200, 116, 193],
	// Extraseasonal — Pulse / Barren
	EFa: [189, 148, 194],
	EFb: [157, 118, 162],
	EG: [89, 52, 91],
	// Arid — Semidesert
	Ada: [232, 230, 162],
	Adc: [205, 221, 186],
	Adh: [234, 184, 184],
	Ade: [227, 186, 227],
	// Arid — Hyperarid
	Aha: [255, 251, 204],
	Ahc: [236, 243, 230],
	Ahh: [255, 224, 224],
	Ahe: [239, 210, 238],
}

export interface Classification {
	zone: string
	color: [number, number, number]
}

/**
 * Pasta bioclimate classification for a single land cell.
 *
 * Returns a zone code and RGB color.
 * Ocean cells are not handled — use a separate ocean classifier.
 *
 * Priority order:
 *   1. CI  — permanent ice
 *   2. XG  — barren (GDDz < 50)
 *   3. A   — arid (Ar < 0.2)
 *   4. XF  — marginal (GDD < 350)
 *   5. XA  — semiarid (GAr < 0.5)
 *   6. XM  — mediterranean (low GrS)
 *   7. Moist zones
 *
 * Temperature groups:
 *   T — warm summer (< 40 °C), mild winter (> 17 °C)
 *   C — warm summer, cool/cold/frigid winter
 *   H — hot+ summer (≥ 40 °C), mild winter
 *   E — hot+ summer, cool/cold/frigid winter
 */
export function classify(cell: Cell): Classification {
	if (cell.biome) return cell.biome
	const zone = classifyZone(cell)
	const result: Classification = { zone, color: ZONE_COLORS[zone] ?? [0, 0, 0] }
	cell.biome = result
	return result
}

function classifyZone(cell: Cell): string {
	const monthly = cell.heat.monthly
	const warmest = Math.max(...monthly)
	const coldest = Math.min(...monthly)

	const gdd = gddTotals(cell)
	const { ar, gar } = aridity(cell)
	const grs = growthSupply(cell)
	const evr = evaporationRatio(cell)
	const ice = iceCover(cell)

	// Winter types
	const cool = coldest > 0 && coldest <= 17
	const cold = coldest > -30 && coldest <= 0

	// Summer types
	const hot = warmest >= 40 && warmest < 60
	const torrid = warmest >= 60 && warmest < 90

	// Derived
	const lowGrS = grs < 0.8
	const pluvial = evr < 0.45

	// Temperature groups
	const groupT = warmest < 40 && coldest > 17
	const groupC = warmest < 40 && coldest <= 17
	const groupH = warmest >= 40 && coldest > 17

	// ── 1. Ice ──
	if (ice.ice) return "CI"

	// ── 2. Barren (GDDz < 50) ──
	if (gdd.gddz < 50) {
		if (groupT) return "TG"
		if (groupC) return "CG"
		if (groupH) return "HG"
		return "EG"
	}

	// ── 3. Arid (Ar < 0.2) ──
	if (ar < 0.2) {
		const pre = ar < 0.06 ? "Ah" : "Ad"
		if (warmest < 60 && coldest > 0) return pre + "a"
		if (warmest < 60) return pre + "c"
		if (coldest > 0) return pre + "h"
		return pre + "e"
	}

	// ── 4. Marginal (GDD < 350) ──
	if (gdd.gdd < 350) {
		if (groupT) return "TF"
		if (groupC) return cool ? "CFa" : "CFb"
		if (groupH) {
			if (hot) return "HFa"
			if (torrid) return "HFb"
			return "HFc"
		}
		if (hot && cool) return "EFa"
		return "EFb"
	}

	// ── From here: GDD > 350, GDDz > 50, Ar > 0.2 ──

	const p = pluvial ? "p" : ""

	if (groupT) return classifyT(gdd, ar, gar, evr, p)
	if (groupC) return classifyC(gdd, ar, gar, lowGrS, cool, cold, p)
	if (groupH) return classifyH(gdd, ar, gar, lowGrS, hot, torrid, p)
	return classifyE(gdd, ar, gar, lowGrS, hot, cool, p)
}

// ── T — Tropical ──

function classifyT(
	gdd: GDDTotals,
	ar: number,
	gar: number,
	evr: number,
	p: string,
): string {
	const eu = gdd.gint < 1250

	if (gar < 0.5) return (eu ? "TUA" : "TQA") + p

	if (eu) {
		if (ar > 0.9) return evr < 0.4 ? "TUrp" : "TUr"
		if (ar > 0.75) return "TUf" + p
		return "TUs" + p
	}
	if (ar > 0.75) return "TQf" + p
	return "TQs" + p
}

// ── C — Cold ──

function classifyC(
	gdd: GDDTotals,
	ar: number,
	gar: number,
	lowGrS: boolean,
	cool: boolean,
	cold: boolean,
	p: string,
): string {
	if (gar < 0.5) {
		if (lowGrS) return cool ? "CAMa" : "CAMb"
		return cool ? "CAa" + p : "CAb" + p
	}

	if (lowGrS) return cool ? "CMa" : "CMb"

	if (gdd.gint < 1250 && cool) {
		if (ar > 0.75) return "CTf" + p
		return "CTs" + p
	}

	if (gdd.gdd < 1300) {
		if (cool) return "CEa" + p
		if (cold) return "CEb" + p
		return "CEc" + p
	}

	if (cool) return "CDa" + p
	return "CDb" + p
}

// ── H — Hot ──

function classifyH(
	gdd: GDDTotals,
	ar: number,
	gar: number,
	lowGrS: boolean,
	hot: boolean,
	torrid: boolean,
	p: string,
): string {
	if (gar < 0.5) {
		if (lowGrS) {
			if (hot) return "HAMa"
			if (torrid) return "HAMb"
			return "HAMc"
		}
		if (hot) return "HAa" + p
		if (torrid) return "HAb" + p
		return "HAc" + p
	}

	if (lowGrS) {
		if (hot) return "HMa"
		if (torrid) return "HMb"
		return "HMc"
	}

	if (gdd.gint < 1250 && hot) {
		if (ar > 0.75) return "HTf" + p
		return "HTs" + p
	}

	if (hot) return "HDa" + p
	if (torrid) return "HDb" + p
	return "HDc" + p
}

// ── E — Extraseasonal ──

function classifyE(
	gdd: GDDTotals,
	ar: number,
	gar: number,
	lowGrS: boolean,
	hot: boolean,
	cool: boolean,
	p: string,
): string {
	const ss = hot && cool

	if (gar < 0.5) {
		if (lowGrS) return ss ? "EAMa" : "EAMb"
		return ss ? "EAa" + p : "EAb" + p
	}

	if (lowGrS) return ss ? "EMa" : "EMb"

	if (gdd.gint < 1250 && ss) {
		if (ar > 0.75) return "ETf" + p
		return "ETs" + p
	}

	return ss ? "EDa" + p : "EDb" + p
}
