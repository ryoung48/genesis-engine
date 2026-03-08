import { WORLD } from "@/model"
import { PROVINCE } from "@/model/provinces"
import { LANGUAGE } from "../language/languages"
import { Culture } from "../culture/types"
import { Heritage } from "./types"

export const HERITAGE = {
	spawn: ({ culture }: { culture: Culture }) => {
		const seed = window.dice.randint(0, 2147483647).toString()
		const language = LANGUAGE.spawn(seed)
		const name = LANGUAGE.word.unique({ lang: language, key: "heritage" }).word
		const heritage: Heritage = {
			idx: window.world.heritages.length,
			cultures: new Set([culture.idx]),
			color: "#ccc",
			hue: 0,
			neighbors: new Set(),
			language,
			name,
		}
		HERITAGE.claim(heritage, culture)
		window.world.heritages.push(heritage)
		return heritage
	},
	claim: (heritage: Heritage, culture: Culture) => {
		culture.heritage = heritage.idx
		heritage.cultures.add(culture.idx)

		// Give culture a dialect of the heritage language + a unique name
		culture.language = LANGUAGE.dialect(heritage.language)
		culture.name = LANGUAGE.word.unique({
			lang: culture.language,
			key: "culture",
		}).word

		culture.provinces.forEach((pIdx) => {
			const province = window.world.provinces[pIdx]
			province.heritage = heritage.idx
		})
	},
	colorize: () => {
		const heritages = window.world.heritages
		const shuffled = window.dice.shuffle([...heritages])

		shuffled.forEach((heritage) => {
			const neighborHues = Array.from(heritage.neighbors)
				.map((nIdx) => window.world.heritages[nIdx].hue)
				.filter((h) => h !== 0) // Only consider heritages that already have a hue

			let bestHue = window.dice.randint(0, 360)
			let maxMinDist = 0

			// Try several random hues and pick the one farthest from neighbors
			for (let i = 0; i < 20; i++) {
				const candidate = window.dice.randint(0, 360)
				let minDist = 360

				neighborHues.forEach((hue) => {
					// Circular distance
					const dist = Math.min(
						Math.abs(candidate - hue),
						360 - Math.abs(candidate - hue),
					)
					if (dist < minDist) minDist = dist
				})

				if (neighborHues.length === 0 || minDist > maxMinDist) {
					maxMinDist = minDist
					bestHue = candidate
					if (neighborHues.length === 0) break
				}
			}

			heritage.hue = bestHue
			heritage.color = `hsl(${heritage.hue}, 50%, 40%)`

			// Apply to children with unique hues
			const cultures = Array.from(heritage.cultures).map(
				(cIdx) => window.world.cultures[cIdx],
			)
			const count = cultures.length
			const step = 40 / Math.max(1, count)
			const hues = window.dice.shuffle(
				Array.from(
					{ length: count },
					(_, i) => (heritage.hue - 20 + i * step + 360) % 360,
				),
			)

			cultures.forEach((culture, i) => {
				HERITAGE.apply(culture, hues[i])
			})
		})
	},
	apply: (culture: Culture, hue: number) => {
		const saturation = window.dice.randint(30, 70)
		const lightness = window.dice.randint(30, 60)
		const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`

		culture.color = color
	},
	build: () => {
		const cultures = window.world.cultures
		const nonDesolate = window.world.provinces.filter((p) => !p.desolate)
		const landArea = nonDesolate.reduce(
			(acc, p) => acc + p.land * window.world.cell.area,
			0,
		)
		const count = Math.floor(cultures.length / 6)
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

		seeds.forEach((c) => HERITAGE.spawn({ culture: c }))

		const queue: Culture[] = [...seeds]
		while (queue.length > 0) {
			const curr = queue.shift()!
			const heritage = window.world.heritages[curr.heritage]

			curr.neighbors.forEach((nIdx) => {
				const neighbor = window.world.cultures[nIdx]

				if (neighbor.heritage === -1) {
					HERITAGE.claim(heritage, neighbor)
					queue.push(neighbor)
				} else if (neighbor.heritage !== heritage.idx) {
					const neighborHeritage = window.world.heritages[neighbor.heritage]
					heritage.neighbors.add(neighborHeritage.idx)
					neighborHeritage.neighbors.add(heritage.idx)
				}
			})
		}

		// mark all provinces without culture as desolate
		window.world.provinces.forEach((p) => {
			if (p.heritage === -1) {
				p.desolate = true
			}
		})

		HERITAGE.colorize()
	},
}
