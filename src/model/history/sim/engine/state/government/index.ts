import { FIELDS } from "@/model/history/sim/engine/fields"
import type {
	GovernmentAccessionParams,
	GovernmentChangeParams,
	GovernmentReviewParams,
	GovernmentTransition,
} from "@/model/history/sim/engine/state/government/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { ERAS } from "@/model/society/eras"

const ABSOLUTE_MIN_PROVINCES = 20
const ABSOLUTE_KNOWLEDGE = 1.9
const SIGNORIA_STREAK = 3
const CITY_MAX_PROVINCES = 4
const CITY_MIN_POPULATION = 5_000
const CITY_MIN_URBAN_SHARE = 0.2

function change({
	state,
	realm,
	to,
	cause,
}: GovernmentChangeParams): GovernmentTransition | null {
	const from = ERAS.governmentTypes[state.governmentType[realm]]
	if (from === to) return null
	FIELDS.prov.government.set({
		state,
		p: realm,
		value: GOVERNMENT.getGovIdx()[to],
	})
	state.events.push({
		tag: "government change",
		time: state.time,
		data: { nation: realm, from, to, cause },
	})
	if (
		GOVERNMENT.govFamilyOfIndex(state.governmentType[realm]) !== "republic" ||
		GOVERNMENT.successionOfIndex(state.governmentType[realm]) !== "election"
	)
		state.electionStreaks.delete(realm)
	return { from, to, cause }
}

function sizeReview({
	state,
	realm,
	provinces,
	rng,
}: GovernmentReviewParams): GovernmentTransition | null {
	const type = ERAS.governmentTypes[state.governmentType[realm]]
	const size = provinces.length
	if (type === "chiefdom" || type === "tribal_monarchy")
		return change({
			state,
			realm,
			to: size >= 5 ? "tribal_monarchy" : "chiefdom",
			cause: "size",
		})
	if (type === "native_council" || type === "tribal_federation")
		return change({
			state,
			realm,
			to: size >= 10 ? "tribal_federation" : "native_council",
			cause: "size",
		})
	if (type === "absolute_monarchy" && size < ABSOLUTE_MIN_PROVINCES) {
		const rolled = GOVERNMENT.monarchySubtype({
			size,
			sizeWeight: ERAS.getEraConfig(state.era).governmentSizeWeight,
			r: rng.random(),
		})
		return change({
			state,
			realm,
			to:
				ERAS.governmentTypes[rolled] === "elective_monarchy"
					? "elective_monarchy"
					: "feudal_monarchy",
			cause: "size",
		})
	}
	return null
}

function yearly({
	state,
	realm,
	provinces,
}: GovernmentReviewParams): GovernmentTransition | null {
	const type = ERAS.governmentTypes[state.governmentType[realm]]
	if (
		(type !== "feudal_monarchy" && type !== "elective_monarchy") ||
		provinces.length > CITY_MAX_PROVINCES
	)
		return null
	let urban = 0
	let population = 0
	let largest = 0
	for (const province of provinces) {
		const city = state.popUrbanCurrent[province]
		urban += city
		population += city + state.popRuralCurrent[province]
		largest = Math.max(largest, city)
	}
	return largest >= CITY_MIN_POPULATION &&
		population > 0 &&
		urban / population >= CITY_MIN_URBAN_SHARE
		? change({ state, realm, to: "oligarchic_republic", cause: "city" })
		: null
}

function found(params: GovernmentReviewParams): GovernmentTransition | null {
	return sizeReview(params) ?? yearly(params)
}

function accede(
	params: GovernmentAccessionParams,
): GovernmentTransition | null {
	const { state, realm, provinces, knowledge, elected, previousHouse } = params
	const earlier = found(params)
	if (earlier) return earlier
	const type = ERAS.governmentTypes[state.governmentType[realm]]
	const ruler = state.people.rulerOf[realm]
	const house = ruler >= 0 ? state.people.persons.dynasty[ruler] : -1
	if (
		GOVERNMENT.govFamilyOfIndex(state.governmentType[realm]) === "republic" &&
		GOVERNMENT.successionOfIndex(state.governmentType[realm]) === "election" &&
		elected &&
		house >= 0
	) {
		const previous = state.electionStreaks.get(realm)
		const wins = previous?.house === house ? previous.wins + 1 : 1
		state.electionStreaks.set(realm, { house, wins })
		if (type === "oligarchic_republic" && wins >= SIGNORIA_STREAK)
			return change({
				state,
				realm,
				to: "dynastic_signoria",
				cause: "election streak",
			})
	} else state.electionStreaks.delete(realm)
	if (type === "dynastic_signoria" && house >= 0 && house !== previousHouse)
		return change({
			state,
			realm,
			to: "oligarchic_republic",
			cause: "house lost",
		})
	if (
		(type === "feudal_monarchy" || type === "elective_monarchy") &&
		provinces.length >= ABSOLUTE_MIN_PROVINCES &&
		knowledge >= ABSOLUTE_KNOWLEDGE
	)
		return change({ state, realm, to: "absolute_monarchy", cause: "knowledge" })
	return null
}

export const STATE_GOVERNMENT = { found, accede, yearly }
