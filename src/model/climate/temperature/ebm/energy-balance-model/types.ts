import type { ENERGY_BALANCE_MODEL } from "@/model/climate/temperature/ebm/energy-balance-model"

export type SolvedEnergyBalanceModel = ReturnType<
	typeof ENERGY_BALANCE_MODEL.create
>

export interface StepTemperatureParams {
	tIdx: number
	dt: number
	lower: readonly number[]
	upper: readonly number[]
}

export interface RunModelParams {
	years: number
	dtDays: number
}
