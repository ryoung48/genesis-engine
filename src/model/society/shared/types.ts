export interface HslToRgbParams {
	h: number
	s: number
	l: number
}

export interface GeneratePartitionColorsParams {
	count: number
	rng: { random(): number }
}

export interface RgbToHslParams {
	r: number
	g: number
	b: number
}
