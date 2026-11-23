import type {
	BoilingPointParams,
	ClassifyHabitabilityParams,
	HabitabilityMasks,
	HasLiquidWaterParams,
	HeatLethalParams,
	WetBulbParams,
} from "@/model/climate/habitability/types"
import { HUMIDITY } from "@/model/climate/precipitation/humidity"

const MONTHS = 12
const WET_BULB_LIMIT_C = 31
const WET_BULB_ITERATIONS = 20
const WET_BULB_LOWER_BOUND_C = -60
const HYPER_ARID_INDEX = 0.05
const PSYCHROMETRIC_COEFFICIENT_PER_KPA = 0.000665
const KPA_PER_BAR = 100
const FREEZING_C = 0
const KELVIN_OFFSET = 273.15
const ANTOINE_SWITCH_BAR = 1.01325
const ANTOINE_LOW = { a: 4.6543, b: 1435.264, c: -64.848 }
const ANTOINE_HIGH = { a: 3.55959, b: 643.748, c: -198.043 }

function boilingPointC({ pressureBar }: BoilingPointParams): number {
	const { a, b, c } =
		pressureBar > ANTOINE_SWITCH_BAR ? ANTOINE_HIGH : ANTOINE_LOW
	return b / (a - Math.log10(pressureBar)) - c - KELVIN_OFFSET
}

function wetBulbC({
	tempC,
	vaporPressureKpa,
	pressureKpa,
}: WetBulbParams): number {
	const gamma = PSYCHROMETRIC_COEFFICIENT_PER_KPA * pressureKpa
	let lo = WET_BULB_LOWER_BOUND_C
	let hi = tempC
	for (let i = 0; i < WET_BULB_ITERATIONS; i++) {
		const mid = (lo + hi) / 2
		const residual =
			HUMIDITY.saturationVaporPressureKpa(mid) -
			gamma * (tempC - mid) -
			vaporPressureKpa
		if (residual > 0) hi = mid
		else lo = mid
	}
	return (lo + hi) / 2
}

function heatLethal({
	temperatureC,
	dtrC,
	pressureKpa,
	annualAridity,
	annualRainMm,
	distFromOceanKm,
}: HeatLethalParams): boolean {
	let hottest = Number.NEGATIVE_INFINITY
	for (let m = 0; m < MONTHS; m++) hottest = Math.max(hottest, temperatureC[m])
	if (!(hottest >= WET_BULB_LIMIT_C)) return false
	const humidity = HUMIDITY.monthlyRelativeHumidity({
		temperatureC,
		dtrC,
		annualAridity,
		annualRainMm,
		distFromOceanKm,
	})
	for (let m = 0; m < MONTHS; m++) {
		const tempC = temperatureC[m]
		if (!(tempC >= WET_BULB_LIMIT_C)) continue
		const vaporPressureKpa =
			(HUMIDITY.saturationVaporPressureKpa(tempC) * humidity[m]) / 100
		if (wetBulbC({ tempC, vaporPressureKpa, pressureKpa }) >= WET_BULB_LIMIT_C)
			return true
	}
	return false
}

function hasLiquidWater({
	temperatureC,
	boilingC,
}: HasLiquidWaterParams): boolean {
	let seen = false
	for (let m = 0; m < MONTHS; m++) {
		if (!Number.isFinite(temperatureC[m])) continue
		seen = true
		if (temperatureC[m] > FREEZING_C && temperatureC[m] < boilingC) return true
	}
	return !seen
}

function classify({
	climate,
	rainfall,
	dtrMonthly,
	oceanDist,
	isLand,
	pressureBar,
	numRegions,
}: ClassifyHabitabilityParams): HabitabilityMasks {
	const uninhabitable = new Uint8Array(numRegions)
	const hyperArid = new Uint8Array(numRegions)
	const boilingC = boilingPointC({ pressureBar })
	const pressureKpa = pressureBar * KPA_PER_BAR
	const temperatureC = new Float64Array(MONTHS)
	const dtrC = new Float64Array(MONTHS)
	for (let r = 0; r < numRegions; r++) {
		if (!isLand[r]) continue
		let annualPetMm = 0
		for (let m = 0; m < MONTHS; m++) {
			temperatureC[m] = climate.temperature_monthly[m * numRegions + r]
			dtrC[m] = dtrMonthly[m * numRegions + r]
			annualPetMm += climate.pet_monthly[m * numRegions + r]
		}
		const annualRainMm = rainfall.annual[r]
		const annualAridity = HUMIDITY.annualAridity({ annualRainMm, annualPetMm })
		if (annualAridity < HYPER_ARID_INDEX) hyperArid[r] = 1
		if (
			!hasLiquidWater({ temperatureC, boilingC }) ||
			heatLethal({
				temperatureC,
				dtrC,
				pressureKpa,
				annualAridity,
				annualRainMm,
				distFromOceanKm: oceanDist[r],
			})
		)
			uninhabitable[r] = 1
	}
	return { uninhabitable, hyperArid }
}

export const HABITABILITY = { classify, boilingPointC, wetBulbC }
