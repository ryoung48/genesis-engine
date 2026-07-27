import { DERIVE } from "@/model/history/generated/derive"
import { EVENT_HEAP } from "@/model/history/generated/event-heap"
import type {
	ComputeCulturePopulationsParams,
	IsBleedEdgeParams,
	RunCultureSpreadParams,
} from "@/model/history/generated/events/culture-spread/types"
import { FIELDS } from "@/model/history/generated/fields"
import { STATE } from "@/model/history/generated/state"
import type { HistoryState } from "@/model/history/generated/state/types"

const SPREAD_INTERVAL_YEARS = 5

const BLEED_INIT_PROBABILITY = 0.35

const NEW_BLEED_CHANCE = 0.2

const BLEED_START_WEIGHT = 0.3

const DIFFUSION_RATE = 0.01

const ASSIMILATION_RATE = 0.04

const BALANCE_THRESHOLD = 0.15

function isBleedEdge({
	seedA,
	seedB,
	probability,
}: IsBleedEdgeParams): boolean {
	const lo = Math.min(seedA, seedB)
	const hi = Math.max(seedA, seedB)
	// Combine with a simple mixing hash
	let h = (((lo ^ 0x9e3779b9) + hi) | 0) >>> 0
	h ^= h >>> 16
	h = Math.imul(h, 0x45d9f3b) >>> 0
	h ^= h >>> 16
	return (h >>> 0) / 0xffffffff < probability
}

function computeCulturePopulations({
	state,
	cultureCount,
}: ComputeCulturePopulationsParams): Float32Array {
	const pop = new Float32Array(cultureCount)
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const c = state.culture[p]
		if (c < 0 || c >= cultureCount) continue
		pop[c] += state.popRuralCurrent[p] + state.popUrbanCurrent[p]
	}
	return pop
}

function initCultureSpread(state: HistoryState): void {
	// Seed visible blends on ~55% of culture borders immediately so stripes
	// appear before any simulation ticks have run. Uses the same strength/balance
	// rules as runCultureSpread: only the weaker culture's province is seeded,
	// and balanced borders are skipped.
	const culturePop = computeCulturePopulations({
		state,
		cultureCount: state.cultureCount,
	})
	const visited = new ProvincePairSet(state.P)
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
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
			const edgeKey = p < nb ? p * state.P + nb : nb * state.P + p
			if (visited.has(edgeKey)) continue
			visited.add(edgeKey)
			if (
				!isBleedEdge({
					seedA: state.provinceSeeds[p],
					seedB: state.provinceSeeds[nb],
					probability: BLEED_INIT_PROBABILITY,
				})
			) {
				continue
			}
			const popP = culturePop[cultureP] ?? 0
			const popNb = culturePop[cultureNb] ?? 0
			const ratio =
				Math.max(popP, popNb) === 0
					? 1
					: Math.abs(popP - popNb) / Math.max(popP, popNb)
			if (ratio < BALANCE_THRESHOLD) continue
			// Only the weaker side receives the blend.
			const receiver = popP < popNb ? p : nb
			const spreaderCulture = popP < popNb ? cultureNb : cultureP
			if (FIELDS.prov.cultureBlendSecondary.get({ state, p: receiver }) >= 0)
				continue
			FIELDS.prov.cultureBlendSecondary.set({
				state,
				p: receiver,
				time: state.time,
				value: spreaderCulture,
			})
			FIELDS.prov.cultureBlendWeight.set({
				state,
				p: receiver,
				time: state.time,
				value: BLEED_START_WEIGHT,
			})
		}
	}

	state.heap.enqueue(
		state.time + SPREAD_INTERVAL_YEARS * STATE.yearMs,
		EVENT_HEAP.evt.CULTURE_SPREAD,
		0,
	)
}

function runCultureSpread({
	state,
	cultureCount,
	rng,
}: RunCultureSpreadParams): void {
	DERIVE.ensureHierarchyClean(state)
	const culturePop = computeCulturePopulations({ state, cultureCount })
	const P = state.P
	const time = state.time

	// --- Advance existing bleeds ---
	for (let p = 0; p < P; p++) {
		if (state.desolate[p]) continue
		const secondary = FIELDS.prov.cultureBlendSecondary.get({ state, p })
		if (secondary < 0) continue

		let weight = FIELDS.prov.cultureBlendWeight.get({ state, p })

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
			FIELDS.prov.cultureBlendSecondary.set({ state, p, time, value: -1 })
			FIELDS.prov.cultureBlendWeight.set({ state, p, time, value: 0 })
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
				if (FIELDS.prov.cultureBlendSecondary.get({ state, p: nb }) >= 0)
					continue
				const eligibleEdge = isBleedEdge({
					seedA: state.provinceSeeds[p],
					seedB: state.provinceSeeds[nb],
					probability: BLEED_INIT_PROBABILITY,
				})
				if (!eligibleEdge) continue
				FIELDS.prov.cultureBlendSecondary.set({
					state,
					p: nb,
					time,
					value: secondary,
				})
				FIELDS.prov.cultureBlendWeight.set({
					state,
					p: nb,
					time,
					value: BLEED_START_WEIGHT,
				})
			}
		} else {
			FIELDS.prov.cultureBlendWeight.set({ state, p, time, value: weight })
		}
	}

	// --- Initiate new bleeds on eligible idle borders ---
	const visited = new ProvincePairSet(P)
	for (let p = 0; p < P; p++) {
		if (state.desolate[p]) continue
		if (FIELDS.prov.cultureBlendSecondary.get({ state, p }) >= 0) continue
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
				!isBleedEdge({
					seedA: state.provinceSeeds[p],
					seedB: state.provinceSeeds[nb],
					probability: BLEED_INIT_PROBABILITY,
				})
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
			if (FIELDS.prov.cultureBlendSecondary.get({ state, p: receiver }) >= 0)
				continue

			if (rng.random() < NEW_BLEED_CHANCE) {
				FIELDS.prov.cultureBlendSecondary.set({
					state,
					p: receiver,
					time,
					value: spreaderCulture,
				})
				FIELDS.prov.cultureBlendWeight.set({
					state,
					p: receiver,
					time,
					value: BLEED_START_WEIGHT,
				})
			}
		}
	}

	// Schedule next tick
	state.heap.enqueue(
		time + SPREAD_INTERVAL_YEARS * STATE.yearMs,
		EVENT_HEAP.evt.CULTURE_SPREAD,
		0,
	)
}

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

export const CULTURE_SPREAD = {
	initCultureSpread,
	runCultureSpread,
}
