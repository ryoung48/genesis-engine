import type {
	CheckLifeParams,
	LifeCheck,
	LifeTrajectory,
	LifeTrajectoryParams,
	LifeYearRoll,
	RollLifeYearParams,
} from "@/model/history/sim/people/lifespan/types"

function healthBand(health: number): number {
	if (health <= 0) return 0
	if (health < 8) return 1
	if (health < 24) return 2
	if (health < 40) return 3
	if (health < 56) return 4
	return 5
}

function rollYear({ age, health, rng }: RollLifeYearParams): LifeYearRoll {
	let nextHealth = health
	if (age >= 25 && rng.random() < Math.min(1, 0.075 + 0.022 * (age - 25)))
		nextHealth = Math.max(0, health - 1)
	let chance = 0
	if (age < 1) chance = 0.1
	else if (age < 5) chance = 0.03
	else if (age < 16) chance = 0.005
	else if (nextHealth < 24) {
		const monthly = 0.25 * ((24 - nextHealth) / 24) ** 2
		chance = 1 - (1 - monthly) ** 12
	}
	if (chance > 0 && rng.random() < chance)
		return { health: nextHealth, deathOffset: 0.001 + rng.random() * 0.998 }
	return { health: nextHealth }
}

function checkYear({ people, person, from, rng }: CheckLifeParams): LifeCheck {
	const table = people.persons
	const age = Math.floor(from - table.birth[person])
	const oldBand = healthBand(table.health[person])
	const roll = rollYear({ age, health: table.health[person], rng })
	table.health[person] = roll.health
	const newBand = healthBand(roll.health)
	return roll.deathOffset === undefined
		? { oldBand, newBand }
		: { death: from + roll.deathOffset, oldBand, newBand }
}

function trajectory({
	birth,
	until,
	sex,
	rng,
	requireAlive,
	initialHealth,
}: LifeTrajectoryParams): LifeTrajectory {
	for (let attempt = 0; attempt < (requireAlive ? 100 : 1); attempt++) {
		let health =
			initialHealth ?? 36 + Math.floor(rng.random() * 5) + (sex === 1 ? 4 : 0)
		let death = Number.POSITIVE_INFINITY
		for (let year = birth; year < until; year++) {
			const roll = rollYear({ age: Math.floor(year - birth), health, rng })
			health = roll.health
			if (roll.deathOffset === undefined) continue
			const deathTime = year + roll.deathOffset
			if (deathTime < until) death = deathTime
			break
		}
		if (!requireAlive || death >= until) return { health, death }
	}
	throw new Error("Could not generate a living person")
}

export const LIFESPAN = { healthBand, checkYear, trajectory }
