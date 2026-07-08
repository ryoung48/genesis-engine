import { SEED_MAX } from "@/model/shared/planet-code"
import { seedStringToNumber } from "@/model/shared/rng"

export function formatSeedLabel(seed: number): string {
	return seed.toString(36)
}

export function normalizeSeedLabel(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
	return normalized || "seed"
}

export function resolveSeedLabel(value: string): number | null {
	const trimmed = value.trim()
	if (!trimmed) return null
	if (/^\d+$/.test(trimmed)) {
		const parsed = Number.parseInt(trimmed, 10)
		return Number.isInteger(parsed) && parsed >= 0 && parsed < SEED_MAX
			? parsed
			: null
	}
	const normalized = normalizeSeedLabel(trimmed)
	if (/^[a-z0-9]{1,6}$/.test(normalized)) {
		const parsed = Number.parseInt(normalized, 36)
		if (Number.isInteger(parsed) && parsed >= 0 && parsed < SEED_MAX) {
			return parsed
		}
	}
	return seedStringToNumber(normalized)
}

export function makeRandomSeedLabel(): string {
	return formatSeedLabel(Math.floor(Math.random() * SEED_MAX))
}
