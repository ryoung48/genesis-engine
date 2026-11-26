import type {
	ClimateTests,
	ClimateTestsParams,
} from "@/model/geography/terrain/deposits/climate-tests/types"
import { MATH } from "@/model/shared/math/core"

const MONTHS = 12
const DRY_MONTH_MM = 60
const HOT_C = 24
const HOT_DRY_MM = 100
const WARM_C = 10
const WET_MM = 40
const ALL_HOT_C = 30

const BAUX = {
	temperature: [20, 23],
	rain: [1000, 1400],
	dry: [7.5, 5.5],
} as const
const IRON = { temperature: [15, 20], rain: [500, 900] } as const
const EVAP = {
	hotDryShare: [0.6, 0.85],
	hotMonths: [0.5, 2.5],
	rain: [350, 120],
	temperature: [0, 10],
} as const
const PEAT = {
	wetShare: [0.75, 0.95],
	warmMonths: [1.5, 3.5],
	rain: [350, 600],
} as const
const SEMI = {
	temperature: [5, 11],
	dryMonths: [3, 5],
	rain: [60, 180],
	wet: [1200, 1600],
	floor: 0.6,
} as const
const ARID = { rain: [650, 300], temperature: [10, 16] } as const

function compute({
	numRegions,
	temperatureMonthly,
	rainfallMonthly,
	isLand,
}: ClimateTestsParams): ClimateTests {
	const out: ClimateTests = {
		bauxite: new Float32Array(numRegions),
		ironLaterite: new Float32Array(numRegions),
		evaporite: new Float32Array(numRegions),
		peat: new Float32Array(numRegions),
		enrichedCopper: new Float32Array(numRegions),
		arid: new Float32Array(numRegions),
	}
	for (let r = 0; r < numRegions; r++) {
		if (!isLand[r]) continue
		let tSum = 0
		let pSum = 0
		let dry = 0
		let hot = 0
		let hotDry = 0
		let warm = 0
		let wet = 0
		let allHot = true
		for (let m = 0; m < MONTHS; m++) {
			const t = temperatureMonthly[m * numRegions + r]
			const p = rainfallMonthly[m * numRegions + r]
			tSum += t
			pSum += p
			if (p < DRY_MONTH_MM) dry++
			if (t > HOT_C) {
				hot++
				if (p < HOT_DRY_MM) hotDry++
			}
			if (t > WARM_C) {
				warm++
				if (p > WET_MM) wet++
			}
			if (t <= ALL_HOT_C) allHot = false
		}
		const mat = tSum / MONTHS
		const map = pSum
		out.bauxite[r] =
			MATH.ramp({ range: BAUX.temperature, x: mat }) *
			MATH.ramp({ range: BAUX.rain, x: map }) *
			MATH.ramp({ range: BAUX.dry, x: dry })
		out.ironLaterite[r] =
			MATH.ramp({ range: IRON.temperature, x: mat }) *
			MATH.ramp({ range: IRON.rain, x: map })
		out.evaporite[r] = Math.max(
			hot
				? MATH.ramp({ range: EVAP.hotDryShare, x: hotDry / hot }) *
						MATH.ramp({ range: EVAP.hotMonths, x: hot })
				: 0,
			MATH.ramp({ range: EVAP.rain, x: map }) *
				MATH.ramp({ range: EVAP.temperature, x: mat }),
		)
		out.peat[r] =
			allHot || warm < 2
				? 0
				: MATH.ramp({ range: PEAT.wetShare, x: wet / warm }) *
					MATH.ramp({ range: PEAT.warmMonths, x: warm }) *
					MATH.ramp({ range: PEAT.rain, x: map })
		out.enrichedCopper[r] =
			MATH.ramp({ range: SEMI.temperature, x: mat }) *
			MATH.ramp({ range: SEMI.dryMonths, x: dry }) *
			(SEMI.floor +
				(1 - SEMI.floor) * MATH.ramp({ range: SEMI.rain, x: map })) *
			(1 - MATH.ramp({ range: SEMI.wet, x: map }))
		out.arid[r] =
			MATH.ramp({ range: ARID.rain, x: map }) *
			MATH.ramp({ range: ARID.temperature, x: mat })
	}
	return out
}

export const CLIMATE_TESTS = { compute }
