import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface RulerTracker {
	// Engine notes already read.
	cursor: number
	// Yearly samples of standing marriage ties and of the realms involved.
	tieYears: number
	tiedRealmYears: number
	marryingRealmYears: number
	// Yearly samples of sovereign realms sharing a dynasty with a neighbour.
	realmYears: number
	sharedDynastyRealmYears: number
	// Yearly samples of union juniors standing.
	unionJuniorYears: number
}

export interface RulerSampleParams {
	engine: HistoryState
	tracker: RulerTracker
}

export interface RulerWindowParams extends RulerSampleParams {
	from: number
	to: number
	serializedPlanBytes: number
}

export interface SuccessionReport {
	count: number
	bySystem: Record<string, number>
	byHouse: Record<string, number>
	// Successions by the claim of the new ruler, 0 to 3.
	byClaim: number[]
	minors: number
	minorShare: number
	// Realms divided, by the number of junior heirs seated.
	juniors: Record<number, number>
	pretenderRevolts: number
	interregnums: number
}

export interface MarriageTieReport {
	formed: number
	ended: number
	standing: number
	// Mean ties standing over the window's yearly samples.
	meanStanding: number
	// Share of marrying realm-years that hold at least one tie.
	tiedShare: number
	// Mean ties held per tied realm-year.
	tiesPerTiedRealm: number
}

export interface DynastyReport {
	realmYears: number
	// Realm-years in which the ruler's dynasty is also a bordering sovereign's.
	sharingRealmYears: number
	sharingShare: number
	dynasties: number
}

export interface UnionReport {
	formed: number
	ended: number
	merged: number
	juniorYears: number
	// Wars begun in the window to press a marriage partner's claim.
	claimWars: number
}

export interface RulersReport {
	heirPlans: HeirPlansReport
	succession: SuccessionReport
	marriageTies: MarriageTieReport
	dynasty: DynastyReport
	unions: UnionReport
}

export interface HeirDistribution {
	count: number
	mean: number | null
	p10: number | null
	p50: number | null
	p90: number | null
}

export interface HeirLeadReport {
	primary: HeirDistribution
	allChildren: HeirDistribution
	primaryBornBeforePlanShare: number | null
	heirBornBeforePlanShare: number | null
}

export interface HeirPlansReport {
	// Cumulative through the end of this reporting window.
	plansRolled: number
	fertilityRejectedSonShare: number | null
	plansCancelled: { unused: number; unreachable: number }
	retainedPlansPeak: number
	serializedPlanBytes: number
	heirAccessionAge: HeirDistribution
	planLeadYears: Record<"primary" | "seated" | "unseated", HeirLeadReport>
}
