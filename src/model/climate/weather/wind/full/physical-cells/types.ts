export type HeldHouHadleyWidthInput = {
	omega: number
	planetRadiusM: number
	deltaThetaK: number
	theta0K: number
}

export type RossbyEddyWidthInput = {
	omega: number
	latDeg: number
	planetRadiusM: number
}

export type RhinesEddyWidthInput = {
	omega: number
	latDeg: number
	planetRadiusM: number
	uRmsMs: number
}

export type SmoothLongitudeInput = {
	values: Float32Array
	halfWindowBins: number
}

export type TropopauseHeightInput = {
	latDeg: number
}
