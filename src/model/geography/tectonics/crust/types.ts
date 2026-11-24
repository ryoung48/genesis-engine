export type OrogenyKind =
	| "none"
	| "andean"
	| "laramide"
	| "ural"
	| "himalayan"
	| "arc"
	| "rift"
	| "transpression"
	| "intraplate"

export interface CrustRaster {
	numCells: number
	plate: Int32Array
	type: Uint8Array
	flags: Uint8Array
	formedAt: Float32Array
	terrane: Int16Array
	oroType: Uint8Array
	oroWork: Float32Array
	oroStart: Float32Array
	oroLast: Float32Array
	thickKm: Float32Array
	beltU: Float32Array
	beltReach: Float32Array
	beltAt: Float32Array
	beltSide: Uint8Array
	beltShear: Int8Array
	prevType: Uint8Array
	prevLast: Float32Array
	prevU: Float32Array
	prevReach: Float32Array
	prevSide: Uint8Array
	prevShear: Int8Array
	rootKm: Float32Array
	upliftKm: Float32Array
	baseKm: Float32Array
	rugged: Float32Array
	prevRugged: Float32Array
	volcType: Uint8Array
	volcAt: Float32Array
	volcKm: Float32Array
	volcSource: Uint16Array
	volcWornKm: Float32Array
	geoFlags: Uint8Array
	coverKm: Float32Array
	coverMaxKm: Float32Array
	coverMaxAt: Float32Array
	coverCarb: Float32Array
	coverSalt: Float32Array
	coverCoal: Float32Array
	coverOrganic: Float32Array
	exhumKm: Float32Array
	unroofKm: Float32Array
	floodMyr: Float32Array
	floodLast: Float32Array
	arcMyr: Float32Array
	riftAt: Float32Array
	shelfSea: Uint8Array
}

export interface RecordOrogenyParams {
	crust: CrustRaster
	cell: number
	oroType: number
	workKm: number
	time: number
	quietMyr: number
}

export interface ThickenCoverParams {
	crust: CrustRaster
	cell: number
	thickenedKm: number
	time: number
	crustKm: number
}
