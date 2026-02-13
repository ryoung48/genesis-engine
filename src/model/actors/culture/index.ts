import { WORLD } from "@/model"
import { PROVINCE } from "@/model/provinces"
import { Province } from "../../provinces/types"
import { Culture, CultureSpawnParams } from "./types"

export const CULTURE = {
	spawn: ({ province }: CultureSpawnParams) => {
		const culture: Culture = {
			idx: window.world.cultures.length,
			provinces: new Set([province.idx]),
			color: "#ccc", // Placeholder color
			neighbors: new Set(),
			heritage: -1,
			faith: -1,
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
}
