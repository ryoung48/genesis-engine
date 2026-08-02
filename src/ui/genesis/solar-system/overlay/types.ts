import type * as THREE from "three"
import type { Text } from "troika-three-text"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import type { SystemBody } from "@/model/celestial/system/types"
import type { MoonOrbitState } from "@/ui/genesis/renderer/moon-orbit-overlay"

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

export interface SolarSystemOverlayParams {
	/** All bodies in the system (siblings + the main world), sorted by
	 * generated orbital distance — see generateSystemBodies. */
	bodies: SystemBody[]
	/** The main world's real orbital period, used as the Kepler-scaling
	 * reference for every other body's period. */
	daysPerYear: number
	spectralClass: MainSequenceClass
	starSubtype: number
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
}

export interface SolarSystemOverlayState {
	group: THREE.Group
	suggestedCameraDistance: number
	setDay(day: number): void
	updateBodies(bodies: SystemBody[]): boolean
	/** Re-billboards every visible name label to face the camera — call this
	 * every frame the solar-system view is active (labels don't rotate with
	 * anything else in the scene, so there's no other hook that keeps them
	 * camera-facing). */
	updateLabelOrientations(camera: THREE.PerspectiveCamera): void
	dispose(): void
	/** Current world-space position + a reasonable framing radius for a body
	 * (or one of its moons), for camera-focus purposes. `bodyIndex` is the
	 * index into the `bodies` array passed to `buildSolarSystemOverlay`, or -1
	 * for the star. `moonIndex`, if given, focuses that body's moon instead
	 * (index into the body's own `moons` array), falling back to the body
	 * itself if that moon can't be resolved. */
	getBodyFocus(
		bodyIndex: number,
		moonIndex?: number,
	): { position: THREE.Vector3; radius: number } | null
	/** Spins every body's (and their moons') mesh around its own axis by a
	 * fraction of a full turn derived from `hours` and that body's own
	 * siderealDayHours (moons assume tidal lock — see moon-orbit-overlay). */
	setSpinHours(hours: number): void
	/** Resolves a raycast hit's object back to a focus target — e.g. for
	 * double-click-to-focus. Returns null if `object` isn't part of any
	 * body/moon/the star in this overlay. */
	resolveHitBodyIndex(
		object: THREE.Object3D,
	): { bodyIndex: number; moonIndex?: number } | null
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
}
