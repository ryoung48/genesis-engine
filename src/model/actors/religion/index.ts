import { WORLD } from "@/model"
import { PROVINCE } from "@/model/provinces"
import { LANGUAGE } from "../language/languages"
import { Faith } from "../faith/types"
import { Religion } from "./types"

export const RELIGION = {
	spawn: ({ faith }: { faith: Faith }) => {
		// Use the heritage language of the origin faith's first culture
		const originCulture = window.world.cultures[Array.from(faith.cultures)[0]]
		const heritage = originCulture
			? window.world.heritages[originCulture.heritage]
			: null
		const lang = heritage?.language
		const name = lang
			? LANGUAGE.word.unique({ lang, key: "religion" }).word
			: ""
		const religion: Religion = {
			idx: window.world.religions.length,
			faiths: new Set([faith.idx]),
			color: "#ccc",
			hue: 0,
			neighbors: new Set(),
			name,
		}
		RELIGION.claim(religion, faith)
		window.world.religions.push(religion)
		return religion
	},
	claim: (religion: Religion, faith: Faith) => {
		faith.religion = religion.idx
		religion.faiths.add(faith.idx)

		faith.cultures.forEach((cIdx) => {
			const culture = window.world.cultures[cIdx]
			culture.provinces.forEach((pIdx) => {
				const province = window.world.provinces[pIdx]
				province.religion = religion.idx
			})
		})
	},
	colorize: () => {
		const religions = window.world.religions
		const shuffled = window.dice.shuffle([...religions])

		shuffled.forEach((religion) => {
			const neighborHues = Array.from(religion.neighbors)
				.map((nIdx) => window.world.religions[nIdx].hue)
				.filter((h) => h !== 0)

			let bestHue = window.dice.randint(0, 360)
			let maxMinDist = 0

			for (let i = 0; i < 20; i++) {
				const candidate = window.dice.randint(0, 360)
				let minDist = 360

				neighborHues.forEach((hue) => {
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

			religion.hue = bestHue
			religion.color = `hsl(${religion.hue}, 50%, 40%)`

			const faiths = Array.from(religion.faiths).map(
				(fIdx) => window.world.faiths[fIdx],
			)
			const count = faiths.length
			const step = 40 / Math.max(1, count)
			const hues = window.dice.shuffle(
				Array.from(
					{ length: count },
					(_, i) => (religion.hue - 20 + i * step + 360) % 360,
				),
			)

			faiths.forEach((faith, i) => {
				RELIGION.apply(faith, hues[i])
			})
		})
	},
	apply: (faith: Faith, hue: number) => {
		const saturation = window.dice.randint(30, 70)
		const lightness = window.dice.randint(30, 60)
		const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`

		faith.color = color
	},
	build: () => {
		const faiths = window.world.faiths
		if (faiths.length === 0) return

		const nonDesolate = window.world.provinces.filter((p) => !p.desolate)
		const landArea = nonDesolate.reduce(
			(acc, p) => acc + p.land * window.world.cell.area,
			0,
		)
		const count = Math.floor(faiths.length / 8)
		const spacing = WORLD.placement.autoSpacing(count, landArea)
		const seeds = WORLD.placement
			.run({
				whitelist: faiths.map((f) => {
					const cIdx = Array.from(f.cultures)[0]
					const culture = window.world.cultures[cIdx]
					const pIdx = Array.from(culture.provinces)[0]
					return PROVINCE.cell(window.world.provinces[pIdx])
				}),
				count,
				spacing,
			})
			.map(
				(cell) =>
					window.world.faiths[window.world.provinces[cell.province].faith],
			)

		seeds.forEach((f) => RELIGION.spawn({ faith: f }))

		const queue: Faith[] = [...seeds]
		while (queue.length > 0) {
			const curr = queue.shift()!
			const religion = window.world.religions[curr.religion]

			curr.neighbors.forEach((nIdx) => {
				const neighbor = window.world.faiths[nIdx]

				if (neighbor.religion === -1) {
					RELIGION.claim(religion, neighbor)
					queue.push(neighbor)
				} else if (neighbor.religion !== religion.idx) {
					const neighborReligion = window.world.religions[neighbor.religion]
					religion.neighbors.add(neighborReligion.idx)
					neighborReligion.neighbors.add(religion.idx)
				}
			})
		}

		RELIGION.colorize()
	},
}
