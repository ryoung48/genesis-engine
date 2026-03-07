import { WORLD } from "@/model"
import { PROVINCE } from "@/model/provinces"
import { Language } from "../language/languages/types"
import { Province } from "../../provinces/types"
import { Culture, CultureSpawnParams } from "./types"
import { pickEthos } from "./ethos"
import { TRADITIONS } from "./traditions"

export const CULTURE = {
	spawn: ({ province }: CultureSpawnParams) => {
		const culture: Culture = {
			idx: window.world.cultures.length,
			provinces: new Set([province.idx]),
			color: "#ccc", // Placeholder color
			neighbors: new Set(),
			heritage: -1,
			faith: -1,
			language: null! as Language,
			name: "",
			ethos: "communal", // placeholder, assigned later
			traditions: [],
		}
		province.culture = culture.idx
		window.world.cultures.push(culture)
		return culture
	},
	build: () => {
		const provinces = window.world.provinces.filter((p) => !p.desolate)
		const landArea = provinces.reduce(
			(acc, p) => acc + p.land * window.world.cell.area,
			0,
		)
		const count = Math.floor(provinces.length / 8)
		const spacing = WORLD.placement.autoSpacing(count, landArea)
		const seeds = WORLD.placement
			.run({
				whitelist: provinces.map((p) => PROVINCE.cell(p)),
				count,
				spacing,
			})
			.map((cell) => window.world.provinces[cell.province])

		seeds.forEach((p) => CULTURE.spawn({ province: p }))

		const queue: Province[] = [...seeds]
		while (queue.length > 0) {
			const curr = queue.shift()!
			const culture = window.world.cultures[curr.culture]

			curr.neighbors.forEach((nIdx) => {
				const neighbor = window.world.provinces[nIdx]
				if (neighbor.desolate) return

				if (neighbor.culture === -1) {
					neighbor.culture = culture.idx
					culture.provinces.add(neighbor.idx)
					queue.push(neighbor)
				} else if (neighbor.culture !== culture.idx) {
					const neighborCulture = window.world.cultures[neighbor.culture]
					culture.neighbors.add(neighborCulture.idx)
					neighborCulture.neighbors.add(culture.idx)
				}
			})
		}
	},

	/**
	 * Assign one ethos per culture using weighted random selection.
	 * Call AFTER HERITAGE.build() so cultures know their heritage.
	 */
	assignEthos: () => {
		window.world.cultures.forEach((culture) => {
			culture.ethos = pickEthos()
		})
	},

	/**
	 * Assign 3 traditions per culture, weighted by:
	 *   - Whether the origin cell meets the tradition's condition (false → weight 0)
	 *   - 3× multiplier if culture's ethos is in the tradition's preferredEthos
	 *   - 0 weight if culture's ethos is in tradition's excludedEthos
	 *   - 3× novelty boost for traditions not yet picked by any culture globally
	 * Call AFTER assignEthos().
	 */
	assignTraditions: () => {
		const TRADITIONS_PER_CULTURE = 3

		// Track global tradition usage across all cultures
		const globalUsage: Record<string, number> = {}

		window.world.cultures.forEach((culture) => {
			// Get the origin cell (first province's seed cell)
			const originProvIdx = Array.from(culture.provinces)[0]
			const originProv = window.world.provinces[originProvIdx]
			const originCell = window.world.cells[originProv.cell]

			// Build weighted list
			const eligible = TRADITIONS.map((tradition) => {
				// Hard exclusions
				if (
					tradition.excludedEthos &&
					tradition.excludedEthos.includes(culture.ethos)
				) {
					return null
				}
				// Condition gate
				if (!tradition.condition(originCell)) {
					return null
				}
				// Base weight; boost if ethos is preferred
				let weight = tradition.preferredEthos.includes(culture.ethos) ? 3 : 1
				// Reduce weight exponentially by global usage
				const occurrences = globalUsage[tradition.key] || 0
				weight /= 10 ** occurrences
				return { v: tradition.key, w: weight }
			}).filter((s): s is { v: string; w: number } => s !== null)

			// Weighted pick without replacement using dice primitives
			const picked = window.dice.weightedSample(eligible, TRADITIONS_PER_CULTURE)

			culture.traditions = picked

			// Update global usage
			picked.forEach((key) => {
				globalUsage[key] = (globalUsage[key] || 0) + 1
			})
		})
	},
}
