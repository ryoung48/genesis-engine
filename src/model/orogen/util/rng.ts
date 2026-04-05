export interface OrogenRng {
	random(): number
	randint(a: number, b: number): number
}

export function makeRng(seed: number): () => number {
	let s = (Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483646) + 1
	return () => {
		s = (s * 16807) % 2147483647
		return (s - 1) / 2147483646
	}
}

export function makeRandInt(seed: number): (n: number) => number {
	const r = makeRng(seed)
	return (n: number) => Math.floor(r() * n)
}

export function createRng(seed: number): OrogenRng {
	const rng = makeRng(seed)
	return {
		random: () => rng(),
		randint: (a: number, b: number) => a + Math.floor(rng() * (b - a + 1)),
	}
}
