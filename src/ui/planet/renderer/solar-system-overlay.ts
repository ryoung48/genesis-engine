import * as THREE from "three"
import type { Text } from "troika-three-text"
import { MOON } from "@/model/celestial/moons"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { OrbitClassification } from "@/model/celestial/orbit-body/types"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import type { SystemBody } from "@/model/celestial/system/types"
import {
	BODY_VISUAL_BASE_RADIUS,
	getMoonOrbitDistanceRelativeToPlanet,
	measureMoonOrbitOuterRadiusForDisplay,
	scaleBodyDiameterToVisualRadius,
} from "@/ui/planet/moon-visual-scale"
import {
	createNameLabel,
	createNameLeaderLine,
	IDENTITY_QUATERNION,
	sizeNameLabel,
	updateLabelPlacement,
} from "@/ui/planet/renderer/body-name-label"
import { boostCloudAlphaMap } from "@/ui/planet/renderer/cloud-material"
import {
	buildMoonOrbitOverlay,
	type MoonOrbitState,
	mod2pi,
	orbitPoint,
	perifocalBasis,
	solveKepler,
} from "@/ui/planet/renderer/moon-orbit-overlay"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"

const DEG2RAD = Math.PI / 180

const TWO_PI = 2 * Math.PI
const ORBIT_SEGMENTS = 256
const PLANET_SCENE_RADIUS = BODY_VISUAL_BASE_RADIUS
const MOON_SYSTEM_SCENE_MIN = 1.35
const MOON_SYSTEM_SCENE_MAX = 2.55
const MIN_MOON_VISUAL_RADIUS = 0.004
// Visual clearance between one body's outer edge and the next body's orbit,
// as a multiple of the (larger of the two) body's own radius — a real
// AU-based distance would either bunch everything near the star or spread it
// beyond any reasonable camera distance depending on spectral class.
const ORBIT_GAP_STAR_RADII = 1.5
const GLOW_TEXTURE_SIZE = 128
const BELT_SCENE_RADIUS = 0.05
const BELT_WIDTH = 0.12
const ASTEROID_COUNT_PER_BELT = 900
const ASTEROID_MIN_SCALE = 0.006
const ASTEROID_MAX_SCALE = 0.02
const ASTEROID_Z_JITTER = 0.02
// Fallbacks only for a body whose classification isn't in
// CLASSIFICATION_COLOR below (shouldn't happen in practice, since every
// classification is mapped) -- MAIN_WORLD_COLOR for the main world,
// ROCKY_SIBLING_COLOR for anything else.
const MAIN_WORLD_COLOR = 0x3b82f6
const ROCKY_SIBLING_COLOR = 0x9ca3af
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
const CLASSIFICATION_COLOR: Partial<Record<OrbitClassification, number>> = {
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
const textureLoader = new THREE.TextureLoader()
const sharedBodyTextureCache = new Map<string, THREE.Texture>()
let sharedGrayscaleSunTexture: THREE.CanvasTexture | null = null
let grayscaleSunTextureLoadPromise: Promise<THREE.CanvasTexture> | null = null

const GROUP_LABEL: Record<SystemBody["group"], string> = {
	"asteroid belt": "Asteroid Belt",
	dwarf: "Dwarf World",
	terrestrial: "Terrestrial Planet",
	helian: "Helian World",
	jovian: "Jovian Planet",
}

// `showRealNames` gates real Sol names the same way the stat-panel titles
// do (see GenerationPanel's resolveSiblingBodyTitle) — off by default so a
// procedurally generated system's bodies read as "Terrestrial Planet 2"
// etc. rather than borrowing unrelated real names baked into the Sol seed
// data.
function bodyDisplayName(
	body: SystemBody,
	siblingNumber: number,
	showRealNames: boolean,
	namesEnabled: boolean,
): string {
	if (body.isMainWorld) {
		if (showRealNames) return "Earth"
		if (namesEnabled && body.name) return body.name
		return "Main World"
	}
	if (namesEnabled && body.name) return body.name
	return `${GROUP_LABEL[body.group]} ${siblingNumber}`
}

// Matches the spectral-class palette used by galaxy-gen's system map.
const STAR_COLOR_BY_CLASS: Record<MainSequenceClass, string> = {
	O: "#7cc6ff",
	B: "#d8eeff",
	A: "#ffffff",
	F: "#fffcd3",
	G: "#fff772",
	K: "#ffc37f",
	M: "#ff9719",
}

// The source photo is naturally orange/yellow. MeshBasicMaterial's `color`
// only multiplies the texture, so tinting it blue (for hot O/B stars) just
// darkens the existing orange rather than actually shifting its hue — the
// orange keeps showing through. Desaturating to grayscale first (keeping only
// luminance, i.e. granulation/limb-darkening detail) lets the spectral-class
// tint fully determine the star's color instead of fighting the photo's hue.
function loadGrayscaleSunTexture(
	onReady: (texture: THREE.CanvasTexture) => void,
): { cancel(): void } {
	let cancelled = false
	if (sharedGrayscaleSunTexture) {
		onReady(sharedGrayscaleSunTexture)
		return {
			cancel() {
				cancelled = true
			},
		}
	}
	if (!grayscaleSunTextureLoadPromise) {
		grayscaleSunTextureLoadPromise = new Promise((resolve) => {
			textureLoader.load("/sol/2k_sun.jpg", (loaded) => {
				const image = loaded.image as HTMLImageElement
				const canvas = document.createElement("canvas")
				canvas.width = image.width
				canvas.height = image.height
				const ctx = canvas.getContext("2d")
				if (ctx) {
					ctx.drawImage(image, 0, 0)
					const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
					const pixels = data.data
					for (let i = 0; i < pixels.length; i += 4) {
						const luminance =
							0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
						pixels[i] = luminance
						pixels[i + 1] = luminance
						pixels[i + 2] = luminance
					}
					ctx.putImageData(data, 0, 0)
				}
				loaded.dispose()
				const grayTexture = new THREE.CanvasTexture(canvas)
				grayTexture.needsUpdate = true
				grayTexture.userData.sharedTexture = true
				sharedGrayscaleSunTexture = grayTexture
				resolve(grayTexture)
			})
		})
	}
	grayscaleSunTextureLoadPromise.then((texture) => {
		if (cancelled) return
		onReady(texture)
	})
	return {
		cancel() {
			cancelled = true
		},
	}
}

function withAlpha(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16)
	const g = Number.parseInt(hex.slice(3, 5), 16)
	const b = Number.parseInt(hex.slice(5, 7), 16)
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Renders a soft white-hot core fading through the star's own color and out
// to transparent — the same core+glow gradient galaxy-gen's system map uses,
// applied here as a camera-facing sprite texture.
function createStarGlowTexture(hexColor: string): THREE.CanvasTexture {
	const canvas = document.createElement("canvas")
	canvas.width = GLOW_TEXTURE_SIZE
	canvas.height = GLOW_TEXTURE_SIZE
	const ctx = canvas.getContext("2d")
	const center = GLOW_TEXTURE_SIZE / 2
	if (ctx) {
		const gradient = ctx.createRadialGradient(
			center,
			center,
			GLOW_TEXTURE_SIZE * 0.03,
			center,
			center,
			center,
		)
		gradient.addColorStop(0, "#ffffff")
		gradient.addColorStop(0.33, hexColor)
		gradient.addColorStop(0.67, withAlpha(hexColor, 0.3))
		gradient.addColorStop(1, withAlpha(hexColor, 0))
		ctx.fillStyle = gradient
		ctx.fillRect(0, 0, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE)
	}
	const texture = new THREE.CanvasTexture(canvas)
	texture.needsUpdate = true
	return texture
}

function bodySceneRadius(
	diameterKm: number,
	sizeClass: number,
	realisticSizes: boolean,
): number {
	return scaleBodyDiameterToVisualRadius(
		diameterKm,
		PLANET_SCENE_RADIUS,
		realisticSizes,
		sizeClass,
	)
}

function loadBodyTexture(texturePath: string): THREE.Texture {
	const cached = sharedBodyTextureCache.get(texturePath)
	if (cached) return cached
	const texture = textureLoader.load(texturePath)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.userData.sharedTexture = true
	sharedBodyTextureCache.set(texturePath, texture)
	return texture
}

function measureBodyMoonSystemOuterRadius(
	body: SystemBody,
	sceneRadius: number,
	showEllipticalOrbits: boolean,
	realisticSizes: boolean,
): number {
	if (body.moons.length === 0) return sceneRadius

	const planetRadiusKm = body.diameterKm / 2
	const planetMassKg = MECHANICS.derivePlanetMassKg(planetRadiusKm)
	const parentOccupiedRadiusRelativeToPlanet =
		body.rings?.outerRadiusRelative ?? 1

	const outerRadiusInMoonOverlayUnits = measureMoonOrbitOuterRadiusForDisplay({
		orbits: body.moons.map((moon) => ({
			orbitalDistancePlanetRadii: getMoonOrbitDistanceRelativeToPlanet(
				MECHANICS.moonSemiMajorAxisM({ moon, planetMassKg }),
				planetRadiusKm,
			),
			eccentricity: showEllipticalOrbits ? moon.eccentricity : 0,
			bodyVisualRadius: Math.max(
				MIN_MOON_VISUAL_RADIUS,
				scaleBodyDiameterToVisualRadius(
					moon.diameterKm,
					PLANET_SCENE_RADIUS,
					realisticSizes,
					moon.sizeClass ??
						MOON.estimateMoonSizeClassFromDiameter(moon.diameterKm),
				) / Math.max(sceneRadius, 1e-6),
			),
		})),
		parentVisualRadius: parentOccupiedRadiusRelativeToPlanet,
		minDisplayDistance: MOON_SYSTEM_SCENE_MIN,
		maxDisplayDistance: MOON_SYSTEM_SCENE_MAX,
	})

	return outerRadiusInMoonOverlayUnits * sceneRadius
}

interface AsteroidFieldData {
	mesh: THREE.InstancedMesh
	count: number
	angles: Float32Array
	radii: Float32Array
	zOffsets: Float32Array
	scales: Float32Array
	rotationAxes: THREE.Vector3[]
	rotationSpeeds: Float32Array
}

// Scatters a field of small, irregularly-scaled rocks around a belt's ring —
// each on its own randomized circular sub-orbit (slightly jittered radius and
// out-of-plane offset) plus a random tumble, so the belt reads as a lively
// swarm rather than a flat static band.
function buildAsteroidField(orbitRadius: number): AsteroidFieldData {
	const count = ASTEROID_COUNT_PER_BELT
	const geometry = new THREE.IcosahedronGeometry(1, 0)
	const material = new THREE.MeshStandardMaterial({
		color: 0xb0b0b0,
		roughness: 1,
		metalness: 0,
	})
	const mesh = new THREE.InstancedMesh(geometry, material, count)
	const angles = new Float32Array(count)
	const radii = new Float32Array(count)
	const zOffsets = new Float32Array(count)
	const scales = new Float32Array(count)
	const rotationAxes: THREE.Vector3[] = []
	const rotationSpeeds = new Float32Array(count)

	const dummy = new THREE.Object3D()
	const color = new THREE.Color()
	for (let i = 0; i < count; i++) {
		angles[i] = Math.random() * TWO_PI
		radii[i] = orbitRadius + (Math.random() - 0.5) * BELT_WIDTH
		zOffsets[i] = (Math.random() - 0.5) * ASTEROID_Z_JITTER
		scales[i] =
			ASTEROID_MIN_SCALE +
			Math.random() * (ASTEROID_MAX_SCALE - ASTEROID_MIN_SCALE)
		rotationAxes.push(
			new THREE.Vector3(
				Math.random() - 0.5,
				Math.random() - 0.5,
				Math.random() - 0.5,
			).normalize(),
		)
		rotationSpeeds[i] = (Math.random() - 0.5) * 2

		dummy.position.set(
			radii[i] * Math.cos(angles[i]),
			radii[i] * Math.sin(angles[i]),
			zOffsets[i],
		)
		dummy.scale.setScalar(scales[i])
		dummy.rotation.set(
			Math.random() * TWO_PI,
			Math.random() * TWO_PI,
			Math.random() * TWO_PI,
		)
		dummy.updateMatrix()
		mesh.setMatrixAt(i, dummy.matrix)

		const shade = 0.5 + Math.random() * 0.5
		color.setRGB(shade, shade * 0.97, shade * 0.92)
		mesh.setColorAt(i, color)
	}
	mesh.instanceMatrix.needsUpdate = true
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

	return {
		mesh,
		count,
		angles,
		radii,
		zOffsets,
		scales,
		rotationAxes,
		rotationSpeeds,
	}
}

function updateAsteroidField(
	field: AsteroidFieldData,
	dummy: THREE.Object3D,
	day: number,
	period: number,
): void {
	const angularRate = TWO_PI / period
	for (let i = 0; i < field.count; i++) {
		const angle = field.angles[i] + angularRate * day
		dummy.position.set(
			field.radii[i] * Math.cos(angle),
			field.radii[i] * Math.sin(angle),
			field.zOffsets[i],
		)
		dummy.scale.setScalar(field.scales[i])
		dummy.quaternion.setFromAxisAngle(
			field.rotationAxes[i],
			field.rotationSpeeds[i] * day,
		)
		dummy.updateMatrix()
		field.mesh.setMatrixAt(i, dummy.matrix)
	}
	field.mesh.instanceMatrix.needsUpdate = true
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

interface PlacedBody {
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

// Golden angle — an irrational fraction of a full turn, so successive bodies
// land at well-spread-out starting angles instead of clustering.
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5))

export function buildSolarSystemOverlay(
	params: SolarSystemOverlayParams,
): SolarSystemOverlayState {
	const {
		bodies,
		daysPerYear,
		spectralClass,
		starSubtype,
		initialDay,
		showEllipticalOrbits,
		showDaylight,
		showInclination,
		showAxialTilt,
		showRealisticSizes,
		showBodyNames,
		showRealNames,
		namesEnabled,
		starName,
	} = params

	const group = new THREE.Group()
	let currentDay = initialDay
	let currentSpinHours = 0

	// --- Star ---
	const starDiameterSol = STAR.getStarDiameterSol({
		cls: spectralClass,
		subtype: starSubtype,
	})
	const starDiameterKm = starDiameterSol * ORBIT_BODY.solarDiameterKm
	// Realistic mode uses the same shared floor/ceiling (and fixed
	// Earth-diameter reference) as every other body in the scene — see
	// scaleBodyDiameterToVisualRadius — so the star sits on the same absolute
	// scale instead of being sized relative to the (resizable) main world.
	// Non-realistic mode instead buckets by spectral class only, with no
	// sizeClass equivalent to hand it — see getNonRealisticStarToPlanetRatio.
	const starRadius = showRealisticSizes
		? scaleBodyDiameterToVisualRadius(
				starDiameterKm,
				PLANET_SCENE_RADIUS,
				true,
				0,
			)
		: PLANET_SCENE_RADIUS *
			STAR.getNonRealisticStarToPlanetRatio({
				cls: spectralClass,
				subtype: starSubtype,
			})
	const starColorHex = STAR_COLOR_BY_CLASS[spectralClass] ?? "#fff772"
	const starColor = new THREE.Color(starColorHex)
	// A real photographic sun texture (NASA-derived, via Solar System Scope),
	// desaturated then tinted per spectral class — see loadGrayscaleSunTexture.
	const starMaterial = new THREE.MeshBasicMaterial({ color: starColor })
	const surfaceTextureLoad = loadGrayscaleSunTexture((texture) => {
		starMaterial.map = texture
		starMaterial.needsUpdate = true
	})
	const starMesh = new THREE.Mesh(
		new THREE.SphereGeometry(starRadius, 48, 32),
		starMaterial,
	)
	// SphereGeometry's poles sit on ±Y, but this scene's equatorial plane is
	// XY (Z-north) — without this the star renders "on its side" relative to
	// the planets' orbital plane. Same fix already applied to the gas-giant
	// mesh elsewhere in this renderer.
	starMesh.rotation.x = Math.PI / 2
	group.add(starMesh)

	const glowTexture = createStarGlowTexture(starColorHex)
	const glowSprite = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: glowTexture,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	)
	glowSprite.scale.setScalar(starRadius * 3)
	group.add(glowSprite)

	// decay=0 keeps the light's intensity constant regardless of a body's
	// orbital distance — with the physically-correct inverse-square falloff
	// (decay=2) the star was too dim at typical distances to cast any visible
	// day/night terminator.
	const starLight = new THREE.PointLight(
		starColor,
		showDaylight ? 2.4 : 0,
		0,
		0,
	)
	group.add(starLight)
	const systemAmbient = new THREE.AmbientLight(
		showDaylight ? 0x445566 : 0xffffff,
		showDaylight ? 0.15 : 2.6,
	)
	group.add(systemAmbient)

	let starNameLabel: Text | undefined
	let starNameLeader: THREE.Line | undefined
	if (showBodyNames) {
		starNameLabel = createNameLabel(
			showRealNames
				? "Sol"
				: namesEnabled && starName
					? starName
					: `${STAR.getStarLabel({ cls: spectralClass, subtype: starSubtype })} Star`,
		)
		starNameLeader = createNameLeaderLine()
		sizeNameLabel(starNameLabel, starRadius)
		group.add(starNameLabel)
		group.add(starNameLeader)
	}

	// Per-group ordinal (1-indexed), matching GenerationPanel's own sibling
	// numbering, so a label like "Terrestrial Planet 2" here matches the same
	// body's title in the stat panel.
	const groupCounters: Record<SystemBody["group"], number> = {
		"asteroid belt": 0,
		dwarf: 0,
		terrestrial: 0,
		helian: 0,
		jovian: 0,
	}

	// --- Build every body (siblings + main world), each with its own nested
	// moon system, but don't position them yet — spacing depends on every
	// body's own size, computed below in orbital order. ---
	const placed: PlacedBody[] = bodies.map((body, index) => {
		const meanAnomalyAtEpoch = index * GOLDEN_ANGLE_RAD
		groupCounters[body.group] += 1
		if (body.group === "asteroid belt") {
			return {
				body,
				sceneRadius: BELT_SCENE_RADIUS,
				moonSystemOuterRadius: BELT_SCENE_RADIUS,
				isBelt: true,
				orbitRadius: 0,
				meanAnomalyAtEpoch,
			}
		}

		const sceneRadius = bodySceneRadius(
			body.diameterKm,
			body.sizeClass,
			showRealisticSizes,
		)
		const bodyGroup = new THREE.Group()
		const isGasGiant = body.group === "jovian"
		const texturePath = body.texturePath
		const material = texturePath
			? new THREE.MeshStandardMaterial({
					map: loadBodyTexture(texturePath),
					roughness: 1,
					metalness: 0,
				})
			: isGasGiant
				? new THREE.MeshStandardMaterial({
						map: loadBodyTexture("/sol/jupiter/2k_jupiter.jpg"),
						roughness: 1,
						metalness: 0,
					})
				: new THREE.MeshStandardMaterial({
						color:
							CLASSIFICATION_COLOR[body.classification] ??
							(body.isMainWorld ? MAIN_WORLD_COLOR : ROCKY_SIBLING_COLOR),
						roughness: 0.9,
						metalness: 0,
					})
		const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), material)
		// SphereGeometry's poles sit on ±Y, but this scene's equatorial plane is
		// XY (Z-north) — textured bodies need the same quarter-turn so their
		// maps don't render "on their side". Untextured rocky spheres looked
		// fine before because the solid-color material had no visible poles.
		if (isGasGiant || texturePath) mesh.rotation.x = Math.PI / 2
		mesh.scale.setScalar(sceneRadius)
		bodyGroup.add(mesh)
		let cloudsMesh: THREE.Mesh | undefined
		if (body.cloudsTexturePath) {
			const cloudsTexture = loadBodyTexture(body.cloudsTexturePath)
			const cloudsMaterial = new THREE.MeshStandardMaterial({
				color: 0xffffff,
				alphaMap: cloudsTexture,
				transparent: true,
				opacity: 1,
				alphaTest: 0.02,
				depthWrite: false,
				roughness: 1,
				metalness: 0,
			})
			boostCloudAlphaMap(cloudsMaterial)
			cloudsMesh = new THREE.Mesh(
				new THREE.SphereGeometry(1, 24, 18),
				cloudsMaterial,
			)
			cloudsMesh.rotation.x = Math.PI / 2
			cloudsMesh.scale.setScalar(sceneRadius * 1.025)
			cloudsMesh.renderOrder = 2
			bodyGroup.add(cloudsMesh)
		}
		let ringMesh: THREE.Mesh | undefined
		if (body.rings) {
			const ringGeometry = new THREE.RingGeometry(
				body.rings.innerRadiusRelative,
				body.rings.outerRadiusRelative,
				96,
				20,
			)
			const position = ringGeometry.getAttribute("position")
			const color = new THREE.Color(body.rings.color)
			const colors = new Float32Array(position.count * 3)
			for (let i = 0; i < position.count; i++) {
				const radius = Math.hypot(position.getX(i), position.getY(i))
				const normalized =
					(radius - body.rings.innerRadiusRelative) /
					Math.max(
						body.rings.outerRadiusRelative - body.rings.innerRadiusRelative,
						1e-6,
					)
				const envelope = 0.18 + Math.sin(normalized * Math.PI) * 0.82
				const broadBands =
					0.72 +
					0.18 * Math.sin(normalized * Math.PI * 5.5 + 0.4) +
					0.1 * Math.sin(normalized * Math.PI * 13.5 + 1.3)
				const fineBands = 0.9 + 0.08 * Math.sin(normalized * Math.PI * 36 + 2.1)
				const gapMask =
					(normalized > 0.34 && normalized < 0.39) ||
					(normalized > 0.73 && normalized < 0.755)
						? 0.18
						: 1
				const brightness = envelope * broadBands * fineBands * gapMask
				colors[i * 3] = Math.min(1, color.r * brightness)
				colors[i * 3 + 1] = Math.min(1, color.g * brightness)
				colors[i * 3 + 2] = Math.min(1, color.b * brightness)
			}
			ringGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
			const ringMaterial = new THREE.MeshBasicMaterial({
				vertexColors: true,
				transparent: true,
				opacity: body.rings.opacity,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
			ringMesh = new THREE.Mesh(ringGeometry, ringMaterial)
			ringMesh.scale.setScalar(sceneRadius)
			bodyGroup.add(ringMesh)
		}

		const moonState = buildMoonOrbitOverlay(
			body.moons,
			body.diameterKm / 2,
			initialDay,
			false,
			15,
			showEllipticalOrbits,
			showInclination,
			body.rings?.outerRadiusRelative ?? 1,
			sceneRadius,
			showAxialTilt,
			showRealisticSizes,
			showBodyNames,
			showRealNames,
			body.isMainWorld ? "Luna" : undefined,
			namesEnabled,
		)
		moonState.group.scale.setScalar(sceneRadius)
		bodyGroup.add(moonState.group)
		group.add(bodyGroup)

		const moonSystemOuterRadius = measureBodyMoonSystemOuterRadius(
			body,
			sceneRadius,
			showEllipticalOrbits,
			showRealisticSizes,
		)

		let nameLabel: Text | undefined
		let nameLeader: THREE.Line | undefined
		if (showBodyNames) {
			nameLabel = createNameLabel(
				bodyDisplayName(
					body,
					groupCounters[body.group],
					showRealNames,
					namesEnabled,
				),
			)
			nameLeader = createNameLeaderLine()
			sizeNameLabel(nameLabel, sceneRadius)
			bodyGroup.add(nameLabel)
			bodyGroup.add(nameLeader)
		}

		return {
			body,
			sceneRadius,
			moonSystemOuterRadius,
			isBelt: false,
			bodyGroup,
			mesh,
			cloudsMesh,
			ringMesh,
			meshRestQuaternion: mesh.quaternion.clone(),
			baseQuaternion: mesh.quaternion.clone(),
			moonState,
			nameLabel,
			nameLeader,
			orbitRadius: 0,
			meanAnomalyAtEpoch,
		}
	})

	// --- Orbit rings + asteroid belt rings ---
	function rebuildMoonState(p: PlacedBody) {
		if (p.isBelt || !p.bodyGroup) return
		if (p.moonState) {
			p.bodyGroup.remove(p.moonState.group)
			p.moonState.dispose()
		}
		p.moonState = buildMoonOrbitOverlay(
			p.body.moons,
			p.body.diameterKm / 2,
			currentDay,
			false,
			15,
			showEllipticalOrbits,
			showInclination,
			p.body.rings?.outerRadiusRelative ?? 1,
			p.sceneRadius,
			showAxialTilt,
			showRealisticSizes,
			showBodyNames,
			showRealNames,
			p.body.isMainWorld ? "Luna" : undefined,
			namesEnabled,
		)
		p.moonState.group.scale.setScalar(p.sceneRadius)
		p.bodyGroup.add(p.moonState.group)
	}

	function rebuildAsteroidFieldForPlacedBody(p: PlacedBody) {
		if (!p.isBelt) return
		if (p.asteroidField) {
			group.remove(p.asteroidField.mesh)
			p.asteroidField.mesh.geometry.dispose()
			const material = p.asteroidField.mesh.material
			if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
			else material.dispose()
		}
		p.asteroidField = buildAsteroidField(p.orbitRadius)
		group.add(p.asteroidField.mesh)
	}

	function updateOrbitLineGeometry(p: PlacedBody) {
		if (!p.orbitLine) return
		const orbitPoints: THREE.Vector3[] = []
		for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
			const a = (i / ORBIT_SEGMENTS) * TWO_PI
			orbitPoints.push(
				p.kepler
					? orbitPoint(
							a,
							p.kepler.a,
							p.kepler.b,
							p.kepler.ae,
							p.kepler.P,
							p.kepler.Q,
						)
					: new THREE.Vector3(
							p.orbitRadius * Math.cos(a),
							p.orbitRadius * Math.sin(a),
							0,
						),
			)
		}
		const nextGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints)
		p.orbitLine.geometry.dispose()
		p.orbitLine.geometry = nextGeometry
	}

	function applyPlacedBodyLayout() {
		let previousOuterEdge = starRadius
		for (const p of placed) {
			p.sceneRadius = p.isBelt
				? BELT_SCENE_RADIUS
				: bodySceneRadius(
						p.body.diameterKm,
						p.body.sizeClass,
						showRealisticSizes,
					)
			p.moonSystemOuterRadius = p.isBelt
				? BELT_SCENE_RADIUS
				: measureBodyMoonSystemOuterRadius(
						p.body,
						p.sceneRadius,
						showEllipticalOrbits,
						showRealisticSizes,
					)
			const gap =
				ORBIT_GAP_STAR_RADII * Math.max(p.sceneRadius, starRadius * 0.05)
			const periapsis = previousOuterEdge + gap + p.moonSystemOuterRadius
			p.orbitRadius = periapsis

			if (p.isBelt) {
				p.kepler = undefined
				previousOuterEdge = periapsis + p.moonSystemOuterRadius
				continue
			}

			p.mesh?.scale.setScalar(p.sceneRadius)
			p.cloudsMesh?.scale.setScalar(p.sceneRadius * 1.025)
			p.ringMesh?.scale.setScalar(p.sceneRadius)
			p.moonState?.group.scale.setScalar(p.sceneRadius)
			if (p.nameLabel) {
				sizeNameLabel(p.nameLabel, p.sceneRadius)
			}

			const e = showEllipticalOrbits ? p.body.eccentricity : 0
			const inc = (showInclination ? p.body.inclinationDeg : 0) * DEG2RAD
			const Omega = p.body.longitudeOfAscendingNodeDeg * DEG2RAD
			const omega = p.body.longitudeOfPerihelionDeg * DEG2RAD
			const a = periapsis / (1 - e)
			const b = a * Math.sqrt(1 - e * e)
			const { P, Q } = perifocalBasis(Omega, inc, omega)
			p.kepler = { P, Q, a, b, ae: a * e, e }
			previousOuterEdge = a * (1 + e) + p.moonSystemOuterRadius

			if (p.mesh && p.meshRestQuaternion) {
				p.baseQuaternion = p.meshRestQuaternion.clone()
				p.mesh.quaternion.copy(p.baseQuaternion)
			}
			if (p.moonState) p.moonState.group.quaternion.identity()
			if (p.ringMesh) p.ringMesh.quaternion.identity()

			if (showAxialTilt && p.body.axialTiltDeg) {
				const { Q: tiltAxis } = perifocalBasis(Omega, inc, 0)
				const tiltRad = p.body.axialTiltDeg * DEG2RAD
				const tiltQuat = new THREE.Quaternion().setFromAxisAngle(
					tiltAxis,
					tiltRad,
				)
				if (p.mesh && p.baseQuaternion) {
					p.baseQuaternion = new THREE.Quaternion().multiplyQuaternions(
						tiltQuat,
						p.baseQuaternion,
					)
					p.mesh.quaternion.copy(p.baseQuaternion)
				}
				p.moonState?.group.quaternion.premultiply(tiltQuat)
				p.ringMesh?.quaternion.premultiply(tiltQuat)
			}
		}
		return previousOuterEdge
	}

	let previousOuterEdge = applyPlacedBodyLayout()
	let mainOrbitRadius =
		placed.find((p) => p.body.isMainWorld)?.kepler?.a ??
		placed[0]?.kepler?.a ??
		placed[0]?.orbitRadius ??
		1
	for (const p of placed) {
		const orbitPoints: THREE.Vector3[] = []
		for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
			const a = (i / ORBIT_SEGMENTS) * TWO_PI
			orbitPoints.push(
				p.kepler
					? orbitPoint(
							a,
							p.kepler.a,
							p.kepler.b,
							p.kepler.ae,
							p.kepler.P,
							p.kepler.Q,
						)
					: new THREE.Vector3(
							p.orbitRadius * Math.cos(a),
							p.orbitRadius * Math.sin(a),
							0,
						),
			)
		}
		const orbitLine = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints(orbitPoints),
			new THREE.LineBasicMaterial({
				color: p.body.isMainWorld ? 0x93c5fd : 0x94a3b8,
				transparent: true,
				opacity: p.body.isMainWorld ? 0.75 : 0.5,
				depthWrite: false,
			}),
		)
		orbitLine.renderOrder = 1
		p.orbitLine = orbitLine
		group.add(orbitLine)

		if (p.isBelt) {
			group.add(
				new THREE.Mesh(
					new THREE.RingGeometry(
						p.orbitRadius - BELT_WIDTH / 2,
						p.orbitRadius + BELT_WIDTH / 2,
						128,
					),
					new THREE.MeshBasicMaterial({
						color: 0xb8b8b8,
						transparent: true,
						opacity: 0.25,
						side: THREE.DoubleSide,
					}),
				),
			)
			p.asteroidField = buildAsteroidField(p.orbitRadius)
			group.add(p.asteroidField.mesh)
		}
	}

	// Kepler-like scaling (period grows with orbit radius^1.5), anchored to
	// the main world's real orbital period so its motion stays accurate.
	function periodDaysFor(orbitRadius: number): number {
		if (mainOrbitRadius <= 0) return Math.max(1, daysPerYear)
		return Math.max(1, daysPerYear * (orbitRadius / mainOrbitRadius) ** 1.5)
	}

	const asteroidDummy = new THREE.Object3D()

	function setDay(day: number) {
		currentDay = day
		for (const p of placed) {
			if (p.isBelt) {
				if (p.asteroidField) {
					updateAsteroidField(
						p.asteroidField,
						asteroidDummy,
						day,
						periodDaysFor(p.orbitRadius),
					)
				}
				continue
			}
			if (!p.bodyGroup || !p.kepler) continue
			const period = periodDaysFor(p.kepler.a)
			const M = mod2pi(p.meanAnomalyAtEpoch + (TWO_PI * day) / period)
			const E = solveKepler(M, p.kepler.e)
			const pos = orbitPoint(
				E,
				p.kepler.a,
				p.kepler.b,
				p.kepler.ae,
				p.kepler.P,
				p.kepler.Q,
			)
			p.bodyGroup.position.copy(pos)
			p.moonState?.setDay(day)
		}
	}
	setDay(initialDay)

	function dispose() {
		surfaceTextureLoad.cancel()
		for (const p of placed) p.moonState?.dispose()
		// troika Text's own dispose() releases its SDF glyph atlas/font
		// ref-count too — the generic Mesh handling below only disposes the
		// geometry/material, which isn't enough for it.
		starNameLabel?.dispose()
		for (const p of placed) p.nameLabel?.dispose()
		group.traverse((obj) => {
			if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
				obj.geometry.dispose()
				const materials = Array.isArray(obj.material)
					? obj.material
					: [obj.material]
				for (const m of materials) {
					if (
						m instanceof THREE.MeshBasicMaterial ||
						m instanceof THREE.MeshStandardMaterial
					)
						if (
							m.map &&
							!(
								"sharedTexture" in m.map.userData &&
								m.map.userData.sharedTexture
							)
						)
							m.map.dispose()
					m.dispose()
				}
			} else if (obj instanceof THREE.Sprite) {
				if (
					obj.material.map &&
					!(
						"sharedTexture" in obj.material.map.userData &&
						obj.material.map.userData.sharedTexture
					)
				)
					obj.material.map.dispose()
				obj.material.dispose()
			}
		})
		group.clear()
	}

	const suggestedCameraDistance = previousOuterEdge * 2.2

	function updateLabelOrientations(camera: THREE.PerspectiveCamera): void {
		if (starNameLabel && starNameLeader) {
			updateLabelPlacement(
				starNameLabel,
				starNameLeader,
				starRadius,
				IDENTITY_QUATERNION,
				camera,
			)
		}
		for (const p of placed) {
			if (p.nameLabel && p.nameLeader) {
				updateLabelPlacement(
					p.nameLabel,
					p.nameLeader,
					p.sceneRadius,
					IDENTITY_QUATERNION,
					camera,
				)
			}
			p.moonState?.updateLabelOrientations?.(camera)
		}
	}

	function getBodyFocus(
		bodyIndex: number,
		moonIndex?: number,
	): { position: THREE.Vector3; radius: number } | null {
		if (bodyIndex === -1) {
			return { position: new THREE.Vector3(0, 0, 0), radius: starRadius }
		}
		const p = placed[bodyIndex]
		if (!p) return null
		if (moonIndex !== undefined && p.moonState?.getMoonFocus) {
			const moonFocus = p.moonState.getMoonFocus(moonIndex)
			if (moonFocus) {
				return {
					position: moonFocus.position,
					radius: Math.max(moonFocus.localRadius * p.sceneRadius, 0.01),
				}
			}
		}
		if (p.isBelt) {
			return {
				position: new THREE.Vector3(p.orbitRadius, 0, 0),
				radius: BELT_WIDTH,
			}
		}
		if (!p.bodyGroup) return null
		return {
			position: p.bodyGroup.position.clone(),
			radius: Math.max(p.sceneRadius, p.moonSystemOuterRadius * 0.5),
		}
	}

	const bodySpinQuat = new THREE.Quaternion()
	const bodySpinAxis = new THREE.Vector3(0, 1, 0)
	function setSpinHours(hours: number) {
		currentSpinHours = hours
		for (const p of placed) {
			if (
				!p.isBelt &&
				p.mesh &&
				p.baseQuaternion &&
				p.body.siderealDayHours > 0
			) {
				const lockedSubstellarLon =
					p.body.tideLock?.type === "solar" ? (p.body.substellarLon ?? 0) : null
				const angle =
					lockedSubstellarLon !== null
						? -(lockedSubstellarLon * DEG2RAD)
						: (hours / p.body.siderealDayHours) * TWO_PI
				bodySpinQuat.setFromAxisAngle(bodySpinAxis, angle)
				p.mesh.quaternion.copy(p.baseQuaternion).multiply(bodySpinQuat)
				if (p.cloudsMesh) {
					// Clouds drift slightly faster than the surface -- real
					// atmospheric circulation outpaces solid-body rotation.
					bodySpinQuat.setFromAxisAngle(bodySpinAxis, angle * 1.1)
					p.cloudsMesh.quaternion.copy(p.baseQuaternion).multiply(bodySpinQuat)
				}
			}
			p.moonState?.setSpinHours?.(hours)
		}
	}

	function resolveHitBodyIndex(
		object: THREE.Object3D,
	): { bodyIndex: number; moonIndex?: number } | null {
		if (object === starMesh) return { bodyIndex: -1 }
		for (let i = 0; i < placed.length; i++) {
			const p = placed[i]!
			if (p.mesh === object || p.ringMesh === object) {
				return { bodyIndex: i }
			}
			const moonIndex = p.moonState?.getMoonIndexForMesh?.(object)
			if (moonIndex != null) return { bodyIndex: i, moonIndex }
		}
		return null
	}

	function updateBodies(nextBodies: SystemBody[]) {
		if (nextBodies.length !== placed.length) return false

		for (let i = 0; i < placed.length; i++) {
			const p = placed[i]!
			const nextBody = nextBodies[i]!
			if (p.body.group !== nextBody.group) return false
			if (!!p.body.rings !== !!nextBody.rings) return false
			if (p.body.texturePath !== nextBody.texturePath) return false
			if (p.body.cloudsTexturePath !== nextBody.cloudsTexturePath) return false
			p.body = nextBody
			if (!p.isBelt) rebuildMoonState(p)
		}

		previousOuterEdge = applyPlacedBodyLayout()
		mainOrbitRadius =
			placed.find((p) => p.body.isMainWorld)?.kepler?.a ??
			placed[0]?.kepler?.a ??
			placed[0]?.orbitRadius ??
			1
		for (const p of placed) {
			updateOrbitLineGeometry(p)
			if (p.isBelt) rebuildAsteroidFieldForPlacedBody(p)
		}
		setDay(currentDay)
		setSpinHours(currentSpinHours)
		return true
	}

	return {
		group,
		suggestedCameraDistance,
		setDay,
		updateBodies,
		dispose,
		getBodyFocus,
		setSpinHours,
		resolveHitBodyIndex,
		updateLabelOrientations,
	}
}
