import type { SpectralClass } from "@/model/celestial/star/types"
import { uiPalette } from "@/ui/components/tokens"

export const SPECTRAL_CLASS_COLORS: Record<SpectralClass, string> = {
	O: "#7cc6ff",
	B: "#d8eeff",
	A: "#ffffff",
	F: "#fffcd3",
	G: "#fff772",
	K: "#ffc37f",
	M: "#ff9719",
	L: uiPalette.brownDwarfL,
	T: uiPalette.brownDwarfT,
	Y: uiPalette.brownDwarfY,
	D: "#e9f4ff",
	NS: uiPalette.neutronStarGlow,
	BH: "#000000",
}
