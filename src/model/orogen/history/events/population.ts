/**
 * POPULATION / CENSUS EVENT — growth, urbanization, development spread.
 * Port of src/model/history/events/population.ts
 */

import { PROV } from "../fields"
import { EVT } from "../heap"
import type { HistoryRng } from "../rng"
import {
	getNationProvinces,
	getProvinceNeighbors,
	getSovereign,
	type HistoryState,
	isSovereign,
	wealthOptimal,
	YEAR_MS,
} from "../state"

// Medieval Demographics Made Easy constants
const MAX_ADJUSTMENT_RATE = 0.005
const URBAN_GROWTH = 0.1
const CITY_MIN = 8000
const TOWN_MIN = 1000
const SECOND_CITY_RATIO = 0.5
const CITY_DECAY = 0.75

// Linear interpolation scales (replacing d3.scaleLinear)
function lerpScale(domain: number[], range: number[], v: number): number {
	const clamped = Math.max(domain[0], Math.min(domain[domain.length - 1], v))
	for (let i = 0; i < domain.length - 1; i++) {
		if (clamped <= domain[i + 1]) {
			const t = (clamped - domain[i]) / (domain[i + 1] - domain[i])
			return range[i] + t * (range[i + 1] - range[i])
		}
	}
	return range[range.length - 1]
}

function urbanPopToDev(pop: number): number {
	return lerpScale(
		[1_000, 5_000, 20_000, 100_000, 1_000_000],
		[0.05, 0.1, 0.25, 0.65, 0.95],
		pop,
	)
}

function devToGrowthRate(dev: number): number {
	return lerpScale(
		[0.0, 0.15, 0.35, 0.55, 0.75, 0.95],
		[0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.002],
		dev,
	)
}

function devToUrbanRate(dev: number): number {
	return lerpScale(
		[0.0, 0.15, 0.35, 0.55, 0.75, 0.95],
		[0.04, 0.05, 0.06, 0.07, 0.08, 0.09],
		dev,
	)
}

function urbanization(state: HistoryState, init: boolean): void {
	// Process each sovereign nation
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || !isSovereign(state, p)) continue

		const provinces = getNationProvinces(state, p)
		let totalBase = 0
		for (const prov of provinces) {
			totalBase += PROV.population.rural.get(state, prov)
		}

		const urbanRate = devToUrbanRate(PROV.development.get(state, p))
		const totalUrban = (urbanRate * totalBase) / (1 - urbanRate)

		// Sort provinces by optimal wealth descending
		const sorted = provinces
			.slice()
			.sort((a, b) => wealthOptimal(state, b) - wealthOptimal(state, a))

		const largestCity = totalUrban * 0.2
		const urbanPops: number[] = []
		let prevCity = largestCity
		let usedUrban = 0
		let i = 0

		// Assign cities using MDME decay
		while (i < sorted.length && usedUrban < totalUrban) {
			let cityPop: number
			if (i === 0) {
				cityPop = largestCity
			} else if (i === 1) {
				cityPop = prevCity * SECOND_CITY_RATIO
			} else {
				cityPop = prevCity * CITY_DECAY
			}
			if (cityPop < CITY_MIN) break
			urbanPops.push(cityPop)
			usedUrban += cityPop
			prevCity = cityPop
			i++
		}

		// Distribute remaining as towns
		const numCities = urbanPops.length
		if (numCities === 0) {
			let townPop = largestCity
			let townsCreated = 0
			while (
				i < sorted.length &&
				usedUrban < totalUrban &&
				townPop >= TOWN_MIN
			) {
				const cappedTown = Math.min(
					townPop,
					CITY_MIN - 1,
					totalUrban - usedUrban,
				)
				if (cappedTown >= TOWN_MIN) {
					urbanPops.push(cappedTown)
					usedUrban += cappedTown
					townsCreated++
					townPop =
						townsCreated === 1
							? townPop * SECOND_CITY_RATIO
							: townPop * CITY_DECAY
				} else {
					break
				}
				i++
			}
		} else {
			const maxTownCount = numCities * 6
			const townStart = Math.min(CITY_MIN - 1, prevCity * 0.8)
			const decay =
				maxTownCount > 1
					? Math.pow(TOWN_MIN / townStart, 1 / (maxTownCount - 1))
					: 1
			let townsCreated = 0
			let townTarget = townStart
			while (
				i < sorted.length &&
				usedUrban < totalUrban &&
				townsCreated < maxTownCount
			) {
				const remainingUrban = totalUrban - usedUrban
				const actualPop = Math.min(townTarget, remainingUrban, CITY_MIN - 1)
				if (actualPop >= TOWN_MIN) {
					urbanPops.push(actualPop)
					usedUrban += actualPop
					townsCreated++
					townTarget *= decay
				} else {
					break
				}
				i++
			}
		}

		for (let idx = 0; idx < sorted.length; idx++) {
			const prov = sorted[idx]
			state.leaderRuntime.targetUrban[prov] = urbanPops[idx] ?? 0
			if (init) {
				PROV.population.urban.set(
					state,
					prov,
					state.time,
					state.leaderRuntime.targetUrban[prov],
				)
			}
		}
	}
}

/** Max spread distance in province hops (simplified from km-based) */
const MAX_SPREAD_HOPS = 20

function development(state: HistoryState, init: boolean): void {
	const BASE_DECAY = 0.75
	const FOREIGN_DECAY = 0.65
	const WATER_ACCESS_BONUS = 1.1

	// Gather all cities
	const cities: { province: number; dev: number; sourceNation: number }[] = []
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		if (PROV.population.urban.get(state, p) >= CITY_MIN) {
			cities.push({
				province: p,
				dev: urbanPopToDev(PROV.population.urban.get(state, p)),
				sourceNation: getSovereign(state, p),
			})
		}
	}

	// Multi-source BFS from all cities
	const devFromCities = new Float32Array(state.P)
	const visited = new Uint8Array(state.P)
	// Priority queue approximation: process highest dev first using a sorted array
	const queue: {
		province: number
		dev: number
		sourceNation: number
		hops: number
	}[] = cities.map((c) => ({ ...c, hops: 0 })).sort((a, b) => b.dev - a.dev)

	for (const city of cities) {
		devFromCities[city.province] = city.dev
		visited[city.province] = 1
	}

	while (queue.length > 0) {
		const { province, dev, sourceNation, hops } = queue.shift()!
		if (dev < 0.01 || hops >= MAX_SPREAD_HOPS) continue

		const neighbors = getProvinceNeighbors(state, province)
		for (const nb of neighbors) {
			if (state.desolate[nb]) continue
			const nbNation = getSovereign(state, nb)
			const isForeign = nbNation !== sourceNation
			const hasWaterAccess = state.waterAccess[nb] === 1

			let decay = BASE_DECAY
			if (isForeign) decay = FOREIGN_DECAY
			if (hasWaterAccess) decay *= WATER_ACCESS_BONUS

			const spreadDev = dev * decay
			if (spreadDev < 0.01) continue
			if (devFromCities[nb] >= spreadDev) continue

			devFromCities[nb] = spreadDev

			// Insert maintaining sorted order
			let lo = 0
			let hi = queue.length
			while (lo < hi) {
				const mid = (lo + hi) >>> 1
				if (queue[mid].dev > spreadDev) lo = mid + 1
				else hi = mid
			}
			queue.splice(lo, 0, {
				province: nb,
				dev: spreadDev,
				sourceNation,
				hops: hops + 1,
			})
		}
	}

	// Apply development
	const DEV_RISE = 0.1
	const DEV_FALL = 0.05
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const cityDev = devFromCities[p]
		const localDev = urbanPopToDev(PROV.population.urban.get(state, p))
		const targetDev = Math.max(cityDev, localDev)

		if (init) {
			PROV.development.set(state, p, state.time, targetDev)
		} else {
			const currentDev = PROV.development.get(state, p)
			const gap = targetDev - currentDev
			const rate = gap > 0 ? DEV_RISE : DEV_FALL
			PROV.development.set(state, p, state.time, currentDev + gap * rate)
		}
	}
}

export function initPopulation(state: HistoryState, _rng: HistoryRng): void {
	urbanization(state, true)
	development(state, true)
	state.heap.enqueue(state.time + YEAR_MS, EVT.CENSUS, 0, 0, 0, 0, state.time)
}

export function runPopulation(
	state: HistoryState,
	previousTime: number,
	_rng: HistoryRng,
): void {
	const duration = state.time - previousTime
	const yearFraction = duration / YEAR_MS

	urbanization(state, false)
	development(state, false)

	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue

		const growth =
			1 + devToGrowthRate(PROV.development.get(state, p)) * yearFraction
		const rural = PROV.population.rural.get(state, p)
		PROV.population.rural.set(state, p, state.time, rural * growth)

		const urban = PROV.population.urban.get(state, p)
		const targetPop = state.leaderRuntime.targetUrban[p]
		const urbanGrowth = urban * growth
		const maxAdjustment = urbanGrowth * MAX_ADJUSTMENT_RATE * yearFraction

		let finalPop: number
		if (targetPop >= urbanGrowth) {
			const gap = targetPop - urbanGrowth
			const adjustment = Math.min(gap * URBAN_GROWTH, maxAdjustment)
			finalPop = Math.min(urbanGrowth + adjustment, targetPop)
		} else {
			const gap = urbanGrowth - targetPop
			const adjustment = Math.min(gap * URBAN_GROWTH, maxAdjustment)
			finalPop = Math.max(urbanGrowth - adjustment, targetPop)
		}

		PROV.population.urban.set(state, p, state.time, finalPop)
	}

	// Schedule next census
	state.heap.enqueue(state.time + YEAR_MS, EVT.CENSUS, 0, 0, 0, 0, state.time)
}
