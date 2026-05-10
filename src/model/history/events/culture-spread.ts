import { EVT } from "../event-heap"
import { PROV } from "../fields"
import type { HistoryRng } from "../history-rng"
import type { HistoryState } from "../state"
import { ensureHierarchyClean, YEAR_MS } from "../state"

const SPREAD_INTERVAL_YEARS = 5
/** Fraction of culture-border province pairs that are eligible for bleed. */
const BLEED_INIT_PROBABILITY = 0.55
/** Probability per tick that an eligible idle border starts a new bleed. */
const NEW_BLEED_CHANCE = 0.08
/** Initial blend weight when a new bleed starts. */
const BLEED_START_WEIGHT = 0.05
/** Blend weight increase per tick via organic cultural diffusion. */
const DIFFUSION_RATE = 0.01
/** Blend weight increase per tick when the province is under a foreign ruler of the secondary culture. */
const ASSIMILATION_RATE = 0.04
/** Relative population difference within which two cultures are considered "balanced" and neither spreads. */
const BALANCE_THRESHOLD = 0.15

/**
 * Returns a deterministic bleed-eligibility hash for a pair of provinces.
 * Uses the province seeds so the result is stable across runs with the same world.
 */
function isBleedEdge(
	seedA: number,
	seedB: number,
	probability: number,
): boolean {
	const lo = Math.min(seedA, seedB)
	const hi = Math.max(seedA, seedB)
	// Combine with a simple mixing hash
	let h = (((lo ^ 0x9e3779b9) + hi) | 0) >>> 0
	h ^= h >>> 16
	h = Math.imul(h, 0x45d9f3b) >>> 0
	h ^= h >>> 16
	return (h >>> 0) / 0xffffffff < probability
}

/**
 * Computes a Float32Array[cultureCount] of total living population per culture.
 */
function computeCulturePopulations(
	state: HistoryState,
	cultureCount: number,
): Float32Array {
	const pop = new Float32Array(cultureCount)
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const c = state.culture[p]
		if (c < 0 || c >= cultureCount) continue
		pop[c] += state.popRuralCurrent[p] + state.popUrbanCurrent[p]
	}
	return pop
}

export function initCultureSpread(state: HistoryState): void {
	state.heap.enqueue(
		state.time + SPREAD_INTERVAL_YEARS * YEAR_MS,
		EVT.CULTURE_SPREAD,
		0,
	)
}

export function runCultureSpread(
	state: HistoryState,
	cultureCount: number,
	rng: HistoryRng,
): void {
	ensureHierarchyClean(state)
	const culturePop = computeCulturePopulations(state, cultureCount)
	const P = state.P
	const time = state.time

	// --- Advance existing bleeds ---
	for (let p = 0; p < P; p++) {
		if (state.desolate[p]) continue
		const secondary = PROV.cultureBlendSecondary.get(state, p)
		if (secondary < 0) continue

		let weight = PROV.cultureBlendWeight.get(state, p)

		// The sovereign of this province determines the political culture pressure.
		const sov = state.sovereignCurrent[p]
		const sovereignCulture = sov >= 0 ? state.culture[sov] : state.culture[p]
		const rate =
			sovereignCulture === secondary ? ASSIMILATION_RATE : DIFFUSION_RATE
		weight = Math.min(1, weight + rate)

		if (weight >= 1) {
			// Full conversion: province adopts the secondary culture.
			const oldCulture = state.culture[p]
			state.culture[p] = secondary
			PROV.cultureBlendSecondary.set(state, p, time, -1)
			PROV.cultureBlendWeight.set(state, p, time, 0)
			state.events.push({
				tag: "culture converted",
				time,
				data: { province: p, from: oldCulture, to: secondary },
			})
			// Seed bleed outward into neighbors still holding the old culture.
			for (
				let i = state.provinceAdjOffset[p];
				i < state.provinceAdjOffset[p + 1];
				i++
			) {
				const nb = state.provinceAdjList[i]
				if (state.desolate[nb] || state.culture[nb] !== oldCulture) continue
				if (PROV.cultureBlendSecondary.get(state, nb) >= 0) continue
				const eligibleEdge = isBleedEdge(
					state.provinceSeeds[p],
					state.provinceSeeds[nb],
					BLEED_INIT_PROBABILITY,
				)
				if (!eligibleEdge) continue
				PROV.cultureBlendSecondary.set(state, nb, time, secondary)
				PROV.cultureBlendWeight.set(state, nb, time, BLEED_START_WEIGHT)
			}
		} else {
			PROV.cultureBlendWeight.set(state, p, time, weight)
		}
	}

	// --- Initiate new bleeds on eligible idle borders ---
	const visited = new ProvincePairSet(P)
	for (let p = 0; p < P; p++) {
		if (state.desolate[p]) continue
		if (PROV.cultureBlendSecondary.get(state, p) >= 0) continue
		const cultureP = state.culture[p]

		for (
			let i = state.provinceAdjOffset[p];
			i < state.provinceAdjOffset[p + 1];
			i++
		) {
			const nb = state.provinceAdjList[i]
			if (state.desolate[nb]) continue
			const cultureNb = state.culture[nb]
			if (cultureNb === cultureP) continue

			// Only one direction check per pair (smaller p first)
			const edgeKey = p < nb ? p * P + nb : nb * P + p
			if (visited.has(edgeKey)) continue
			visited.add(edgeKey)

			// Check if this edge is a bleed edge at all
			if (
				!isBleedEdge(
					state.provinceSeeds[p],
					state.provinceSeeds[nb],
					BLEED_INIT_PROBABILITY,
				)
			) {
				continue
			}

			// Determine which direction to bleed: stronger culture spreads into weaker.
			const popP = culturePop[cultureP] ?? 0
			const popNb = culturePop[cultureNb] ?? 0
			const ratio =
				Math.max(popP, popNb) === 0
					? 1
					: Math.abs(popP - popNb) / Math.max(popP, popNb)

			if (ratio < BALANCE_THRESHOLD) continue // balanced — neither spreads

			// The weaker culture's province is the receiver.
			const receiver = popP < popNb ? p : nb
			const spreaderCulture = popP < popNb ? cultureNb : cultureP
			if (PROV.cultureBlendSecondary.get(state, receiver) >= 0) continue

			if (rng.random() < NEW_BLEED_CHANCE) {
				PROV.cultureBlendSecondary.set(state, receiver, time, spreaderCulture)
				PROV.cultureBlendWeight.set(state, receiver, time, BLEED_START_WEIGHT)
			}
		}
	}

	// Schedule next tick
	state.heap.enqueue(
		time + SPREAD_INTERVAL_YEARS * YEAR_MS,
		EVT.CULTURE_SPREAD,
		0,
	)
}

/** Bitset for deduplicating province-pair edge visits during spread iteration. */
class ProvincePairSet {
	private readonly _buckets: Uint32Array
	constructor(provinceCount: number) {
		this._buckets = new Uint32Array(
			Math.ceil((provinceCount * provinceCount) / 32),
		)
	}
	has(index: number): boolean {
		return (this._buckets[index >>> 5] & (1 << (index & 31))) !== 0
	}
	add(index: number): void {
		this._buckets[index >>> 5] |= 1 << (index & 31)
	}
}
