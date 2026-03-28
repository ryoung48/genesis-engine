import { TIME } from "../../utilities/time"
import type { OrogenClimate, OrogenParams, OrogenRainfall, SphereMesh } from "../types"
import { computeMonthlyInsolation } from "./climate"

const ZONE_COLOR_MAP = {
	Ofi: [226, 248, 255],
	Ofd: [185, 227, 255],
	Ofg: [137, 169, 190],
	Og: [79, 119, 150],
	Oc: [113, 171, 216],
	Ot: [9, 120, 171],
	Oh: [6, 79, 147],
	Or: [1, 45, 86],
	Oe: [81, 9, 170],
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

export const PASTA_LABELS = ["ocean", ...Object.keys(ZONE_COLOR_MAP)] as const

export const PASTA_NAMES: Record<(typeof PASTA_LABELS)[number], string> = {
	ocean: "Ocean",
	Ofi: "Permanent Frozen Ocean",
	Ofd: "Seasonal Frozen Ocean",
	Ofg: "Dark Seasonal Frozen Ocean",
	Og: "Dark Ocean",
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
	TG: "Tropical Barren",
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

const ZONE_INDEX = new Map<string, number>(PASTA_LABELS.map((label, index) => [label, index]))

function gdm(temp: number, month: number, base: number, platStart: number, platEnd: number, comp: number): number {
	const max = platStart - base
	const backSlope = max / (comp - platEnd)
	let gdd = temp - base
	if (temp > platStart) gdd = max
	if (temp > platEnd) gdd = max - backSlope * (temp - platEnd)
	return Math.max(0, gdd) * TIME.month.days(month).length
}

function gddiDay(insolationWm2: number, baseline: number): number {
	const effective = insolationWm2 * 0.5
	return Math.min(20, Math.max(0, (effective - baseline) / 10))
}

function longestRun(monthly: number[]): number {
	if (monthly.every((v) => v > 0)) return Infinity
	const start = monthly.findIndex((v) => v === 0)
	let maxSum = 0
	let runSum = 0
	for (let i = 0; i < monthly.length; i++) {
		const value = monthly[(start + i) % monthly.length]
		if (value > 0) {
			runSum += value
			if (runSum > maxSum) maxSum = runSum
		} else {
			runSum = 0
		}
	}
	return maxSum
}

function gddTotal(gdd: number[], gint: number[] | null = null, threshold = 1250): number {
	const n = gdd.length
	const giAcc = gint ? gint.slice() : new Array<number>(n).fill(1e6)

	if (gint) {
		for (let pass = 0; pass < 2; pass++) {
			for (let t = 0; t < n; t++) {
				const prev = t === 0 ? giAcc[n - 1] : giAcc[t - 1]
				giAcc[t] = gint[t] > 0 ? gint[t] + prev : 0
			}
		}
		if (giAcc.every((v) => v > 0)) giAcc[n - 1] = 1e6
		for (let pass = 0; pass < 2; pass++) {
			for (let t = 0; t < n; t++) {
				const tn = n - (t + 1)
				const prev = ((tn - 1) % n + n) % n
				if (gint[tn] > 0 && gint[prev] > 0) giAcc[prev] = giAcc[tn]
			}
		}
	}

	const gddAcc = gdd.slice()
	for (let pass = 0; pass < 2; pass++) {
		for (let t = 0; t < n; t++) {
			const prev = t === 0 ? gddAcc[n - 1] : gddAcc[t - 1]
			const sum = gdd[t] + prev
			if (gdd[t] > 0) gddAcc[t] = sum
			else if (giAcc[t] > threshold) gddAcc[t] = 0
			else gddAcc[t] = sum
		}
	}

	return gddAcc.every((v) => v > 0) ? Infinity : Math.max(...gddAcc)
}

function pet(monthlyTemps: number[]): number[] {
	return monthlyTemps.map((temp, month) => Math.max(0, (temp * 7) / 30 * TIME.month.days(month).length))
}

function estimateSeaIceFraction(temp: number): number {
	const freezePoint = -1.8
	if (temp <= freezePoint - 10) return 1
	if (temp >= freezePoint + 4) return 0
	return Math.max(0, Math.min(1, (freezePoint + 4 - temp) / 14))
}

function aet(monthlyTemps: number[], monthlyRain: number[]): number[] {
	const petM = pet(monthlyTemps)
	const result = new Array<number>(12).fill(0)
	let soil = 25

	for (let iter = 0; iter < 20; iter++) {
		const startSoil = soil
		for (let month = 0; month < 12; month++) {
			const p = monthlyRain[month]
			const pe = petM[month]
			if (p >= pe) {
				soil = Math.min(50, soil + (p - pe))
				result[month] = pe
			} else {
				const deficit = pe - p
				const soilEvap = soil > 25
					? Math.min(soil, deficit)
					: Math.min(soil, deficit * (soil / 25))
				soil -= soilEvap
				result[month] = p + soilEvap
			}
		}
		if (Math.abs(soil - startSoil) < 1) break
	}

	return result
}

function classifyPasta(monthlyTemps: number[], monthlyRain: number[], monthlyInsolation: number[], isOcean: boolean): string {
	const warmest = Math.max(...monthlyTemps)
	const coldest = Math.min(...monthlyTemps)
	const annualPrecip = monthlyRain.reduce((sum, value) => sum + value, 0)
	const aetM = aet(monthlyTemps, monthlyRain)
	const petM = pet(monthlyTemps)

	let petSum = 0
	let aetSum = 0
	let petGdd = 0
	let aetGdd = 0
	let precGdd = 0
	let gddWeightSum = 0
	const mGDD: number[] = []
	const mGDDz: number[] = []
	const mGInt: number[] = []

	for (let month = 0; month < 12; month++) {
		const temp = monthlyTemps[month]
		const days = TIME.month.days(month).length
		const g5 = gdm(temp, month, 5, 25, 40, 50)
		const g0 = gdm(temp, month, 0, 20, 40, 60)
		const lightStd = gddiDay(monthlyInsolation[month], 20)
		const lightZero = gddiDay(monthlyInsolation[month], 0)
		const ceiling = 15 * days
		const effectiveGDDz = Math.min(g0, lightZero * days)

		mGDD.push(g5 > 0 && lightStd > 0 ? g5 : 0)
		mGDDz.push(g0 > 0 && lightZero > 0 ? g0 : 0)
		mGInt.push(Math.max(0, ceiling - effectiveGDDz))

		petSum += petM[month]
		aetSum += aetM[month]
		petGdd += petM[month] * g5
		aetGdd += aetM[month] * g5
		precGdd += monthlyRain[month] * g5
		gddWeightSum += g5
	}

	const gdd = gddTotal(mGDD, mGInt)
	const gddz = gddTotal(mGDDz, mGInt)
	const gint = longestRun(mGInt)
	const ar = petSum > 0 ? aetSum / petSum : 1
	const gar = petGdd > 0 ? aetGdd / petGdd : 1
	const aetAvg = aetSum / 12
	const gpr = gddWeightSum > 0 ? precGdd / gddWeightSum : 0
	const grs = aetAvg > 0 ? gpr / aetAvg : 1
	const evr = annualPrecip > 0 ? aetSum / annualPrecip : 1
	const ice = warmest <= 0 && annualPrecip > 25

	const cool = coldest > 0 && coldest <= 17
	const cold = coldest > -30 && coldest <= 0
	const hot = warmest >= 40 && warmest < 60
	const torrid = warmest >= 60 && warmest < 90
	const lowGrS = grs < 0.8
	const pluvial = evr < 0.45
	const groupT = warmest < 40 && coldest > 17
	const groupC = warmest < 40 && coldest <= 17
	const groupH = warmest >= 40 && coldest > 17

	const seaIceFractions = monthlyTemps.map(estimateSeaIceFraction)
	const maxSeaIce = Math.max(...seaIceFractions)
	const minSeaIce = Math.min(...seaIceFractions)

	if (isOcean) {
		if (minSeaIce > 0.8) return "Ofi"
		if (maxSeaIce > 0.2) return gddz >= 50 ? "Ofd" : "Ofg"
		if (gddz < 50) return "Og"
		if (warmest > 60) return "Or"
		if (coldest > 18) return warmest > 40 ? "Oh" : "Ot"
		if (warmest > 40) return "Oe"
		return "Oc"
	}

	if (ice) return "CI"

	if (gddz < 50) {
		if (groupT) return "TG"
		if (groupC) return "CG"
		if (groupH) return "HG"
		return "EG"
	}

	if (ar < 0.2) {
		const prefix = ar < 0.06 ? "Ah" : "Ad"
		if (warmest < 60 && coldest > 0) return `${prefix}a`
		if (warmest < 60) return `${prefix}c`
		if (coldest > 0) return `${prefix}h`
		return `${prefix}e`
	}

	if (gdd < 350) {
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

	const p = pluvial ? "p" : ""

	if (groupT) {
		const eu = gint < 1250
		if (gar < 0.5) return `${eu ? "TUA" : "TQA"}${p}`
		if (eu) {
			if (ar > 0.9) return evr < 0.4 ? "TUrp" : "TUr"
			if (ar > 0.75) return `TUf${p}`
			return `TUs${p}`
		}
		return ar > 0.75 ? `TQf${p}` : `TQs${p}`
	}

	if (groupC) {
		if (gar < 0.5) {
			if (lowGrS) return cool ? "CAMa" : "CAMb"
			return cool ? `CAa${p}` : `CAb${p}`
		}
		if (lowGrS) return cool ? "CMa" : "CMb"
		if (gint < 1250 && cool) return ar > 0.75 ? `CTf${p}` : `CTs${p}`
		if (gdd < 1300) {
			if (cool) return `CEa${p}`
			if (cold) return `CEb${p}`
			return `CEc${p}`
		}
		return cool ? `CDa${p}` : `CDb${p}`
	}

	if (groupH) {
		if (gar < 0.5) {
			if (lowGrS) {
				if (hot) return "HAMa"
				if (torrid) return "HAMb"
				return "HAMc"
			}
			if (hot) return `HAa${p}`
			if (torrid) return `HAb${p}`
			return `HAc${p}`
		}
		if (lowGrS) {
			if (hot) return "HMa"
			if (torrid) return "HMb"
			return "HMc"
		}
		if (gint < 1250 && hot) return ar > 0.75 ? `HTf${p}` : `HTs${p}`
		if (hot) return `HDa${p}`
		if (torrid) return `HDb${p}`
		return `HDc${p}`
	}

	const ss = hot && cool
	if (gar < 0.5) {
		if (lowGrS) return ss ? "EAMa" : "EAMb"
		return ss ? `EAa${p}` : `EAb${p}`
	}
	if (lowGrS) return ss ? "EMa" : "EMb"
	if (gint < 1250 && ss) return ar > 0.75 ? `ETf${p}` : `ETs${p}`
	return ss ? `EDa${p}` : `EDb${p}`
}

export function assignPastaClimate(
	mesh: SphereMesh,
	isLand: Uint8Array,
	climate: OrogenClimate,
	rainfall: OrogenRainfall,
	params: OrogenParams,
): Uint8Array {
	const N = mesh.numRegions
	const output = new Uint8Array(N)
	const insolation = computeMonthlyInsolation(mesh, params)

	for (let r = 0; r < N; r++) {
		const monthlyTemps = Array.from({ length: 12 }, (_, month) => climate.temperature_monthly[month * N + r])
		const monthlyRain = isLand[r]
			? Array.from({ length: 12 }, (_, month) => rainfall.monthly[month * N + r])
			: new Array<number>(12).fill(0)
		const monthlyInsolation = Array.from({ length: 12 }, (_, month) => insolation[month * N + r])
		output[r] = ZONE_INDEX.get(classifyPasta(monthlyTemps, monthlyRain, monthlyInsolation, !isLand[r])) ?? 0
	}

	return output
}

export function pastaClimateColor(zoneCode: number): [number, number, number] {
	if (zoneCode <= 0 || zoneCode >= PASTA_LABELS.length) return [0.05, 0.08, 0.18]
	const label = PASTA_LABELS[zoneCode]
	const rgb = ZONE_COLOR_MAP[label as keyof typeof ZONE_COLOR_MAP]
	return rgb ? [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255] : [0.05, 0.08, 0.18]
}

export function pastaClimateName(zoneCode: number): string {
	if (zoneCode < 0 || zoneCode >= PASTA_LABELS.length) return "Ocean"
	return PASTA_NAMES[PASTA_LABELS[zoneCode]] ?? PASTA_LABELS[zoneCode]
}
