import { HASH } from "@/model/shared/random/hash"
import type {
	LadderExperimentParams,
	LadderGeneration,
	LadderGrade,
	LadderSimulationParams,
} from "@/test/history-run/ladder-experiment/types"

const LADDERS = ["intellect", "physique", "beauty"] as const
function draw({
	seed,
	channel,
	first,
	second,
	birth,
	rules,
}: LadderExperimentParams): LadderGrade {
	const sides: LadderGrade = { active: 0, good: 0, bad: 0 }
	let goodActive = 0
	let badActive = 0
	for (const side of [1, -1]) {
		let carried = 0
		let active = 0
		for (let tier = 3; tier >= 1; tier--) {
			const parents = [first, second].map((parent) => {
				const showing = Math.max(0, parent.active * side)
				const hidden = side === 1 ? parent.good : parent.bad
				const value = Math.max(
					rules.higherTierParent === "none" && showing > tier ? 0 : showing,
					hidden,
				)
				const showingHere =
					showing === tier ||
					(rules.higherTierParent === "active" && showing > tier)
				const lower = value > 0 && value < tier
				return {
					state: showingHere
						? "active"
						: value > 0 && !(lower && rules.lowerTierParent === "none")
							? "carried"
							: "none",
					reduction: lower ? 0.2 ** Math.max(0, tier - value - 1) : 1,
				}
			})
			const a = parents.filter((parent) => parent.state === "active").length
			const c = parents.filter((parent) => parent.state === "carried").length
			const chances =
				a === 2
					? [0.8, 1]
					: a === 1
						? c === 1
							? [0.5, 1]
							: [0.25, 0.75]
						: c === 2
							? [0.1, 0.5]
							: c === 1
								? [0.02, 0.25]
								: [birth[tier - 1], 0]
			const rollChannel = channel + (side === 1 ? 0 : 12) + (3 - tier) * 3
			const reduction = parents[0].reduction * parents[1].reduction
			if (
				HASH.unit({ seed, channel: rollChannel, salt: 0 }) <
				chances[0] * reduction
			) {
				active = tier
				if (
					tier < 3 &&
					a === 2 &&
					HASH.unit({ seed, channel: rollChannel + 2, salt: 0 }) < 0.5
				)
					active++
				if (carried <= active) carried = 0
				break
			}
			if (
				HASH.unit({ seed, channel: rollChannel + 1, salt: 0 }) <
				chances[1] *
					(rules.lowerTierParent === "reducedCarrier" ? reduction : 1)
			)
				carried = Math.max(carried, tier)
		}
		if (side === 1) {
			goodActive = active
			sides.good = carried
		} else {
			badActive = active
			sides.bad = carried
		}
		if (goodActive > 0 && rules.sideOrder === "goodFirst") break
	}
	sides.active =
		goodActive && badActive
			? HASH.unit({ seed, channel: channel + 24, salt: 0 }) < 0.5
				? goodActive
				: -badActive
			: goodActive || -badActive
	sides.active = sides.active || 0
	return sides
}
function simulate({ rules }: LadderSimulationParams): LadderGeneration[] {
	const seed = 14963991
	const size = 40000
	let previous: LadderGrade[][] = []
	const generations: LadderGeneration[] = []
	for (let generation = 0; generation <= 32; generation++) {
		const order = Array.from(Array(size).keys(), (i) => ({
			i,
			roll: HASH.unit({ seed, channel: generation - 1, salt: i }),
		}))
			.sort((a, b) => a.roll - b.roll || a.i - b.i)
			.map((row) => row.i)
		const current: LadderGrade[][] = []
		const ladders = Object.fromEntries(
			LADDERS.map((name) => [
				name,
				{
					active: Array(7).fill(0) as number[],
					good: [0, 0, 0, 0],
					bad: [0, 0, 0, 0],
				},
			]),
		) as LadderGeneration["ladders"]
		for (let i = 0; i < size; i++) {
			const nameSeed =
				1 +
				Math.floor(
					HASH.unit({ seed, channel: 1000 + generation, salt: i }) * 0x7ffffffe,
				)
			const couple = Math.floor(i / 2) * 2
			const children = LADDERS.map((name, index) => {
				const value = draw({
					seed: nameSeed,
					channel: 200 + index * 30,
					first:
						generation === 0
							? { active: 0, good: 0, bad: 0 }
							: previous[order[couple]][index],
					second:
						generation === 0
							? { active: 0, good: 0, bad: 0 }
							: previous[order[couple + 1]][index],
					birth:
						name === "intellect"
							? [0.005, 0.0025, 0.0005]
							: [0.005, 0.0025, 0.0015],
					rules,
				})
				ladders[name].active[value.active + 3]++
				ladders[name].good[value.good]++
				ladders[name].bad[value.bad]++
				return value
			})
			current.push(children)
		}
		for (const stats of Object.values(ladders))
			for (const key of ["active", "good", "bad"] as const)
				stats[key] = stats[key].map((count) => count / size)
		generations.push({ generation, ladders })
		previous = current
	}
	return generations
}
export const LADDER_EXPERIMENT = { draw, simulate }
