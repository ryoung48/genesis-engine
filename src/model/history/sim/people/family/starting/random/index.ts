import { PEOPLE } from "@/model/history/sim/people"
import type {
	AgeParams,
	DrawParams,
	KeyParams,
	SourceParams,
} from "@/model/history/sim/people/family/starting/random/types"
import type {
	PeopleRandomSource,
	PersonDraws,
} from "@/model/history/sim/people/types"
import { HASH } from "@/model/shared/random/hash"
import { RNG } from "@/model/shared/random/rng"

function key({ seed, path }: KeyParams): number {
	for (const salt of path)
		seed = Math.floor(HASH.unit({ seed, channel: 6000, salt }) * 2 ** 32) >>> 0
	return seed >>> 0
}

function source({ seed, path, purpose }: SourceParams): PeopleRandomSource {
	const root =
		Math.floor(
			HASH.unit({ seed: key({ seed, path }), channel: 6001, salt: purpose }) *
				2 ** 32,
		) >>> 0
	let counter = 0
	return RNG.fromSource({
		random: () => HASH.unit({ seed: root, channel: 6002, salt: counter++ }),
		nonPositiveWeightBehavior: "undefined",
	})
}

function draws({ seed, path, sex, origin }: DrawParams): PersonDraws {
	return {
		recordHealth: false,
		nameSeed: PEOPLE.nameSeed({
			sex,
			genderSystem: origin.genderSystem,
			rng: source({ seed, path, purpose: 3 }),
		}),
		rng: source({ seed, path, purpose: 4 }),
	}
}

function rulerAge({ rng }: AgeParams): number {
	return (
		rng.weightedChoice([
			{ v: rng.uniform(1, 10), w: 0.4 },
			{ v: rng.uniform(11, 15), w: 0.2 },
			{ v: rng.uniform(16, 30), w: 5 },
			{ v: rng.uniform(31, 50), w: 4 },
			{ v: rng.uniform(51, 65), w: 1 },
		]) ?? 30
	)
}

export const STARTING_RANDOM = { key, source, draws, rulerAge }
