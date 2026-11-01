export interface IdenticonConfigParams {
	name: string
	forcedHue: number | null
}

export interface IdenticonColorParams {
	hue: number
	saturation: number
	lightness: number
}

export interface IdenticonTone {
	roll: number
	backSaturation: number
	backLightness: number
	lightness: readonly [number, number]
	grayscaleLightness: readonly [number, number]
	saturation: number
}

export interface IdenticonStyle {
	hue: number
	backColor: string
	lightness: readonly [number, number]
	grayscaleLightness: readonly [number, number]
	saturation: number
}
