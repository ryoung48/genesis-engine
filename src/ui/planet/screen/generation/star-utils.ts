// Re-export all model-layer star types and functions

import type { MainSequenceClass } from "@/model/celestial/star/star-types"

export const SPECTRAL_CLASS_COLORS: Record<MainSequenceClass, string> = {
	O: "#7cc6ff",
	B: "#d8eeff",
	A: "#ffffff",
	F: "#fffcd3",
	G: "#fff772",
	K: "#ffc37f",
	M: "#ff9719",
}
