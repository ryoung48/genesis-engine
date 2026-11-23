export function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback
}

export function readNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function readNumberInRange(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
): number {
	return Math.min(max, Math.max(min, readNumber(value, fallback)))
}
