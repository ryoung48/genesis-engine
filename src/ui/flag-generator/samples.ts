import type { FlagBatchParams, FlagPreview } from "@/ui/flag-generator/types"
import { FLAG_GENERATOR } from "@/ui/heraldry/simple"

const BATCH_SIZE = 24
const PREVIEW_WIDTH = 256

export function createFlagBatch({
	seed,
	pattern,
	hue,
}: FlagBatchParams): FlagPreview[] {
	const degrees = FLAG_GENERATOR.hues.find(
		(entry) => entry.value === hue,
	)!.degrees
	return Array.from({ length: BATCH_SIZE }, (_, index) => {
		const sampleSeed = `${seed}:${index + 1}`
		const design = FLAG_GENERATOR.sample({
			seed: sampleSeed,
			pattern,
			hue: degrees,
		})
		const canvas = FLAG_GENERATOR.render({ design, width: PREVIEW_WIDTH })
		return {
			seed: sampleSeed,
			pattern: design.pattern,
			label: FLAG_GENERATOR.patterns.find(
				(entry) => entry.value === design.pattern,
			)!.label,
			imageUrl: canvas?.toDataURL("image/png") ?? null,
		}
	})
}
