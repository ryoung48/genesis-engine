import type {
	CarveParams,
	CenterParams,
	GrowParams,
	SeedParams,
	SizesParams,
} from "@/model/history/distribution/secession/types"
import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"

const SIZE_LADDER_RATIO = 1.2

function seed({ territory, country, rng }: SeedParams): number {
	const joints = DISTRIBUTION_TERRITORY.articulations({ territory, country })
	const options = [...country.members]
		.filter((p) => p !== country.capital && !joints.has(p))
		.map((p) => ({
			v: p,
			w:
				DISTRIBUTION_TERRITORY.distance({
					territory,
					a: country.capital,
					b: p,
				}) ** 2,
		}))
	const chosen = rng.weightedChoice(options)
	if (chosen === undefined) throw new Error("Country has no secession seed")
	return chosen
}

function sizes({ total, limit }: SizesParams): number[] {
	const found = new Set<number>([Math.floor(total / 2)])
	for (
		let s = 1;
		s < total;
		s = Math.max(s + 1, Math.round(s * SIZE_LADDER_RATIO))
	)
		found.add(s)
	return [...found].filter((s) => s >= 1 && s < total && s <= limit)
}

function grow({
	territory: t,
	country: c,
	seed: start,
	size,
}: GrowParams): number[] {
	const roots = [c.capital, start],
		taken = [1, 1],
		side = new Map<number, number>([
			[c.capital, 0],
			[start, 1],
		]),
		frontier = [new Set<number>(), new Set<number>()]
	const expand = (p: number, s: number) => {
		for (
			let j = t.provinces.adjOffset[p];
			j < t.provinces.adjOffset[p + 1];
			j++
		) {
			const q = t.provinces.adjList[j]
			if (t.owner[q] === c.id && !side.has(q)) frontier[s].add(q)
		}
	}
	expand(c.capital, 0)
	expand(start, 1)
	for (;;) {
		let best = -1,
			bestSide = 0,
			bestCost = Infinity
		for (let s = 0; s < 2; s++) {
			if (s === 1 && taken[1] >= size) continue
			for (const q of frontier[s]) {
				if (side.has(q)) {
					frontier[s].delete(q)
					continue
				}
				const cost = DISTRIBUTION_TERRITORY.distance({
					territory: t,
					a: roots[s],
					b: q,
				})
				if (cost < bestCost) {
					best = q
					bestSide = s
					bestCost = cost
				}
			}
		}
		if (best < 0) break
		side.set(best, bestSide)
		taken[bestSide]++
		frontier[bestSide].delete(best)
		expand(best, bestSide)
	}
	return [...c.members].filter((p) => side.get(p) !== 0)
}

function centered({ territory: t, provinces }: CenterParams): number[] {
	const mean = [0, 0, 0]
	for (const p of provinces)
		for (let k = 0; k < 3; k++)
			mean[k] += t.positions[3 * p + k] / provinces.length
	let best = provinces[0],
		bestCost = Infinity
	for (const p of provinces) {
		const cost = Math.hypot(
			t.positions[3 * p] - mean[0],
			t.positions[3 * p + 1] - mean[1],
			t.positions[3 * p + 2] - mean[2],
		)
		if (cost < bestCost) {
			best = p
			bestCost = cost
		}
	}
	return [best, ...provinces.filter((p) => p !== best)]
}

function carve({ limit, ...params }: CarveParams): number[] {
	let size = Math.min(params.size, limit)
	for (;;) {
		const provinces = grow({ ...params, size })
		if (provinces.length <= limit || size === 1)
			return centered({ territory: params.territory, provinces })
		size = Math.max(1, Math.floor(size / 2))
	}
}

export const DISTRIBUTION_SECESSION = { seed, sizes, carve }
