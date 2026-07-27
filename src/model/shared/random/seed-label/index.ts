import { RNG } from "@/model/shared/random/rng"
import { SEEDS } from "@/model/shared/random/seeds"

function formatSeedLabel(seed: number): string {
	return seed.toString(36)
}

function normalizeSeedLabel(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
	return normalized || "seed"
}

function resolveSeedLabel(value: string): number | null {
	const trimmed = value.trim()
	if (!trimmed) return null
	if (/^\d+$/.test(trimmed)) {
		const parsed = Number.parseInt(trimmed, 10)
		return Number.isInteger(parsed) && parsed >= 0 && parsed < SEEDS.seedMax
			? parsed
			: null
	}
	const normalized = normalizeSeedLabel(trimmed)
	if (/^[a-z0-9]{1,6}$/.test(normalized)) {
		const parsed = Number.parseInt(normalized, 36)
		if (Number.isInteger(parsed) && parsed >= 0 && parsed < SEEDS.seedMax) {
			return parsed
		}
	}
	return RNG.seedStringToNumber(normalized)
}

function makeRandomSeedLabel(): string {
	return formatSeedLabel(Math.floor(Math.random() * SEEDS.seedMax))
}

export const SEED_LABEL = {
	formatSeedLabel,
	normalizeSeedLabel,
	resolveSeedLabel,
	makeRandomSeedLabel,
}
