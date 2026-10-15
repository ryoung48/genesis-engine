export type ProvinceStatusName =
	| "uninhabited"
	| "stateless"
	| "state"
	| "desolate"

export interface StatusNameParams {
	code: number
}

export interface InitialStatusParams {
	desolate: Uint8Array
	sovereign: Int32Array
	// [JUSTIFICATION] Earth imports and eras without migration have no settlement field.
	migrationWave: Float32Array | undefined
	// [JUSTIFICATION] Present exactly when migrationWave is.
	settlementWave: number | undefined
}
