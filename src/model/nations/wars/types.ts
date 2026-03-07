export interface War {
	idx: number
	attacker: number
	defender: number
	startTime: number
	occupied: number[] // Province indices currently under occupation
	endTime?: number
	rebel?: boolean
}
