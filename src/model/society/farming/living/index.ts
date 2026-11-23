import { MATH } from "@/model/shared/math/core"
import type {
	AdoptionParams,
	Capacities,
	CapacitiesParams,
	CodeParams,
	CropFitParams,
	DensityParams,
	ExchangeAdoptionParams,
	FarmDensityParams,
	HerdShareParams,
	MixedHerdAdoptionParams,
	ModeCodeParams,
	PastoralYearParams,
	PostFarmingMode,
	PostModeParams,
	RampParams,
	YieldFactorParams,
} from "@/model/society/farming/living/types"
import { FARMING_MEASURES } from "@/model/society/farming/measures"
import { MIGRATION } from "@/model/society/migration"

const FARM_PEOPLE_PER_KM2 = 60
const HERD_PEOPLE_PER_KM2 = 2
const IRRIGATION_YIELD = 2.5
const ARID_BOUNDS = { edge0: 0.2, edge1: 0.5 }
const HOLD = 10
const RAMP_YEARS = 650
const ADOPTION_LAG_YEARS = Math.round(RAMP_YEARS * Math.LN2)
const MODE_SHARE_MIN = 0.27
const FARM_SEASON = { edge0: 1000, edge1: 2000 }
const HOLD_DECAY_YEARS = 1500
const DEPENDENCE_LAG_YEARS = 4250
const INTENSIFY_YEARS = 16000
const YIELD_CONTRAST = 3
const IRRIGATION_CONTRAST = 2
const EXPANSION_START = 0.6
const EXPANSION_YEARS = 4000
const YIELD_BY_TECH_LEVEL = {
	domain: [3, 4, 5, 6, 7, 8],
	range: [1, 1.4, 2, 2.5, 3.5, 5.5],
}
// Specialised and mounted pastoralism opens this many years after the planet's
// first origin-landmass hearth fires. Earth's first such hearth starts at
// -9600 (China) and specialised pastoralism took off in the early first
// millennium BCE (Arzhan-1 about -850; docs/terrestrial/population/farming.md),
// so -1000 - (-9600) = 8600.
const PASTORAL_DELAY_YEARS = 8600
// Livestock landing on already farmed land join the farming at once as mixed
// farming, with no domestication lag. Colonial cattle and sheep spread within
// decades of landing: Hispaniola in 1493, Mexico in the 1520s (Crosby 1972,
// The Columbian Exchange), so about 30 years from arrival to adoption.
const MIXED_HERD_DELAY_YEARS = 30
// Herds introduced by voyage onto land with no native stock fill their range
// within centuries, not millennia: feral cattle released on the Pampas from
// 1536 and 1580 numbered in the millions by the 1700s, and Spanish cattle and
// horses overran Mexico and the Plains within a century or two of landing
// (Crosby 1972, The Columbian Exchange). An e-folding time of 50 years puts
// land and density at 95% of their capacity after 150 years.
const COLONIAL_RAMP_YEARS = 50
const MODE_CODES: PostFarmingMode[] = ["none", "farm", "herd"]

function cropFit({ measures }: CropFitParams): Float64Array {
	return Float64Array.from(
		{ length: measures.count },
		(_, p) =>
			MATH.smoothstep({ ...FARM_SEASON, x: measures.gdd[p] }) *
			FARMING_MEASURES.moisture({
				npp: measures.npp[p],
				floodShare: measures.floodShare[p],
			}),
	)
}

function capacities({ measures, suitability }: CapacitiesParams): Capacities {
	const forage = new Float32Array(measures.count)
	const farm = new Float32Array(measures.count)
	const herd = new Float32Array(measures.count)
	for (let p = 0; p < measures.count; p++) {
		const rainfed =
			suitability[p] *
			MATH.smoothstep({ ...ARID_BOUNDS, x: measures.arid[p] }) *
			FARMING_MEASURES.season({ gdd: measures.gdd[p] })
		const irrigated = IRRIGATION_YIELD * measures.floodShare[p]
		forage[p] = measures.forager[p]
		farm[p] = FARM_PEOPLE_PER_KM2 * Math.max(rainfed, irrigated)
		herd[p] =
			HERD_PEOPLE_PER_KM2 *
			measures.pasture[p] *
			FARMING_MEASURES.season({ gdd: measures.gdd[p] })
	}
	return { forage, farm, herd }
}

function herdShare({ measures, cropFit }: HerdShareParams): Float64Array {
	return Float64Array.from(
		{ length: measures.count },
		(_, p) =>
			(1 - cropFit[p]) *
			measures.pasture[p] *
			FARMING_MEASURES.season({ gdd: measures.gdd[p] }),
	)
}

function postMode({
	forage,
	farm,
	herd,
	farmShare,
	herdShare: herdLand,
}: PostModeParams): number {
	const farmable = farmShare >= MODE_SHARE_MIN && farm > forage
	const herdable = herdLand >= MODE_SHARE_MIN && herd > forage
	if (farmable && (!herdable || farm >= herd)) return MODE_CODES.indexOf("farm")
	return MODE_CODES.indexOf(herdable ? "herd" : "none")
}

function codeOf({ mode }: ModeCodeParams): number {
	return MODE_CODES.indexOf(mode)
}

function modeOfCode({ code }: CodeParams): PostFarmingMode {
	return MODE_CODES[code]
}

function adoptionYear({
	farmingYear,
	forage,
	capacity,
	hearthTiming,
	horizonYear,
}: AdoptionParams): number {
	if (farmingYear === MIGRATION.sentinel) return MIGRATION.sentinel
	const ratio = capacity / forage
	if (ratio <= 1) return MIGRATION.sentinel
	const decay =
		ratio >= HOLD
			? 0
			: Math.ceil(HOLD_DECAY_YEARS * Math.log((HOLD - 1) / (ratio - 1)))
	const dependence = Math.ceil(DEPENDENCE_LAG_YEARS * (1 - hearthTiming))
	const year = farmingYear + ADOPTION_LAG_YEARS + dependence + decay
	return year > horizonYear ? MIGRATION.sentinel : year
}

// Once ships cross the open ocean the world's crops travel too, and the
// dependence lag ends for every province farming has reached: maize, manioc and
// sweet potato became staples across Africa and Asia within a century or two of
// 1500 (Crosby 1972, The Columbian Exchange; Nunn and Qian 2010, J. Economic
// Perspectives 24(2):163). The province then adopts the usual adoption lag
// (and any hold decay) after the later of its farming arrival and the ocean
// year.
function exchangeAdoptionYear({
	farmingYear,
	oceanYear,
	forage,
	capacity,
	horizonYear,
}: ExchangeAdoptionParams): number {
	return adoptionYear({
		farmingYear:
			farmingYear === MIGRATION.sentinel
				? farmingYear
				: Math.max(farmingYear, oceanYear),
		forage,
		capacity,
		hearthTiming: 1,
		horizonYear,
	})
}

function pastoralYear({ startYears, horizonYear }: PastoralYearParams): number {
	return startYears.length
		? Math.min(...startYears) + PASTORAL_DELAY_YEARS
		: horizonYear
}

function mixedHerdAdoption({
	arrivalYear,
	farmingAdoptionYear,
	horizonYear,
}: MixedHerdAdoptionParams): number {
	if (
		arrivalYear === MIGRATION.sentinel ||
		farmingAdoptionYear === MIGRATION.sentinel
	)
		return MIGRATION.sentinel
	const year =
		Math.max(arrivalYear, farmingAdoptionYear) + MIXED_HERD_DELAY_YEARS
	return year > horizonYear ? MIGRATION.sentinel : year
}

function density({ forage, capacity, years }: DensityParams): number {
	const age = Math.max(0, years)
	const ramp = 1 - Math.exp(-age / RAMP_YEARS)
	const intensity = 1 - Math.exp(-age / INTENSIFY_YEARS)
	return forage + Math.max(0, capacity - forage) * ramp * intensity
}

function colonialRamp({ years }: RampParams): number {
	return 1 - Math.exp(-Math.max(0, years) / COLONIAL_RAMP_YEARS)
}

function colonialDensity({ forage, capacity, years }: DensityParams): number {
	return forage + Math.max(0, capacity - forage) * colonialRamp({ years })
}

function farmDensity({ capacity }: FarmDensityParams): number {
	const yieldShare = capacity / FARM_PEOPLE_PER_KM2
	return (
		FARM_PEOPLE_PER_KM2 *
		Math.min(1, yieldShare) ** YIELD_CONTRAST *
		Math.max(1, yieldShare) ** IRRIGATION_CONTRAST
	)
}

function ramp({ years }: RampParams): number {
	return 1 - Math.exp(-Math.max(0, years) / RAMP_YEARS)
}

function expansion({ years }: RampParams): number {
	const age = Math.max(0, years)
	return (
		ramp({ years: age }) *
		(EXPANSION_START +
			(1 - EXPANSION_START) * (1 - Math.exp(-age / EXPANSION_YEARS)))
	)
}

function yieldFactor({ techLevel }: YieldFactorParams): number {
	return MATH.piecewise({ ...YIELD_BY_TECH_LEVEL, x: techLevel })
}

export const FARMING_LIVING = {
	ramp,
	expansion,
	yieldFactor,
	capacities,
	cropFit,
	herdShare,
	postMode,
	modeOfCode,
	codeOf,
	adoptionYear,
	exchangeAdoptionYear,
	pastoralYear,
	mixedHerdAdoption,
	density,
	colonialRamp,
	colonialDensity,
	farmDensity,
}
