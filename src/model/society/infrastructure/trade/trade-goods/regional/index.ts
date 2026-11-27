import type {
	Coast,
	CoastGapBoundParams,
	CoastGapParams,
	CoastParams,
	ConfineParams,
	GoodHolder,
	HoldersParams,
	HomeLandmassesParams,
	ShareScaleParams,
} from "@/model/society/infrastructure/trade/trade-goods/regional/types"

// A home that holds less than this share of the good's suitable weight
// world-wide takes in the nearest other landmass that can grow it: the good
// keeps most of its suitable land instead of being stranded on a sliver.
const HOME_MIN_SUITABLE_SHARE = 0.5
// Coast points per landmass for the coast-to-coast gap; a sample keeps the
// pairwise search small on continents with thousands of coastal locations.
const COAST_SAMPLE = 200
// Fixed-point rounds rescaling the good on its home to its unconfined share.
const SHARE_ROUNDS = 8

// Per good, the locations whose options include it, with its weight and the
// rest, from one pass over all rows.
function holders({ options, goods }: HoldersParams): Map<number, GoodHolder[]> {
	const { start, goods: rowGoods, weights } = options
	const lists = goods.map((): GoodHolder[] => [])
	const slot = new Int8Array(256).fill(-1)
	goods.forEach((good, i) => {
		slot[good] = i
	})
	for (let l = 0; l + 1 < start.length; l++) {
		const from = start[l]!
		const to = start[l + 1]!
		for (let at = from; at < to; at++) {
			const index = slot[rowGoods[at]!]!
			if (index < 0) continue
			let own = 0
			let rest = 0
			for (let other = from; other < to; other++) {
				if (rowGoods[other] === rowGoods[at]) own += weights[other]!
				else rest += weights[other]!
			}
			if (own > 0) lists[index]!.push({ l, at, own, rest })
		}
	}
	return new Map(goods.map((good, i) => [good, lists[i]!]))
}

function coastGap({ from, to, xyz }: CoastGapParams): number {
	let best = Infinity
	for (const a of from.points)
		for (const b of to.points) {
			const dx = xyz[3 * a]! - xyz[3 * b]!
			const dy = xyz[3 * a + 1]! - xyz[3 * b + 1]!
			const dz = xyz[3 * a + 2]! - xyz[3 * b + 2]!
			best = Math.min(best, dx * dx + dy * dy + dz * dz)
		}
	return best
}

// Squared gap no pair of the two coasts' points can beat, from their bounding
// spheres; shrunk a hair so float rounding never lifts it above the true gap.
function coastGapBound({ from, to }: CoastGapBoundParams): number {
	const dx = from.center[0] - to.center[0]
	const dy = from.center[1] - to.center[1]
	const dz = from.center[2] - to.center[2]
	const apart = Math.sqrt(dx * dx + dy * dy + dz * dz) - from.radius - to.radius
	return apart > 0 ? apart * apart * (1 - 1e-9) : 0
}

function coast({ points, xyz }: CoastParams): Coast {
	const center: [number, number, number] = [0, 0, 0]
	for (const p of points)
		for (let k = 0; k < 3; k++) center[k]! += xyz[3 * p + k]! / points.length
	let radius = 0
	for (const p of points)
		radius = Math.max(
			radius,
			Math.hypot(
				xyz[3 * p]! - center[0],
				xyz[3 * p + 1]! - center[1],
				xyz[3 * p + 2]! - center[2],
			),
		)
	return { points, center, radius }
}

// The home landmass, plus the nearest landmasses that can grow the good until
// together they hold HOME_MIN_SUITABLE_SHARE of its suitable weight. Pairs
// whose bounding spheres are already farther than the best gap are skipped;
// exact pair gaps are cached across goods.
function homeLandmasses({
	suitability,
	home,
	coasts,
	gaps,
	xyz,
}: HomeLandmassesParams): Set<number> {
	let total = 0
	for (const value of suitability.values()) total += value
	const set = new Set([home])
	let held = suitability.get(home) ?? 0
	while (held < HOME_MIN_SUITABLE_SHARE * total) {
		let nearest = -1
		let nearestGap = Infinity
		for (const [landmass, value] of suitability) {
			if (set.has(landmass) || value <= 0) continue
			const to = coasts.get(landmass)
			if (!to) continue
			let gap = Infinity
			for (const member of set) {
				const from = coasts.get(member)
				if (!from) continue
				if (coastGapBound({ from, to }) > Math.min(gap, nearestGap)) continue
				const key =
					Math.min(member, landmass) * 2 ** 26 + Math.max(member, landmass)
				let pair = gaps.get(key)
				if (pair === undefined) {
					pair = coastGap({ from, to, xyz })
					gaps.set(key, pair)
				}
				gap = Math.min(gap, pair)
			}
			if (gap < nearestGap) {
				nearest = landmass
				nearestGap = gap
			}
		}
		if (nearest < 0) break
		set.add(nearest)
		held += suitability.get(nearest)!
	}
	return set
}

function shareScale({ home, target }: ShareScaleParams): number {
	let scale = 1
	for (let round = 0; round < SHARE_ROUNDS; round++) {
		let expected = 0
		for (const { own, rest } of home)
			expected += (scale * own) / (rest + scale * own)
		if (expected <= 0) return scale
		scale *= target / expected
	}
	return scale
}

// Holds each good to the landmass of the first location that rolled it (plus
// nearest landmasses when that home is short of suitable land), scaled up
// there to keep its unconfined expected world share. Weights are rescaled in
// place; the returned mask marks the locations whose rows changed.
function confine({
	goods,
	options,
	material,
	landmass,
	coastal,
	xyz,
}: ConfineParams): Uint8Array {
	const coastLists = new Map<number, number[]>()
	const { start, weights } = options
	for (let l = 0; l < landmass.length; l++) {
		if (start[l] === start[l + 1] || !coastal[l]) continue
		const list = coastLists.get(landmass[l]!) ?? []
		list.push(l)
		coastLists.set(landmass[l]!, list)
	}
	const coasts = new Map<number, Coast>()
	for (const [key, list] of coastLists) {
		const stride = Math.ceil(list.length / COAST_SAMPLE)
		const points = list.filter((_, i) => i % stride === 0)
		coasts.set(key, coast({ points, xyz }))
	}
	const gaps = new Map<number, number>()
	const changed = new Uint8Array(landmass.length)
	for (const [good, held] of holders({ options, goods })) {
		const suitability = new Map<number, number>()
		let target = 0
		for (const { l, own, rest } of held) {
			const share = own / (own + rest)
			target += share
			suitability.set(
				landmass[l]!,
				(suitability.get(landmass[l]!) ?? 0) + share,
			)
		}
		const first = material.indexOf(good)
		const homes =
			first < 0
				? new Set<number>()
				: homeLandmasses({
						suitability,
						home: landmass[first]!,
						coasts,
						gaps,
						xyz,
					})
		const home = held.filter(({ l }) => homes.has(landmass[l]!))
		const scale = home.length > 0 ? shareScale({ home, target }) : 0
		for (const { l, at } of held) {
			weights[at]! *= homes.has(landmass[l]!) ? scale : 0
			changed[l] = 1
		}
	}
	return changed
}

export const REGIONAL_GOODS = { confine }
