import type { OrbitClassification } from "@/model/celestial/orbit-body/types"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import type { SystemBody } from "@/model/celestial/system/types"
import { BODY_VISUAL_BASE_RADIUS } from "@/ui/genesis/shared/moon-visual-scale"

export const DEG2RAD = Math.PI / 180

export const TWO_PI = 2 * Math.PI
export const ORBIT_SEGMENTS = 256
export const PLANET_SCENE_RADIUS = BODY_VISUAL_BASE_RADIUS
export const MOON_SYSTEM_SCENE_MIN = 1.35
export const MOON_SYSTEM_SCENE_MAX = 2.55
export const MIN_MOON_VISUAL_RADIUS = 0.004
// Visual clearance between one body's outer edge and the next body's orbit,
// as a multiple of the (larger of the two) body's own radius — a real
// AU-based distance would either bunch everything near the star or spread it
// beyond any reasonable camera distance depending on spectral class.
export const ORBIT_GAP_STAR_RADII = 1.5
export const BELT_SCENE_RADIUS = 0.05
export const BELT_WIDTH = 0.12
// Fallbacks only for a body whose classification isn't in
// CLASSIFICATION_COLOR below (shouldn't happen in practice, since every
// classification is mapped) -- MAIN_WORLD_COLOR for the main world,
// ROCKY_SIBLING_COLOR for anything else.
export const MAIN_WORLD_COLOR = 0x3b82f6
export const ROCKY_SIBLING_COLOR = 0x9ca3af
// Ported from galaxy-gen's ORBIT_CLASSIFICATION[type].color.primary (orbits/
// classification.ts) -- used as the untextured solid-color fallback for any
// body (main world or sibling) whose classification has no generated art
// (see generate-system-bodies.ts's GENERATED_TEXTURE_FILES), instead of a
// single flat color. Applies to the main world too, so an Earth-like
// tectonic main world renders the same green a tectonic sibling would, not
// a fixed "this is home" blue regardless of classification. Never applies
// to a jovian in practice (jovians always get a texture -- either generated
// art or the Jupiter photo fallback just below -- so they never reach this
// branch), even though jovian is included below for completeness.
export const CLASSIFICATION_COLOR: Partial<
	Record<OrbitClassification, number>
> = {
	acheronian: 0x848484,
	arid: 0xdeb887,
	asphodelian: 0x778899,
	"asteroid belt": 0x575656,
	asteroid: 0x778899,
	chthonian: 0xa52a2a,
	"geo-cyclic": 0x782fe0,
	"geo-tidal": 0x4682b4,
	hebean: 0xbce02f,
	helian: 0xffa500,
	"jani-lithic": 0xd2b48c,
	jovian: 0xffdab9,
	meltball: 0xff625d,
	oceanic: 0x1e90ff,
	panthalassic: 0x4169e1,
	rockball: 0x8b7d7b,
	snowball: 0xadd8e6,
	stygian: 0x2f4f4f,
	tectonic: 0x7cfc00,
	telluric: 0x8b0000,
	vesperian: 0xdaa520,
}

/** Converts CLASSIFICATION_COLOR's Three.js hex numbers (e.g. 0x7cfc00) into
 * CSS hex strings for 2D UI (the Swatch primitive) -- null for an
 * unclassified body (e.g. an asteroid belt slot still being rolled) rather
 * than guessing. */
export function classificationSwatchColor(
	classification: string | undefined,
): string | null {
	const hex = classification
		? CLASSIFICATION_COLOR[classification as OrbitClassification]
		: undefined
	return hex === undefined ? null : `#${hex.toString(16).padStart(6, "0")}`
}

export const GROUP_LABEL: Record<SystemBody["group"], string> = {
	"asteroid belt": "Asteroid Belt",
	dwarf: "Dwarf World",
	terrestrial: "Terrestrial Planet",
	helian: "Helian World",
	jovian: "Jovian Planet",
}

// Matches the spectral-class palette used by galaxy-gen's system map.
export const STAR_COLOR_BY_CLASS: Record<MainSequenceClass, string> = {
	O: "#7cc6ff",
	B: "#d8eeff",
	A: "#ffffff",
	F: "#fffcd3",
	G: "#fff772",
	K: "#ffc37f",
	M: "#ff9719",
}

// Golden angle — an irrational fraction of a full turn, so successive bodies
// land at well-spread-out starting angles instead of clustering.
export const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5))
