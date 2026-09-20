import { describe, expect, it } from "vitest"
import { uiPalette } from "@/ui/components/tokens"
import { brownDwarfGlow } from "@/ui/genesis/renderer/brown-dwarf-glow"
import {
	buildCloudBandMaterial,
	swatchCloudBandPalette,
} from "@/ui/genesis/renderer/cloud-band-material"

function luminance(hex: string): number {
	const r = Number.parseInt(hex.slice(1, 3), 16) / 255
	const g = Number.parseInt(hex.slice(3, 5), 16) / 255
	const b = Number.parseInt(hex.slice(5, 7), 16) / 255
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe("brown dwarf material diagnostics", () => {
	it("prints palette contrast and bandMode per class", () => {
		for (const cls of ["L", "T", "Y"] as const) {
			const glow = brownDwarfGlow({ spectralClass: cls, subtype: 5 })
			const palette = swatchCloudBandPalette({
				hex: Number.parseInt(glow.color.slice(1), 16),
			})
			const hexes = [
				palette.top.getHexString(),
				palette.bot.getHexString(),
				palette.mid1.getHexString(),
				palette.mid2.getHexString(),
				palette.mid3.getHexString(),
				palette.bandWarm.getHexString(),
				palette.bandCream.getHexString(),
				palette.bandDark.getHexString(),
			]
			const lums = hexes.map((h) => luminance(`#${h}`))
			const spread = Math.max(...lums) - Math.min(...lums)
			console.log(
				`${cls}: glow=${glow.color} light=${glow.lightIntensity.toFixed(3)} halo=${glow.haloOpacity.toFixed(3)} paletteSpread=${spread.toFixed(3)} [${hexes.join(" ")}]`,
			)
			const material = buildCloudBandMaterial({
				seed: 505,
				style: `brown-dwarf-${cls.toLowerCase()}` as
					| "brown-dwarf-l"
					| "brown-dwarf-t"
					| "brown-dwarf-y",
				palette,
			})
			const shader = {
				uniforms: {} as Record<string, { value: unknown }>,
				vertexShader: "#include <common>\n#include <begin_vertex>",
				fragmentShader: "#include <common>\n#include <map_fragment>",
			}
			material.onBeforeCompile!(shader as never, undefined as never)
			console.log(
				`${cls}: bandMode=${String(shader.uniforms.giantBandMode?.value)} injected=${String(shader.fragmentShader.includes("giantBrownDwarfColor"))}`,
			)
			expect(shader.fragmentShader.includes("giantBrownDwarfColor")).toBe(true)
		}
		console.log(
			`tokens L=${uiPalette.brownDwarfL} T=${uiPalette.brownDwarfT} Y=${uiPalette.brownDwarfY}`,
		)
	})
})
