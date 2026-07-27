import { STAR } from "@/model/celestial/star"
import { HYDROLOGY } from "@/model/climate/hydrology"
import type {
	AssignEarthPastaClimateParams,
	ClassifyLandParams,
	ClassifyOceanParams,
	ComputePastaZonesParams,
	GddiDayParams,
	GddTotalParams,
	GdmParams,
} from "@/model/climate/pasta/types"
import type {
	AssignPastaClimateParams,
	PastaDebug,
} from "@/model/climate/types"

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
	TUrp: [0, 0, 160],
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

const pastaLabels = ["ocean", ...Object.keys(ZONE_COLOR_MAP)] as const

const PASTA_NAMES: Record<(typeof pastaLabels)[number], string> = {
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

const TH_COOL = 15

const TH_COLD = -10

const TH_FRIGID = -30

const TH_HOT = 40

const TH_TORRID = 60

const TH_BOIL = 90

const OCEAN = {
	torrid: TH_TORRID,
	hot: TH_HOT,
	cold: TH_COOL,
}

const Z = Object.fromEntries(
	pastaLabels.map((label) => [label, pastaLabels.indexOf(label)]),
) as Record<string, number>

function gdm({
	temp,
	monthDays,
	base,
	platStart,
	platEnd,
	comp,
}: GdmParams): number {
	const max = platStart - base
	const backSlope = max / (comp - platEnd)
	let gdd = temp - base
	if (temp > platStart) gdd = max
	if (temp > platEnd) gdd = max - backSlope * (temp - platEnd)
	return (gdd > 0 ? gdd : 0) * monthDays
}

function gddiDay({ insolationWm2, baseline }: GddiDayParams): number {
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

function gddTotal({
	gdd,
	gint,
	gddAcc,
	giAcc,
	threshold,
}: GddTotalParams): number {
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

function classifyOcean({
	temps,
	insol,
	mGDDz,
	mGInt,
	gddAccBuf,
	giAccBuf,
	iceMin,
	iceMax,
	dpm,
	warmest,
	coldest,
}: ClassifyOceanParams): { zone: number } {
	// Only need gddz for ocean classification
	for (let m = 0; m < 12; m++) {
		const g0 = gdm({
			temp: temps[m],
			monthDays: dpm,
			base: 0,
			platStart: 20,
			platEnd: 40,
			comp: 60,
		})
		const lightZero = gddiDay({ insolationWm2: insol[m], baseline: 0 })
		const effectiveGDDz = g0 < lightZero * dpm ? g0 : lightZero * dpm
		mGDDz[m] = g0 > 0 && lightZero > 0 ? effectiveGDDz : 0
		const v = 15 * dpm - effectiveGDDz
		mGInt[m] = v > 0 ? v : 0
	}
	const gddz = gddTotal({
		gdd: mGDDz,
		gint: mGInt,
		gddAcc: gddAccBuf,
		giAcc: giAccBuf,
		threshold: 1250,
	})

	// Sea ice from ice accumulation model (1cm snow ≈ 10% cover, per Pasta spec):
	//   minIce > 80mm (8cm) all months → permanent ice (Ofi)
	//   maxIce > 20mm (2cm) any month  → seasonal ice (Ofd/Ofg)
	let zone: number
	if (iceMin > 80) zone = Z.Ofi
	else if (iceMax > 20) zone = gddz >= 50 ? Z.Ofd : Z.Ofg
	else if (gddz < 50) zone = Z.Og
	else if (warmest > OCEAN.torrid) zone = Z.Or
	else if (coldest > OCEAN.cold) zone = warmest > OCEAN.hot ? Z.Oh : Z.Ot
	else if (warmest > OCEAN.hot) zone = Z.Oe
	else zone = Z.Oc

	return { zone }
}

const ICE_THRESHOLD = 100

function classifyLand({
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
	iceVal,
	dpm,
	warmest,
	coldest,
}: ClassifyLandParams): {
	zone: number
	gdd: number
	gint: number
} {
	let annualPrecip = 0
	for (let m = 0; m < 12; m++) annualPrecip += rain[m]

	let petSum = 0,
		aetSum = 0,
		petGdd = 0,
		aetGdd = 0,
		precGdd = 0,
		gddWeightSum = 0
	for (let m = 0; m < 12; m++) {
		const temp = temps[m]
		const g5 = gdm({
			temp,
			monthDays: dpm,
			base: 5,
			platStart: 25,
			platEnd: 40,
			comp: 50,
		})
		const g0 = gdm({
			temp,
			monthDays: dpm,
			base: 0,
			platStart: 20,
			platEnd: 40,
			comp: 60,
		})
		const lightStd = gddiDay({ insolationWm2: insol[m], baseline: 20 })
		const lightZero = gddiDay({ insolationWm2: insol[m], baseline: 0 })
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

	const gdd = gddTotal({
		gdd: mGDD,
		gint: mGInt,
		gddAcc: gddAccBuf,
		giAcc: giAccBuf,
		threshold: 1250,
	})
	const gddz = gddTotal({
		gdd: mGDDz,
		gint: mGInt,
		gddAcc: gddAccBuf,
		giAcc: giAccBuf,
		threshold: 1250,
	})
	const gint = longestRun(mGInt)
	const ar = petSum > 0 ? aetSum / petSum : 1
	const gar = petGdd > 0 ? aetGdd / petGdd : 1
	const aetAvg = aetSum / 12
	const gpr = gddWeightSum > 0 ? precGdd / gddWeightSum : 0
	const grs = aetAvg > 0 ? gpr / aetAvg : 1
	const evr = annualPrecip > 0 ? aetSum / annualPrecip : 1
	// Growing-season precipitation-to-PET ratio: how much does growing-season
	// rainfall exceed atmospheric demand? GDD-weighting discounts winter months
	// (g5 ≈ 0 below 5°C), so winter snowpack doesn't inflate the numerator.
	// This correctly requires extraordinary growing-season wetness for the pluvial
	// flag, unlike evr which fires too easily in cold climates where PET is low.
	const gsPrecipToPet = petGdd > 0 ? precGdd / petGdd : 1

	const cool = coldest > TH_COLD && coldest <= TH_COOL
	const cold = coldest > TH_FRIGID && coldest <= TH_COLD
	const hot = warmest >= TH_HOT && warmest < TH_TORRID
	const torrid = warmest >= TH_TORRID && warmest < TH_BOIL
	const lowGrS = grs < 0.8
	const pluvial = gsPrecipToPet > 2.5
	const groupT = warmest < TH_HOT && coldest > TH_COOL
	const groupC = warmest < TH_HOT && coldest <= TH_COOL
	const groupH = warmest >= TH_HOT && coldest > TH_COOL

	// Ice classification per Pasta spec:
	// CI if MinIce > 10cm, BUT persistent ice removed if absolute max temp > 0°C
	let zone: number
	if (iceVal > ICE_THRESHOLD && warmest <= 0) {
		zone = Z.CI
	} else if (gddz < 50) {
		if (groupT) zone = Z.TG
		else if (groupC) zone = Z.CG
		else if (groupH) zone = Z.HG
		else zone = Z.EG
	} else if (ar < 0.2) {
		if (ar < 0.06) {
			if (warmest < TH_TORRID && coldest > TH_COLD) zone = Z.Aha
			else if (warmest < TH_TORRID) zone = Z.Ahc
			else if (coldest > TH_COLD) zone = Z.Ahh
			else zone = Z.Ahe
		} else if (warmest < TH_TORRID && coldest > TH_COLD) zone = Z.Ada
		else if (warmest < TH_TORRID) zone = Z.Adc
		else if (coldest > TH_COLD) zone = Z.Adh
		else zone = Z.Ade
	} else if (gdd < 350) {
		if (groupT) zone = Z.TF
		else if (groupC) zone = cool ? Z.CFa : Z.CFb
		else if (groupH) {
			if (hot) zone = Z.HFa
			else if (torrid) zone = Z.HFb
			else zone = Z.HFc
		} else if (hot && cool) zone = Z.EFa
		else zone = Z.EFb
	} else if (groupT) {
		const eu = gint < 1250
		if (gar < 0.5) {
			zone = eu ? (pluvial ? Z.TUAp : Z.TUA) : pluvial ? Z.TQAp : Z.TQA
		} else if (eu) {
			if (ar > 0.9 && gsPrecipToPet > 1.1) zone = evr < 0.4 ? Z.TUrp : Z.TUr
			else if (ar > 0.75) zone = pluvial ? Z.TUfp : Z.TUf
			else zone = pluvial ? Z.TUsp : Z.TUs
		} else {
			zone = ar > 0.75 ? (pluvial ? Z.TQfp : Z.TQf) : pluvial ? Z.TQsp : Z.TQs
		}
	} else if (groupC) {
		if (gar < 0.5) {
			if (lowGrS) zone = cool ? Z.CAMa : Z.CAMb
			else zone = cool ? (pluvial ? Z.CAap : Z.CAa) : pluvial ? Z.CAbp : Z.CAb
		} else if (lowGrS) zone = cool ? Z.CMa : Z.CMb
		else if (gint < 1250 && cool) {
			zone = ar > 0.75 ? (pluvial ? Z.CTfp : Z.CTf) : pluvial ? Z.CTsp : Z.CTs
		} else if (gdd < 1300) {
			if (cool) zone = pluvial ? Z.CEap : Z.CEa
			else if (cold) zone = pluvial ? Z.CEbp : Z.CEb
			else zone = pluvial ? Z.CEcp : Z.CEc
		} else {
			zone = cool ? (pluvial ? Z.CDap : Z.CDa) : pluvial ? Z.CDbp : Z.CDb
		}
	} else if (groupH) {
		if (gar < 0.5) {
			if (lowGrS) {
				if (hot) zone = Z.HAMa
				else if (torrid) zone = Z.HAMb
				else zone = Z.HAMc
			} else if (hot) zone = pluvial ? Z.HAap : Z.HAa
			else if (torrid) zone = pluvial ? Z.HAbp : Z.HAb
			else zone = pluvial ? Z.HAcp : Z.HAc
		} else if (lowGrS) {
			if (hot) zone = Z.HMa
			else if (torrid) zone = Z.HMb
			else zone = Z.HMc
		} else if (gint < 1250 && hot) {
			zone = ar > 0.75 ? (pluvial ? Z.HTfp : Z.HTf) : pluvial ? Z.HTsp : Z.HTs
		} else if (hot) zone = pluvial ? Z.HDap : Z.HDa
		else if (torrid) zone = pluvial ? Z.HDbp : Z.HDb
		else zone = pluvial ? Z.HDcp : Z.HDc
	} else {
		const ss = hot && cool
		if (gar < 0.5) {
			if (lowGrS) zone = ss ? Z.EAMa : Z.EAMb
			else zone = ss ? (pluvial ? Z.EAap : Z.EAa) : pluvial ? Z.EAbp : Z.EAb
		} else if (lowGrS) zone = ss ? Z.EMa : Z.EMb
		else if (gint < 1250 && ss) {
			zone = ar > 0.75 ? (pluvial ? Z.ETfp : Z.ETf) : pluvial ? Z.ETsp : Z.ETs
		} else {
			zone = ss ? (pluvial ? Z.EDap : Z.EDa) : pluvial ? Z.EDbp : Z.EDb
		}
	}

	return {
		zone,
		gdd,
		gint,
	}
}

function computePastaZones({
	mesh,
	isLand,
	temperatureMonthly,
	temperatureMax,
	temperatureMin,
	insolationMonthly,
	rainfallMonthly,
	petMonthly,
	aetMonthly,
	params,
	iceThickness,
	iceMinMonthly,
	iceMaxMonthly,
}: ComputePastaZonesParams): { zones: Uint8Array; debug: PastaDebug } {
	const N = mesh.numRegions
	const dpm = params.daysPerYear / 12
	const output = new Uint8Array(N)
	const cls = STAR.isValidSpectralClass(params.spectralClass)
		? params.spectralClass
		: "G"
	const parFactor = STAR.getStarPARFactor({ cls, subtype: params.starSubtype })

	const debug: PastaDebug = {
		gdd: new Float32Array(N),
		gint: new Float32Array(N),
		gdd_monthly: new Float32Array(12 * N),
		gint_monthly: new Float32Array(12 * N),
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
			temps[m] = temperatureMonthly[m * N + r]
			insol[m] = insolationMonthly[m * N + r] * parFactor
		}
		const warmest = temperatureMax[r]
		const coldest = temperatureMin[r]
		debug.minT[r] = coldest
		debug.maxT[r] = warmest
		if (!isLand[r]) {
			// Ocean: skip AET/PET, only needs temps + insolation + ice
			const result = classifyOcean({
				temps,
				insol,
				mGDDz,
				mGInt,
				gddAccBuf,
				giAccBuf,
				iceMin: iceMinMonthly ? iceMinMonthly[r] : 0,
				iceMax: iceMaxMonthly ? iceMaxMonthly[r] : 0,
				dpm,
				warmest,
				coldest,
			})
			output[r] = result.zone
		} else {
			for (let m = 0; m < 12; m++) {
				const idx = m * N + r
				rain[m] = rainfallMonthly[idx]
				petBuf[m] = petMonthly[idx]
				aetBuf[m] = aetMonthly[idx]
			}
			const result = classifyLand({
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
				iceVal: iceThickness ? iceThickness[r] : 0,
				dpm,
				warmest,
				coldest,
			})
			output[r] = result.zone
			debug.gdd[r] = result.gdd
			debug.gint[r] = result.gint === Infinity ? 99999 : result.gint
			for (let m = 0; m < 12; m++) {
				debug.gdd_monthly[m * N + r] = mGDD[m]
				debug.gint_monthly[m * N + r] = mGInt[m]
			}
		}
	}

	return { zones: output, debug }
}

function assignPastaClimate({
	mesh,
	isLand,
	climate,
	rainfall,
	hydrology,
	params,
	iceThickness,
	iceMinMonthly,
	iceMaxMonthly,
}: AssignPastaClimateParams): { zones: Uint8Array; debug: PastaDebug } {
	return computePastaZones({
		mesh,
		isLand,
		temperatureMonthly: climate.temperature_monthly,
		temperatureMax: climate.temperature_max,
		temperatureMin: climate.temperature_min,
		insolationMonthly: climate.insolation_monthly,
		rainfallMonthly: rainfall.monthly,
		petMonthly: climate.pet_monthly,
		aetMonthly: hydrology.aet_monthly,
		params,
		iceThickness,
		iceMinMonthly,
		iceMaxMonthly,
	})
}

function assignEarthPastaClimate({
	mesh,
	isLand,
	climate,
	rainfall,
	params,
	realDtrMonthly,
	iceThickness,
	iceMinMonthly,
	iceMaxMonthly,
}: AssignEarthPastaClimateParams):
	| { zones: Uint8Array; debug: PastaDebug }
	| undefined {
	const temperatureMonthly = climate.real_temperature_monthly
	const rainfallMonthly = rainfall.real_monthly
	if (!temperatureMonthly || !rainfallMonthly) return undefined

	const N = mesh.numRegions
	const dpm = params.daysPerYear / 12
	const temperatureMax = new Float32Array(N)
	const temperatureMin = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		let hot = -Infinity
		let cold = Infinity
		for (let m = 0; m < 12; m++) {
			const t = temperatureMonthly[m * N + r]
			if (t > hot) hot = t
			if (t < cold) cold = t
		}
		temperatureMax[r] = hot
		temperatureMin[r] = cold
	}

	const dtrMonthly = realDtrMonthly ?? climate.temperature_monthly_range
	const petMonthly = new Float32Array(12 * N)
	HYDROLOGY.fillPetMonthlyHargreaves({
		temperatureMonthly,
		rangeMonthly: dtrMonthly,
		insolationMonthly: climate.insolation_monthly,
		petMonthly,
		dpm,
	})

	const aetMonthly = new Float32Array(12 * N)
	const rainBuf = new Float64Array(12)
	const petBuf = new Float64Array(12)
	const aetBuf = new Float64Array(12)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			rainBuf[m] = rainfallMonthly[idx]
			petBuf[m] = petMonthly[idx]
		}
		HYDROLOGY.computeAetFromPet({ rain: rainBuf, petBuf, aetBuf })
		for (let m = 0; m < 12; m++) aetMonthly[m * N + r] = aetBuf[m]
	}

	return computePastaZones({
		mesh,
		isLand,
		temperatureMonthly,
		temperatureMax,
		temperatureMin,
		insolationMonthly: climate.insolation_monthly,
		rainfallMonthly,
		petMonthly,
		aetMonthly,
		params,
		iceThickness,
		iceMinMonthly,
		iceMaxMonthly,
	})
}

function pastaClimateColor(zoneCode: number): [number, number, number] {
	if (zoneCode <= 0 || zoneCode >= pastaLabels.length) return [0.05, 0.08, 0.18]
	const label = pastaLabels[zoneCode]
	const rgb = ZONE_COLOR_MAP[label as keyof typeof ZONE_COLOR_MAP]
	return rgb ? [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255] : [0.05, 0.08, 0.18]
}

function pastaClimateName(zoneCode: number): string {
	if (zoneCode < 0 || zoneCode >= pastaLabels.length) return "Ocean"
	return PASTA_NAMES[pastaLabels[zoneCode]] ?? pastaLabels[zoneCode]
}

export const PASTA = {
	pastaLabels,
	assignPastaClimate,
	assignEarthPastaClimate,
	pastaClimateColor,
	pastaClimateName,
}
