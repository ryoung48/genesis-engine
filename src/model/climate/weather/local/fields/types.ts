export interface WeatherFieldParams {
	seed: number
	channel: string
	xyz: [number, number, number]
	radiusKm: number
	seconds: number
	driftMs: [number, number]
}
