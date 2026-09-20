import { uiPalette } from "@/ui/components/tokens"
import type {
	BrownDwarfClass,
	BrownDwarfGlow,
	BrownDwarfGlowInput,
} from "@/ui/genesis/renderer/types"

const GLOW_BY_CLASS: Record<BrownDwarfClass, BrownDwarfGlow> = {
	L: { color: uiPalette.brownDwarfL, haloOpacity: 0.22, lightIntensity: 0.65 },
	T: { color: uiPalette.brownDwarfT, haloOpacity: 0.14, lightIntensity: 0.38 },
	Y: { color: uiPalette.brownDwarfY, haloOpacity: 0.075, lightIntensity: 0.18 },
}

export function brownDwarfGlow(input: BrownDwarfGlowInput): BrownDwarfGlow {
	const classGlow = GLOW_BY_CLASS[input.spectralClass]
	const subtypeFade = 1 - 0.4 * Math.min(1, Math.max(0, input.subtype / 9))
	return {
		color: classGlow.color,
		haloOpacity: classGlow.haloOpacity * subtypeFade,
		lightIntensity: classGlow.lightIntensity * subtypeFade,
	}
}
