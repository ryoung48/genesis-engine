import type { createRng } from "../../../../shared/rng"
import type { OrbitClassification } from "../../../orbit-body/types"

// Procedurally generated body textures (public/generated/<classification>/...)
// -- only classifications with real art get a texturePath; anything else
// (tectonic, oceanic, panthalassic, helian, ...) is left unset and falls back
// to the renderer's plain "blue" solid-color material, same as before this
// existed. Never applies to the real Sol seed, which keeps its own authored
// textures.
const GENERATED_TEXTURE_FILES: Partial<Record<OrbitClassification, string[]>> =
	{
		jovian: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png"],
		rockball: ["1.png", "2.png", "3.png", "4.png", "5.png"],
		telluric: ["1.png", "2.png", "3.png", "4.png", "5.png"],
		meltball: ["1.png", "2.png", "3.png", "4.png", "5.png"],
		snowball: ["1.png", "2.png", "3.png", "4.png", "5.png"],
		arid: [
			"Dry-EQUIRECTANGULAR-1-1024x512.png",
			"Dry-EQUIRECTANGULAR-2-1024x512.png",
			"Dry-EQUIRECTANGULAR-3-1024x512.png",
			"Dry-EQUIRECTANGULAR-4-1024x512.png",
			"Dry-EQUIRECTANGULAR-5-1024x512.png",
			"Martian-EQUIRECTANGULAR-1-1024x512.png",
			"Martian-EQUIRECTANGULAR-2-1024x512.png",
			"Martian-EQUIRECTANGULAR-3-1024x512.png",
			"Martian-EQUIRECTANGULAR-4-1024x512.png",
			"Martian-EQUIRECTANGULAR-5-1024x512.png",
		],
	}

export function pickGeneratedTexturePath({
	rng,
	classification,
}: {
	rng: ReturnType<typeof createRng>
	classification: OrbitClassification
}): string | undefined {
	const files = GENERATED_TEXTURE_FILES[classification]
	if (!files || files.length === 0) return undefined
	const file = rng.choice(files)
	return `/generated/${classification}/${file}`
}
