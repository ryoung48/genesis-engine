import type {
	HazardSegment,
	IntervalParams,
	ProjectDeathParams,
} from "@/model/history/sim/people/lifespan/types"
import { HASH } from "@/model/shared/random/hash"

// CK3 NOldAge: below this health a person can die of it, with this monthly
// chance at zero health.
const DIE_HEALTH = 3
const DIE_CHANCE_ZERO = 0.25
// Yearly background death chance up to each age: the stand-in for disease.
const BACKGROUND: readonly (readonly [number, number])[] = [
	[1, 0.1],
	[5, 0.03],
	[16, 0.005],
	[Infinity, 0.012],
]
// Each band's chance as a yearly death rate.
const BACKGROUND_RATE = BACKGROUND.map(([, chance]) => -Math.log(1 - chance))
const MONTH = 1 / 12
const CHANNEL = {
	select: 1002,
	month: 1003,
	within: 1004,
	newbornSelect: 1005,
	newbornDate: 1006,
}

function monthlyChance(health: number): number {
	return health < DIE_HEALTH
		? DIE_CHANCE_ZERO * ((DIE_HEALTH - health) / DIE_HEALTH) ** 2
		: 0
}

// The interval split at the 1st, 5th and 16th birthdays it crosses.
function healthRate(health: number): number {
	return health < DIE_HEALTH ? -12 * Math.log(1 - monthlyChance(health)) : 0
}

function segments({
	birth,
	health,
	from,
	to,
}: IntervalParams): HazardSegment[] {
	const rate = healthRate(health)
	const parts: HazardSegment[] = []
	let start = from
	for (const [index, [age]] of BACKGROUND.entries()) {
		if (start >= to) break
		const end = Math.min(to, birth + age)
		if (end <= start) continue
		parts.push({ start, end, rate: rate + BACKGROUND_RATE[index] })
		start = end
	}
	return parts
}

// The same sum the segments give, without building them: almost every
// interval ends in survival and needs nothing else.
function survival({ birth, health, from, to }: IntervalParams): number {
	const rate = healthRate(health)
	let hazard = 0
	let start = from
	for (let index = 0; index < BACKGROUND.length && start < to; index++) {
		const end = Math.min(to, birth + BACKGROUND[index][0])
		if (end <= start) continue
		hazard += (rate + BACKGROUND_RATE[index]) * (end - start)
		start = end
	}
	return Math.exp(-hazard)
}

// One roll decides whether the person dies in the interval. The death then
// falls in a segment by its share of the deaths and at a date by the survival
// within that segment: a newborn's first partial year takes that date, and
// everyone else dies evenly within what the segment keeps of its month. The
// death is always after the interval's start. Infinity when the person lives
// through the interval.
function project(params: ProjectDeathParams): number {
	const { seed, year, from } = params
	const survives = survival(params)
	const newborn = from === params.birth
	const roll = HASH.unit({
		seed,
		channel: newborn ? CHANNEL.newbornSelect : CHANNEL.select,
		salt: year,
	})
	if (roll < survives) return Infinity
	const parts = segments(params)
	const date = HASH.unit({
		seed,
		channel: newborn ? CHANNEL.newbornDate : CHANNEL.month,
		salt: year,
	})
	let left = -Math.log(1 - date * (1 - survives))
	for (const [index, part] of parts.entries()) {
		const length = part.end - part.start
		if (left > part.rate * length && index < parts.length - 1) {
			left -= part.rate * length
			continue
		}
		const offset = Math.min(length, left / part.rate)
		if (newborn) return part.start + Math.max(offset, length * 1e-9)
		const low =
			part.start + Math.min(Math.floor(offset / MONTH) * MONTH, length - 1e-12)
		const high = Math.min(part.end, low + MONTH)
		const within = HASH.unit({ seed, channel: CHANNEL.within, salt: year })
		return low + (1 - within) * (high - low)
	}
	return Infinity
}

export const LIFESPAN = { channels: CHANNEL, survival, project }
