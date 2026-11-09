import type * as THREE from "three"
import type { Text } from "troika-three-text"
import type {
	HostStarAttributes,
	SpectralClass,
} from "@/model/celestial/star/types"
import type { CompanionStar, SystemBody } from "@/model/celestial/system/types"
import type { EclipseShadowState } from "@/ui/genesis/renderer/eclipse-shadow/types"
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

export interface AsteroidFieldData {
	points: THREE.Points
	centerRadius: number
	angles: Float32Array
	radii: Float32Array
	zOffsets: Float32Array
}

export interface BuildAsteroidFieldInput {
	innerRadius: number
	outerRadius: number
	// Belts get no temperature estimate, so the orbital zone is the only
	// signal for an icy (outer-zone) versus rocky tint.
	isOuterZone: boolean
}

// The drawn radial band a companion star sweeps, its footprint included.
export interface CompanionBand {
	inner: number
	outer: number
}

export interface ComputeBodyScaleInput {
	drawnSemiMajor: Map<PlacedBody, number>
	companionBands: CompanionBand[]
}

export interface DistanceMapping {
	exponent: number
	scale: number
}

export interface DrawnDistanceInput {
	mapping: DistanceMapping
	au: number
}

export type LayoutSlot =
	| { kind: "body"; placedIndex: number; orbitalDistanceAU: number }
	| { kind: "companion"; companionIndex: number; orbitalDistanceAU: number }

export interface PlacedLayout {
	drawnSemiMajor: Map<PlacedBody, number>
	// [JUSTIFICATION] Only the readable layout sizes bodies to their spacing;
	// the true-scale layout sizes them from their radius and leaves this unset.
	bodyScale?: number
	outerEdge: number
}

export interface CreateOrbitTrailInput {
	color: number
	// The trail's opacity right at the body; it fades to zero at the tail.
	peakOpacity: number
}

export interface FadeOrbitTrailInput {
	trail: THREE.Line
	// The body's radius as a fraction of the viewport's half-height.
	bodyScreenRadius: number
}

export interface UpdateOrbitTrailInput {
	trail: THREE.Line
	kepler: NonNullable<PlacedBody["kepler"]>
	eccentricAnomaly: number
}

export interface LabelVisibilityInput {
	// Orbit radius as a fraction of the viewport's half-height.
	orbitScreenRadius: number
	radiusKm: number
}

export interface UpdateAsteroidFieldInput {
	field: AsteroidFieldData
	day: number
	centerPeriodDays: number
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
	role: CompanionStar["role"]
	parentIndex: CompanionStar["parentIndex"]
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
	/** Shows each body's (and the star's) name as a billboarded label with a
	 * leader line to the top of the body, similar in spirit to the globe
	 * view's solar-terminator/nation-label overlays. */
	showBodyNames: boolean
	/** Outlined circles marking bodies drawn too small to find (see
	 * BODY_MARKER), for planets and moons alike. */
	showBodyMarkers: boolean
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
	// [JUSTIFICATION] Only set by the internal recursive companion call: the
	// factor the primary star was shrunk by (its drawn radius over its
	// uncapped one), applied to the companion too so the two stars keep their
	// true size order. External callers never provide it.
	parentStarSizeScale?: number
	// [JUSTIFICATION] Only set by the internal recursive companion call: the
	// primary's units-per-AU, so a companion's bodies share the primary's
	// true scale instead of fitting their own system to LAYOUT_OUTER_RADIUS.
	unitsPerAU?: number
	trueScale: boolean
}

export interface SolarSystemOverlayState {
	group: THREE.Group
	/** Farthest extent of this star's bodies, belts and companions. */
	outerRadius: number
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
	/** Re-selects each body's sphere tessellation from its apparent on-screen
	 * size — call this every frame the solar-system view is active, alongside
	 * updateLabelOrientations. Cheap when nothing changed: it only touches a
	 * mesh whose tier actually crossed a threshold this frame. */
	updateLevelOfDetail(camera: THREE.PerspectiveCamera): void
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
	isBelt: boolean
	bodyGroup?: THREE.Group
	mesh?: THREE.Mesh
	/** [JUSTIFICATION] Limb-scattering shell, absent for an airless or
	 * vacuum/trace body and for every belt -- the same "this body has no such
	 * mesh" optionality as `mesh`/`cloudsMesh`/`ringMesh` beside it, which is
	 * how absence is spelled here since the project builds with
	 * strictNullChecks off and an explicit null would widen to `any`. Typed
	 * concretely because setDay writes its sunDirection uniform each time the
	 * body moves. */
	atmosphereMesh?: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
	cloudsMesh?: THREE.Mesh
	ringMesh?: THREE.Mesh
	orbitLine?: THREE.Line
	meshRestQuaternion?: THREE.Quaternion
	baseQuaternion?: THREE.Quaternion
	moonState?: MoonOrbitState
	/** [JUSTIFICATION] Outlined circle shown while the body is drawn too small
	 * to find; belts have none, like `mesh`. */
	marker?: THREE.Sprite
	/** [JUSTIFICATION] Eclipse casters for the planet's surface and clouds;
	 * belts have none, like `mesh`. */
	eclipse?: EclipseShadowState
	/** [JUSTIFICATION] Eclipse casters for the ring; only ringed bodies. */
	ringEclipse?: EclipseShadowState
	/** Which shared tessellation tier this body's mesh currently draws from
	 * (see updateLevelOfDetail) — starts at the tier the build path assigns,
	 * so a first frame that picks the same one correctly does nothing. Always
	 * 0 for a belt, which has no mesh to tessellate. */
	lodTier: number
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
	/** [JUSTIFICATION] Only set for asteroid belts — the belt's inner and
	 * outer edges in scene units, from its real AU range. */
	beltEdges?: { inner: number; outer: number }
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
	orbitalDistanceAU: number
	kepler: {
		P: THREE.Vector3
		Q: THREE.Vector3
		a: number
		b: number
		ae: number
		e: number
	}
	orbitLine: THREE.Line
	parentIndex: number
	// [JUSTIFICATION] Absent for a companion that orbits the primary directly.
	parent?: PlacedCompanion
	/** Golden-angle-spread starting angle, same technique as every planet's
	 * own meanAnomalyAtEpoch -- without this every companion starts at angle
	 * 0 and multiple companions render collinear from the primary instead of
	 * spread around it. */
	meanAnomalyAtEpoch: number
}
