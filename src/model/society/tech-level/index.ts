import { MATH } from "@/model/shared/math/core"
import { ERAS } from "@/model/society/eras"
import { TECH_SPREAD } from "@/model/society/tech-level/spread"
import type {
	KardashevParams,
	LogLinearParams,
	RealmLevelsParams,
	SizePlan,
	TechLevelParams,
	WorldPower,
	WorldPowerParams,
} from "@/model/society/tech-level/types"

const WORLD_POPULATION_BY_LEADERS = {
	domain: [0.5, 1.4, 2, 2.5, 3.15, 4.1, 5, 6.1, 7, 7.8, 9],
	range: [
		4e6, 45e6, 115e6, 190e6, 285e6, 460e6, 1e9, 1.65e9, 2.5e9, 8.1e9, 10.4e9,
	],
}

const WATTS_PER_PERSON = {
	domain: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
	range: [
		250, 600, 1000, 1200, 1600, 3000, 5000, 8000, 10000, 25000, 60000, 150000,
		400000,
	],
}

const URBAN_SHARE = {
	domain: [0, 1, 2, 3, 4, 5, 6, 7, 8],
	range: [0, 0.04, 0.1, 0.08, 0.12, 0.3, 0.45, 0.65, 0.8],
}

const LARGEST_CITY = {
	domain: [1, 2, 3, 4, 5, 6, 7, 8],
	range: [80e3, 1e6, 1e6, 1.1e6, 2.3e6, 6.5e6, 16e6, 37e6],
}

const STATE_HELD = {
	domain: [0, 0.19, 1.8, 2.1, 2.35, 2.45, 3.5, 5.1, 7.8],
	range: [0, 0.08, 0.3285, 0.3669, 0.4635, 0.4682, 0.7191, 1, 1],
}

const SIZE_ANCHORS = [0.19, 0.56, 1.8, 2.1, 2.35, 2.45, 3.5, 5.1, 7.8]

const SIZE_SHARES: number[][] = [
	[50, 35, 15, 0, 0, 0, 0],
	[19.38, 34.26, 21.8, 11.76, 12.8, 0, 0],
	[1.55, 12.15, 15.62, 16.85, 12.2, 7.74, 33.89],
	[1.67, 10.77, 12.85, 13.71, 15.41, 13.68, 31.91],
	[1.44, 9.14, 12.25, 18.53, 21.9, 23.32, 13.42],
	[2.63, 9.44, 12.83, 24.79, 15.13, 10.93, 24.25],
	[1.34, 3.97, 6.62, 11.6, 7.64, 8.85, 59.98],
	[0.17, 0.72, 0.69, 3.04, 2.34, 5.39, 87.64],
	[0.21, 0.6, 1.19, 3.97, 6.95, 14.35, 72.73],
]

const LARGEST_BUCKET_UPPER = [250, 250, 533, 280, 250, 224, 794, 788, 599]

const SIZE_BUCKETS_BY_SHARE: [number, number][] = [
	[1, 1],
	[2, 4],
	[5, 9],
	[10, 24],
	[25, 49],
	[50, 100],
	[101, 250],
]

const MAX_TECH_LEVEL = 12

const DESCRIPTOR_INDEX = {
	domain: [0, 1, 2, 3, 4, 5, 6, 7],
	range: [1, 9, 18, 27, 40, 70, 80, 90],
}

const DESCRIPTORS: [number, string][] = [
	[1, "Paleolithic"],
	[3, "Mesolithic"],
	[6, "Neolithic"],
	[9, "Copper Age"],
	[12, "Bronze Age"],
	[15, "Late Bronze Age"],
	[18, "Iron Age"],
	[21, "Classical Age"],
	[24, "Late Antiquity"],
	[27, "Early Middle Ages"],
	[30, "High Middle Ages"],
	[33, "Commercial Revolution"],
	[36, "Late Middle Ages"],
	[40, "Renaissance"],
	[45, "Age of Discovery"],
	[50, "Scientific Revolution"],
	[60, "Enlightenment"],
	[70, "Industrial Revolution"],
	[80, "Machine Age"],
	[90, "Space Age"],
]

const KARDASHEV_BASE_WATTS_LOG10 = 6
const KARDASHEV_DECADES_PER_TYPE = 10

function logLinear({ domain, range, x }: LogLinearParams): number {
	return (
		10 **
		MATH.piecewise({
			domain,
			range: range.map((value) => Math.log10(value)),
			x,
		})
	)
}

function worldPopulation({ techLevel }: TechLevelParams): number {
	return logLinear({
		...WORLD_POPULATION_BY_LEADERS,
		x: TECH_SPREAD.leaderLevel({ techLevel }),
	})
}

function watts({ techLevel }: TechLevelParams): number {
	return logLinear({ ...WATTS_PER_PERSON, x: techLevel })
}

function kardashev({ watts: total }: KardashevParams): number {
	return (
		(Math.log10(total) - KARDASHEV_BASE_WATTS_LOG10) /
		KARDASHEV_DECADES_PER_TYPE
	)
}

function urbanShare({ techLevel }: TechLevelParams): number {
	return MATH.piecewise({ ...URBAN_SHARE, x: techLevel })
}

function largestCity({ techLevel }: TechLevelParams): number {
	return logLinear({ ...LARGEST_CITY, x: techLevel })
}

function stateHeld({ techLevel }: TechLevelParams): number {
	return MATH.piecewise({ ...STATE_HELD, x: techLevel })
}

function describe({ techLevel }: TechLevelParams): string {
	const index = MATH.piecewise({ ...DESCRIPTOR_INDEX, x: techLevel })
	let name = DESCRIPTORS[0][1]
	for (const [from, label] of DESCRIPTORS) if (index >= from) name = label
	return name
}

function sizePlan({ techLevel }: TechLevelParams): SizePlan {
	const shares = SIZE_BUCKETS_BY_SHARE.map((_, bucket) =>
		MATH.piecewise({
			domain: SIZE_ANCHORS,
			range: SIZE_SHARES.map((row) => row[bucket]),
			x: techLevel,
		}),
	)
	const upper = Math.round(
		MATH.piecewise({
			domain: SIZE_ANCHORS,
			range: LARGEST_BUCKET_UPPER,
			x: techLevel,
		}),
	)
	const buckets = SIZE_BUCKETS_BY_SHARE.map(
		([low, high], bucket): [number, number] =>
			bucket === SIZE_BUCKETS_BY_SHARE.length - 1 ? [low, upper] : [low, high],
	)
	return {
		percentages: MATH.normalize(shares).reverse(),
		buckets: buckets.reverse(),
	}
}

function realmLevels({
	sovereign,
	population,
	techLevel,
}: RealmLevelsParams): Float32Array {
	const mass = new Float64Array(sovereign.length)
	const weight = new Float64Array(sovereign.length)
	for (let p = 0; p < sovereign.length; p++) {
		const root = sovereign[p]
		if (root < 0 || !Number.isFinite(techLevel[p])) continue
		mass[root] += population[p] * techLevel[p]
		weight[root] += population[p]
	}
	return Float32Array.from(mass, (value, root) =>
		weight[root] > 0 ? value / weight[root] : 0,
	)
}

function worldPower({ population, techLevel }: WorldPowerParams): WorldPower {
	let total = 0
	for (let p = 0; p < population.length; p++)
		if (Number.isFinite(techLevel[p]))
			total += population[p] * watts({ techLevel: techLevel[p] })
	return {
		watts: total,
		kardashev: total > 0 ? kardashev({ watts: total }) : 0,
	}
}

export const TECH_LEVEL = {
	worldPopulation,
	watts,
	kardashev,
	worldPower,
	urbanShare,
	largestCity,
	stateHeld,
	sizePlan,
	describe,
	realmLevels,
	assign: TECH_SPREAD.assign,
	leaderLevel: TECH_SPREAD.leaderLevel,
	averageLevel: TECH_SPREAD.averageLevel,
	defaultTarget: TECH_SPREAD.leaderLevel({ techLevel: ERAS.defaultTechLevel }),
	maxTechLevel: MAX_TECH_LEVEL,
}
