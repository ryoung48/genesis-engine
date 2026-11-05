import type {
	ScanAdvanceParams,
	ScanCreateParams,
	ScanEarliestParams,
	ScanIntersectParams,
	ScanInterval,
	ScanMaximum,
	ScanPositiveParams,
	ScanRangeParams,
	ScanState,
} from "@/model/shared/math/scan/types"

const RESOLUTION_S = 1
const GOLDEN = (Math.sqrt(5) - 1) / 2

function create({ f, startS }: ScanCreateParams): ScanState {
	const value = f(startS)
	return { t: startS, value, openS: value > 0 ? startS : null, evaluations: 1 }
}

function advance({ f, state, endS, rate }: ScanAdvanceParams): ScanInterval[] {
	const closed: ScanInterval[] = []
	while (state.t < endS) {
		const magnitude = Number.isNaN(state.value) ? 0 : Math.abs(state.value)
		const bound = rate(state.t)
		const step = Math.max(
			RESOLUTION_S,
			Math.min(magnitude / bound.rate, bound.untilS - state.t),
		)
		const t = Math.min(endS, state.t + step)
		const value = f(t)
		state.evaluations++
		const contact = state.t + (t - state.t) / 2
		if (value > 0 && state.openS === null) state.openS = contact
		else if (value <= 0 && state.openS !== null) {
			closed.push([state.openS, contact])
			state.openS = null
		}
		state.t = t
		state.value = value
	}
	return closed
}

function positive({
	f,
	startS,
	endS,
	rate,
}: ScanPositiveParams): ScanInterval[] {
	const state = create({ f, startS })
	const intervals = advance({ f, state, endS, rate })
	if (state.openS !== null) intervals.push([state.openS, endS])
	return intervals
}

function intersect({ a, b }: ScanIntersectParams): ScanInterval[] {
	const result: ScanInterval[] = []
	for (const x of a)
		for (const y of b) {
			const start = Math.max(x[0], y[0]),
				end = Math.min(x[1], y[1])
			if (end > start) result.push([start, end])
		}
	return result.sort((p, q) => p[0] - q[0])
}

function maximum({ f, startS, endS }: ScanRangeParams): ScanMaximum {
	let a = startS,
		b = endS
	let c = b - GOLDEN * (b - a),
		d = a + GOLDEN * (b - a)
	let fc = f(c),
		fd = f(d)
	let evaluations = 2
	while (b - a > RESOLUTION_S) {
		if (fc >= fd) {
			b = d
			d = c
			fd = fc
			c = b - GOLDEN * (b - a)
			fc = f(c)
		} else {
			a = c
			c = d
			fc = fd
			d = a + GOLDEN * (b - a)
			fd = f(d)
		}
		evaluations++
	}
	const left = f(startS),
		right = f(endS)
	const inner = fc >= fd ? { seconds: c, value: fc } : { seconds: d, value: fd }
	evaluations += 2
	const best =
		left >= inner.value && left >= right
			? { seconds: startS, value: left }
			: right > inner.value
				? { seconds: endS, value: right }
				: inner
	return { ...best, evaluations }
}

function earliest({ f, startS, endS, threshold }: ScanEarliestParams): number {
	if (f(startS) >= threshold) return startS
	let a = startS,
		b = endS
	while (b - a > RESOLUTION_S) {
		const mid = a + (b - a) / 2
		if (f(mid) >= threshold) b = mid
		else a = mid
	}
	return b
}

export const SCAN = {
	create,
	advance,
	positive,
	intersect,
	maximum,
	earliest,
	resolutionS: RESOLUTION_S,
}
