function pdf(value: number): number {
	return Math.exp((-value * value) / 2) / Math.sqrt(2 * Math.PI)
}

function cdf(value: number): number {
	const t = 1 / (1 + 0.2316419 * Math.abs(value))
	const tail =
		pdf(value) *
		t *
		(0.31938153 +
			t *
				(-0.356563782 +
					t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
	return value >= 0 ? 1 - tail : tail
}

function quantile(probability: number): number {
	if (!(probability > 0 && probability < 1))
		throw new RangeError("Normal probability must be between zero and one")
	let lo = -8
	let hi = 8
	for (let i = 0; i < 32; i++) {
		const mid = (lo + hi) / 2
		if (cdf(mid) < probability) lo = mid
		else hi = mid
	}
	return (lo + hi) / 2
}

export const NORMAL = { pdf, cdf, quantile }
