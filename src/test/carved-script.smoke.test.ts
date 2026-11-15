import { expect, it } from "vitest"
import { SCRIPT } from "@/model/society/script"
import type {
	RuneData,
	RuneMotif,
} from "@/model/society/script/runegen/rune/types"

function hasSolidBlock({ bitmap, width, height }: RuneData): boolean {
	return bitmap.some(
		(row, y) =>
			y + 3 <= height &&
			row.some(
				(_, x) =>
					x + 3 <= width &&
					bitmap
						.slice(y, y + 3)
						.every((band) => band.slice(x, x + 3).every(Boolean)),
			),
	)
}

const cases: { languageSeed: number; motif: RuneMotif }[] = [
	{ languageSeed: 14963991, motif: "none" },
	{ languageSeed: 4, motif: "stave" },
]

it.each(
	cases,
)("keeps open space in Carved glyphs for seed $languageSeed and motif $motif", ({
	languageSeed,
	motif,
}) => {
	const { glyphs } = SCRIPT.spawn({
		languageSeed,
		generatorOptions: {
			seedTemplate: "carved",
			symmetryBias: "symmetric",
			motif,
		},
	})

	expect(Object.keys(glyphs)).toHaveLength(26)
	expect(
		Object.entries(glyphs)
			.filter(([, rune]) => hasSolidBlock(rune))
			.map(([char]) => char),
	).toEqual([])
})
