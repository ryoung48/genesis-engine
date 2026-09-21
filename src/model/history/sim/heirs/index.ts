import type { HeirResult, HeirsOfParams } from "@/model/history/sim/heirs/types"
import { NO_HEIR, UNNAMED } from "@/model/history/sim/heirs/types"
import { HEIRS as PERSON_HEIRS } from "@/model/history/sim/people/heirs"
import { SUCCESSION_LAW } from "@/model/history/sim/succession-law"

function of({ state, dying, law, rng }: HeirsOfParams): HeirResult {
	if (state.people) {
		const person = state.people.holderOfSeat[dying]
		if (person < 0) return { primary: NO_HEIR, juniors: [] }
		const result = PERSON_HEIRS.of({
			people: state.people,
			dying: person,
			time: state.time / (365 * 24 * 60 * 60 * 1000),
			law,
			gender: SUCCESSION_LAW.genderOf({
				state,
				nation: state.sovereignCurrent[dying],
			}),
		})
		return { primary: result.primary, juniors: result.juniors }
	}
	const count =
		rng.weightedChoice([
			{ v: 0, w: 5 },
			{ v: 1, w: 30 },
			{ v: 2, w: 30 },
			{ v: 3, w: 20 },
			{ v: 4, w: 15 },
		]) ?? 1
	return {
		primary: count === 0 ? NO_HEIR : UNNAMED,
		juniors:
			count <= 1 || law === "single_heir"
				? []
				: Array.from({ length: count - 1 }, () => UNNAMED),
	}
}

export const HEIRS = { of }
