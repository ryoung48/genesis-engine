import type {
	OrogenClimate,
	OrogenHydrology,
	OrogenParams,
	OrogenRainfall,
	SphereMesh,
} from "../types"
import { getDaysPerYear } from "../util/units"
import { computeMonthlyInsolation } from "./climate"

const ZONE_COLOR_MAP = {
	Ofi: [220, 245, 255],
	Ofd: [170, 225, 255],
	Ofg: [130, 195, 235],
	Og: [90, 165, 215],
	Oc: [50, 145, 220],
	Ot: [20, 110, 200],
	Oh: [15, 80, 185],
	Or: [40, 50, 170],
	Oe: [120, 40, 200],
	TUr: [0, 0, 255],
	TUrp: [4, 0, 191],
	TUf: [41, 112, 255],
	TUfp: [26, 80, 188],
	TUs: [145, 180, 255],
	TUsp: [95, 125, 196],
	TUA: [199, 216, 255],
	TUAp: [136, 157, 206],
	TQf: [55, 210, 192],
	TQfp: [48, 141, 130],
	TQs: [117, 245, 230],
	TQsp: [114, 197, 188],
	TQA: [186, 253, 245],
	TQAp: [174, 219, 213],
	TF: [83, 83, 147],
	TG: [30, 28, 109],
	CTf: [84, 218, 34],
	CTfp: [54, 158, 16],
	CTs: [167, 253, 129],
	CTsp: [120, 192, 89],
	CDa: [14, 251, 93],
	CDap: [0, 194, 65],
	CDb: [0, 219, 117],
	CDbp: [5, 158, 66],
	CEa: [172, 251, 214],
	CEap: [133, 214, 176],
	CEb: [112, 240, 186],
	CEbp: [54, 171, 120],
	CEc: [65, 251, 251],
	CEcp: [4, 182, 185],
	CMa: [180, 240, 51],
	CMb: [172, 209, 44],
	CAMa: [251, 255, 0],
	CAMb: [162, 172, 27],
	CAa: [215, 194, 117],
	CAap: [161, 139, 54],
	CAb: [197, 219, 118],
	CAbp: [132, 171, 84],
	CFa: [172, 203, 210],
	CFb: [180, 188, 192],
	CG: [153, 153, 153],
	CI: [94, 94, 94],
	HTf: [255, 102, 0],
	HTfp: [147, 59, 1],
	HTs: [253, 151, 83],
	HTsp: [198, 89, 16],
	HDa: [255, 66, 66],
	HDap: [223, 48, 48],
	HDb: [255, 0, 0],
	HDbp: [199, 0, 0],
	HDc: [181, 33, 48],
	HDcp: [137, 11, 26],
	HMa: [253, 157, 30],
	HMb: [217, 137, 18],
	HMc: [184, 107, 0],
	HAMa: [255, 187, 0],
	HAMb: [212, 160, 17],
	HAMc: [177, 137, 27],
	HAa: [245, 200, 163],
	HAap: [209, 161, 122],
	HAb: [230, 164, 148],
	HAbp: [202, 129, 109],
	HAc: [210, 121, 121],
	HAcp: [178, 83, 83],
	HFa: [154, 106, 106],
	HFb: [136, 89, 89],
	HFc: [119, 60, 60],
	HG: [71, 31, 31],
	ETf: [128, 0, 255],
	ETfp: [99, 0, 199],
	ETs: [181, 115, 247],
	ETsp: [143, 90, 196],
	EDa: [225, 0, 255],
	EDap: [158, 0, 179],
	EDb: [249, 108, 218],
	EDbp: [181, 79, 159],
	EMa: [255, 26, 205],
	EMb: [209, 10, 166],
	EAMa: [255, 0, 123],
	EAMb: [178, 31, 102],
	EAa: [193, 139, 159],
	EAap: [160, 106, 125],
	EAb: [255, 184, 248],
	EAbp: [200, 116, 193],
	EFa: [189, 148, 194],
	EFb: [157, 118, 162],
	EG: [89, 52, 91],
	Ada: [232, 230, 162],
	Adc: [205, 221, 186],
	Adh: [234, 184, 184],
	Ade: [227, 186, 227],
	Aha: [255, 251, 204],
	Ahc: [236, 243, 230],
	Ahh: [255, 224, 224],
	Ahe: [239, 210, 238],
} as const

const ZONE_TRUE_COLOR_MAP = {
	Ofi: [240, 240, 240],
	Ofd: [10, 10, 51],
	Ofg: [10, 10, 51],
	Og: [10, 10, 51],
	Oc: [10, 10, 51],
	Ot: [10, 10, 51],
	Oh: [10, 10, 51],
	Or: [10, 10, 51],
	Oe: [10, 10, 51],
	TUr: [41, 63, 13],
	TUrp: [42, 65, 16],
	TUf: [55, 74, 20],
	TUfp: [59, 80, 24],
	TUs: [75, 85, 33],
	TUsp: [89, 102, 47],
	TUA: [107, 105, 53],
	TUAp: [124, 116, 63],
	TQf: [59, 78, 23],
	TQfp: [54, 73, 24],
	TQs: [75, 80, 35],
	TQsp: [67, 76, 30],
	TQA: [107, 105, 53],
	TQAp: [124, 116, 63],
	TF: [78, 84, 66],
	TG: [98, 91, 59],
	CTf: [59, 78, 23],
	CTfp: [54, 73, 24],
	CTs: [75, 80, 35],
	CTsp: [67, 76, 30],
	CDa: [60, 78, 23],
	CDap: [36, 54, 15],
	CDb: [55, 75, 21],
	CDbp: [38, 62, 11],
	CEa: [60, 63, 29],
	CEap: [38, 52, 18],
	CEb: [49, 61, 18],
	CEbp: [52, 64, 25],
	CEc: [62, 71, 24],
	CEcp: [64, 74, 27],
	CMa: [60, 73, 26],
	CMb: [51, 63, 22],
	CAMa: [103, 97, 54],
	CAMb: [118, 108, 68],
	CAa: [105, 98, 58],
	CAap: [58, 68, 25],
	CAb: [102, 100, 55],
	CAbp: [94, 87, 55],
	CFa: [78, 84, 66],
	CFb: [93, 88, 54],
	CG: [98, 91, 59],
	CI: [240, 240, 240],
	HTf: [55, 74, 20],
	HTfp: [59, 80, 24],
	HTs: [75, 85, 33],
	HTsp: [89, 102, 47],
	HDa: [60, 78, 23],
	HDap: [36, 54, 15],
	HDb: [55, 75, 21],
	HDbp: [38, 62, 11],
	HDc: [62, 71, 24],
	HDcp: [64, 74, 27],
	HMa: [60, 73, 26],
	HMb: [51, 63, 22],
	HMc: [51, 63, 22],
	HAMa: [103, 97, 54],
	HAMb: [118, 108, 68],
	HAMc: [118, 108, 68],
	HAa: [107, 105, 53],
	HAap: [124, 116, 63],
	HAb: [107, 105, 53],
	HAbp: [124, 116, 63],
	HAc: [107, 105, 53],
	HAcp: [124, 116, 63],
	HFa: [78, 84, 66],
	HFb: [93, 88, 54],
	HFc: [93, 88, 54],
	HG: [98, 91, 59],
	ETf: [59, 78, 23],
	ETfp: [54, 73, 24],
	ETs: [75, 80, 35],
	ETsp: [67, 76, 30],
	EDa: [60, 78, 23],
	EDap: [36, 54, 15],
	EDb: [55, 75, 21],
	EDbp: [38, 62, 11],
	EMa: [60, 73, 26],
	EMb: [51, 63, 22],
	EAMa: [103, 97, 54],
	EAMb: [118, 108, 68],
	EAa: [105, 98, 58],
	EAap: [58, 68, 25],
	EAb: [102, 100, 55],
	EAbp: [94, 87, 55],
	EFa: [78, 84, 66],
	EFb: [93, 88, 54],
	EG: [98, 91, 59],
	Ada: [167, 137, 95],
	Aha: [238, 210, 156],
	Adc: [177, 153, 110],
	Ahc: [208, 181, 141],
	Adh: [167, 137, 95],
	Ahh: [238, 210, 156],
	Ade: [177, 153, 110],
	Ahe: [208, 181, 141],
} as const

export const PASTA_LABELS = ["ocean", ...Object.keys(ZONE_COLOR_MAP)] as const

export const PASTA_NAMES: Record<(typeof PASTA_LABELS)[number], string> = {
	ocean: "Ocean",
	Ofi: "Permanent Frozen Ocean",
	Ofd: "Seasonal Frozen Ocean",
	Ofg: "Barren Seasonal Frozen Ocean",
	Og: "Barren Ocean",
	Oc: "Cool Ocean",
	Ot: "Tropical Ocean",
	Oh: "Hot Ocean",
	Or: "Torrid Ocean",
	Oe: "Extraseasonal Ocean",
	TUr: "Tropical Rainforest",
	TUrp: "Hyperpluvial Tropical Rainforest",
	TUf: "Tropical Forest",
	TUfp: "Tropical Monsoon Forest",
	TUs: "Tropical Moist Savanna",
	TUsp: "Tropical Moist Monsoon Savanna",
	TUA: "Tropical Dry Savanna",
	TUAp: "Tropical Dry Monsoon Savanna",
	TQf: "Quasitropical Forest",
	TQfp: "Quasitropical Monsoon Forest",
	TQs: "Quasitropical Moist Savanna",
	TQsp: "Quasitropical Moist Monsoon Savanna",
	TQA: "Quasitropical Dry Savanna",
	TQAp: "Quasitropical Dry Monsoon Savanna",
	TF: "Tropical Twilight",
	TG: "Tropical Dark",
	CTf: "Subtropical Forest",
	CTfp: "Subtropical Monsoon Forest",
	CTs: "Subtropical Moist Savanna",
	CTsp: "Subtropical Moist Monsoon Savanna",
	CDa: "Oceanic Temperate",
	CDap: "Oceanic Temperate Rainforest",
	CDb: "Continental Temperate",
	CDbp: "Continental Temperate Rainforest",
	CEa: "Oceanic Boreal",
	CEap: "Oceanic Boreal Rainforest",
	CEb: "Continental Boreal",
	CEbp: "Continental Boreal Rainforest",
	CEc: "Percontinental Boreal",
	CEcp: "Percontinental Boreal Rainforest",
	CMa: "Oceanic Submediterranean",
	CMb: "Continental Submediterranean",
	CAMa: "Oceanic Mediterranean",
	CAMb: "Continental Mediterranean",
	CAa: "Cool Dry Savanna",
	CAap: "Cool Dry Monsoon Savanna",
	CAb: "Cold Steppe",
	CAbp: "Cold Pluvial Steppe",
	CFa: "Oceanic Tundra",
	CFb: "Continental Tundra",
	CG: "Cold Barren",
	CI: "Ice",
	HTf: "Supertropical Forest",
	HTfp: "Supertropical Monsoon Forest",
	HTs: "Supertropical Moist Savanna",
	HTsp: "Supertropical Moist Monsoon Savanna",
	HDa: "Hot Swelter",
	HDap: "Hot Pluvial Swelter",
	HDb: "Torrid Swelter",
	HDbp: "Torrid Pluvial Swelter",
	HDc: "Boiling Swelter",
	HDcp: "Boiling Pluvial Swelter",
	HMa: "Hot Subparamediterranean",
	HMb: "Torrid Subparamediterranean",
	HMc: "Boiling Subparamediterranean",
	HAMa: "Hot Paramediterranean",
	HAMb: "Torrid Paramediterranean",
	HAMc: "Boiling Paramediterranean",
	HAa: "Hot Dry Savanna",
	HAap: "Hot Dry Monsoon Savanna",
	HAb: "Torrid Steppe",
	HAbp: "Torrid Pluvial Steppe",
	HAc: "Boiling Steppe",
	HAcp: "Boiling Pluvial Steppe",
	HFa: "Hot Parch",
	HFb: "Torrid Parch",
	HFc: "Boiling Parch",
	HG: "Hot Barren",
	ETf: "Extratropical Forest",
	ETfp: "Extratropical Monsoon Forest",
	ETs: "Extratropical Moist Savanna",
	ETsp: "Extratropical Moist Monsoon Savanna",
	EDa: "Superseasonal Extracontinental",
	EDap: "Superseasonal Extracontinental Rainforest",
	EDb: "Hyperseasonal Extracontinental",
	EDbp: "Hyperseasonal Extracontinental Rainforest",
	EMa: "Superseasonal Subextramediterranean",
	EMb: "Hyperseasonal Subextramediterranean",
	EAMa: "Superseasonal Extramediterranean",
	EAMb: "Hyperseasonal Extramediterranean",
	EAa: "Superseasonal Dry Savanna",
	EAap: "Superseasonal Dry Monsoon Savanna",
	EAb: "Hyperseasonal Steppe",
	EAbp: "Hyperseasonal Pluvial Steppe",
	EFa: "Superseasonal Pulse",
	EFb: "Hyperseasonal Pulse",
	EG: "Extraseasonal Barren",
	Ada: "Warm Semidesert",
	Adc: "Cold Semidesert",
	Adh: "Hot Semidesert",
	Ade: "Hyperseasonal Semidesert",
	Aha: "Warm Desert",
	Ahc: "Cold Desert",
	Ahh: "Hot Desert",
	Ahe: "Hyperseasonal Desert",
}

const TH_COOL = 17
const TH_COLD = 0
const TH_FRIGID = -30
const TH_HOT = 40
const TH_TORRID = 60
const TH_BOIL = 90

// Pre-resolved zone indices — avoids Map lookups and string allocations in the hot loop
const Z = Object.fromEntries(
	PASTA_LABELS.map((label, index) => [label, index]),
) as Record<string, number>

function gdm(
	temp: number,
	monthDays: number,
	base: number,
	platStart: number,
	platEnd: number,
	comp: number,
): number {
	const max = platStart - base
	const backSlope = max / (comp - platEnd)
	let gdd = temp - base
	if (temp > platStart) gdd = max
	if (temp > platEnd) gdd = max - backSlope * (temp - platEnd)
	return (gdd > 0 ? gdd : 0) * monthDays
}

function gddiDay(insolationWm2: number, baseline: number): number {
	const effective = insolationWm2 * 0.5
	const v = (effective - baseline) * 0.1
	return v < 0 ? 0 : v > 20 ? 20 : v
}

function longestRun(monthly: Float64Array): number {
	let allPositive = true
	let start = -1
	for (let i = 0; i < 12; i++) {
		if (monthly[i] <= 0) {
			allPositive = false
			if (start < 0) start = i
		}
	}
	if (allPositive) return Infinity
	let maxSum = 0
	let runSum = 0
	for (let i = 0; i < 12; i++) {
		const value = monthly[(start + i) % 12]
		if (value > 0) {
			runSum += value
			if (runSum > maxSum) maxSum = runSum
		} else {
			runSum = 0
		}
	}
	return maxSum
}

function gddTotal(
	gdd: Float64Array,
	gint: Float64Array,
	gddAcc: Float64Array,
	giAcc: Float64Array,
	threshold: number,
): number {
	for (let t = 0; t < 12; t++) giAcc[t] = gint[t]

	for (let pass = 0; pass < 2; pass++) {
		for (let t = 0; t < 12; t++) {
			const prev = t === 0 ? giAcc[11] : giAcc[t - 1]
			giAcc[t] = gint[t] > 0 ? gint[t] + prev : 0
		}
	}
	let allPos = true
	for (let t = 0; t < 12; t++)
		if (giAcc[t] <= 0) {
			allPos = false
			break
		}
	if (allPos) giAcc[11] = 1e6
	for (let pass = 0; pass < 2; pass++) {
		for (let t = 0; t < 12; t++) {
			const tn = 11 - t
			const prev = (((tn - 1) % 12) + 12) % 12
			if (gint[tn] > 0 && gint[prev] > 0) giAcc[prev] = giAcc[tn]
		}
	}

	for (let t = 0; t < 12; t++) gddAcc[t] = gdd[t]
	for (let pass = 0; pass < 2; pass++) {
		for (let t = 0; t < 12; t++) {
			const prev = t === 0 ? gddAcc[11] : gddAcc[t - 1]
			const sum = gdd[t] + prev
			if (gdd[t] > 0) gddAcc[t] = sum
			else if (giAcc[t] > threshold) gddAcc[t] = 0
			else gddAcc[t] = sum
		}
	}

	allPos = true
	let max = -Infinity
	for (let t = 0; t < 12; t++) {
		if (gddAcc[t] <= 0) allPos = false
		if (gddAcc[t] > max) max = gddAcc[t]
	}
	return allPos ? Infinity : max
}

function classifyOcean(
	temps: Float64Array,
	insol: Float64Array,
	mGDDz: Float64Array,
	mGInt: Float64Array,
	gddAccBuf: Float64Array,
	giAccBuf: Float64Array,
	iceMin: number,
	iceMax: number,
	dpm: number,
	warmest: number,
	coldest: number,
): number {
	// Only need gddz for ocean classification
	for (let m = 0; m < 12; m++) {
		const g0 = gdm(temps[m], dpm, 0, 20, 40, 60)
		const lightZero = gddiDay(insol[m], 0)
		const effectiveGDDz = g0 < lightZero * dpm ? g0 : lightZero * dpm
		mGDDz[m] = g0 > 0 && lightZero > 0 ? effectiveGDDz : 0
		const v = 15 * dpm - effectiveGDDz
		mGInt[m] = v > 0 ? v : 0
	}
	const gddz = gddTotal(mGDDz, mGInt, gddAccBuf, giAccBuf, 1250)

	// Sea ice from ice accumulation model (1cm snow ≈ 10% cover, per Pasta spec):
	//   minIce > 80mm (8cm) all months → permanent ice (Ofi)
	//   maxIce > 20mm (2cm) any month  → seasonal ice (Ofd/Ofg)
	if (iceMin > 80) return Z.Ofi
	if (iceMax > 20) return gddz >= 50 ? Z.Ofd : Z.Ofg
	if (gddz < 50) return Z.Og
	if (warmest > TH_TORRID) return Z.Or
	if (coldest > TH_COOL) return warmest > TH_HOT ? Z.Oh : Z.Ot
	if (warmest > TH_HOT) return Z.Oe
	return Z.Oc
}

// MinIce > 10cm (100mm w.e.) for CI, per Worldbuilding Pasta spec
const ICE_THRESHOLD = 100

interface LandDebugOut {
	gdd: number
	gddz: number
	gint: number
	ar: number
	gar: number
	grs: number
	evr: number
}

const _landDebug: LandDebugOut = {
	gdd: 0,
	gddz: 0,
	gint: 0,
	ar: 0,
	gar: 0,
	grs: 0,
	evr: 0,
}

function classifyLand(
	temps: Float64Array,
	rain: Float64Array,
	insol: Float64Array,
	petBuf: Float64Array,
	aetBuf: Float64Array,
	mGDD: Float64Array,
	mGDDz: Float64Array,
	mGInt: Float64Array,
	gddAccBuf: Float64Array,
	giAccBuf: Float64Array,
	iceVal: number,
	dpm: number,
	warmest: number,
	coldest: number,
): number {
	let annualPrecip = 0
	for (let m = 0; m < 12; m++) annualPrecip += rain[m]

	// Ice classification per Pasta spec:
	// CI if MinIce > 10cm, BUT persistent ice removed if absolute max temp > 0°C
	if (iceVal > ICE_THRESHOLD && warmest <= 0) {
		_landDebug.gdd = 0
		_landDebug.gddz = 0
		_landDebug.gint = 0
		_landDebug.ar = 0
		_landDebug.gar = 0
		_landDebug.grs = 0
		_landDebug.evr = 0
		return Z.CI
	}

	let petSum = 0,
		aetSum = 0,
		petGdd = 0,
		aetGdd = 0,
		precGdd = 0,
		gddWeightSum = 0
	for (let m = 0; m < 12; m++) {
		const temp = temps[m]
		const g5 = gdm(temp, dpm, 5, 25, 40, 50)
		const g0 = gdm(temp, dpm, 0, 20, 40, 60)
		const lightStd = gddiDay(insol[m], 20)
		const lightZero = gddiDay(insol[m], 0)
		const ceiling = 15 * dpm
		const effectiveGDDz = g0 < lightZero * dpm ? g0 : lightZero * dpm

		const effectiveGDD = g5 < lightStd * dpm ? g5 : lightStd * dpm
		mGDD[m] = g5 > 0 && lightStd > 0 ? effectiveGDD : 0
		mGDDz[m] = g0 > 0 && lightZero > 0 ? effectiveGDDz : 0
		mGInt[m] = ceiling - effectiveGDDz
		if (mGInt[m] < 0) mGInt[m] = 0

		petSum += petBuf[m]
		aetSum += aetBuf[m]
		petGdd += petBuf[m] * g5
		aetGdd += aetBuf[m] * g5
		precGdd += rain[m] * g5
		gddWeightSum += g5
	}

	const gdd = gddTotal(mGDD, mGInt, gddAccBuf, giAccBuf, 1250)
	const gddz = gddTotal(mGDDz, mGInt, gddAccBuf, giAccBuf, 1250)
	const gint = longestRun(mGInt)
	const ar = petSum > 0 ? aetSum / petSum : 1
	const gar = petGdd > 0 ? aetGdd / petGdd : 1
	const aetAvg = aetSum / 12
	const gpr = gddWeightSum > 0 ? precGdd / gddWeightSum : 0
	const grs = aetAvg > 0 ? gpr / aetAvg : 1
	const evr = annualPrecip > 0 ? aetSum / annualPrecip : 1

	_landDebug.gdd = gdd === Infinity ? 99999 : gdd
	_landDebug.gddz = gddz === Infinity ? 99999 : gddz
	_landDebug.gint = gint === Infinity ? 99999 : gint
	_landDebug.ar = ar
	_landDebug.gar = gar
	_landDebug.grs = grs
	_landDebug.evr = evr

	const cool = coldest > TH_COLD && coldest <= TH_COOL
	const cold = coldest > TH_FRIGID && coldest <= TH_COLD
	const hot = warmest >= TH_HOT && warmest < TH_TORRID
	const torrid = warmest >= TH_TORRID && warmest < TH_BOIL
	const lowGrS = grs < 0.8
	const pluvial = evr < 0.45
	const groupT = warmest < TH_HOT && coldest > TH_COOL
	const groupC = warmest < TH_HOT && coldest <= TH_COOL
	const groupH = warmest >= TH_HOT && coldest > TH_COOL

	if (gddz < 50) {
		if (groupT) return Z.TG
		if (groupC) return Z.CG
		if (groupH) return Z.HG
		return Z.EG
	}

	if (ar < 0.2) {
		if (ar < 0.06) {
			if (warmest < TH_TORRID && coldest > TH_COLD) return Z.Aha
			if (warmest < TH_TORRID) return Z.Ahc
			if (coldest > TH_COLD) return Z.Ahh
			return Z.Ahe
		}
		if (warmest < TH_TORRID && coldest > TH_COLD) return Z.Ada
		if (warmest < TH_TORRID) return Z.Adc
		if (coldest > TH_COLD) return Z.Adh
		return Z.Ade
	}

	if (gdd < 350) {
		if (groupT) return Z.TF
		if (groupC) return cool ? Z.CFa : Z.CFb
		if (groupH) {
			if (hot) return Z.HFa
			if (torrid) return Z.HFb
			return Z.HFc
		}
		if (hot && cool) return Z.EFa
		return Z.EFb
	}

	if (groupT) {
		const eu = gint < 1250
		if (gar < 0.5)
			return eu ? (pluvial ? Z.TUAp : Z.TUA) : pluvial ? Z.TQAp : Z.TQA
		if (eu) {
			if (ar > 0.9) return evr < 0.4 ? Z.TUrp : Z.TUr
			if (ar > 0.75) return pluvial ? Z.TUfp : Z.TUf
			return pluvial ? Z.TUsp : Z.TUs
		}
		return ar > 0.75 ? (pluvial ? Z.TQfp : Z.TQf) : pluvial ? Z.TQsp : Z.TQs
	}

	if (groupC) {
		if (gar < 0.5) {
			if (lowGrS) return cool ? Z.CAMa : Z.CAMb
			return cool ? (pluvial ? Z.CAap : Z.CAa) : pluvial ? Z.CAbp : Z.CAb
		}
		if (lowGrS) return cool ? Z.CMa : Z.CMb
		if (gint < 1250 && cool)
			return ar > 0.75 ? (pluvial ? Z.CTfp : Z.CTf) : pluvial ? Z.CTsp : Z.CTs
		if (gdd < 1300) {
			if (cool) return pluvial ? Z.CEap : Z.CEa
			if (cold) return pluvial ? Z.CEbp : Z.CEb
			return pluvial ? Z.CEcp : Z.CEc
		}
		return cool ? (pluvial ? Z.CDap : Z.CDa) : pluvial ? Z.CDbp : Z.CDb
	}

	if (groupH) {
		if (gar < 0.5) {
			if (lowGrS) {
				if (hot) return Z.HAMa
				if (torrid) return Z.HAMb
				return Z.HAMc
			}
			if (hot) return pluvial ? Z.HAap : Z.HAa
			if (torrid) return pluvial ? Z.HAbp : Z.HAb
			return pluvial ? Z.HAcp : Z.HAc
		}
		if (lowGrS) {
			if (hot) return Z.HMa
			if (torrid) return Z.HMb
			return Z.HMc
		}
		if (gint < 1250 && hot)
			return ar > 0.75 ? (pluvial ? Z.HTfp : Z.HTf) : pluvial ? Z.HTsp : Z.HTs
		if (hot) return pluvial ? Z.HDap : Z.HDa
		if (torrid) return pluvial ? Z.HDbp : Z.HDb
		return pluvial ? Z.HDcp : Z.HDc
	}

	const ss = hot && cool
	if (gar < 0.5) {
		if (lowGrS) return ss ? Z.EAMa : Z.EAMb
		return ss ? (pluvial ? Z.EAap : Z.EAa) : pluvial ? Z.EAbp : Z.EAb
	}
	if (lowGrS) return ss ? Z.EMa : Z.EMb
	if (gint < 1250 && ss)
		return ar > 0.75 ? (pluvial ? Z.ETfp : Z.ETf) : pluvial ? Z.ETsp : Z.ETs
	return ss ? (pluvial ? Z.EDap : Z.EDa) : pluvial ? Z.EDbp : Z.EDb
}

export interface PastaDebug {
	gdd: Float32Array
	gddz: Float32Array
	gint: Float32Array
	ar: Float32Array
	gar: Float32Array
	grs: Float32Array
	evr: Float32Array
	minT: Float32Array
	maxT: Float32Array
}

export function assignPastaClimate(
	mesh: SphereMesh,
	isLand: Uint8Array,
	climate: OrogenClimate,
	rainfall: OrogenRainfall,
	hydrology: OrogenHydrology,
	params: OrogenParams,
	iceThickness?: Float32Array,
	iceMinMonthly?: Float32Array,
	iceMaxMonthly?: Float32Array,
): { zones: Uint8Array; debug: PastaDebug } {
	const N = mesh.numRegions
	const dpm = getDaysPerYear(params.daysPerYear) / 12
	const output = new Uint8Array(N)
	const insolation = computeMonthlyInsolation(mesh, params)

	const debug: PastaDebug = {
		gdd: new Float32Array(N),
		gddz: new Float32Array(N),
		gint: new Float32Array(N),
		ar: new Float32Array(N),
		gar: new Float32Array(N),
		grs: new Float32Array(N),
		evr: new Float32Array(N),
		minT: new Float32Array(N),
		maxT: new Float32Array(N),
	}

	// Pre-allocate all working buffers — reused for every region
	const temps = new Float64Array(12)
	const rain = new Float64Array(12)
	const insol = new Float64Array(12)
	const petBuf = new Float64Array(12)
	const aetBuf = new Float64Array(12)
	const mGDD = new Float64Array(12)
	const mGDDz = new Float64Array(12)
	const mGInt = new Float64Array(12)
	const gddAccBuf = new Float64Array(12)
	const giAccBuf = new Float64Array(12)

	for (let r = 0; r < N; r++) {
		for (let m = 0; m < 12; m++) {
			temps[m] = climate.temperature_monthly[m * N + r]
			insol[m] = insolation[m * N + r]
		}

		const warmest = climate.temperature_max[r]
		const coldest = climate.temperature_min[r]
		debug.minT[r] = coldest
		debug.maxT[r] = warmest

		if (!isLand[r]) {
			// Ocean: skip AET/PET, only needs temps + insolation + ice
			output[r] = classifyOcean(
				temps,
				insol,
				mGDDz,
				mGInt,
				gddAccBuf,
				giAccBuf,
				iceMinMonthly ? iceMinMonthly[r] : 0,
				iceMaxMonthly ? iceMaxMonthly[r] : 0,
				dpm,
				warmest,
				coldest,
			)
			// Ocean debug: compute gddz only
			const gddz = gddTotal(mGDDz, mGInt, gddAccBuf, giAccBuf, 1250)
			debug.gddz[r] = gddz
		} else {
			for (let m = 0; m < 12; m++) {
				const idx = m * N + r
				rain[m] = rainfall.monthly[idx]
				petBuf[m] = climate.pet_monthly[idx]
				aetBuf[m] = hydrology.aet_monthly[idx]
			}
			output[r] = classifyLand(
				temps,
				rain,
				insol,
				petBuf,
				aetBuf,
				mGDD,
				mGDDz,
				mGInt,
				gddAccBuf,
				giAccBuf,
				iceThickness ? iceThickness[r] : 0,
				dpm,
				warmest,
				coldest,
			)
			// Land debug: recompute key metrics (buffers still hold values from classifyLand)
			const gdd = gddTotal(mGDD, mGInt, gddAccBuf, giAccBuf, 1250)
			const gddz = gddTotal(mGDDz, mGInt, gddAccBuf, giAccBuf, 1250)
			const gint = longestRun(mGInt)
			let petSum = 0,
				aetSum = 0,
				petGdd = 0,
				aetGdd = 0,
				annualPrecip = 0
			for (let m = 0; m < 12; m++) {
				petSum += petBuf[m]
				aetSum += aetBuf[m]
				annualPrecip += rain[m]
				const g5 = gdm(temps[m], dpm, 5, 25, 40, 50)
				petGdd += petBuf[m] * g5
				aetGdd += aetBuf[m] * g5
			}
			const ar = petSum > 0 ? aetSum / petSum : 1
			const gar = petGdd > 0 ? aetGdd / petGdd : 1
			let precGdd = 0,
				gddWeightSum = 0
			for (let m = 0; m < 12; m++) {
				const g5 = gdm(temps[m], dpm, 5, 25, 40, 50)
				precGdd += rain[m] * g5
				gddWeightSum += g5
			}
			const aetAvg = aetSum / 12
			const gpr = gddWeightSum > 0 ? precGdd / gddWeightSum : 0
			const grs = aetAvg > 0 ? gpr / aetAvg : 1
			const evr = annualPrecip > 0 ? aetSum / annualPrecip : 1
			debug.gdd[r] = gdd
			debug.gddz[r] = gddz
			debug.gint[r] = gint === Infinity ? 99999 : gint
			debug.ar[r] = ar
			debug.gar[r] = gar
			debug.grs[r] = grs
			debug.evr[r] = evr
		}
	}

	return { zones: output, debug }
}

export function pastaClimateColor(zoneCode: number): [number, number, number] {
	if (zoneCode <= 0 || zoneCode >= PASTA_LABELS.length)
		return [0.05, 0.08, 0.18]
	const label = PASTA_LABELS[zoneCode]
	const rgb = ZONE_COLOR_MAP[label as keyof typeof ZONE_COLOR_MAP]
	return rgb ? [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255] : [0.05, 0.08, 0.18]
}

export function pastaTrueColor(zoneCode: number): [number, number, number] {
	if (zoneCode <= 0 || zoneCode >= PASTA_LABELS.length)
		return [10 / 255, 10 / 255, 51 / 255]
	const label = PASTA_LABELS[zoneCode]
	const rgb = ZONE_TRUE_COLOR_MAP[label as keyof typeof ZONE_TRUE_COLOR_MAP]
	return rgb
		? [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
		: [10 / 255, 10 / 255, 51 / 255]
}

export function pastaClimateName(zoneCode: number): string {
	if (zoneCode < 0 || zoneCode >= PASTA_LABELS.length) return "Ocean"
	return PASTA_NAMES[PASTA_LABELS[zoneCode]] ?? PASTA_LABELS[zoneCode]
}
