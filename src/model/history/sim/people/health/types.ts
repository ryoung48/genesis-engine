export type HealthBand = "Good" | "Fair" | "Poor" | "Grave"

// Times in years; the band is read at `time`.
export interface BandParams {
	birth: number
	death: number
	time: number
}
