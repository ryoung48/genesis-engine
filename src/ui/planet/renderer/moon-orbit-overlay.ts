import * as THREE from "three"
import type { MoonParams, TideLock } from "@/model/celestial/moons/moon-types"
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

const MOON_COLORS_HEX = [0x0ea5e9, 0x8b5cf6, 0x10b981]
const TWO_PI = 2 * Math.PI
const ORBIT_SEGMENTS = 256

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
	/** World-space position + this overlay's local (pre-parent-scale) display
	 * radius for a given moon, for camera-focus purposes. */
	getMoonFocus?(
		moonIndex: number,
	): { position: THREE.Vector3; localRadius: number } | null
}

export function buildMoonOrbitOverlay(
	moons: MoonParams[],
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
			0.008,
			parentSceneRadiusForGlobalScaling && parentSceneRadiusForGlobalScaling > 0
				? scaleBodyDiameterToVisualRadius(
						moon.diameterKm,
						BODY_VISUAL_BASE_RADIUS,
					) /
					parentSceneRadiusForGlobalScaling
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
				bodyVisualRadius: moonDisplayRadii[index] ?? 0.008,
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
	}> = []

	moons.forEach((moon, i) => {
		const periapsis = orbitPeriapses[i] ?? SCENE_MIN
		const e = showEllipticalOrbits ? moon.eccentricity : 0
		const a = periapsis / (1 - e)
		const b = a * Math.sqrt(1 - e * e)
		const ae = a * e

		const Omega = (moon.longitudeOfAscendingNodeDeg * Math.PI) / 180
		const inc = ((showInclination ? moon.inclinationDeg : 0) * Math.PI) / 180
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
		const moonR = moonDisplayRadii[i] ?? 0.008
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

	function getMoonFocus(moonIndex: number) {
		const mesh = moonMeshes[moonIndex]
		if (!mesh) return null
		mesh.updateWorldMatrix(true, false)
		const position = new THREE.Vector3()
		mesh.getWorldPosition(position)
		return { position, localRadius: moonDisplayRadii[moonIndex] ?? 0.008 }
	}

	return { group, setDay, dispose, getMoonFocus }
}
