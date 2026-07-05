import * as THREE from "three"
import type { TideLock } from "@/model/celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	moonSemiMajorAxisM,
	resolveMoonOrbitHoursPerDay,
} from "@/model/celestial/moons/orbital-mechanics"
import {
	getStarDiameterSol,
	type MainSequenceClass,
} from "@/model/celestial/star/star-types"
import type { SystemBody } from "@/model/celestial/system/generate-system-bodies"
import {
	BODY_VISUAL_BASE_RADIUS,
	getMoonOrbitDistanceRelativeToPlanet,
	measureMoonOrbitOuterRadiusForDisplay,
	scaleBodyDiameterToVisualRadius,
} from "../moon-visual-scale"
import {
	buildMoonOrbitOverlay,
	type MoonOrbitState,
	mod2pi,
	orbitPoint,
	perifocalBasis,
	solveKepler,
} from "./moon-orbit-overlay"

const DEG2RAD = Math.PI / 180

const TWO_PI = 2 * Math.PI
const ORBIT_SEGMENTS = 256
const PLANET_SCENE_RADIUS = BODY_VISUAL_BASE_RADIUS
const SOLAR_DIAMETER_KM = 1_391_400
const MOON_SYSTEM_SCENE_MIN = 1.35
const MOON_SYSTEM_SCENE_MAX = 2.55
// Visual clearance between one body's outer edge and the next body's orbit,
// as a multiple of the (larger of the two) body's own radius — a real
// AU-based distance would either bunch everything near the star or spread it
// beyond any reasonable camera distance depending on spectral class.
const ORBIT_GAP_STAR_RADII = 1.5
// The true star/planet diameter ratio (~109x for a G star vs. Earth) would
// either swallow the planet or vanish depending on distance if rendered
// literally, so it's compressed with a sqrt curve (same trick used for the
// gas-giant/moon proportions elsewhere in this renderer) — the star still
// reads as dramatically bigger than the planet without dominating the scene.
const MIN_STAR_TO_PLANET_RATIO = 3
const MAX_STAR_TO_PLANET_RATIO = 24
const GLOW_TEXTURE_SIZE = 128
const BELT_SCENE_RADIUS = 0.05
const BELT_WIDTH = 0.12
const ASTEROID_COUNT_PER_BELT = 900
const ASTEROID_MIN_SCALE = 0.006
const ASTEROID_MAX_SCALE = 0.02
const ASTEROID_Z_JITTER = 0.02
const MAIN_WORLD_COLOR = 0x3b82f6
const ROCKY_SIBLING_COLOR = 0x9ca3af

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
	new THREE.TextureLoader().load("/2k_sun.jpg", (loaded) => {
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
		if (cancelled) return
		const grayTexture = new THREE.CanvasTexture(canvas)
		grayTexture.needsUpdate = true
		onReady(grayTexture)
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
): number {
	return scaleBodyDiameterToVisualRadius(diameterKm, PLANET_SCENE_RADIUS)
}

function loadBodyTexture(texturePath: string): THREE.Texture {
	const texture = new THREE.TextureLoader().load(texturePath)
	texture.colorSpace = THREE.SRGBColorSpace
	return texture
}

function measureBodyMoonSystemOuterRadius(
	body: SystemBody,
	sceneRadius: number,
	hoursPerDay: number,
	tideLock: TideLock | null,
	showEllipticalOrbits: boolean,
): number {
	if (body.moons.length === 0) return sceneRadius

	const planetRadiusKm = body.diameterKm / 2
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
		hoursPerDay,
		body.isMainWorld ? tideLock : null,
	)
	const parentOccupiedRadiusRelativeToPlanet =
		body.rings?.outerRadiusRelative ?? 1

	const outerRadiusInMoonOverlayUnits = measureMoonOrbitOuterRadiusForDisplay({
		orbits: body.moons.map((moon) => ({
			orbitalDistancePlanetRadii: getMoonOrbitDistanceRelativeToPlanet(
				moonSemiMajorAxisM(moon, planetMassKg, moonOrbitHoursPerDay),
				planetRadiusKm,
			),
			eccentricity: showEllipticalOrbits ? moon.eccentricity : 0,
			bodyVisualRadius: Math.max(
				0.008,
				scaleBodyDiameterToVisualRadius(moon.diameterKm, PLANET_SCENE_RADIUS) /
					Math.max(sceneRadius, 1e-6),
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
	hoursPerDay: number
	/** Only applied to the main world's own moon system. */
	tideLock: TideLock | null
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
}

export interface SolarSystemOverlayState {
	group: THREE.Group
	suggestedCameraDistance: number
	setDay(day: number): void
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
}

interface PlacedBody {
	body: SystemBody
	sceneRadius: number
	moonSystemOuterRadius: number
	isBelt: boolean
	bodyGroup?: THREE.Group
	moonState?: MoonOrbitState
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
		hoursPerDay,
		tideLock,
		daysPerYear,
		spectralClass,
		starSubtype,
		initialDay,
		showEllipticalOrbits,
		showDaylight,
		showInclination,
	} = params

	const group = new THREE.Group()
	const mainWorld = bodies.find((b) => b.isMainWorld) ?? bodies[0]
	const referenceDiameterKm = mainWorld?.diameterKm || 12_000

	// --- Star ---
	const starDiameterSol = getStarDiameterSol(spectralClass, starSubtype)
	const starDiameterKm = starDiameterSol * SOLAR_DIAMETER_KM
	const trueDiameterRatio = starDiameterKm / referenceDiameterKm
	const starToPlanetRatio = THREE.MathUtils.clamp(
		Math.sqrt(trueDiameterRatio),
		MIN_STAR_TO_PLANET_RATIO,
		MAX_STAR_TO_PLANET_RATIO,
	)
	const starRadius = PLANET_SCENE_RADIUS * starToPlanetRatio
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

	// --- Build every body (siblings + main world), each with its own nested
	// moon system, but don't position them yet — spacing depends on every
	// body's own size, computed below in orbital order. ---
	const placed: PlacedBody[] = bodies.map((body, index) => {
		const meanAnomalyAtEpoch = index * GOLDEN_ANGLE_RAD
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

		const sceneRadius = bodySceneRadius(body.diameterKm)
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
						map: loadBodyTexture("/2k_jupiter.jpg"),
						roughness: 1,
						metalness: 0,
					})
				: new THREE.MeshStandardMaterial({
						color: body.isMainWorld ? MAIN_WORLD_COLOR : ROCKY_SIBLING_COLOR,
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
				const envelope =
					0.18 + Math.sin(normalized * Math.PI) * 0.82
				const broadBands =
					0.72 +
					0.18 * Math.sin(normalized * Math.PI * 5.5 + 0.4) +
					0.1 * Math.sin(normalized * Math.PI * 13.5 + 1.3)
				const fineBands =
					0.9 +
					0.08 * Math.sin(normalized * Math.PI * 36 + 2.1)
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
			const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial)
			ringMesh.scale.setScalar(sceneRadius)
			bodyGroup.add(ringMesh)
		}

		const moonState = buildMoonOrbitOverlay(
			body.moons,
			body.diameterKm / 2,
			hoursPerDay,
			body.isMainWorld ? tideLock : null,
			initialDay,
			false,
			15,
			showEllipticalOrbits,
			showInclination,
			body.rings?.outerRadiusRelative ?? 1,
			sceneRadius,
		)
		moonState.group.scale.setScalar(sceneRadius)
		bodyGroup.add(moonState.group)
		group.add(bodyGroup)

		const moonSystemOuterRadius = measureBodyMoonSystemOuterRadius(
			body,
			sceneRadius,
			hoursPerDay,
			tideLock,
			showEllipticalOrbits,
		)

		return {
			body,
			sceneRadius,
			moonSystemOuterRadius,
			isBelt: false,
			bodyGroup,
			moonState,
			orbitRadius: 0,
			meanAnomalyAtEpoch,
		}
	})

	// --- Sequential diameter-based orbit spacing: each body's orbit clears
	// the previous body's own outer edge (including its moon system) by a
	// gap scaled to its own size, rather than any real AU distance.
	// p.orbitRadius is this spacing floor — treated as the ellipse's
	// periapsis (closest approach), not its semi-major axis, so an eccentric
	// orbit's closest point never dips inside the previous body/star's
	// cleared space regardless of how eccentric it is. The semi-major axis
	// is derived from it (periapsis = a·(1−e)), and the next body's floor is
	// pushed out to clear this body's real apoapsis (a·(1+e)), not just its
	// periapsis, so eccentric orbits can't clip into what comes after them
	// either. ---
	let previousOuterEdge = starRadius
	for (const p of placed) {
		const gap =
			ORBIT_GAP_STAR_RADII * Math.max(p.sceneRadius, starRadius * 0.05)
		const periapsis = previousOuterEdge + gap + p.moonSystemOuterRadius
		p.orbitRadius = periapsis

		if (p.isBelt) {
			previousOuterEdge = periapsis + p.moonSystemOuterRadius
			continue
		}

		const e = showEllipticalOrbits ? p.body.eccentricity : 0
		const inc = (showInclination ? p.body.inclinationDeg : 0) * DEG2RAD
		const Omega = p.body.longitudeOfAscendingNodeDeg * DEG2RAD
		const omega = p.body.argumentOfPeriapsisDeg * DEG2RAD
		const a = periapsis / (1 - e)
		const b = a * Math.sqrt(1 - e * e)
		const { P, Q } = perifocalBasis(Omega, inc, omega)
		p.kepler = { P, Q, a, b, ae: a * e, e }
		previousOuterEdge = a * (1 + e) + p.moonSystemOuterRadius
	}
	const mainOrbitRadius =
		placed.find((p) => p.body.isMainWorld)?.kepler?.a ??
		placed[0]?.kepler?.a ??
		placed[0]?.orbitRadius ??
		1

	// --- Orbit rings + asteroid belt rings ---
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
						m.map?.dispose()
					m.dispose()
				}
			} else if (obj instanceof THREE.Sprite) {
				obj.material.map?.dispose()
				obj.material.dispose()
			}
		})
		group.clear()
	}

	const suggestedCameraDistance = previousOuterEdge * 2.2

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

	return {
		group,
		suggestedCameraDistance,
		setDay,
		dispose,
		getBodyFocus,
	}
}
