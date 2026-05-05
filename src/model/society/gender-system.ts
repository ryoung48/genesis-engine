import { createRng } from "@/model/shared/rng"

export const CULTURE_GENDER_SYSTEM = {
	PATRIARCHAL: 0,
	EQUAL: 1,
	MATRIARCHAL: 2,
} as const

export type CultureGenderSystem =
	(typeof CULTURE_GENDER_SYSTEM)[keyof typeof CULTURE_GENDER_SYSTEM]

type LeaderGender = "male" | "female"

function hashSeed(seed: number): number {
	let value = Math.trunc(seed) | 0
	value ^= value >>> 16
	value = Math.imul(value, 0x7feb352d)
	value ^= value >>> 15
	value = Math.imul(value, 0x846ca68b)
	value ^= value >>> 16
	return value >>> 0
}

export function assignCultureGenderSystems(
	count: number,
	seed: number,
): Uint8Array {
	const rng = createRng(seed)
	const systems = new Uint8Array(count)
	for (let index = 0; index < count; index++) {
		const roll = rng.random()
		systems[index] =
			roll < 0.85
				? CULTURE_GENDER_SYSTEM.PATRIARCHAL
				: roll < 0.9
					? CULTURE_GENDER_SYSTEM.EQUAL
					: CULTURE_GENDER_SYSTEM.MATRIARCHAL
	}
	return systems
}

export function normalizeCultureGenderSystem(
	system: number | undefined | null,
): CultureGenderSystem {
	return system === CULTURE_GENDER_SYSTEM.EQUAL ||
		system === CULTURE_GENDER_SYSTEM.MATRIARCHAL
		? system
		: CULTURE_GENDER_SYSTEM.PATRIARCHAL
}

export function resolveLeaderGender(
	system: number | undefined | null,
	seed: number,
): LeaderGender {
	const normalized = normalizeCultureGenderSystem(system)
	const roll = hashSeed(seed) / 0xffffffff
	if (normalized === CULTURE_GENDER_SYSTEM.EQUAL) {
		return roll < 0.5 ? "male" : "female"
	}
	if (normalized === CULTURE_GENDER_SYSTEM.MATRIARCHAL) {
		return roll < 0.95 ? "female" : "male"
	}
	return roll < 0.95 ? "male" : "female"
}

export function leaderGenderSymbol(gender: LeaderGender | null): string | null {
	if (gender === "male") return "♂"
	if (gender === "female") return "♀"
	return null
}
