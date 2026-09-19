import type {
	OrbitClassification,
	OrbitZone,
} from "@/model/celestial/orbit-body/types"
import type { SpectralClass } from "@/model/celestial/star/types"
import type { CompanionStar, SystemBody } from "@/model/celestial/system/types"
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
// Real main-belt asteroids span roughly 2.1-3.3 AU around a ~2.77 AU center
// -- an inner-to-outer radial spread of about 0.44x its own orbit radius, far
// wider than a thin fixed-width ring. beltHalfWidth (overlay.ts) derives each
// belt's actual half-width from this ratio against its own orbitRadius, with
// BELT_WIDTH_MIN as a floor so a belt packed in close to its star doesn't
// collapse to an invisible sliver.
export const BELT_WIDTH_RATIO = 0.44
export const BELT_WIDTH_MIN = 0.12
// Real main-belt inclinations mostly fall within ~20deg of the ecliptic, so
// the belt's vertical (out-of-plane) thickness is real but much shallower
// than its radial spread -- this ratio is applied against beltHalfWidth
// rather than getting its own fixed jitter constant, so a wide belt also
// reads as a proportionally thicker toroidal swarm instead of a flat disc.
export const BELT_VERTICAL_RATIO = 0.35
// Fallbacks only for a body whose classification isn't in
// CLASSIFICATION_COLOR below (shouldn't happen in practice, since every
// classification is mapped) -- MAIN_WORLD_COLOR for the main world,
// ROCKY_SIBLING_COLOR for anything else.
export const MAIN_WORLD_COLOR = 0x3b82f6
export const ROCKY_SIBLING_COLOR = 0x9ca3af
export const ORBIT_LINE_COLOR_BY_ZONE: Record<CompanionStar["role"], number> = {
	epistellar: 0xfb923c,
	inner: 0xfacc15,
	outer: 0x7dd3fc,
	distant: 0x94a3b8,
}
// Solid-color fallback for a tectonic/vesperian body whose hydrosphereCode is
// 10-11 ("no continents" full ocean) -- deliberately close to Earth's ocean
// blue rather than that classification's usual land-tinted
// CLASSIFICATION_COLOR entry (tectonic's green, vesperian's gold), since
// there's no land left to tint. See pickGeneratedBodyTextures's doc (texture/
// index.ts) for why these bodies never get a texturePath at all.
export const FULL_OCEAN_COLOR = 0x1b3d6d
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
	// Protostar-system accreting protoplanets (World Builder's Handbook p.
	// 224-225) -- lava-world fallback tints for when the meltball texture
	// (see texture/index.ts's hydrosphereCode===12 check, which these always
	// satisfy) hasn't loaded yet, in ascending "size reads as more atmosphere
	// haze over the glow" order.
	"proto-dwarf": 0xff4500,
	"proto-terrestrial": 0xff6a1a,
	"proto-helian": 0xffa347,
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

/** Converts ORBIT_LINE_COLOR_BY_ZONE's Three.js hex numbers into CSS hex
 * strings for the wiki's Semi Major Axis swatch -- the same
 * epistellar/inner/outer/distant palette the 3D scene uses for zone-colored
 * orbit lines. A body with no rolled zone (e.g. an asteroid belt slot) shows
 * the "distant" fallback tint. */
export function orbitZoneSwatchColor(zone: OrbitZone | undefined): string {
	const hex = ORBIT_LINE_COLOR_BY_ZONE[zone ?? "distant"]
	return `#${hex.toString(16).padStart(6, "0")}`
}

export const GROUP_LABEL: Record<SystemBody["group"], string> = {
	"asteroid belt": "Asteroid Belt",
	dwarf: "Dwarf World",
	terrestrial: "Terrestrial Planet",
	helian: "Helian World",
	jovian: "Jovian Planet",
}

// Matches the spectral-class palette used by galaxy-gen's system map.
export const STAR_COLOR_BY_CLASS: Record<SpectralClass, string> = {
	O: "#7cc6ff",
	B: "#d8eeff",
	A: "#ffffff",
	F: "#fffcd3",
	G: "#fff772",
	K: "#ffc37f",
	M: "#ff9719",
	L: "#b43cff",
	T: "#8c37c8",
	Y: "#5e2a7a",
	D: "#e9f4ff",
	NS: "#8b5cff",
	BH: "#090909",
}

// Sphere tessellation tiers for planet meshes, selected per frame from a
// body's apparent size (see updateLevelOfDetail). The low tier is enough for
// a body a few pixels across but shows an obviously polygonal silhouette
// once the camera flies in, which is exactly when the higher tiers cost
// nothing -- only one or two bodies can fill the screen at a time. Each tier
// is a shared unit sphere reused by every body at that tier, so this also
// replaces the per-body geometry every mesh used to allocate.
export const BODY_LOD_SEGMENTS: readonly { width: number; height: number }[] = [
	{ width: 24, height: 18 },
	{ width: 48, height: 32 },
	{ width: 96, height: 64 },
]

// A body's projected radius as a fraction of the viewport's half-height, at
// or above which it moves up to the next tessellation tier. Indexed to
// BODY_LOD_SEGMENTS from tier 1 up (tier 0 is the floor and needs no
// threshold).
export const BODY_LOD_THRESHOLDS: readonly number[] = [0.05, 0.22]

// Golden angle — an irrational fraction of a full turn, so successive bodies
// land at well-spread-out starting angles instead of clustering.
export const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5))
