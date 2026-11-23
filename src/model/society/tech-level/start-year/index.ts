import { MATH } from "@/model/shared/math/core"
import { FARMING_WAY_OF_LIFE } from "@/model/society/farming/way-of-life"
import { MIGRATION } from "@/model/society/migration"
import { TECH_LEVEL } from "@/model/society/tech-level"
import type {
	FirstYearParams,
	StartYearParams,
	TargetYearParams,
	TimelineAtParams,
} from "@/model/society/tech-level/start-year/types"

const SETTLED_TARGET = { domain: [0, 0.5], range: [0.962, 0.989] }
const FARMING_AGE_TARGET = {
	domain: [0.5, 1, 1.8, 2.35, 3],
	range: [2429, 4050, 4871, 5580, 5997],
}
const AGRARIAN_LIMIT = 3
const YEARS_AFTER_AGRARIAN = {
	domain: [3, 3.8, 5, 6, 7.3, 7.8],
	range: [0, 300, 400, 450, 500, 525],
}
const SCAN_STEP_YEARS = 50

function farmingAgeAt({
	farming,
	areaKm2,
	graph,
	techLevel,
	year,
}: TimelineAtParams): number {
	const field = FARMING_WAY_OF_LIFE.wayOfLife({
		farming,
		graph,
		year,
		techLevel,
	})
	let people = 0
	let years = 0
	for (let province = 0; province < graph.count; province++) {
		const count = field.density[province] * areaKm2[province]
		if (!(count > 0)) continue
		const farmYears = Math.max(0, year - farming.adoptionYear[province])
		const herdYears = Math.max(0, year - farming.herdAdoptionYear[province])
		people += count
		years +=
			count *
			(field.farm[province] * farmYears + field.herd[province] * herdYears)
	}
	return people > 0 ? years / people : 0
}

function settledShareAt({
	farming,
	areaKm2,
	graph,
	year,
}: TimelineAtParams): number {
	let land = 0
	let settled = 0
	for (let province = 0; province < graph.count; province++) {
		if (graph.desolate[province]) continue
		land += areaKm2[province]
		if (farming.settledYear[province] <= year) settled += areaKm2[province]
	}
	return land > 0 ? settled / land : 0
}

function firstYear({ measure, target, from, to }: FirstYearParams): number {
	let previous = from
	for (let year = from; year <= to; year += SCAN_STEP_YEARS) {
		if (measure(year) >= target) {
			let low = previous
			let high = year
			while (high - low > 1) {
				const mid = Math.floor((low + high) / 2)
				if (measure(mid) >= target) high = mid
				else low = mid
			}
			return high
		}
		previous = year
	}
	return to
}

function startYear({
	farming,
	areaKm2,
	graph,
	horizonYear,
	techLevel,
}: StartYearParams): number {
	const timeline = {
		farming,
		areaKm2,
		graph,
		techLevel: Math.min(techLevel, AGRARIAN_LIMIT),
	}
	const earliest = (years: Int32Array) => {
		let first = horizonYear
		for (let p = 0; p < years.length; p++)
			if (!graph.desolate[p] && years[p] !== MIGRATION.sentinel)
				first = Math.min(first, years[p])
		return first
	}
	if (techLevel < SETTLED_TARGET.domain[1])
		return firstYear({
			measure: (year) => settledShareAt({ ...timeline, year }),
			target: MATH.piecewise({ ...SETTLED_TARGET, x: techLevel }),
			from: earliest(farming.settledYear),
			to: horizonYear,
		})
	const agrarian = firstYear({
		measure: (year) => farmingAgeAt({ ...timeline, year }),
		target: MATH.piecewise({
			...FARMING_AGE_TARGET,
			x: Math.min(techLevel, AGRARIAN_LIMIT),
		}),
		from: earliest(farming.adoptionYear),
		to: horizonYear,
	})
	return techLevel <= AGRARIAN_LIMIT
		? agrarian
		: Math.round(
				agrarian + MATH.piecewise({ ...YEARS_AFTER_AGRARIAN, x: techLevel }),
			)
}

function targetYear({ target, ...timeline }: TargetYearParams): number {
	return startYear({
		...timeline,
		techLevel: TECH_LEVEL.averageLevel({ target }),
	})
}

export const TECH_START = {
	farmingAgeAt,
	settledShareAt,
	startYear,
	targetYear,
}
