import { scaleLinear } from "d3"
import { NATION } from "@/model/nations"
import { TIME } from "@/model/utilities/time"
import { PROVINCE } from "../../provinces"
import { Province } from "../../provinces/types"
import { CensusEvent } from "../types"

// Medieval Demographics Made Easy (S. John Ross) based constants
// const POP_GROWTH = 0.001 // ~0.1% annual growth (MDME: 0.1-0.3% in good times)
const MAX_ADJUSTMENT_RATE = 0.005
const URBAN_GROWTH = 0.1
const CITY_MIN = 8000 // MDME: cities are 8000+
const TOWN_MIN = 1000 // MDME: towns are 1000-8000
const SECOND_CITY_RATIO = 0.5 // MDME: 20-80% of largest (avg 50%)
const CITY_DECAY = 0.75 // MDME: each city 10-40% smaller (avg 25% reduction)

const urbanPopToDev = scaleLinear()
	.domain([1_000, 5_000, 20_000, 100_000, 1_000_000])
	.range([0.05, 0.1, 0.25, 0.65, 0.95])
	.clamp(true)

const devToGrowthRate = scaleLinear()
	.domain([0.0, 0.15, 0.35, 0.55, 0.75, 0.95])
	.range([0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.002])
	.clamp(true)

const devToUrbanRate = scaleLinear()
	.domain([0.0, 0.15, 0.35, 0.55, 0.75, 0.95])
	.range([0.04, 0.05, 0.06, 0.07, 0.08, 0.09])
	.clamp(true)

export const POPULATION_EVENT = {
	init: () => {
		POPULATION_EVENT.spawn()
		POPULATION_EVENT.urbanization(true)
		POPULATION_EVENT.development(true)
	},
	urbanization: (init?: boolean) => {
		NATION.nations().forEach((nation) => {
			const provinces = NATION.provinces(nation)
			const totalBase = provinces.reduce(
				(acc, province) => acc + PROVINCE.population.rural.get(province),
				0,
			)
			const urbanRate = devToUrbanRate(PROVINCE.development.get(nation))
			const totalUrban = (urbanRate * totalBase) / (1 - urbanRate)

			// Sort provinces by optimal wealth descending to determine rank
			const sorted = [...provinces].sort(
				(a, b) => NATION.wealth.optimal(b) - NATION.wealth.optimal(a),
			)

			const largestCity = totalUrban * 0.2

			// Build city populations using MDME decay
			const urbanPops: number[] = []
			let prevCity = largestCity
			let usedUrban = 0
			let i = 0

			// First, assign cities (8000+) following MDME decay
			while (i < sorted.length && usedUrban < totalUrban) {
				let cityPop: number
				if (i === 0) {
					cityPop = largestCity
				} else if (i === 1) {
					// Second city: 50% of largest (MDME: 20-80%, avg 50%)
					cityPop = prevCity * SECOND_CITY_RATIO
				} else {
					// Each remaining city: 25% smaller than previous
					cityPop = prevCity * CITY_DECAY
				}

				// Stop adding cities when below city threshold
				if (cityPop < CITY_MIN) break

				urbanPops.push(cityPop)
				usedUrban += cityPop
				prevCity = cityPop
				i++
			}

			// Distribute remaining urban as towns
			const numCities = urbanPops.length
			if (numCities === 0) {
				// No cities: towns decay at city decay rate
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
						// Use SECOND_CITY_RATIO for the second town, then CITY_DECAY
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
				// Dynamically calculate decay to hit TOWN_MIN by the last slot
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

			sorted.forEach((province, idx) => {
				// Urban pop added to provinces with cities/towns
				province._population.targetUrban = urbanPops[idx] ?? 0
				if (init)
					PROVINCE.population.urban.set(
						province,
						province._population.targetUrban,
					)
			})
		})
	},
	development: (init?: boolean) => {
		// Decay constants
		const BASE_DECAY = 0.85
		const FOREIGN_DECAY = 0.75 // Higher decay (lower multiplier) for foreign provinces
		const COASTAL_BONUS = 1.1 // Lower decay (higher multiplier) for coastal provinces

		// Gather all cities and their initial development + source nation
		const cities = window.world.provinces
			.filter(
				(p) => !p.desolate && PROVINCE.population.urban.get(p) >= CITY_MIN,
			)
			.map((p) => ({
				province: p,
				dev: urbanPopToDev(PROVINCE.population.urban.get(p)),
				sourceNation: PROVINCE.nation(p),
			}))

		// Single multi-source BFS: seed all cities into queue sorted by dev (highest first)
		// Process highest development first so each province gets max on first visit
		type QueueEntry = {
			province: Province
			dev: number
			sourceNation: Province
		}
		const queue: QueueEntry[] = [...cities].sort((a, b) => b.dev - a.dev)
		const devFromCities = new Map<number, number>()

		// Mark all city provinces as visited with their initial dev
		for (const city of cities) {
			devFromCities.set(city.province.idx, city.dev)
		}

		while (queue.length > 0) {
			const { province, dev, sourceNation } = queue.shift()!

			// Stop spreading if development is too low
			if (dev < 0.01) continue

			const neighbors = PROVINCE.neighbors({ province })
			for (const neighbor of neighbors) {
				// Calculate decay based on neighbor properties
				const neighborNation = PROVINCE.nation(neighbor)
				const isForeign = neighborNation !== sourceNation
				const neighborCell = PROVINCE.cell(neighbor)
				const isCoastal = neighborCell.topography === "coastal"

				// Skip far neighbors (e.g., distant islands)
				const distance = PROVINCE.distance({ province, other: neighbor })
				const MAX_SPREAD_DISTANCE = 1500
				if (distance > MAX_SPREAD_DISTANCE) continue

				let decay = BASE_DECAY
				if (isForeign) decay = FOREIGN_DECAY
				if (isCoastal) decay *= COASTAL_BONUS

				const spreadDev = dev * decay
				if (spreadDev < 0.01) continue

				const existingDev = devFromCities.get(neighbor.idx)
				// Only process if we have higher dev to offer
				if (existingDev !== undefined && existingDev >= spreadDev) continue

				devFromCities.set(neighbor.idx, spreadDev)
				// Insert maintaining sorted order (binary search insert)
				let lo = 0
				let hi = queue.length
				while (lo < hi) {
					const mid = (lo + hi) >>> 1
					if (queue[mid].dev > spreadDev) lo = mid + 1
					else hi = mid
				}
				queue.splice(lo, 0, {
					province: neighbor,
					dev: spreadDev,
					sourceNation,
				})
			}
		}

		// Apply development: blend current toward target, allowing decay
		const DEV_RISE = 0.1 // 10% of gap per tick when rising
		const DEV_FALL = 0.05 // 5% of gap per tick when falling
		window.world.provinces
			.filter((p) => !p.desolate)
			.forEach((province) => {
				const cityDev = devFromCities.get(province.idx) ?? 0
				const urbanPop = PROVINCE.population.urban.get(province)
				const localDev = urbanPopToDev(urbanPop)
				const targetDev = Math.max(cityDev, localDev)

				if (init) {
					PROVINCE.development.set(province, targetDev)
				} else {
					const currentDev = PROVINCE.development.get(province)
					const gap = targetDev - currentDev
					const rate = gap > 0 ? DEV_RISE : DEV_FALL
					PROVINCE.development.set(province, currentDev + gap * rate)
				}
			})
	},
	run: (event: CensusEvent) => {
		const start = event.previous
		const end = window.world.time
		const duration = end - start
		const yearFraction = duration / TIME.constants.yearMS

		POPULATION_EVENT.urbanization()
		POPULATION_EVENT.development()

		window.world.provinces
			.filter((p) => !p.desolate)
			.forEach((province) => {
				const growth =
					1 + devToGrowthRate(PROVINCE.development.get(province)) * yearFraction
				const rural = PROVINCE.population.rural.get(province)
				PROVINCE.population.rural.set(province, rural * growth)

				const urban = PROVINCE.population.urban.get(province)
				const targetPop = province._population.targetUrban ?? 0

				// Max adjustment capped per year
				const urbanGrowth = urban * growth
				const maxAdjustment = urbanGrowth * MAX_ADJUSTMENT_RATE * yearFraction

				let finalPop: number
				if (targetPop >= urbanGrowth) {
					// Target is above base growth - grow more with diminishing returns
					const gap = targetPop - urbanGrowth
					const adjustment = Math.min(gap * URBAN_GROWTH, maxAdjustment)
					finalPop = Math.min(urbanGrowth + adjustment, targetPop)
				} else {
					// Target is below base growth - decrease towards target
					const gap = urbanGrowth - targetPop
					const adjustment = Math.min(gap * URBAN_GROWTH, maxAdjustment)
					finalPop = Math.max(urbanGrowth - adjustment, targetPop)
				}

				PROVINCE.population.urban.set(province, finalPop)
			})
		POPULATION_EVENT.spawn()
	},
	spawn: () => {
		window.world.future.enqueue({
			type: "census",
			time: window.world.time + TIME.constants.yearMS,
			previous: window.world.time,
		})
	},
}
