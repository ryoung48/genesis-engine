const MAX_VOLCANISM = 10
const LEGACY_VOLCANISM_MAX = 2

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

function smoothstep01(value: number): number {
	const t = clamp(value, 0, 1)
	return t * t * (3 - 2 * t)
}

export function clampVolcanism(value?: number, fallback = 1): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback
	return clamp(value, 0, MAX_VOLCANISM)
}

export function getLegacyVolcanismEquivalent(volcanism: number): number {
	return clamp(volcanism, 0, LEGACY_VOLCANISM_MAX) / LEGACY_VOLCANISM_MAX
}

export function getVolcanismOverdrive(volcanism: number): number {
	if (volcanism <= LEGACY_VOLCANISM_MAX) return 0
	return smoothstep01(
		(volcanism - LEGACY_VOLCANISM_MAX) / (MAX_VOLCANISM - LEGACY_VOLCANISM_MAX),
	)
}
