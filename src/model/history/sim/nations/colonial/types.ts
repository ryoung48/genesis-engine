export interface AssignColonialRelationsParams {
	nationCount: number
	nationGovType: Uint8Array
	nationColonizer: Int32Array
	assignment: Int32Array
	seeds: number[]
	size: Int32Array
	colonialFraction: number
	waterAccess: Uint8Array
	habitability: Float32Array
	provinceSeeds: Int32Array
	r_xyz: Float32Array
	sizeWeight: number
	/** Already-scaled nation spread limit (rad) — used as minimum colonial distance */
	maxSpreadRad: number
}
