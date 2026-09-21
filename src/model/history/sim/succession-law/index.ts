import { GOVERNMENT } from "@/model/history/sim/nations/government"
import type {
	ClimbLawsParams,
	GenderLaw,
	InitLawsParams,
	LawOfParams,
	NewSovereignLawParams,
	SuccessionLaw,
} from "@/model/history/sim/succession-law/types"
import { ERAS } from "@/model/society/eras"

const LAWS: readonly SuccessionLaw[] = [
	"confederate",
	"partition",
	"high_partition",
	"single_heir",
]
const GENDERS: readonly GenderLaw[] = [
	"male_preference",
	"equal",
	"female_preference",
]

function isTribal({ state, nation }: LawOfParams): boolean {
	return GOVERNMENT.govFamilyOfIndex(state.governmentType[nation]) === "tribal"
}

function genderIndex({ state, nation }: LawOfParams): number {
	const religion = state.religion[nation]
	return religion < 0 ? 0 : state.religionGenderDoctrines[religion]
}

function lawOf({ state, nation }: LawOfParams): SuccessionLaw {
	return LAWS[state.successionLaw[nation]] ?? "confederate"
}

function genderOf({ state, nation }: LawOfParams): GenderLaw {
	return GENDERS[state.genderLaw[nation]] ?? "male_preference"
}

function initial({ state, seed }: InitLawsParams): void {
	const sizes = new Int32Array(state.P)
	for (let p = 0; p < state.P; p++) {
		const realm = state.sovereignCurrent[p]
		if (realm >= 0) sizes[realm]++
	}
	const buckets: number[][] = [[], [], []]
	for (let nation = 0; nation < state.P; nation++) {
		if (sizes[nation] === 0 || state.parentCurrent[nation] >= 0) continue
		state.genderLaw[nation] = genderIndex({ state, nation })
		if (isTribal({ state, nation })) continue
		const bucket = sizes[nation] === 1 ? 0 : sizes[nation] <= 4 ? 1 : 2
		buckets[bucket].push(nation)
	}
	const partitionShare = ERAS.getEraConfig(state.era).succession.partitionShares
	for (let bucket = 0; bucket < buckets.length; bucket++) {
		const nations = buckets[bucket]
		nations.sort(
			(a, b) =>
				((Math.imul(a + 1, 2654435761) ^ seed) >>> 0) -
				((Math.imul(b + 1, 2654435761) ^ seed) >>> 0),
		)
		const quota = Math.round(nations.length * partitionShare[bucket])
		for (let i = 0; i < quota; i++) state.successionLaw[nations[i]] = 1
	}
}

function forNewSovereign({
	state,
	nation,
	former,
}: NewSovereignLawParams): void {
	state.genderLaw[nation] = genderIndex({ state, nation })
	state.successionLaw[nation] = isTribal({ state, nation })
		? 0
		: state.successionLaw[former]
}

function climb({ state, rng }: ClimbLawsParams): void {
	const year = state.time / (365 * 24 * 60 * 60 * 1000)
	const config = ERAS.getEraConfig(state.era).succession
	for (let nation = 0; nation < state.P; nation++) {
		if (
			state.desolate[nation] ||
			state.stateless[nation] ||
			state.parentCurrent[nation] >= 0 ||
			isTribal({ state, nation })
		)
			continue
		const law = state.successionLaw[nation]
		let next = law
		if (
			year >= config.singleHeirUnlockYear &&
			law < 3 &&
			rng.random() < config.singleHeirHazard
		)
			next = 3
		else if (law < 2 && rng.random() < config.climbHazard) next = law + 1
		if (next === law) continue
		state.successionLaw[nation] = next
		state.events.push({
			tag: "succession law changed",
			time: state.time,
			data: { nation, from: LAWS[law], to: LAWS[next] },
		})
	}
}

export const SUCCESSION_LAW = {
	initial,
	forNewSovereign,
	climb,
	lawOf,
	genderOf,
}
