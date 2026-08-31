import type * as THREE from "three"
import type { Text } from "troika-three-text"
import type {
	HostStarAttributes,
	SpectralClass,
} from "@/model/celestial/star/types"
import type { SystemBody } from "@/model/celestial/system/types"
import type { MoonOrbitState } from "@/ui/genesis/renderer/moon-orbit-overlay"

/** Addresses any node in a solar system's orbit tree -- the parent of any
 * node is always either a star or a planet, so this is the whole address
 * space: `starIndex` picks WHICH star (0 = the system's own primary/root
 * star, 1-based = a companion, indexing into `companionStars`/`companions`
 * same as before), and `bodyIdx`/`moonIdx` are that node's own array
 * position among its parent's siblings (a star's own `bodies`, or a body's
 * own `moons`). This replaces the old ad hoc `{bodyIndex, moonIndex?,
 * starIndex?}` triple (with `bodyIndex === -1` magic-numbering "the star
 * itself") and the Navigator's separate `"companion-star"` selection kind --
 * a companion is just `{kind: "star", starIndex: N}` for N > 0, the exact
 * same shape the primary uses for N = 0, so there is no longer a second
 * branch to special-case (and forget to update, as happened with the
 * original double-click-doesn't-update-the-wiki-panel bug). */
export type OrbitAddress =
	| { kind: "star"; starIndex: number }
	| { kind: "body"; starIndex: number; bodyIdx: number }
	| { kind: "moon"; starIndex: number; bodyIdx: number; moonIdx: number }

// Scatters a field of small, irregularly-scaled rocks around a belt's ring —
// each on its own randomized circular sub-orbit (slightly jittered radius and
// out-of-plane offset) plus a random tumble, so the belt reads as a lively
// swarm rather than a flat static band.
export interface AsteroidFieldData {
	mesh: THREE.InstancedMesh
	count: number
	angles: Float32Array
	radii: Float32Array
	zOffsets: Float32Array
	scales: Float32Array
	rotationAxes: THREE.Vector3[]
	rotationSpeeds: Float32Array
}

/** One companion star's own overlay params plus where it sits relative to
 * the star it orbits. `star` is itself a full SolarSystemOverlayParams --
 * companions are just another orbit slot, interleaved with planets in the
 * SAME distance-ordered pack (see buildSolarSystemOverlay); a companion's
 * own `star.companions` is always empty, since this repo's model has no
 * companion-of-a-companion nesting (CompanionStar has no companionStars
 * field of its own). Its orbit uses the companion's own real Kepler period
 * around its parent (from GALAXY_SYSTEMS.generate), not the daysPerYear-
 * anchored heuristic scaling planets use. */
export interface CompanionOverlayParams {
	star: SolarSystemOverlayParams
	orbitalDistanceAU: number
	orbitalPeriodDays: number
	eccentricity: number
	inclinationDeg: number
}

/** Params for one star's full worth of orbiting bodies -- both planets and
 * any companion stars, packed together in one distance-ordered pass by
 * buildSolarSystemOverlay (see its own doc comment). A single-star system is
 * simply the `companions: []` case of the same call, not a different path;
 * this is also what a companion's own nested system looks like (with its
 * own `companions: []`, per CompanionOverlayParams' doc). */
export interface SolarSystemOverlayParams {
	/** All bodies orbiting this star (siblings + the main world), sorted by
	 * generated orbital distance — see generateSystemBodies. */
	bodies: SystemBody[]
	/** Empty for a single-star system -- the common case, not a different
	 * code path. */
	companions: CompanionOverlayParams[]
	/** The main world's real orbital period, used as the Kepler-scaling
	 * reference for every other body's period. A companion (no main world of
	 * its own) passes its own outermost body's rolled period instead. */
	daysPerYear: number
	spectralClass: SpectralClass
	starSubtype: number
	/** [JUSTIFICATION] Manually authored O–M hosts still store class/subtype
	 * only; generated galaxy hosts provide the canonical physical profile. */
	hostStar?: HostStarAttributes
	initialDay: number
	/** Also controls moon orbits, same as the existing moon-orbit overlay. */
	showEllipticalOrbits: boolean
	showDaylight: boolean
	/** When false, every body's orbit is flattened into the equatorial plane
	 * regardless of its rolled inclination/ascending node. */
	showInclination: boolean
	/** When false, no body/moon renders any axial tilt (meshes, moon-orbit
	 * planes, and rings all sit flat/untitled) — a diagnostic/visual toggle,
	 * doesn't affect the underlying axialTiltDeg data. */
	showAxialTilt: boolean
	/** When true, every body (planets, moons, the star) renders at its true
	 * relative diameter (clamped only by a floor/ceiling — see
	 * scaleBodyDiameterToVisualRadius). When false, falls back to the old
	 * sqrt-compressed sizing so nothing strays far from Earth's own scene
	 * size. */
	showRealisticSizes: boolean
	/** Shows each body's (and the star's) name as a billboarded label with a
	 * leader line to the top of the body, similar in spirit to the globe
	 * view's solar-terminator/nation-label overlays. */
	showBodyNames: boolean
	/** When true and showBodyNames is on, uses real Sol names (star: "Sol",
	 * main world: "Earth", named siblings/moons from the Sol seed data)
	 * instead of generic group-based labels — true exactly when this is the
	 * real Sol seed (see GenesisView's showRealNames computation). */
	showRealNames: boolean
	/** Whether to show a sibling/moon/main-world's own `name` label at all —
	 * unlike showRealNames (a Sol-only spoiler gate for the curated real
	 * names), this is true for any generated name, Sol or a procedural
	 * system's own language-generated names alike. */
	namesEnabled: boolean
	/** The star's own procedurally generated name (see generateStarName in
	 * generate-system-bodies.ts) — undefined for the real Sol seed, which
	 * uses its own hardcoded "Sol" (behind showRealNames) instead. */
	starName?: string
	/** The main world's real simulated terrain/vegetation, rendered as its
	 * surface in place of texturePath's static image — null for a real Earth
	 * import (which keeps its curated photo) or while no world has been
	 * simulated yet. See useSolarSystemView's mainWorldSatelliteTexture. */
	mainWorldTexture?: THREE.DataTexture | null
	/** True for any non-Sol seed. Gates the animated swatch-tinted cloud-band
	 * mesh that replaces every planet's (and every classified moon's) texture
	 * in a procedurally generated system — the real Sol view keeps its curated
	 * photographic/simulated surfaces. See buildSolarSystemOverlay's body
	 * material selection and moon-orbit-overlay's cloudBandPalette. */
	proceduralSystem: boolean
	/** Set internally by buildSolarSystemOverlay's own recursive companion-star
	 * call (never by an external caller) — true exactly when this star is
	 * itself a companion orbiting another star. That other star is a sibling
	 * light source this star's own light must not bleed onto (and vice
	 * versa), even though a companion's own `companions` is always `[]` (no
	 * companion-of-a-companion nesting) and so can't see that sibling in its
	 * own `companions.length`. See starLight.distance and systemAmbient. */
	isCompanion?: boolean
}

export interface SolarSystemOverlayState {
	group: THREE.Group
	suggestedCameraDistance: number
	setDay(day: number): void
	/** Only ever called with the primary's own next bodies (see
	 * useSolarSystemView) -- companions aren't live-edited, so they don't
	 * need an update path; a changed companion set is a whole new
	 * `buildSolarSystemOverlay` call, same as any other structural change. */
	updateBodies(
		bodies: SystemBody[],
		mainWorldTexture?: THREE.DataTexture | null,
	): boolean
	/** Re-billboards every visible name label to face the camera — call this
	 * every frame the solar-system view is active (labels don't rotate with
	 * anything else in the scene, so there's no other hook that keeps them
	 * camera-facing). */
	updateLabelOrientations(camera: THREE.PerspectiveCamera): void
	dispose(): void
	/** Current world-space position + a reasonable framing radius for any
	 * addressed node (a star, one of its bodies, or one of a body's moons),
	 * for camera-focus purposes. */
	getBodyFocus(
		address: OrbitAddress,
	): { position: THREE.Vector3; radius: number } | null
	/** Spins every body's (and their moons') mesh around its own axis by a
	 * fraction of a full turn derived from `hours` and that body's own
	 * siderealDayHours (moons assume tidal lock — see moon-orbit-overlay). */
	setSpinHours(hours: number): void
	/** Resolves a raycast hit's object back to a focus target — e.g. for
	 * double-click-to-focus. Returns null if `object` isn't part of any
	 * body/moon/star in this overlay. */
	resolveHitBodyIndex(object: THREE.Object3D): OrbitAddress | null
	/** Every addressable node in this overlay (the star, its bodies, their
	 * moons, and recursively any companion stars' own bodies/moons) — used to
	 * find the screen-space-nearest body for a double-click that didn't land
	 * an exact raycast hit. */
	listAddresses(): OrbitAddress[]
}

export interface PlacedBody {
	body: SystemBody
	sceneRadius: number
	moonSystemOuterRadius: number
	isBelt: boolean
	bodyGroup?: THREE.Group
	mesh?: THREE.Mesh
	cloudsMesh?: THREE.Mesh
	ringMesh?: THREE.Mesh
	orbitLine?: THREE.Line
	meshRestQuaternion?: THREE.Quaternion
	baseQuaternion?: THREE.Quaternion
	moonState?: MoonOrbitState
	nameLabel?: Text
	nameLeader?: THREE.Line
	orbitRadius: number
	/** Mean anomaly at epoch — spreads bodies around their orbits instead of
	 * lining them all up at day 0. */
	meanAnomalyAtEpoch: number
	/** Kepler orbit basis (perifocal P/Q vectors + semi-major/minor axes),
	 * computed once orbitRadius/eccentricity/inclination are known — null for
	 * asteroid belts, which render as a flat static ring instead. */
	kepler?: {
		P: THREE.Vector3
		Q: THREE.Vector3
		a: number
		b: number
		ae: number
		e: number
	}
	/** Only set for asteroid belts. */
	asteroidField?: AsteroidFieldData
	/** Only set for asteroid belts — half the belt's radial (inner-to-outer)
	 * span, scaled off its own orbitRadius (see BELT_WIDTH_RATIO) rather than
	 * a fixed constant. */
	beltHalfWidth?: number
}

/** A companion star mounted inside its parent's own group, orbiting it --
 * built once (recursively via buildSolarSystemOverlay) and then repositioned
 * every setDay() call, same as a PlacedBody's bodyGroup. */
export interface PlacedCompanion {
	mount: THREE.Group
	overlay: SolarSystemOverlayState
	orbitalPeriodDays: number
	eccentricity: number
	inclinationDeg: number
	/** Assigned by the combined distance-ordered layout pass (see
	 * buildSolarSystemOverlay's layoutSlots) -- 0 until then. */
	orbitRadius: number
	kepler: {
		P: THREE.Vector3
		Q: THREE.Vector3
		a: number
		b: number
		ae: number
		e: number
	}
	orbitLine: THREE.Line
	/** Golden-angle-spread starting angle, same technique as every planet's
	 * own meanAnomalyAtEpoch -- without this every companion starts at angle
	 * 0 and multiple companions render collinear from the primary instead of
	 * spread around it. */
	meanAnomalyAtEpoch: number
}
