import type { AfricanPaintParams } from "@/ui/heraldry/simple/african/types"

const KENTE_BANDS = 7
const KENTE_BLOCK = 0.25
const KENTE_THREAD = 0.28

function paint({ ctx, design }: AfricanPaintParams) {
	switch (design.pattern) {
		case "kente-bands": {
			const band = 1 / KENTE_BANDS
			for (let index = 0; index < KENTE_BANDS; index++) {
				const top = index * band
				if (index % 2 === 1) {
					ctx.fillStyle = design.colors[1]
					ctx.fillRect(
						0,
						top + (band * (1 - KENTE_THREAD)) / 2,
						1,
						band * KENTE_THREAD,
					)
					continue
				}
				const shift = (index / 2) % 2 === 0 ? 0 : KENTE_BLOCK / 2
				for (let block = -1; block * KENTE_BLOCK < 1; block++) {
					ctx.fillStyle = design.colors[block % 2 === 0 ? 1 : 2]
					ctx.fillRect(shift + block * KENTE_BLOCK, top, KENTE_BLOCK, band)
				}
			}
			break
		}
	}
}

export const AFRICAN_HERALDRY = { paint }
