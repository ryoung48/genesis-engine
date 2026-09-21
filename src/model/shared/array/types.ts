export type NumericArray =
	| Int16Array
	| Int32Array
	| Uint8Array
	| Float32Array
	| Float64Array

export interface GrowNumericArrayParams<T extends NumericArray> {
	array: T
	capacity: number
}
