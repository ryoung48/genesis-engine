// Re-export all model-layer star types and functions

import type { SpectralClass } from "@/model/celestial/star/types"

// O-M colors match galaxy-gen's spectralAttributes; L/T/Y/D/NS/BH colors are
// ported directly from galaxy-gen's stars/generation.ts spectralAttributes
// table (BH intentionally renders black, same as the source).
export const SPECTRAL_CLASS_COLORS: Record<SpectralClass, string> = {
	O: "#7cc6ff",
	B: "#d8eeff",
	A: "#ffffff",
	F: "#fffcd3",
	G: "#fff772",
	K: "#ffc37f",
	M: "#ff9719",
	L: "#e06f67",
	T: "#963f3f",
	Y: "#82779b",
	D: "#b2bdff",
	NS: "#002aff",
	BH: "#000000",
}
