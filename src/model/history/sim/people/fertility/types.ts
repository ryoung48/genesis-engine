import type { PeopleState, RealmOrigin } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type PregnancyOutcome =
	| "birth"
	| "miscarriage"
	| "stillbirth"
	| "mother dies"
	| "mother and child die"

// A pregnancy whose end is decided but has not happened yet.
export interface Pregnancy {
	mother: number
	father: number
	conception: number
	due: number
	outcome: PregnancyOutcome
	twins: boolean
	origin: RealmOrigin
}

export interface Delivery extends Pregnancy {
	id: number
}

export interface Deliveries {
	next: number
	byId: Map<number, Delivery>
	byMother: Map<number, number[]>
	// The end of the last interval projected for each mother.
	projected: Map<number, number>
	// Deliveries below this id have been handed to the event queue.
	queued: number
}

export interface FinishDeliveryParams {
	people: PeopleState
	id: number
	time: number
}

export interface DeliverParams {
	people: PeopleState
	pregnancy: Pregnancy
	// When the pregnancy ends.
	time: number
	rng: SharedRng
}

export interface QueueParams {
	people: PeopleState
	pregnancy: Pregnancy
}

export interface CancelParams {
	people: PeopleState
	person: number
}

export interface ProjectParams {
	people: PeopleState
	mother: number
	father: number
	from: number
	until: number
	origin: RealmOrigin
	rng: SharedRng
}

export interface TakeQueuedParams {
	people: PeopleState
}

export interface BearParams {
	people: PeopleState
	mother: number
	father: number
	from: number
	until: number
	// The mother is known to live until then, so no pregnancy may kill her
	// earlier.
	survives: number
	// The present: a pregnancy that ends later stays pending.
	now: number
	origin: RealmOrigin
	rng: SharedRng
}

export interface SiblingsParams {
	people: PeopleState
	child: number
	until: number
	origin: RealmOrigin
	rng: SharedRng
}

export interface CoupleParams {
	people: PeopleState
	mother: number
	father: number
}

export interface CoupleAtParams extends CoupleParams {
	time: number
}

export interface OutcomeParams {
	people: PeopleState
	mother: number
	time: number
	// Children the mother has already borne.
	earlier: number
	rng: SharedRng
}

export interface SmoothWeightParams {
	// The mother's effective health.
	health: number
	// Children she has already borne.
	earlier: number
}

export interface DurationParams {
	outcome: PregnancyOutcome
	rng: SharedRng
}

export interface ChildCount {
	// Births to the mother by any father.
	earlier: number
	// The couple's children, born and still living.
	together: number
	living: number
}

export interface TwinChanceParams {
	people: PeopleState
	mother: number
	age: number
}

export interface WomanParams {
	people: PeopleState
	woman: number
}

export interface ChildDynastyParams {
	people: PeopleState
	mother: number
	father: number
	origin: RealmOrigin
}
