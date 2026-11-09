export const PARAMS: Record<string, number>
export const PARAMS_DEFAULTS: Readonly<Record<string, number>>
export const PARAM_PRIORS: Readonly<
	Record<string, { value: number; min: number; max: number; source: string }>
>
export function setParams(params: Record<string, number>): void
export function resetParams(): void
