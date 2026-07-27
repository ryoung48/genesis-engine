import { RNG } from "@/model/shared/random/rng"
import type {
	CompressNameParams,
	CompressWordParams,
} from "@/model/society/script/compress/types"

function normalizeName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z ]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function compressWord({ word, ratio, seedSalt }: CompressWordParams): string {
	const target = Math.max(1, Math.round(word.length * ratio))
	if (target >= word.length) return word

	const remainingIndices = Array.from(
		{ length: word.length - 1 },
		(_, index) => index + 1,
	)
	const selected = RNG.createStringRng({ seed: `${seedSalt}:${word}` })
		.sample(remainingIndices, Math.max(0, target - 1))
		.sort((a, b) => a - b)

	return word[0] + selected.map((index) => word[index]).join("")
}

function compressName({ name, ratio, seedSalt }: CompressNameParams): string {
	const normalized = normalizeName(name)
	if (!normalized) return ""
	return normalized
		.split(" ")
		.filter(Boolean)
		.map((word) => compressWord({ word, ratio, seedSalt }))
		.join(" ")
}

export const COMPRESS = {
	compressName,
}
