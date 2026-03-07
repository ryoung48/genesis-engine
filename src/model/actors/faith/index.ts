import { WORLD } from "@/model"
import { PROVINCE } from "@/model/provinces"
import { LANGUAGE } from "../language/languages"
import { Culture } from "../culture/types"
import { Faith, FaithSpawnParams } from "./types"

export const FAITH = {
	spawn: ({ culture }: FaithSpawnParams) => {
		const name = culture.language
			? LANGUAGE.word.unique({ lang: culture.language, key: "faith" }).word
			: ""
		const faith: Faith = {
			idx: window.world.faiths.length,
			cultures: new Set([culture.idx]),
			color: "#ccc", // Placeholder color
			neighbors: new Set(),
			religion: -1,
			name,
		}
		FAITH.claim(faith, culture)
		window.world.faiths.push(faith)
		return faith
	},
	claim: (faith: Faith, culture: Culture) => {
		culture.faith = faith.idx
		faith.cultures.add(culture.idx)

		culture.provinces.forEach((pIdx) => {
			const province = window.world.provinces[pIdx]
			province.faith = faith.idx
		})
	},
	build: () => {
		const cultures = window.world.cultures
		const nonDesolate = window.world.provinces.filter((p) => !p.desolate)
		if (nonDesolate.length === 0) return

		const landArea = nonDesolate.reduce(
			(acc, p) => acc + p.land * window.world.cell.area,
			0,
		)
		const count = Math.floor(cultures.length / 3)
		if (count === 0) return

		const spacing = WORLD.placement.autoSpacing(count, landArea)
		const seeds = WORLD.placement
			.run({
				whitelist: cultures.map((c) => {
					const pIdx = Array.from(c.provinces)[0]
					return PROVINCE.cell(window.world.provinces[pIdx])
				}),
				count,
				spacing,
			})
			.map(
				(cell) =>
					window.world.cultures[window.world.provinces[cell.province].culture],
			)

		seeds.forEach((c) => FAITH.spawn({ culture: c }))

		const queue: Culture[] = [...seeds]
		while (queue.length > 0) {
			const curr = queue.shift()!
			const faith = window.world.faiths[curr.faith]

			curr.neighbors.forEach((nIdx) => {
				const neighbor = window.world.cultures[nIdx]

				if (neighbor.faith === -1) {
					FAITH.claim(faith, neighbor)
					queue.push(neighbor)
				} else if (neighbor.faith !== faith.idx) {
					const neighborFaith = window.world.faiths[neighbor.faith]
					faith.neighbors.add(neighborFaith.idx)
					neighborFaith.neighbors.add(faith.idx)
				}
			})
		}
	},
}
