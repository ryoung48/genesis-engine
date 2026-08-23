import type { OrbitClassification } from "@/model/celestial/orbit-body/types"
import type { Zone } from "@/model/celestial/planet/types"
import { RNG } from "@/model/shared/random/rng"

// Art-set folder names under public/textures/celestial/generated/ -- mostly
// one-to-one with OrbitClassification (jovian, rockball, ...), but oasis/
// savanna/terrestrial/oceanic are climate/hydrosphere-driven art pools shared
// across several classifications (see pickGeneratedBodyTextures below), not
// classifications themselves.
type GeneratedArtSet =
	| OrbitClassification
	| "oasis"
	| "oasis-cold"
	| "savanna"
	| "terrestrial"
	| "archepligo"
	| "vesperian-arid"
	| "vesperian-land"
	| "vesperian-continental"
	| "vesperian-archipelago"
	| "vesperian-water-world"
	| "jovian-hot"
	| "hebean-arid"
	| "hebean-water"
	| "geo-tidal-arid"
	| "geo-tidal-water"
	| "geo-cyclic-arid"
	| "geo-cyclic-water"

// Procedurally generated body textures (public/textures/celestial/generated/<set>/...)
// -- only classifications/art-sets with real art get a texturePath; anything
// else is left unset and falls back to the renderer's plain "blue"
// solid-color material, same as before this existed. Never applies to the
// real Sol seed, which keeps its own authored textures.
const GENERATED_TEXTURE_FILES: Partial<Record<GeneratedArtSet, string[]>> = {
	jovian: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png"],
	rockball: ["1.png", "3.png", "4.png", "5.png", "6.png", "7.png", "8.png"],
	asteroid: ["1.png"],
	telluric: ["1.png", "2.png", "3.png", "4.png"],
	meltball: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png"],
	snowball: [
		"1.png",
		"2.png",
		"3.png",
		"4.png",
		"5.png",
		"6.png",
		"7.png",
		"8.png",
		"9.png",
	],
	arid: [
		"1.png",
		"2.png",
		"3.png",
		"4.png",
		"5.png",
		"6.png",
		"7.png",
		"8.png",
		"9.png",
		"10.png",
	],
	savanna: ["1.png", "2.png", "3.png", "4.png", "5.png"],
	terrestrial: ["1.png", "2.png", "3.png", "4.png", "5.png"],
	// Hydrosphere-driven art pool (formerly the "oceanic" folder name, renamed
	// to disambiguate from the "oceanic" classification below).
	archepligo: ["1.png", "2.png", "3.png", "4.png", "5.png"],
	// Single-image art sets -- oceanic gets its own dedicated realistic
	// full-ocean render (panthalassic no longer does -- see overlay.ts's
	// procedural cloud-band shader, used for every panthalassic body
	// instead); chthonian, acheronian, and stygian get their own dedicated
	// art; oasis is also curated images.
	oceanic: ["1.png"],
	chthonian: ["1.png"],
	acheronian: ["1.png"],
	stygian: ["1.png"],
	oasis: ["1.png", "2.png"],
	asphodelian: ["1.png"],
	// Cold-variant art for oasis-qualifying bodies that are cold or frozen --
	// overrides the usual frozen -> snowball branch for those (see
	// pickGeneratedBodyTextures below).
	"oasis-cold": ["1.png"],
	// vesperian and jani-lithic are the two solar-tide-locked classifications
	// (see body/index.ts's tide-lock branch) -- their art is drawn with the
	// substellar (dayside) point at the image's horizontal center, matching
	// the fixed dayside-facing rotation the renderer already applies to every
	// solar-locked body (see overlay.ts's lockedSubstellarLon handling).
	"jani-lithic": ["1.png"],
	"vesperian-arid": ["1.png"],
	"vesperian-land": ["1.png"],
	"vesperian-continental": ["1.png"],
	"vesperian-archipelago": ["1.png"],
	"vesperian-water-world": ["1.png"],
	// Epistellar-zone ("hot Jupiter") variant -- see the zone check in
	// pickGeneratedBodyTextures below.
	"jovian-hot": ["1.png", "2.png"],
	// hebean/geo-tidal/geo-cyclic each have their own hydrosphereCode-keyed
	// art (hydro 0 -> arid, hydro > 0 -> water), no frozen/rockball fallback.
	"hebean-arid": ["1.png"],
	"hebean-water": ["1.png"],
	"geo-tidal-arid": ["1.png"],
	"geo-tidal-water": ["1.png"],
	"geo-cyclic-arid": ["1.png"],
	"geo-cyclic-water": ["1.png"],
}

// Families with variant art live below a shared parent folder rather than as
// sibling generated art-set folders. Unlisted art sets retain their direct
// generated/<set> folder.
const GENERATED_ART_SET_FOLDERS: Partial<Record<GeneratedArtSet, string>> = {
	asteroid: "asteroids/rocky",
	"oasis-cold": "oasis/cold",
	"vesperian-arid": "vesperian/arid",
	"vesperian-land": "vesperian/land",
	"vesperian-continental": "vesperian/continental",
	"vesperian-archipelago": "vesperian/archipelago",
	"vesperian-water-world": "vesperian/water-world",
	"jovian-hot": "jovian/hot",
	"hebean-arid": "hebean/arid",
	"hebean-water": "hebean/water",
	"geo-tidal-arid": "geo-tidal/arid",
	"geo-tidal-water": "geo-tidal/water",
	"geo-cyclic-arid": "geo-cyclic/arid",
	"geo-cyclic-water": "geo-cyclic/water",
}

// Shared cloud-layer pool (public/textures/celestial/generated/clouds/...),
// pooled from savanna+terrestrial+oceanic's cloud sets -- interchangeable,
// not keyed by classification like GENERATED_TEXTURE_FILES above.
const CLOUDS_FILES = Array.from({ length: 15 }, (_, i) => `${i + 1}.png`)

function pickGeneratedTexturePath({
	rng,
	classification,
}: {
	rng: ReturnType<typeof RNG.createRng>
	classification: GeneratedArtSet
}): string | undefined {
	const files = GENERATED_TEXTURE_FILES[classification]
	if (!files || files.length === 0) return undefined
	const file = rng.choice(files)
	const folder = GENERATED_ART_SET_FOLDERS[classification] ?? classification
	return `/textures/celestial/generated/${folder}/${file}`
}

function pickGeneratedCloudsTexturePath({
	rng,
}: {
	rng: ReturnType<typeof RNG.createRng>
}): string {
	return `/textures/celestial/generated/clouds/${rng.choice(CLOUDS_FILES)}`
}

export type ClimateBand = "frozen" | "cold" | "temperate" | "hot" | "burning"

/** Climate+hydrosphere-aware texture/clouds selection for the classifications
 * that need more than a single flat art pool (see pickGeneratedTexturePath
 * above for the rest, which are untouched). Falls through to
 * pickGeneratedTexturePath for any classification not covered by this
 * mapping. */
function pickGeneratedBodyTextures({
	rng,
	classification,
	hydrosphereCode,
	climateBand,
	zone,
}: {
	rng: ReturnType<typeof RNG.createRng>
	classification: OrbitClassification
	hydrosphereCode: number
	climateBand: ClimateBand
	zone?: Zone
}): { texturePath?: string; cloudsTexturePath?: string } {
	const frozen = climateBand === "frozen"
	const pick = (cls: GeneratedArtSet) =>
		pickGeneratedTexturePath({ rng, classification: cls })
	const withClouds = (texturePath: string | undefined) => ({
		texturePath,
		cloudsTexturePath: pickGeneratedCloudsTexturePath({ rng }),
	})

	// hydrosphereCode 12 ("intense volcanism/molten surface") always gets the
	// meltball art regardless of classification -- previously only reachable
	// via the "meltball" classification itself (see dice-table's fixed
	// hydrosphereCode: 12), but the proto/primordial youth override
	// (planet/environment/index.ts's applyProtoHydrosphereSuppression) can now
	// force any non-asteroid-belt, non-jovian classification down to code 12
	// too, so this check runs before the classification switch below.
	// telluric is excluded -- it keeps its own art even when molten. helian is
	// also excluded -- its own case below picks between meltball and
	// helian-hot depending on atmospherePressureBar.
	if (
		hydrosphereCode === 12 &&
		classification !== "telluric" &&
		classification !== "helian"
	) {
		return { texturePath: pick("meltball") }
	}

	switch (classification) {
		case "tectonic": {
			// Oasis-qualifying (hydro <= 1) cold/frozen bodies get the dedicated
			// cold-oasis art instead of falling into the general frozen ->
			// snowball branch below.
			if (hydrosphereCode <= 1) {
				if (frozen || climateBand === "cold")
					return { texturePath: pick("oasis-cold") }
				return { texturePath: pick("oasis") }
			}
			if (frozen) return { texturePath: pick("snowball") }
			if (hydrosphereCode <= 4) return withClouds(pick("savanna"))
			if (hydrosphereCode <= 7) return withClouds(pick("terrestrial"))
			if (hydrosphereCode <= 9) return withClouds(pick("archepligo"))
			// hydrosphereCode 10-11: no texture image -- solid ocean-blue fallback
			// (see CLASSIFICATION_COLOR/overlay.ts), but still gets clouds.
			return withClouds(undefined)
		}
		// Solar-locked -- dedicated dayside-centered art keyed purely on
		// hydrosphereCode, no frozen/snowball override (the artist already
		// depicts the appropriate climate per bucket). No clouds: they'd
		// obscure the dayside-centered art the substellar-lock rotation is
		// built around (see overlay.ts's solarLockedSpinAngle).
		case "vesperian": {
			if (hydrosphereCode <= 1) return { texturePath: pick("vesperian-arid") }
			if (hydrosphereCode <= 4) return { texturePath: pick("vesperian-land") }
			if (hydrosphereCode <= 7)
				return { texturePath: pick("vesperian-continental") }
			if (hydrosphereCode <= 9)
				return { texturePath: pick("vesperian-archipelago") }
			return { texturePath: pick("vesperian-water-world") }
		}
		// Solar-locked, same dayside-centered art convention as vesperian --
		// hydrosphereCode is always 0 (see dice-table's "jani-lithic" case), so
		// a single dedicated image covers every jani-lithic body.
		case "jani-lithic":
			return { texturePath: pick("jani-lithic") }
		// hydrosphereCode is always 1-3 here (see dice-table's "arid" case),
		// always oasis-qualifying -- cold/frozen -> cold-oasis art (overrides
		// the usual frozen -> snowball), temperate/hot -> oasis, burning -> arid.
		case "arid": {
			if (frozen || climateBand === "cold")
				return { texturePath: pick("oasis-cold") }
			if (climateBand === "burning") return { texturePath: pick("arid") }
			return { texturePath: pick("oasis") }
		}
		// No texture generated -- overlay.ts's buildSolarSystemOverlay renders
		// every "helian"-classification body (regardless of temperature,
		// atmosphere subtype, or hydrosphere -- molten included) with its own
		// procedural fbm cloud-band shader instead (see
		// buildAtmosphericCloudBandMaterial/helianCloudPalette), which ignores
		// texturePath entirely. Generating and storing a path here that's
		// permanently unread is just dead weight.
		case "helian":
			return {}
		case "geo-cyclic":
			return {
				texturePath: pick(
					hydrosphereCode > 0 ? "geo-cyclic-water" : "geo-cyclic-arid",
				),
			}
		case "geo-tidal":
			return {
				texturePath: pick(
					hydrosphereCode > 0 ? "geo-tidal-water" : "geo-tidal-arid",
				),
			}
		case "hebean":
			return {
				texturePath: pick(
					hydrosphereCode === 0 ? "hebean-arid" : "hebean-water",
				),
			}
		case "stygian":
			return { texturePath: pick("stygian") }
		case "asphodelian":
			return { texturePath: pick("asphodelian") }
		case "acheronian":
			return { texturePath: pick("acheronian") }
		case "chthonian":
			return { texturePath: pick("chthonian") }
		// No texture generated -- same reasoning as "helian" above: overlay.ts
		// renders every panthalassic body with the procedural cloud-band
		// shader (deep blue, or the shared icy palette when frozen) instead.
		case "panthalassic":
			return {}
		case "oceanic":
			return { texturePath: frozen ? pick("snowball") : pick("oceanic") }
		case "jovian":
			if (zone === "epistellar") return { texturePath: pick("jovian-hot") }
			return { texturePath: pick("jovian") }
		default:
			return { texturePath: pick(classification) }
	}
}

export const TEXTURE = {
	pickGeneratedTexturePath,
	pickGeneratedBodyTextures,
}
