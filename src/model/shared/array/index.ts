import type {
	GrowNumericArrayParams,
	NumericArray,
} from "@/model/shared/array/types"

function growNumeric<T extends NumericArray>({
	array,
	capacity,
}: GrowNumericArrayParams<T>): T {
	const ArrayType = array.constructor as new (length: number) => T
	const copy = new ArrayType(capacity)
	copy.set(array)
	return copy
}

export const ARRAY = { growNumeric }
