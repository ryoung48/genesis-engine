import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	OrbitClassification,
	OrbitZone,
} from "@/model/celestial/orbit-body/types"
import type { SpectralClass } from "@/model/celestial/star/types"
import type { CompanionStar, SystemBody } from "@/model/celestial/system/types"
export const DEG2RAD = Math.PI / 180

export const TWO_PI = 2 * Math.PI
export const KM_PER_AU = ORBIT_BODY.astronomicalUnitM / 1000

// --- System layout: true scale ---
// Every distance and every body radius is drawn at the same units-per-AU, so
// sizes and orbits keep their real proportions. The factor puts the system's
// farthest apoapsis, belt edge or companion star on LAYOUT_OUTER_RADIUS.
export const LAYOUT_OUTER_RADIUS = 100
// The generator keeps every orbit outside its star's real radius, so a star is
// drawn true size; this only stops it (a black hole's disk bounds reach twice
// its drawn radius) from covering the innermost periapsis.
export const STAR_MAX_INNER_PERIAPSIS_FRACTION = 1
// True size makes a white dwarf, neutron star or black hole subpixel, so a
// star is never drawn smaller than this fraction of a Sun-sized star at the
// system's own scale (a fixed size would swamp small stars in a large system).
// 0.1 R_sun is about the smallest a hydrogen-burning star gets, so only
// compact remnants (a white dwarf is ~0.01 R_sun) are ever raised to it; their
// flare keeps them findable.
export const MIN_STAR_RADIUS_SUN_FRACTION = 0.1
// Three.js windows a cutoff point light by (1 - (d/cutoff)^4)^2, so a body at
// the cutoff is dark and one at 0.4 of it keeps 95%. In a multi-star system
// the light is cut off at this multiple of the outer orbit edge, so every
// orbit stays lit at 95% or better while the far sibling's bodies still fall
// outside the window.
export const STAR_LIGHT_CUTOFF_OUTER_EDGE_FACTOR = 2.5
// --- Readable layout: as close to true scale as each system allows ---
// Orbits are laid out by their gap above the star's true surface, raised to
// a per-system power p = min(1, ln(MAX_ORBIT_SPREAD) / ln(outer / inner)):
// a compact system stays linear, a spread-out one is compressed just enough.
// 120 puts Sol (Mercury 0.39 AU to Eris 68 AU, a ~175x spread) at p ~ 0.93,
// drawing Neptune at ~23x Earth's distance against the true 30x -- closer to
// real than the ~18x of Sangil Lee's solar system simulator (sangillee.com,
// assets/solar/js/solar.min.js), our readability reference.
export const MAX_ORBIT_SPREAD = 120
// Floor on an orbit's gap above the star's surface, below the closest known
// exoplanet orbits (~0.006 AU), so the power law never sees zero.
export const MIN_ORBIT_GAP_AU = 0.001
// A Sun-sized star's drawn radius: ~1.2% of the outer edge, the reference
// simulator's Sun-to-Neptune-orbit ratio (1 : ~73).
export const SUN_DRAWN_RADIUS = 1.2
// Star radius = SUN_DRAWN_RADIUS * (1 + 0.5 * log10(R / R_sun)): 0.1 R_sun
// -> 0.5, 100 R_sun -> 2, 1000 R_sun -> 2.5. Floored at 0.25 so white
// dwarfs, neutron stars and black holes stay visible.
export const STAR_LOG_SLOPE = 0.5
// Orbits are drawn from the star's centre (a surface offset would inflate
// every inner distance and flatten the spacing), so a star is capped at half
// its innermost drawn periapsis: a giant shrinks instead of covering its
// orbits, and nothing ever sits inside the star.
export const READABLE_STAR_MAX_INNER_PERIAPSIS_FRACTION = 0.5
export const MIN_STAR_SIZE = 0.25
// Body size before fitting: tanh(radius_km / 1e5) from the reference
// simulator, linear for rocky worlds and saturating for giants (Earth 0.064,
// Jupiter 0.60), floored so the smallest moonlets keep a sliver of size.
export const BODY_SIZE_RADIUS_KM = 1e5
export const MIN_BODY_SIZE = 0.001
// One per-system factor scales every body as large as its spacing allows: a
// body plus its moon system fills at most 40% of the gap to its nearest
// neighbouring orbit (leaving 20% clear between two equal neighbours).
export const BODY_GAP_FRACTION = 0.4
// ...and never larger than this fraction of a Sun-sized star per unit of
// tanh size, which draws the Sun ~58x Earth's size: between the reference
// simulator's 15.6x and the true 109x, so the star reads as dominant while
// rocky planets stay visible up close.
export const MAX_BODY_TO_STAR_SCALE = 0.27
// Lower bound on that factor (1% of its maximum) for two orbits drawn on
// top of each other; their bodies stay findable through their markers.
export const MIN_BODY_SCALE_FRACTION = 0.01
// Name labels fade as a body's orbit shrinks on screen (orbit radius as a
// fraction of the viewport's half-height), and the smaller the body the
// sooner: a body of radius <= 1,500 km (Pluto-sized) fades from 0.3 down to
// 0.15, one of >= 60,000 km (Saturn-sized) from 0.08 down to 0.03, with sizes
// between interpolated on a log scale. Zoomed out on Sol, only the giants
// stay named; the inner planets' names return as you zoom in.
export const LABEL_FADE_SMALL_RADIUS_KM = 1_500
export const LABEL_FADE_LARGE_RADIUS_KM = 60_000
export const LABEL_FADE_SMALL_ORBIT = { full: 0.3, gone: 0.15 }
export const LABEL_FADE_LARGE_ORBIT = { full: 0.08, gone: 0.03 }
// A body's ring marker hides only when its orbit is so small on screen that
// the ring (0.02 of the half-height) would sit on the star, whatever the
// body's size: full from twice the ring radius, gone at the ring radius.
export const BODY_MARKER_MIN_ORBIT_SCREEN_RADIUS = { full: 0.04, gone: 0.02 }
// Fallback radial spread for a belt with no rolled span (the Sol seed's
// belts): real main-belt asteroids span roughly 2.1-3.3 AU around 2.77 AU,
// and the classical Kuiper belt 30-50 AU around 43 AU, both about 0.44x
// their centre distance.
export const BELT_WIDTH_RATIO = 0.44
// Real main-belt inclinations mostly fall within ~20deg of the ecliptic, so
// the belt's vertical (out-of-plane) thickness is real but much shallower
// than its radial spread.
export const BELT_VERTICAL_RATIO = 0.35
// Fallbacks only for a body whose classification isn't in
// CLASSIFICATION_COLOR below (shouldn't happen in practice, since every
// classification is mapped) -- MAIN_WORLD_COLOR for the main world,
// ROCKY_SIBLING_COLOR for anything else.
export const MAIN_WORLD_COLOR = 0x3b82f6
export const ROCKY_SIBLING_COLOR = 0x9ca3af

export const JOVIAN_COLOR_BY_ZONE: Record<OrbitZone, readonly number[]> = {
	epistellar: [0xc4774c, 0x9b564d, 0xaa6c78],
	inner: [0xd6b688, 0xb69673, 0xc28f77],
	outer: [
		0xc9a878, 0xdcc787, 0x4d78b4, 0xc9a878, 0xdcc787, 0x4d78b4, 0xc9a878,
		0xdcc787, 0x4d78b4, 0x84c7c5,
	],
}
export const ORBIT_LINE_COLOR_BY_ZONE: Record<CompanionStar["role"], number> = {
	epistellar: 0xfb923c,
	inner: 0xfacc15,
	outer: 0x7dd3fc,
	distant: 0x94a3b8,
}
// Ocean worlds use blue instead of their classification's land tint.
export const FULL_OCEAN_COLOR = 0x1b3d6d
// Base colors for procedural body materials.
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
	snowball: 0xf0f8ff,
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
