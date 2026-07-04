import { createStringRng } from "@/model/shared/rng"

function normalizeName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z ]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function compressWord(word: string, ratio: number, seedSalt: string): string {
	const target = Math.max(1, Math.round(word.length * ratio))
	if (target >= word.length) return word

	const remainingIndices = Array.from(
		{ length: word.length - 1 },
		(_, index) => index + 1,
	)
	const selected = createStringRng(`${seedSalt}:${word}`)
		.sample(remainingIndices, Math.max(0, target - 1))
		.sort((a, b) => a - b)

	return word[0] + selected.map((index) => word[index]).join("")
}

export function compressName(
	name: string,
	ratio: number,
	seedSalt: string,
): string {
	const normalized = normalizeName(name)
	if (!normalized) return ""
	return normalized
		.split(" ")
		.filter(Boolean)
		.map((word) => compressWord(word, ratio, seedSalt))
		.join(" ")
}
