import type {
	AssignCultureGenderSystemsParams,
	ResolveLeaderGenderParams,
	RestrictGenderSystemsParams,
} from "@/model/history/sim/gender-system/types"
import { RELIGION_DOCTRINE } from "@/model/history/sim/religion/doctrine"
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

function restrict({
	systems,
	cultureToReligion,
	doctrine,
	seed,
}: RestrictGenderSystemsParams): Uint8Array {
	if (!doctrine) return systems
	const group = RELIGION_DOCTRINE.groups.findIndex(
		(group) => group.name === "gender",
	)
	return systems.map((system, culture) => {
		const religion = cultureToReligion[culture]
		if (religion < 0) return system
		if (
			doctrine.options[religion * RELIGION_DOCTRINE.groups.length + group] === 0
		)
			return cultureGenderSystem.PATRIARCHAL
		const roll = RNG.createRng({ seed: seed + 7414 + culture * 8191 }).random()
		return roll < 0.14 ? 0 : roll < 0.43 ? 1 : 2
	})
}
export const GENDER_SYSTEM = {
	restrict,
	cultureGenderSystem,
	assignCultureGenderSystems,
	normalizeCultureGenderSystem,
	resolveLeaderGender,
}
