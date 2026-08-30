import type {
	AssignCultureGenderSystemsParams,
	ResolveLeaderGenderParams,
} from "@/model/history/sim/gender-system/types"
import { RNG } from "@/model/shared/random/rng"
import type { CultureGenderSystem, LeaderGender } from "@/model/society/types"

const cultureGenderSystem = {
	PATRIARCHAL: 0,
	EQUAL: 1,
	MATRIARCHAL: 2,
} as const

function hashSeed(seed: number): number {
	let value = Math.trunc(seed) | 0
	value ^= value >>> 16
	value = Math.imul(value, 0x7feb352d)
	value ^= value >>> 15
	value = Math.imul(value, 0x846ca68b)
	value ^= value >>> 16
	return value >>> 0
}

function assignCultureGenderSystems({
	count,
	seed,
}: AssignCultureGenderSystemsParams): Uint8Array {
	const rng = RNG.createRng({ seed })
	const systems = new Uint8Array(count)
	for (let index = 0; index < count; index++) {
		const roll = rng.random()
		systems[index] =
			roll < 0.85
				? cultureGenderSystem.PATRIARCHAL
				: roll < 0.9
					? cultureGenderSystem.EQUAL
					: cultureGenderSystem.MATRIARCHAL
	}
	return systems
}

function normalizeCultureGenderSystem(
	system: number | undefined | null,
): CultureGenderSystem {
	return system === cultureGenderSystem.EQUAL ||
		system === cultureGenderSystem.MATRIARCHAL
		? system
		: cultureGenderSystem.PATRIARCHAL
}

function resolveLeaderGender({
	system,
	seed,
}: ResolveLeaderGenderParams): LeaderGender {
	const normalized = normalizeCultureGenderSystem(system)
	const roll = hashSeed(seed) / 0xffffffff
	if (normalized === cultureGenderSystem.EQUAL) {
		return roll < 0.5 ? "male" : "female"
	}
	if (normalized === cultureGenderSystem.MATRIARCHAL) {
		return roll < 0.95 ? "female" : "male"
	}
	return roll < 0.95 ? "male" : "female"
}

export const GENDER_SYSTEM = {
	cultureGenderSystem,
	assignCultureGenderSystems,
	normalizeCultureGenderSystem,
	resolveLeaderGender,
}
