export interface ChannelBandParams {
	flowMonthly: Float32Array
	flowAnnual: Float32Array
	areaM2: Float64Array
	widthM: Float64Array
	pet: Float32Array
	rain: Float32Array
	dry: Uint8Array
	secondsPerYear: number
}

export interface ChannelBand {
	channelM3s: Float32Array
	valleyShare: Float32Array
	sustainedBand: Float32Array
}

export interface ValleyWidthParams {
	flowM3s: number
}
