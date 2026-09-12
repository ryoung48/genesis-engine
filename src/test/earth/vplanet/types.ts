export interface VplanetReference {
	revision: string
	epoch: string
	latitudeDegrees: number[]
	forcingDay: number[]
	insolation: number[][]
	temperature: number[][]
	iceMassBalance: number[][]
}
