export const KOPPEN_CLASSES: { code: string; name: string }[]

// [JUSTIFICATION] o and stride are optional because the vendored JS defaults them to 0 and 1.
export function classifyCell(
	T: ArrayLike<number>,
	P: ArrayLike<number>,
	o?: number,
	stride?: number,
): number
