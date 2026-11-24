import { ROCKS } from "@/model/geography/terrain/rocks"
import type {
	RegionClimateParams,
	Soil,
	SoilAtParams,
	SoilClimate,
	SoilClimateTerms,
	SoilFertility,
	SoilFertilityParams,
	SoilGrade,
	SoilKindParams,
	SoilModifier,
	SoilParentKey,
} from "@/model/geography/terrain/soils/types"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MATH } from "@/model/shared/math/core"

const C = SURFACE_CONFIG
const MONTHS = 12
const GRADES: readonly SoilGrade[] = [
	"Barren",
	"Poor",
	"Middling",
	"Good",
	"Rich",
]
const MODIFIERS: readonly SoilModifier[] = [
	"none",
	"black",
	"leached",
	"podzol",
]
const KIND_WORDS: Record<SoilParentKey, string> = {
	river: "river silt",
	loess: "loess",
	till: "glacial till",
	erg: "dune sand",
	volcanic: "volcanic ash",
	basalt: "basalt clay",
	limestone: "limestone soil",
	shale: "shale clay",
	sandstone: "sandy soil",
	granite: "thin granite soil",
	gneiss: "thin granite soil",
	shield: "thin granite soil",
	slate: "stony slate soil",
	greenstone: "greenstone soil",
	ophiolite: "serpentine soil",
	salt: "salt crust",
}
const MODIFIER_WORDS: Record<SoilModifier, string> = {
	none: "",
	black: "black earth",
	leached: "leached red earth",
	podzol: "acid podzol",
}
const LEACHED_AT = 0.45
const BLACK_AT = 0.5
const PODZOL_AT = 0.5
const WOODS_BIOME = 4

function regionClimate({
	region,
	numRegions,
	temperatureMonthly,
	temperatureAvg,
	rainfallAnnual,
	petMonthly,
}: RegionClimateParams): SoilClimate {
	let warmest = -Infinity
	let coldest = Infinity
	let pet = 0
	for (let m = 0; m < MONTHS; m++) {
		const t = temperatureMonthly[m * numRegions + region]
		warmest = Math.max(warmest, t)
		coldest = Math.min(coldest, t)
		pet += Math.max(C.petFloorMmPerMonth, petMonthly[m * numRegions + region])
	}
	return {
		wet: rainfallAnnual[region] / pet,
		mean: temperatureAvg[region],
		warmest,
		coldest,
	}
}

function climateTerms({
	wet,
	mean,
	warmest,
	coldest,
}: SoilClimate): SoilClimateTerms {
	return {
		black:
			MATH.ramp({ range: C.blackWet, x: wet }) *
			MATH.ramp({ range: C.blackWetMax, x: wet }) *
			MATH.ramp({ range: C.blackWarmest, x: warmest }) *
			MATH.ramp({ range: C.blackColdest, x: coldest }),
		leach:
			MATH.ramp({ range: C.leachWet, x: wet }) *
			MATH.ramp({ range: C.leachWarm, x: mean }),
		podzol:
			MATH.ramp({ range: C.podzolColdest, x: coldest }) *
			MATH.ramp({ range: C.podzolWarmest, x: warmest }),
	}
}

function parentKey({ rock, young }: SoilKindParams): SoilParentKey {
	if (rock === "young") return young === "none" ? "river" : young
	return rock as Exclude<SoilParentKey, "river" | "loess" | "till" | "erg">
}

function spared({
	rock,
	young,
	rising,
}: Pick<SoilAtParams, "rock" | "young" | "rising">): number {
	const renewed =
		rock === "young" && young === "river"
			? C.leachRenew.river
			: rock === "volcanic"
				? C.leachRenew.volcanic
				: rock === "basalt"
					? C.leachRenew.basalt
					: 0
	return Math.max(renewed, C.leachRenew.rising * rising)
}

function soilAt({
	rock,
	young,
	rising,
	forested,
	climate,
}: SoilAtParams): Soil {
	const parent = C.parentFertility[parentKey({ rock, young })]
	const climateOnly = climateTerms(climate)
	const terms = { ...climateOnly, podzol: forested ? climateOnly.podzol : 0 }
	const leach = terms.leach * (1 - spared({ rock, young, rising }))
	const fertility = MATH.clamp01(
		parent *
			(1 - C.leachLoss * leach) *
			(1 - C.podzolLoss * terms.podzol) *
			(1 + C.blackBonus * terms.black),
	)
	const modifier =
		leach >= LEACHED_AT
			? "leached"
			: terms.black >= BLACK_AT
				? "black"
				: terms.podzol >= PODZOL_AT
					? "podzol"
					: "none"
	return { parent, fertility, modifier }
}

function fertility({
	rock,
	youngKind,
	rising,
	vegetation,
	isLand,
	temperatureMonthly,
	temperatureAvg,
	rainfallAnnual,
	petMonthly,
}: SoilFertilityParams): SoilFertility {
	const n = rock.length
	const out = new Float32Array(n)
	const modifier = new Uint8Array(n)
	for (let r = 0; r < n; r++) {
		if (!isLand[r]) continue
		const soil = soilAt({
			rock: ROCKS.kinds[rock[r]],
			young: ROCKS.youngKinds[youngKind[r]],
			rising: rising[r],
			forested: vegetation[r] >= WOODS_BIOME,
			climate: regionClimate({
				region: r,
				numRegions: n,
				temperatureMonthly,
				temperatureAvg,
				rainfallAnnual,
				petMonthly,
			}),
		})
		out[r] = soil.fertility
		modifier[r] = MODIFIERS.indexOf(soil.modifier)
	}
	return { fertility: out, modifier }
}

function kindWord(params: SoilKindParams): string {
	return KIND_WORDS[parentKey(params)]
}

function modifierWord(modifier: SoilModifier): string {
	return MODIFIER_WORDS[modifier]
}

function grade(value: number): SoilGrade {
	let index = 0
	for (let g = 0; g < C.soilGrades.length; g++)
		if (value >= C.soilGrades[g]) index = g + 1
	return GRADES[index]
}

export const SOILS = {
	grades: GRADES,
	modifiers: MODIFIERS,
	kindWord,
	modifierWord,
	regionClimate,
	climateTerms,
	soilAt,
	fertility,
	grade,
}
