import * as THREE from "three"
import type { MoonParams } from "@/model/celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	moonSemiMajorAxisM,
} from "@/model/celestial/moons/orbital-mechanics"
import {
	getMoonOrbitDistanceRelativeToPlanet,
	getMoonRadiusRelativeToPlanet,
	scaleMoonOrbitDistanceForDisplay,
} from "../moon-visual-scale"

const MOON_COLORS_HEX = [0x0ea5e9, 0x8b5cf6, 0x10b981]
const TWO_PI = 2 * Math.PI
const ORBIT_SEGMENTS = 256

function solveKepler(M: number, e: number): number {
	let E = M
	for (let i = 0; i < 50; i++) {
		const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E))
		E += dE
		if (Math.abs(dE) < 1e-12) break
	}
	return E
}

function mod2pi(angle: number): number {
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
function perifocalBasis(
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

function orbitPoint(
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
 * Q is the orbital direction vector (90° ahead), used to orient axial tilt.
 */
function buildMoonMesh(
	radius: number,
	color: number,
	axialTiltDeg: number,
	retrogradeRotation: boolean,
	Q: THREE.Vector3,
	showGrid: boolean,
	gridSpacing: number,
): THREE.Mesh {
	const geo = new THREE.SphereGeometry(radius, 8, 6)
	const moonTex = new THREE.TextureLoader().load("/moon.jpg")
	const mat = new THREE.MeshStandardMaterial({
		map: moonTex,
		roughness: 1,
		metalness: 0,
	})
	const mesh = new THREE.Mesh(geo, mat)
	const tiltRad =
		((axialTiltDeg * Math.PI) / 180) * (retrogradeRotation ? -1 : 1)
	mesh.setRotationFromAxisAngle(Q, tiltRad)

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
}

export function buildMoonOrbitOverlay(
	moons: MoonParams[],
	planetRadiusKm: number,
	hoursPerDay: number,
	initialDay: number,
	showGrid: boolean,
	gridSpacing: number,
	showEllipticalOrbits: boolean,
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
	const maxOrbitalDistancePlanetRadii = Math.max(
		...moons.map((moon) =>
			getMoonOrbitDistanceRelativeToPlanet(
				moonSemiMajorAxisM(moon, planetMassKg, hoursPerDay) *
					(1 + moon.eccentricity),
				planetRadiusKm,
			),
		),
	)

	// Scale all orbits to fit between 1.3 and 2.6 scene units
	// (planet surface = 1.0 scene unit).
	const SCENE_MIN = 1.35
	const SCENE_MAX = 2.55

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
	}> = []

	moons.forEach((moon, i) => {
		const smaM = moonSemiMajorAxisM(moon, planetMassKg, hoursPerDay)
		const orbitalDistancePlanetRadii = getMoonOrbitDistanceRelativeToPlanet(
			smaM,
			planetRadiusKm,
		)
		const a = scaleMoonOrbitDistanceForDisplay({
			orbitalDistancePlanetRadii,
			maxOrbitalDistancePlanetRadii,
			minDisplayDistance: SCENE_MIN,
			maxDisplayDistance: SCENE_MAX,
		})
		const e = showEllipticalOrbits ? moon.eccentricity : 0
		const b = a * Math.sqrt(1 - e * e)
		const ae = a * e

		const Omega = (moon.longitudeOfAscendingNodeDeg * Math.PI) / 180
		const inc = (moon.inclinationDeg * Math.PI) / 180
		const omega = (moon.argumentOfPeriapsisDeg * Math.PI) / 180
		const M0 = (moon.meanAnomalyAtEpochDeg * Math.PI) / 180

		const { P, Q } = perifocalBasis(Omega, inc, omega)
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
		const moonR = Math.max(
			0.008,
			getMoonRadiusRelativeToPlanet(moon.diameterKm, planetRadiusKm),
		)
		const moonMesh = buildMoonMesh(
			moonR,
			moonColor,
			moon.axialTiltDeg,
			moon.retrogradeRotation,
			Q,
			showGrid,
			gridSpacing,
		)
		group.add(moonMesh)
		moonMeshes.push(moonMesh)
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
		})
	})

	function setDay(day: number) {
		for (const d of moonData) {
			const n = TWO_PI / d.period
			const M = mod2pi(d.M0 + n * day)
			const E = solveKepler(M, d.e)
			const pos = orbitPoint(E, d.a, d.b, d.ae, d.P, d.Q)
			d.moonMesh.position.copy(pos)
		}
	}

	setDay(initialDay)

	function dispose() {
		group.traverse((obj) => {
			if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
				obj.geometry.dispose()
				if (Array.isArray(obj.material))
					obj.material.forEach((m) => m.dispose())
				else obj.material.dispose()
			}
		})
		group.clear()
	}

	return { group, setDay, dispose }
}

// ── Gas giant system 3D overlay ───────────────────────────────────────────────

const GG_BAND_COLOR = 0xa16207
const MAIN_MOON_COLOR = 0x60a5fa
const SIBLING_COLORS_HEX = [
	0x94a3b8, 0xa78bfa, 0x34d399, 0xf472b6, 0xfb923c, 0xfbbf24,
]

export function buildGasGiantSystemOverlay(
	system: import("@/model/celestial/moons/moon-types").GasGiantSystem,
	planetRadiusKm: number,
	initialDay: number,
	showGrid: boolean,
	gridSpacing: number,
	showEllipticalOrbits: boolean,
): MoonOrbitState {
	const group = new THREE.Group()

	const {
		gasGiant,
		mainMoonPd,
		mainMoonOrbitalPeriodDays,
		mainMoonInclinationDeg,
		mainMoonEccentricity,
		mainMoonLongitudeOfAscendingNodeDeg,
		mainMoonArgumentOfPeriapsisDeg,
		mainMoonMeanAnomalyAtEpochDeg,
		siblingMoons,
	} = system

	// ── Derive display sizes from actual physical ratios ──────────────────────
	// Planet globe = 1.0 scene unit radius.
	// Gas giant ratio = how many planet-diameters fit across the gas giant.
	const ggRatioToPlanet = gasGiant.diameterKm / (planetRadiusKm * 2)

	// 1:1 scale vs planet globe (globe radius = 1.0), so a 9× gas giant → radius 9.0.
	const GG_SPHERE_R = Math.max(0.5, ggRatioToPlanet)

	// ── Orbital scaling ───────────────────────────────────────────────────────
	// Distances are measured from the gas giant's surface, not its center.
	// smaDisplay(pd) = GG_SPHERE_R + pd * pdToScene * compressionScale
	// so pd=0 sits on the surface and every pd adds proportional distance beyond it.
	const pdToScene = GG_SPHERE_R * 2 // 1 gas-giant diameter in scene units
	const MAX_ORBIT_RADIUS = Math.max(6.0, GG_SPHERE_R * 2.5)
	// Available radius for the pd portion of orbits (beyond the gas giant surface).
	const availR = MAX_ORBIT_RADIUS - GG_SPHERE_R
	const rawMaxApoapsisInPd = Math.max(
		mainMoonPd * (1 + mainMoonEccentricity),
		...siblingMoons.map((m) => m.pd * (1 + m.eccentricity)),
		1,
	)
	const rawMaxApoapsisPdScene = rawMaxApoapsisInPd * pdToScene
	const compressionScale =
		rawMaxApoapsisPdScene > availR ? availR / rawMaxApoapsisPdScene : 1.0

	// SMA from gas giant center = surface offset + scaled pd distance.
	function smaDisplay(pd: number): number {
		return GG_SPHERE_R + pd * pdToScene * compressionScale
	}

	// Gas giant sits at the main planet's actual (compressed) orbital distance.
	const mainOrbitE = showEllipticalOrbits ? mainMoonEccentricity : 0
	const mainOrbitA = smaDisplay(mainMoonPd)
	const mainOrbitB = mainOrbitA * Math.sqrt(1 - mainOrbitE * mainOrbitE)
	const mainOrbitAe = mainOrbitA * mainOrbitE
	const mainOrbitOmegaRad =
		(mainMoonLongitudeOfAscendingNodeDeg * Math.PI) / 180
	const mainOrbitIncRad = (mainMoonInclinationDeg * Math.PI) / 180
	const mainOrbitPeriapsisRad = (mainMoonArgumentOfPeriapsisDeg * Math.PI) / 180
	const mainOrbitM0 = (mainMoonMeanAnomalyAtEpochDeg * Math.PI) / 180
	const { P: mainOrbitP, Q: mainOrbitQ } = perifocalBasis(
		mainOrbitOmegaRad,
		mainOrbitIncRad,
		mainOrbitPeriapsisRad,
	)
	const initialMainOrbitE = solveKepler(mainOrbitM0, mainOrbitE)
	const ggPos = orbitPoint(
		initialMainOrbitE,
		mainOrbitA,
		mainOrbitB,
		mainOrbitAe,
		mainOrbitP,
		mainOrbitQ,
	).multiplyScalar(-1)

	// ── Gas giant subgroup ───────────────────────────────────────────────────
	// perifocalBasis uses Z-north / XY equatorial — same convention as the planet globe.
	// No rotation needed; i=0 orbits lie in XY and moon meshes (Z-north) appear upright.
	const ggGroup = new THREE.Group()
	ggGroup.position.copy(ggPos)
	group.add(ggGroup)

	// Gas giant sphere (at subgroup origin = ggPos in world)
	const ggGeo = new THREE.SphereGeometry(GG_SPHERE_R, 24, 18)
	const jupiterTex = new THREE.TextureLoader().load("/2k_jupiter.jpg")
	const ggMat = new THREE.MeshStandardMaterial({
		map: jupiterTex,
		roughness: 1,
		metalness: 0,
	})
	const ggSpinGroup = new THREE.Group()
	ggGroup.add(ggSpinGroup)
	const ggMesh = new THREE.Mesh(ggGeo, ggMat)
	ggMesh.rotation.x = Math.PI / 2
	ggSpinGroup.add(ggMesh)

	// Grid in Y-up space to match Three.js SphereGeometry UV mapping (poles at ±Y)
	const gridR = GG_SPHERE_R * 1.002
	const GRID_STEPS = 96
	const ggGridMat = () =>
		new THREE.LineBasicMaterial({
			color: GG_BAND_COLOR,
			transparent: true,
			opacity: 0.4,
		})
	for (let latDeg = -90 + gridSpacing; latDeg < 90; latDeg += gridSpacing) {
		const lat = (latDeg * Math.PI) / 180
		const pts: THREE.Vector3[] = []
		for (let s = 0; s <= GRID_STEPS; s++) {
			const lon = (s / GRID_STEPS) * TWO_PI
			pts.push(
				new THREE.Vector3(
					gridR * Math.cos(lat) * Math.cos(lon),
					gridR * Math.sin(lat),
					gridR * Math.cos(lat) * Math.sin(lon),
				),
			)
		}
		ggMesh.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(pts),
				ggGridMat(),
			),
		)
	}
	for (let lonDeg = 0; lonDeg < 360; lonDeg += gridSpacing) {
		const lon = (lonDeg * Math.PI) / 180
		const pts: THREE.Vector3[] = []
		for (let s = 0; s <= GRID_STEPS; s++) {
			const lat = (s / GRID_STEPS - 0.5) * Math.PI
			pts.push(
				new THREE.Vector3(
					gridR * Math.cos(lat) * Math.cos(lon),
					gridR * Math.sin(lat),
					gridR * Math.cos(lat) * Math.sin(lon),
				),
			)
		}
		ggMesh.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(pts),
				ggGridMat(),
			),
		)
	}

	// ── Lightning flashes on the night side ───────────────────────────────────
	const LIGHTNING_COUNT = 10
	const lightningFlashes = Array.from({ length: LIGHTNING_COUNT }, () => {
		const phi = Math.acos(2 * Math.random() - 1)
		const theta = Math.random() * TWO_PI
		const localPos = new THREE.Vector3(
			GG_SPHERE_R * Math.sin(phi) * Math.cos(theta),
			GG_SPHERE_R * Math.sin(phi) * Math.sin(theta),
			GG_SPHERE_R * Math.cos(phi),
		)
		const mat = new THREE.MeshStandardMaterial({
			color: 0x000000,
			emissive: new THREE.Color(0xfff8c0),
			emissiveIntensity: 0,
			roughness: 1,
			metalness: 0,
			transparent: true,
			opacity: 0,
		})
		const mesh = new THREE.Mesh(
			new THREE.SphereGeometry(GG_SPHERE_R * 0.022, 4, 3),
			mat,
		)
		mesh.position.copy(localPos)
		ggMesh.add(mesh)
		return {
			mat,
			localPos: localPos.clone().normalize(),
			phase: Math.random() * TWO_PI,
		}
	})
	let daylightEnabled = false

	// ── Main planet orbit ring ────────────────────────────────────────────────
	// The world sits at the origin, so render the gas giant's mirrored orbital path
	// using the generated main-moon orbital basis instead of a fixed flat circle.
	const mainOrbitPts: THREE.Vector3[] = []
	for (let j = 0; j <= ORBIT_SEGMENTS; j++) {
		const E = (j / ORBIT_SEGMENTS) * TWO_PI
		mainOrbitPts.push(
			orbitPoint(
				E,
				mainOrbitA,
				mainOrbitB,
				mainOrbitAe,
				mainOrbitP,
				mainOrbitQ,
			).multiplyScalar(-1),
		)
	}
	ggGroup.add(
		new THREE.Line(
			new THREE.BufferGeometry().setFromPoints(mainOrbitPts),
			new THREE.LineBasicMaterial({
				color: MAIN_MOON_COLOR,
				transparent: true,
				opacity: 0.35,
			}),
		),
	)

	// Faint arm from gas giant center toward planet origin — updated each frame as GG orbits
	const armGeo = new THREE.BufferGeometry().setFromPoints([
		ggPos.clone(),
		new THREE.Vector3(0, 0, 0),
	])
	group.add(
		new THREE.Line(
			armGeo,
			new THREE.LineBasicMaterial({
				color: MAIN_MOON_COLOR,
				transparent: true,
				opacity: 0.12,
			}),
		),
	)

	// ── Sibling moon orbits ───────────────────────────────────────────────────
	const siblingData: Array<{
		a: number
		b: number
		ae: number
		e: number
		period: number
		M0: number
		P: THREE.Vector3
		Q: THREE.Vector3
		mesh: THREE.Mesh
	}> = []

	siblingMoons.forEach((moon, i) => {
		const e = showEllipticalOrbits ? moon.eccentricity : 0
		// Clamp SMA so periapsis (a*(1-e)) never dips inside the gas giant sphere
		const rawA = smaDisplay(moon.pd)
		const minA = e < 1 ? GG_SPHERE_R / (1 - e) : rawA
		const a = Math.max(rawA, minA)
		const b = a * Math.sqrt(1 - e * e)
		const ae = a * e

		const OmegaRad = (moon.longitudeOfAscendingNodeDeg * Math.PI) / 180
		const incRad = (moon.inclinationDeg * Math.PI) / 180
		const omegaRad = (moon.argumentOfPeriapsisDeg * Math.PI) / 180
		const M0 = (moon.meanAnomalyAtEpochDeg * Math.PI) / 180

		// No manual frame rotation needed — ggGroup's −90° X handles it.
		const { P, Q } = perifocalBasis(OmegaRad, incRad, omegaRad)
		const color = SIBLING_COLORS_HEX[i % SIBLING_COLORS_HEX.length] ?? 0x94a3b8

		// Orbit path (in subgroup space, no ggPos offset)
		const pathPts: THREE.Vector3[] = []
		for (let j = 0; j <= ORBIT_SEGMENTS; j++) {
			const E = (j / ORBIT_SEGMENTS) * TWO_PI
			pathPts.push(orbitPoint(E, a, b, ae, P, Q))
		}
		ggGroup.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(pathPts),
				new THREE.LineBasicMaterial({
					color,
					transparent: true,
					opacity: 0.28,
				}),
			),
		)

		// Moon body in subgroup space — Z-north maps to world Y via ggGroup rotation.
		const moonRatioToGG = moon.diameterKm / gasGiant.diameterKm
		const moonR = Math.max(
			0.015,
			Math.min(GG_SPHERE_R * 0.25, GG_SPHERE_R * moonRatioToGG * 2),
		)
		const moonMesh = buildMoonMesh(
			moonR,
			color,
			moon.axialTiltDeg,
			moon.retrogradeRotation,
			Q,
			showGrid,
			gridSpacing,
		)
		ggGroup.add(moonMesh)

		siblingData.push({
			a,
			b,
			ae,
			e,
			period: moon.orbitalPeriodDays,
			M0,
			P,
			Q,
			mesh: moonMesh,
		})
	})

	function setDay(day: number) {
		// Mirror the main moon's orbit so the gas giant moves correctly in the
		// terrestrial world's planet-centered frame.
		const mainN = TWO_PI / mainMoonOrbitalPeriodDays
		const mainM = mod2pi(mainOrbitM0 + mainN * day)
		const mainE = solveKepler(mainM, mainOrbitE)
		const newGGPos = orbitPoint(
			mainE,
			mainOrbitA,
			mainOrbitB,
			mainOrbitAe,
			mainOrbitP,
			mainOrbitQ,
		).multiplyScalar(-1)
		ggGroup.position.copy(newGGPos)

		// Spin gas giant on its axis
		ggSpinGroup.rotation.z = (TWO_PI / (gasGiant.dayLengthHours / 24)) * day

		// Update arm line start point
		const armPos = armGeo.getAttribute("position") as THREE.BufferAttribute
		armPos.setXYZ(0, newGGPos.x, newGGPos.y, newGGPos.z)
		armPos.needsUpdate = true

		// Sun direction relative to GG center, so the lit hemisphere shifts as GG orbits
		// Lightning flashes: MeshStandardMaterial handles day/night via scene lighting.
		// Drive emissiveIntensity so flashes glow on the night side naturally.
		if (daylightEnabled) {
			for (const f of lightningFlashes) {
				const t = day * 18 + f.phase
				const pulse = Math.pow(
					Math.max(0, Math.sin(t) * Math.sin(t * 1.73 + f.phase)),
					6,
				)
				f.mat.opacity = pulse
				f.mat.emissiveIntensity = pulse * 2.5
			}
		}

		// Sibling moons in ggGroup space
		for (const d of siblingData) {
			const n = TWO_PI / d.period
			const M = mod2pi(d.M0 + n * day)
			const E = solveKepler(M, d.e)
			const pos = orbitPoint(E, d.a, d.b, d.ae, d.P, d.Q)
			d.mesh.position.copy(pos)
		}
	}

	setDay(initialDay)

	function dispose() {
		group.traverse((obj) => {
			if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
				obj.geometry.dispose()
				if (Array.isArray(obj.material))
					obj.material.forEach((m) => m.dispose())
				else obj.material.dispose()
			}
		})
		group.clear()
	}

	// Suggest a camera distance that frames the whole system with breathing room.
	const maxSiblingApoapsis =
		siblingMoons.length > 0
			? Math.max(
					...siblingMoons.map((m) => {
						const e = m.eccentricity
						const rawA = smaDisplay(m.pd)
						const minA = e < 1 ? GG_SPHERE_R / (1 - e) : rawA
						return Math.max(rawA, minA) * (1 + e)
					}),
				)
			: 0
	const mainOrbitApoapsis = mainOrbitA * (1 + mainOrbitE)
	const systemRadius =
		mainOrbitApoapsis + Math.max(GG_SPHERE_R, maxSiblingApoapsis)
	const suggestedMaxDistance = systemRadius * 2.5

	function setDaylightMode(enabled: boolean) {
		daylightEnabled = enabled
		if (!enabled) {
			for (const f of lightningFlashes) {
				f.mat.opacity = 0
				f.mat.emissiveIntensity = 0
			}
		}
	}

	return { group, setDay, dispose, suggestedMaxDistance, setDaylightMode }
}
