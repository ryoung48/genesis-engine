import type { MarriageObservation } from "@/model/history/sim/people/family/diagnostics/types"
import type { MarriageCandidateContext } from "@/model/history/sim/people/family/match-scoring/types"
import type { StartingFamilies } from "@/model/history/sim/people/family/starting/types"
import type { Deliveries } from "@/model/history/sim/people/fertility/types"
import type {
	HouseholdContext,
	ResidenceHistory,
} from "@/model/history/sim/people/household/types"
import type { PeopleLog } from "@/model/history/sim/people/log/types"
import type { OpinionMemory } from "@/model/history/sim/people/opinion/memory/types"
import type {
	MemoryCounts,
	OpinionContext,
} from "@/model/history/sim/people/opinion/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type PeopleRandomSource = Pick<
	SharedRng,
	"random" | "uniform" | "randint" | "weightedChoice" | "shuffle"
>

export interface PersonDraws {
	recordHealth: boolean
	nameSeed: number
	rng: PeopleRandomSource
}

export type BirthDraws = ((sex: Sex) => PersonDraws) | null

export type Sex = 0 | 1

export type GenderPreference = "male" | "female" | "none"

export interface PersonTable {
	bases: number[]

	personality: number[]
	grades: number[]
	congenital: number[]
	carried: number[]
	stress: number[]
	sex: Sex[]
	createdAt: number[]
	birth: number[]
	death: number[]
	father: number[]
	mother: number[]
	spouse: number[]
	dynasty: number[]
	culture: number[]
	nameSeed: number[]
	residence: number[]
	initialResidence: number[]
	heldSeats: number[][]
	children: number[][]
	scopeYear: number[]
	marriedAt: number[]
	// Realm at birth; names are drawn from its culture.
	home: number[]
	// Base fertility, 0.5 to 0.6.
	fertility: number[]
	// Highest seat standing ever held; 0 for none.
	peak: number[]
	// Earliest next conception: the last pregnancy's end plus a rest.
	nextBirth: number[]
	// The promised partner, or -1; always set on both parties.
	betrothed: number[]
	// When the betrothal was made; -1 without one.
	betrothedAt: number[]
	// Health at birth less the permanent losses of ageing.
	baseHealth: number[]
	// Progress of each ageing condition, 0-100; -1 when absent.
	infirmXp: number[]
	cloudedEyesXp: number[]
	fragileBonesXp: number[]
	witheringMindXp: number[]
	falteringHeartXp: number[]
	// The last recorded health band, with the Blind and Incapable bits.
	healthFlags: number[]
	// The last completed age whose yearly health pulse has run.
	healthAgeYear: number[]
	// Death has been projected up to this time.
	healthIntervalEnd: number[]
	// The calendar year the person last led an army; -1 for never.
	ledYear: number[]
}

export type SeatChangeReason =
	| "succession"
	| "usurpation"
	| "rebellion"
	| "restoration"
	| "regime change"
	| "union"
	| "territorial change"
	| "district grant"
	| "partition"
	| "promotion"
	| "demotion"
	| "unknown"

export type RegentKind =
	| "parent"
	| "spouse"
	| "relative"
	| "protector"
	| "council"

export type RegencyCause = "minority" | "incapacity"

export interface Regency {
	ward: number
	cause: RegencyCause
	// -1 for a regency council.
	regent: number
	kind: RegentKind
}

// A deposed ruler, or their heir, who may try to retake the throne.
export interface DeposedClaim {
	claimant: number
	// 0 for the deposed ruler, 1 for their heir.
	generation: number
	// The claimant has made their coming-of-age attempt.
	tried: boolean
}

export type DeathCause = "natural" | "heart" | "battle" | "childbirth"

export type PregnancyLoss = "miscarriage" | "stillbirth" | "childbirth death"

export interface PeopleState {
	startingFamilies: StartingFamilies
	household: HouseholdContext
	residenceHistory: ResidenceHistory
	holdingsChanged: (person: number) => void
	persons: PersonTable
	alive: number[]
	stressed: number[]
	// Deaths of a spouse or child since the last yearly pass, by the bereaved.
	bereavements: Map<number, number>
	deliveries: Deliveries
	rulerOf: Int32Array
	// Patrician house heads of each electoral republic, by realm.
	patricians: Map<number, number[]>
	// Successive shared rulers of each personal-union junior realm.
	unionGenerations: Map<number, number>
	// Realm pairs allied by a marriage between their ruling families, keyed by
	// the lower realm times the province count plus the higher.
	marriageAlliances: Map<number, MarriageAlliance>
	// Sovereign realms governed by a regent for a child or an incapable ruler,
	// by realm.
	regencies: Map<number, Regency>
	// Claims of deposed rulers, by the realm they lost.
	deposed: Map<number, DeposedClaim>
	// Remembered interactions by observer, then target; one entry per reason.
	memories: Map<number, Map<number, OpinionMemory[]>>
	memoryCounts: MemoryCounts
	log: PeopleLog
	nextDynasty: number
}

export interface AddPersonParams {
	people: PeopleState
	sex: Sex
	birth: number
	death: number
	father: number
	mother: number
	dynasty: number
	culture: number
	nameSeed: number
	realm: number
	fertility: number
}

export interface SpawnParams {
	recordHealth: boolean
	death: number | null
	nameSeed: number | null
	people: PeopleState
	sex: Sex
	birth: number
	// The person is known to be alive then; their birth for a newborn.
	survives: number
	father: number
	mother: number
	dynasty: number
	origin: RealmOrigin
	rng: PeopleRandomSource
}

export interface PersonAtParams {
	people: PeopleState
	person: number
	time: number
}

export interface PersonRefParams {
	people: PeopleState
	person: number
}

export interface RealmOrigin {
	realm: number
	culture: number
	genderSystem: number
}

export interface FoundHouseParams {
	people: PeopleState
	origin: RealmOrigin
	time: number
	age: number
	// Tier of the seat the house is founded for; sets its family size.
	rank: number
	rng: PeopleRandomSource
}

export interface SetRulerParams {
	people: PeopleState
	seat: number
	person: number
	rank: number
	reason: SeatChangeReason
}

export interface RaiseParams {
	people: PeopleState
	person: number
	rank: number
}

export interface ShortenLifeParams {
	people: PeopleState
	person: number
	time: number
}

export interface SetRegentParams {
	people: PeopleState
	seat: number
	// -1 ends the regent's tenure.
	person: number
	ward: number
}

export interface VacateParams {
	people: PeopleState
	seat: number
	reason: SeatChangeReason
}

// The realm-level rules the marriage market reads from the engine.
export interface MarriageRealms {
	observe: (observation: MarriageObservation) => void
	opinionContext: () => OpinionContext
	candidateOf: (person: number) => MarriageCandidateContext
	allied: (match: CrossMatch) => boolean
	onboard: (person: number) => void
	// Returns whether the match may have changed which realm anyone lives in.
	settle: (selection: MarriageSelection) => boolean
	refresh: () => void
	neighborsOf: (realm: number) => readonly number[]
	originOf: (realm: number) => RealmOrigin
	// Realms whose ruling houses marry abroad for alliance.
	royal: (realm: number) => boolean
	// The match would form or bind a marriage alliance.
	alliable: (match: CrossMatch) => boolean
}

export interface MarriageSelection {
	match: CrossMatch
	betrothal: boolean
}

export interface RunPeopleYearParams extends MarriageRealms {
	people: PeopleState
	time: number
	rulers: number[]
	sovereigns: number[]
	rng: PeopleRandomSource
}

export interface ProjectYearParams {
	people: PeopleState
	time: number
	rulers: number[]
	originOf: (realm: number) => RealmOrigin
	rng: PeopleRandomSource
}

export interface PeopleMatches {
	weddings: CrossMatch[]
	betrothals: CrossMatch[]
}

export interface MarriageAlliance {
	first: number
	second: number
}

export interface CrossMatch {
	a: number
	b: number
	realmA: number
	realmB: number
}

export interface MarriageTieParams {
	people: PeopleState
	a: number
	b: number
	time: number
}

export interface NameSeedParams {
	sex: Sex
	genderSystem: number
	rng: PeopleRandomSource
}

export interface PreferenceParams {
	genderSystem: number
}
