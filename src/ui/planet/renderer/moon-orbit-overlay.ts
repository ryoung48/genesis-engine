import * as THREE from "three"
import type { MoonBody, TideLock } from "@/model/celestial/moons/moon-types"
import { estimateMoonSizeClassFromDiameter } from "@/model/celestial/moons/moon-utils"
import {
	derivePlanetMassKg,
	moonSemiMajorAxisM,
	resolveMoonOrbitHoursPerDay,
} from "@/model/celestial/moons/orbital-mechanics"
import {
	BODY_VISUAL_BASE_RADIUS,
	getMoonOrbitDistanceRelativeToPlanet,
	layoutMoonOrbitPeriapsesForDisplay,
	scaleBodyDiameterToVisualRadius,
} from "../moon-visual-scale"
import {
	createNameLabel,
	createNameLeaderLine,
	sizeNameLabel,
	type Text,
	updateLabelPlacement,
} from "./body-name-label"

const MOON_COLORS_HEX = [0x0ea5e9, 0x8b5cf6, 0x10b981]
const TWO_PI = 2 * Math.PI
const ORBIT_SEGMENTS = 256
const MIN_MOON_VISUAL_RADIUS = 0.004
const textureLoader = new THREE.TextureLoader()
let sharedMoonTexture: THREE.Texture | null = null
const namedMoonTextureCache = new Map<string, THREE.Texture>()

function loadMoonTexture(texturePath: string): THREE.Texture {
	const cached = namedMoonTextureCache.get(texturePath)
	if (cached) return cached
	const texture = textureLoader.load(texturePath)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.userData.sharedTexture = true
	namedMoonTextureCache.set(texturePath, texture)
	return texture
}

export function solveKepler(M: number, e: number): number {
	let E = M
	for (let i = 0; i < 50; i++) {
		const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E))
		E += dE
		if (Math.abs(dE) < 1e-12) break
	}
	return E
}

export function mod2pi(angle: number): number {
	return ((angle % TWO_PI) + TWO_PI) % TWO_PI
}

/**
 * Builds perifocal unit vectors P and Q in the equatorial frame.
 *
 * The globe uses Z-up geography: x = r·cos(lat)·cos(lon),
 * y = r·cos(lat)·sin(lon), z = r·sin(lat).  North pole = +Z,
 * equatorial plane = XY.  This matches the standard orbital mechanics
 * convention (Z-up), so we use the textbook rotation directly:
 *   R_z(Ω) · R_x(i) · R_z(ω)
 *
 * P points toward periapsis; Q is 90° ahead in the orbit direction.
 */
export function perifocalBasis(
	OmegaRad: number,
	incRad: number,
	omegaRad: number,
): { P: THREE.Vector3; Q: THREE.Vector3 } {
	const cosO = Math.cos(OmegaRad),
		sinO = Math.sin(OmegaRad)
	const cosI = Math.cos(incRad),
		sinI = Math.sin(incRad)
	const cosW = Math.cos(omegaRad),
		sinW = Math.sin(omegaRad)

	const P = new THREE.Vector3(
		cosO * cosW - sinO * sinW * cosI,
		sinO * cosW + cosO * sinW * cosI,
		sinW * sinI,
	)
	const Q = new THREE.Vector3(
		-cosO * sinW - sinO * cosW * cosI,
		-sinO * sinW + cosO * cosW * cosI,
		cosW * sinI,
	)
	return { P, Q }
}

export function orbitPoint(
	E: number,
	a: number,
	b: number,
	ae: number,
	P: THREE.Vector3,
	Q: THREE.Vector3,
): THREE.Vector3 {
	const xp = a * (Math.cos(E) - ae / a) // = a*(cos E - e)
	const yp = b * Math.sin(E)
	return new THREE.Vector3(
		xp * P.x + yp * Q.x,
		xp * P.y + yp * Q.y,
		xp * P.z + yp * Q.z,
	)
}

/**
 * Builds a moon sphere with optional lat/lon grid lines.
 * `tiltAxis` orients the axial tilt — anchored to the ascending node (not
 * periapsis), so it stays fixed as the moon's own periapsis is varied.
 */
function buildMoonMesh(
	radius: number,
	color: number,
	axialTiltDeg: number,
	tiltAxis: THREE.Vector3,
	showGrid: boolean,
	gridSpacing: number,
	texturePath?: string,
): THREE.Mesh {
	const geo = new THREE.SphereGeometry(radius, 8, 6)
	let map: THREE.Texture
	if (texturePath) {
		map = loadMoonTexture(texturePath)
	} else {
		if (!sharedMoonTexture) {
			sharedMoonTexture = textureLoader.load("/sol/earth/moon.jpg")
			sharedMoonTexture.colorSpace = THREE.SRGBColorSpace
			sharedMoonTexture.userData.sharedTexture = true
		}
		map = sharedMoonTexture
	}
	const mat = new THREE.MeshStandardMaterial({
		map,
		roughness: 1,
		metalness: 0,
	})
	const mesh = new THREE.Mesh(geo, mat)
	// SphereGeometry's poles sit on ±Y, but this scene's equatorial plane is
	// XY (Z-north) — same quarter-turn the terrestrial/gas-giant meshes get
	// elsewhere in this renderer. Composed as a quaternion (pole correction
	// first, tilt on top) rather than baked into the geometry, so the spin
	// axis below — which spins in the mesh's local (pre-pole-correction) Y,
	// matching the same convention setSpinHours uses for planets — still
	// lines up with the true polar axis.
	const poleQuat = new THREE.Quaternion().setFromAxisAngle(
		new THREE.Vector3(1, 0, 0),
		Math.PI / 2,
	)
	const tiltRad = (axialTiltDeg * Math.PI) / 180
	const tiltQuat = new THREE.Quaternion().setFromAxisAngle(tiltAxis, tiltRad)
	mesh.quaternion.multiplyQuaternions(tiltQuat, poleQuat)

	if (showGrid) {
		const gridRadius = radius * 1.01
		const STEPS = 64
		const gridMat = new THREE.LineBasicMaterial({
			color,
			transparent: true,
			opacity: 0.2,
			linewidth: 0.5,
			depthTest: true,
		})
		const addLine = (pts: THREE.Vector3[]) => {
			mesh.add(
				new THREE.Line(
					new THREE.BufferGeometry().setFromPoints(pts),
					gridMat.clone(),
				),
			)
		}
		for (let latDeg = -90 + gridSpacing; latDeg < 90; latDeg += gridSpacing) {
			const lat = (latDeg * Math.PI) / 180
			const pts: THREE.Vector3[] = []
			for (let s = 0; s <= STEPS; s++) {
				const lon = (s / STEPS) * TWO_PI
				pts.push(
					new THREE.Vector3(
						gridRadius * Math.cos(lat) * Math.cos(lon),
						gridRadius * Math.cos(lat) * Math.sin(lon),
						gridRadius * Math.sin(lat),
					),
				)
			}
			addLine(pts)
		}
		for (let lonDeg = 0; lonDeg < 360; lonDeg += gridSpacing) {
			const lon = (lonDeg * Math.PI) / 180
			const pts: THREE.Vector3[] = []
			for (let s = 0; s <= STEPS; s++) {
				const lat = (s / STEPS - 0.5) * Math.PI
				pts.push(
					new THREE.Vector3(
						gridRadius * Math.cos(lat) * Math.cos(lon),
						gridRadius * Math.cos(lat) * Math.sin(lon),
						gridRadius * Math.sin(lat),
					),
				)
			}
			addLine(pts)
		}
	}
	return mesh
}

export interface MoonOrbitState {
	group: THREE.Group
	/** Suggested camera maxDistance for this system. */
	suggestedMaxDistance?: number
	/** Update moon positions for a new day without rebuilding geometry. */
	setDay(day: number): void
	/** Toggle daylight-dependent effects (atmosphere rim, lightning). */
	setDaylightMode?(enabled: boolean): void
	dispose(): void
	/** World-space position + this overlay's local (pre-parent-scale) display
	 * radius for a given moon, for camera-focus purposes. */
	getMoonFocus?(
		moonIndex: number,
	): { position: THREE.Vector3; localRadius: number } | null
	/** Spins every moon mesh around its own (tilted) axis by a fraction of a
	 * full turn derived from `hours` and that moon's own rotation period. */
	setSpinHours?(hours: number): void
	/** Index of the moon whose mesh is (or contains) `object`, e.g. for
	 * resolving a raycast hit back to a moon — null if no match. */
	getMoonIndexForMesh?(object: THREE.Object3D): number | null
	/** Re-billboards every visible moon name label to face the camera — see
	 * the same method on SolarSystemOverlayState for why this needs its own
	 * per-frame hook. */
	updateLabelOrientations?(camera: THREE.PerspectiveCamera): void
}

export function buildMoonOrbitOverlay(
	moons: MoonBody[],
	planetRadiusKm: number,
	hoursPerDay: number,
	tideLock: TideLock | null,
	initialDay: number,
	showGrid: boolean,
	gridSpacing: number,
	showEllipticalOrbits: boolean,
	showInclination: boolean = true,
	parentOccupiedRadiusRelativeToPlanet: number = 1,
	parentSceneRadiusForGlobalScaling?: number,
	showAxialTilt: boolean = true,
	realisticSizes: boolean = true,
	showMoonNames: boolean = false,
	showRealNames: boolean = false,
	/** Real-name fallback for the first moon (index 0) when it has no
	 * `name` of its own — e.g. "Luna" for the main world's default single
	 * moon, which may still be unnamed in non-Sol procedural systems. */
	firstMoonFallbackRealName?: string,
	/** Whether to show a moon's own (procedurally generated or real) `name`
	 * at all — unlike showRealNames (Sol-only real-name spoiler gate), this
	 * is true for any generated moon name, Sol or not. */
	namesEnabled: boolean = false,
): MoonOrbitState {
	const group = new THREE.Group()
	if (moons.length === 0) {
		return {
			group,
			setDay: () => undefined,
			dispose: () => {
				group.clear()
			},
		}
	}

	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
		hoursPerDay,
		tideLock,
	)
	// Scale all orbits to fit between 1.3 and 2.6 scene units
	// (planet surface = 1.0 scene unit).
	const SCENE_MIN = 1.35
	const SCENE_MAX = 2.55
	const moonDisplayRadii = moons.map((moon) =>
		Math.max(
			MIN_MOON_VISUAL_RADIUS,
			parentSceneRadiusForGlobalScaling && parentSceneRadiusForGlobalScaling > 0
				? scaleBodyDiameterToVisualRadius(
						moon.diameterKm,
						BODY_VISUAL_BASE_RADIUS,
						realisticSizes,
						moon.sizeClass ??
							estimateMoonSizeClassFromDiameter(moon.diameterKm),
					) / parentSceneRadiusForGlobalScaling
				: moon.diameterKm / Math.max(planetRadiusKm * 2, 1),
		),
	)
	const orbitPeriapses = layoutMoonOrbitPeriapsesForDisplay({
		orbits: moons.map((moon, index) => {
			const smaM = moonSemiMajorAxisM(moon, planetMassKg, moonOrbitHoursPerDay)
			return {
				orbitalDistancePlanetRadii: getMoonOrbitDistanceRelativeToPlanet(
					smaM,
					planetRadiusKm,
				),
				eccentricity: showEllipticalOrbits ? moon.eccentricity : 0,
				bodyVisualRadius: moonDisplayRadii[index] ?? MIN_MOON_VISUAL_RADIUS,
			}
		}),
		parentVisualRadius: parentOccupiedRadiusRelativeToPlanet,
		minDisplayDistance: SCENE_MIN,
		maxDisplayDistance: SCENE_MAX,
	})

	const moonMeshes: THREE.Mesh[] = []
	const moonData: Array<{
		a: number
		b: number
		ae: number
		period: number
		M0: number
		e: number
		P: THREE.Vector3
		Q: THREE.Vector3
		moonMesh: THREE.Mesh
		baseQuaternion: THREE.Quaternion
		spinPeriodHours: number
		nameLabelAnchor?: THREE.Group
		nameLabel?: Text
		nameLeader?: THREE.Line
		localRadius: number
	}> = []

	moons.forEach((moon, i) => {
		const periapsis = orbitPeriapses[i] ?? SCENE_MIN
		const e = showEllipticalOrbits ? moon.eccentricity : 0
		const a = periapsis / (1 - e)
		const b = a * Math.sqrt(1 - e * e)
		const ae = a * e

		const Omega = (moon.longitudeOfAscendingNodeDeg * Math.PI) / 180
		const inc = ((showInclination ? moon.inclinationDeg : 0) * Math.PI) / 180
		const omega = (moon.longitudeOfPerihelionDeg * Math.PI) / 180
		const M0 = (moon.meanAnomalyAtEpochDeg * Math.PI) / 180

		const { P, Q } = perifocalBasis(Omega, inc, omega)
		// The tilt axis is deliberately NOT derived from omega (periapsis) —
		// using the periapsis-relative Q here would lock the tilt direction
		// to periapsis, so moving periapsis would drag the tilt axis along
		// with it and the two could never be phased against each other (e.g.
		// periapsis landing at a solstice vs. an equinox). Anchoring it to
		// the ascending node instead (omega=0) keeps it fixed as periapsis
		// moves independently.
		const { Q: tiltAxis } = perifocalBasis(Omega, inc, 0)
		const moonColor = MOON_COLORS_HEX[i % MOON_COLORS_HEX.length]
		const lineColor = moonColor

		// --- Orbit path ---
		const pathPoints: THREE.Vector3[] = []
		for (let j = 0; j <= ORBIT_SEGMENTS; j++) {
			const E = (j / ORBIT_SEGMENTS) * TWO_PI
			pathPoints.push(orbitPoint(E, a, b, ae, P, Q))
		}
		const orbitGeo = new THREE.BufferGeometry().setFromPoints(pathPoints)
		const orbitMat = new THREE.LineBasicMaterial({
			color: lineColor,
			transparent: true,
			opacity: 0.4,
		})
		group.add(new THREE.Line(orbitGeo, orbitMat))

		// --- Moon body ---
		const moonR = moonDisplayRadii[i] ?? MIN_MOON_VISUAL_RADIUS
		const moonMesh = buildMoonMesh(
			moonR,
			moonColor,
			showAxialTilt ? moon.axialTiltDeg : 0,
			tiltAxis,
			showGrid,
			gridSpacing,
			moon.texturePath,
		)
		group.add(moonMesh)
		moonMeshes.push(moonMesh)

		// Name label — a translate-only anchor (not the moonMesh itself, which
		// rotates via axial tilt + spin) so the label/leader don't inherit
		// that rotation. Its position is kept in sync with moonMesh in setDay.
		let nameLabelAnchor: THREE.Group | undefined
		let nameLabel: Text | undefined
		let nameLeader: THREE.Line | undefined
		if (showMoonNames) {
			nameLabelAnchor = new THREE.Group()
			const moonName =
				namesEnabled && moon.name
					? moon.name
					: showRealNames && i === 0 && firstMoonFallbackRealName
						? firstMoonFallbackRealName
						: `Moon ${i + 1}`
			nameLabel = createNameLabel(moonName)
			nameLeader = createNameLeaderLine()
			sizeNameLabel(nameLabel, moonR)
			nameLabelAnchor.add(nameLabel)
			nameLabelAnchor.add(nameLeader)
			group.add(nameLabelAnchor)
		}

		moonData.push({
			a,
			b,
			ae,
			period: moon.orbitalPeriodDays,
			M0,
			e,
			P,
			Q,
			moonMesh,
			baseQuaternion: moonMesh.quaternion.clone(),
			spinPeriodHours: moon.siderealDayHours,
			nameLabelAnchor,
			nameLabel,
			nameLeader,
			localRadius: moonR,
		})
	})

	function setDay(day: number) {
		for (const d of moonData) {
			const n = TWO_PI / d.period
			const M = mod2pi(d.M0 + n * day)
			const E = solveKepler(M, d.e)
			const pos = orbitPoint(E, d.a, d.b, d.ae, d.P, d.Q)
			d.moonMesh.position.copy(pos)
			d.nameLabelAnchor?.position.copy(pos)
		}
	}

	setDay(initialDay)

	function dispose() {
		// troika Text's own dispose() releases its SDF glyph atlas/font
		// ref-count too — the generic Mesh handling below only disposes the
		// geometry/material, which isn't enough for it.
		for (const d of moonData) d.nameLabel?.dispose()
		group.traverse((obj) => {
			if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
				obj.geometry.dispose()
				if (Array.isArray(obj.material))
					obj.material.forEach((m) => {
						if (
							"map" in m &&
							m.map &&
							!(
								"sharedTexture" in m.map.userData &&
								m.map.userData.sharedTexture
							)
						)
							m.map.dispose()
						m.dispose()
					})
				else {
					if (
						"map" in obj.material &&
						obj.material.map &&
						!(
							"sharedTexture" in obj.material.map.userData &&
							obj.material.map.userData.sharedTexture
						)
					)
						obj.material.map.dispose()
					obj.material.dispose()
				}
			}
		})
		group.clear()
	}

	function getMoonFocus(moonIndex: number) {
		const mesh = moonMeshes[moonIndex]
		if (!mesh) return null
		mesh.updateWorldMatrix(true, false)
		const position = new THREE.Vector3()
		mesh.getWorldPosition(position)
		return {
			position,
			localRadius: moonDisplayRadii[moonIndex] ?? MIN_MOON_VISUAL_RADIUS,
		}
	}

	const spinQuat = new THREE.Quaternion()
	const spinAxis = new THREE.Vector3(0, 1, 0)
	function setSpinHours(hours: number) {
		for (const d of moonData) {
			if (d.spinPeriodHours <= 0) continue
			const angle = (hours / d.spinPeriodHours) * TWO_PI
			spinQuat.setFromAxisAngle(spinAxis, angle)
			d.moonMesh.quaternion.copy(d.baseQuaternion).multiply(spinQuat)
		}
	}

	function getMoonIndexForMesh(object: THREE.Object3D): number | null {
		const index = moonMeshes.indexOf(object as THREE.Mesh)
		return index === -1 ? null : index
	}

	function updateLabelOrientations(camera: THREE.PerspectiveCamera): void {
		for (const d of moonData) {
			if (!d.nameLabel || !d.nameLeader) continue
			// `group` carries the parent planet's axial tilt (premultiplied in
			// once by the caller) — passing its quaternion here cancels that
			// rotation so the label still points toward the camera's own
			// on-screen "up" rather than the tilted orbital plane's.
			updateLabelPlacement(
				d.nameLabel,
				d.nameLeader,
				d.localRadius,
				group.quaternion,
				camera,
			)
		}
	}

	return {
		group,
		setDay,
		dispose,
		getMoonFocus,
		setSpinHours,
		getMoonIndexForMesh,
		updateLabelOrientations,
	}
}
