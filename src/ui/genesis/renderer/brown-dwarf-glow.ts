import * as THREE from "three"
import { uiPalette } from "@/ui/components/tokens"
import { STAR_GLOW_STRENGTH } from "@/ui/genesis/renderer/star-surface-material"
import type {
	BrownDwarfClass,
	BrownDwarfGlow,
	BrownDwarfGlowInput,
} from "@/ui/genesis/renderer/types"

const GLOW_BY_CLASS: Record<
	BrownDwarfClass,
	Pick<BrownDwarfGlow, "color" | "lightIntensity">
> = {
	L: { color: uiPalette.brownDwarfL, lightIntensity: 0.72 },
	T: { color: uiPalette.brownDwarfT, lightIntensity: 0.43 },
	Y: { color: uiPalette.brownDwarfY, lightIntensity: 0.25 },
}

export function brownDwarfGlow(input: BrownDwarfGlowInput): BrownDwarfGlow {
	const classGlow = GLOW_BY_CLASS[input.spectralClass]
	const subtypeFade = 1 - 0.4 * Math.min(1, Math.max(0, input.subtype / 9))
	const color = input.color ?? classGlow.color
	return {
		color,
		haloTint: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.7),
		haloOpacity: STAR_GLOW_STRENGTH,
		lightIntensity: classGlow.lightIntensity * subtypeFade,
	}
}
