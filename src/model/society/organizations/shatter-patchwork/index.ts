import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { PLACEMENT } from "@/model/society/nations/placement"
import type { GenesisProvinces } from "@/model/society/types"

export interface MemberSizeBucket {
	min: number
	max: number
	/** Fraction of total *member count* (not province mass) drawn from this
	 * bucket -- skews the patchwork toward however small/large its members
	 * should read, independent of how big the shattered nation itself was. */
	fraction: number
}

export interface ShatterPatchworkParams {
	provinces: GenesisProvinces
	/** Mutated in place: territory reassigned from the shattered nation to its
	 * new member nations. */
	assignment: Int32Array
	/** Mutated in place: new member nations are appended. The shattered
	 * nation's own entry is zeroed to size 0 (left for the caller to compact). */
	seeds: number[]
	sizes: number[]
	habitability: Float32Array
	waterAccess: Uint8Array
	r_xyz: Float32Array
	migrationWave: Float32Array | undefined
	provinceContinent: Uint8Array | undefined
	maxSpreadRad: number
	seed: number
	/** XORed into the noise/nameSeed derivation so different org kinds
	 * sharing this module don't correlate with each other. */
	seedSalt: number
	/** Below this province count a shattered nation reads as noise, not a
	 * patchwork -- skip rather than produce a handful of trivial fragments. */
	minTerritorySize: number
	memberBuckets: ReadonlyArray<MemberSizeBucket>
	/** Picks which existing nation to shatter, or -1 if none qualifies.
	 * Called with the current (pre-shatter) seeds/sizes. */
	findEligibleNation: (nations: {
		seeds: readonly number[]
		sizes: readonly number[]
	}) => number
}

export interface ShatterPatchworkResult {
	/** The largest resulting member -- authoritative (e.g. the HRE Emperor)
	 * or purely a naming anchor, depending on the caller's org kind. */
	leadNationIndex: number
	memberNationIndices: number[]
	nameSeed: number
}

/** Plans member sizes that sum exactly to `budget`, distributed across
 * `buckets` by count fraction. Generalizes nations/index.ts's
 * spreadBucketSizes to buckets with different [min,max] ranges sharing one
 * overall budget. */
function planMemberSizes(
	budget: number,
	buckets: ReadonlyArray<MemberSizeBucket>,
): number[] {
	if (budget <= 0) return []

	const avgSize = buckets.reduce(
		(sum, b) => sum + b.fraction * ((b.min + b.max) / 2),
		0,
	)
	const estimatedCount = Math.max(
		1,
		Math.min(budget, Math.round(budget / avgSize)),
	)

	const rawCounts = buckets.map((b) => b.fraction * estimatedCount)
	const bucketCounts: number[] = rawCounts.map((v) => Math.floor(v))
	let countRemainder =
		estimatedCount - bucketCounts.reduce((sum, v) => sum + v, 0)
	const order = rawCounts
		.map((v, idx) => ({ idx, remainder: v - bucketCounts[idx] }))
		.sort((a, b) => b.remainder - a.remainder)
	for (
		let i = 0;
		i < order.length && countRemainder > 0;
		i++, countRemainder--
	) {
		bucketCounts[order[i].idx] += 1
	}
	if (bucketCounts.reduce((sum, c) => sum + c, 0) === 0) bucketCounts[0] = 1

	const members: Array<{ min: number; max: number; size: number }> = []
	for (let bi = 0; bi < buckets.length; bi++) {
		const { min, max } = buckets[bi]
		const count = bucketCounts[bi]
		for (let i = 0; i < count; i++) {
			const t = count === 1 ? 0.5 : i / (count - 1)
			members.push({ min, max, size: Math.round(min + (max - min) * t) })
		}
	}

	let remaining = budget - members.reduce((sum, m) => sum + m.size, 0)
	let guard = 0
	while (remaining !== 0 && guard++ < members.length * 4 + 4) {
		let changed = false
		if (remaining > 0) {
			const order = members
				.map((_, idx) => idx)
				.sort((a, b) => members[a].size - members[b].size)
			for (let i = 0; i < order.length && remaining > 0; i++) {
				const m = members[order[i]]
				if (m.size >= m.max) continue
				m.size++
				remaining--
				changed = true
			}
		} else {
			const order = members
				.map((_, idx) => idx)
				.sort((a, b) => members[b].size - members[a].size)
			for (let i = 0; i < order.length && remaining < 0; i++) {
				const m = members[order[i]]
				if (m.size <= m.min) continue
				m.size--
				remaining++
				changed = true
			}
		}
		if (!changed) break
	}
	// Every existing member maxed out -- rather than dumping the remainder
	// onto one of them (which would break the hard per-member size cap), keep
	// adding new top-bucket-sized members until the budget is exactly used.
	const topBucket = buckets[buckets.length - 1]
	while (remaining > 0) {
		const size = Math.min(remaining, topBucket.max)
		members.push({ min: topBucket.min, max: topBucket.max, size })
		remaining -= size
	}

	return members.map((m) => m.size)
}

/**
 * Shared core for every "shatter one large eligible nation into a patchwork
 * of small member nations" organization (Imperial Patchwork, Trade League,
 * ...): deletes the nation `findEligibleNation` picks, then re-partitions
 * its former territory using the same distribute/flood-fill placement
 * primitives as the main nation partition, sized via `memberBuckets`. New
 * members are appended to `seeds`/`sizes`; the shattered nation's own slot
 * is left at size 0 for the caller to compact away along with its index
 * remapping. Returns null when no nation qualifies.
 */
function shatterPatchwork(
	params: ShatterPatchworkParams,
): ShatterPatchworkResult | null {
	const {
		provinces,
		assignment,
		seeds,
		sizes,
		habitability,
		waterAccess,
		r_xyz,
		migrationWave,
		provinceContinent,
		maxSpreadRad,
		seed,
		seedSalt,
		minTerritorySize,
		memberBuckets,
		findEligibleNation,
	} = params

	const targetNation = findEligibleNation({ seeds, sizes })
	if (targetNation < 0) return null

	const provinceCount = provinces.count
	const territory: number[] = []
	for (let p = 0; p < provinceCount; p++) {
		if (assignment[p] === targetNation) territory.push(p)
	}
	if (territory.length < minTerritorySize) return null

	const targets = planMemberSizes(territory.length, memberBuckets).sort(
		(a, b) => b - a,
	)

	for (const p of territory) assignment[p] = -1
	sizes[targetNation] = 0

	const active = new Uint8Array(provinceCount)
	for (const p of territory) active[p] = 1
	const blocked = new Uint8Array(provinceCount)
	const noise = new SimplexNoise(seed ^ seedSalt)

	const newIndices: number[] = []
	for (const target of targets) {
		const components = PLACEMENT.buildOpenComponents({
			active,
			assignment,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
		const seedProvince = PLACEMENT.selectSeed({
			target,
			active,
			assignment,
			blocked,
			habitability,
			waterAccess,
			migrationWave,
			provinceContinent,
			componentId: components.componentId,
			componentSizes: components.sizes,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
		if (seedProvince < 0) continue

		const nationIndex = seeds.length
		seeds.push(seedProvince)
		sizes.push(1)
		assignment[seedProvince] = nationIndex
		newIndices.push(nationIndex)

		const frontier = new Set<number>()
		for (
			let j = provinces.adjOffset[seedProvince],
				jEnd = provinces.adjOffset[seedProvince + 1];
			j < jEnd;
			j++
		) {
			const nb = provinces.adjList[j]
			if (active[nb] && assignment[nb] < 0) frontier.add(nb)
		}

		while (sizes[nationIndex] < target) {
			const claim = PLACEMENT.bestClaim({
				nation: nationIndex,
				seedProvince,
				frontier,
				active,
				assignment,
				habitability,
				waterAccess,
				r_xyz,
				provinceSeeds: provinces.seeds,
				adjOffset: provinces.adjOffset,
				adjList: provinces.adjList,
				noise,
				maxSpreadRad,
			})
			if (claim < 0) break
			PLACEMENT.claimProvinceDynamic({
				nation: nationIndex,
				province: claim,
				active,
				assignment,
				sizes,
				frontier,
				adjOffset: provinces.adjOffset,
				adjList: provinces.adjList,
			})
		}

		const blockHops = Math.max(1, Math.round(Math.sqrt(target) * 0.5))
		PLACEMENT.markBlocked({
			start: seedProvince,
			hops: blockHops,
			active,
			blocked,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
	}

	// Leftover territory the target loop couldn't seed/claim (rare): attach to
	// an adjacent new member if one exists and isn't already at the hard size
	// cap, else stand up its own singleton.
	const newIndexSet = new Set(newIndices)
	const maxMemberSize = memberBuckets[memberBuckets.length - 1].max
	for (const p of territory) {
		if (assignment[p] >= 0) continue
		let attached = -1
		for (
			let j = provinces.adjOffset[p], jEnd = provinces.adjOffset[p + 1];
			j < jEnd;
			j++
		) {
			const n = assignment[provinces.adjList[j]]
			if (n >= 0 && newIndexSet.has(n) && sizes[n] < maxMemberSize) {
				attached = n
				break
			}
		}
		if (attached >= 0) {
			assignment[p] = attached
			sizes[attached] += 1
		} else {
			const nationIndex = seeds.length
			seeds.push(p)
			sizes.push(1)
			assignment[p] = nationIndex
			newIndices.push(nationIndex)
			newIndexSet.add(nationIndex)
		}
	}

	let leadNationIndex = newIndices[0]
	let leadSizeActual = -1
	for (const idx of newIndices) {
		if (sizes[idx] > leadSizeActual) {
			leadSizeActual = sizes[idx]
			leadNationIndex = idx
		}
	}

	return {
		leadNationIndex,
		memberNationIndices: newIndices,
		nameSeed: ((seed ^ seedSalt) + targetNation * 2654435761) >>> 0,
	}
}

export const SHATTER_PATCHWORK = {
	shatterPatchwork,
}
