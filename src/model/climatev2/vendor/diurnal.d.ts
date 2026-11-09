export interface DiurnalRanges {
	land: Float32Array
	sea: Float32Array
}
export const DIURNAL_PARAMS: Record<string, number>
export const DIURNAL_PRIORS: Readonly<
	Record<string, { value: number; min: number; max: number; source: string }>
>
