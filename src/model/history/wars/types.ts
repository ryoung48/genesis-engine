export interface War {
	idx: number
	attacker: number // Province index of attacking nation capital
	defender: number // Province index of defending nation capital
	startTime: number
	occupied: number[] // Province indices currently under occupation
	endTime?: number
	rebel?: boolean
}
