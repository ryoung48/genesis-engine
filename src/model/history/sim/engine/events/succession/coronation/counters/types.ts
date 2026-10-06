export type CoronationQuality =
	| "uncrowned"
	| "humble"
	| "customary"
	| "lavish"
	| "magnificent"

export type CoronationKind = "accession" | "elevation"

// The grids are flat kind × rank × quality; `founded` and `raised` use the
// founded title's tier as the rank, the others the rank the fee was priced at.
export interface CoronationCounters {
	held: Float64Array
	ducats: Float64Array
	memories: Float64Array
	founded: Float64Array
	raised: Float64Array
	// Accessions owed a coronation at the end of a minority regency.
	deferred: number
	// Deferred coronations held at coming of age; also counted in `held`.
	majority: number
	// Accessions never crowned because the ruler was incapable.
	incapable: number
	// Realms flagged composite at the end of each yearly pass.
	compositeRealmYears: number
	// Rebellion checks made under the composite penalty, and those accepted.
	compositeEvaluations: number
	compositeRebellions: number
	elevateMs: number
}

export interface CoronationCellParams {
	kind: CoronationKind
	rank: number
	quality: CoronationQuality
}
