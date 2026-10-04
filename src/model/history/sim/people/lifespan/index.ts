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
function segments({
	birth,
	health,
	from,
	to,
}: IntervalParams): HazardSegment[] {
	const healthRate = -12 * Math.log(1 - monthlyChance(health))
	const parts: HazardSegment[] = []
	let start = from
	for (const [age, chance] of BACKGROUND) {
		if (start >= to) break
		const end = Math.min(to, birth + age)
		if (end <= start) continue
		parts.push({ start, end, rate: healthRate - Math.log(1 - chance) })
		start = end
	}
	return parts
}

function survival(params: IntervalParams): number {
	let hazard = 0
	for (const part of segments(params))
		hazard += part.rate * (part.end - part.start)
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
	const parts = segments(params)
	let hazard = 0
	for (const part of parts) hazard += part.rate * (part.end - part.start)
	const survives = Math.exp(-hazard)
	const newborn = from === params.birth
	const roll = HASH.unit({
		seed,
		channel: newborn ? CHANNEL.newbornSelect : CHANNEL.select,
		salt: year,
	})
	if (roll < survives) return Infinity
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
