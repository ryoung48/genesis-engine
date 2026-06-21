import * as THREE from "three"
import type { MoonParams } from "@/model/celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	moonSemiMajorAxisM,
} from "@/model/celestial/moons/orbital-mechanics"

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

export interface MoonOrbitState {
	group: THREE.Group
	/** Update moon positions for a new day without rebuilding geometry. */
	setDay(day: number): void
	/** Tilt the orbit group to match the sun's current sub-solar latitude.
	 *  Pass the unit sun direction vector (same coords as scene sun.position). */
	setTilt(sx: number, sy: number, sz: number): void
	dispose(): void
}

export function buildMoonOrbitOverlay(
	moons: MoonParams[],
	planetRadiusKm: number,
	hoursPerDay: number,
	initialDay: number,
	showGrid: boolean,
	gridSpacing: number,
): MoonOrbitState {
	const group = new THREE.Group()
	if (moons.length === 0) {
		return {
			group,
			setDay: () => undefined,
			setTilt: () => undefined,
			dispose: () => {
				group.clear()
			},
		}
	}

	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const maxSmaM = Math.max(
		...moons.map((m) => moonSemiMajorAxisM(m, planetMassKg, hoursPerDay)),
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
		const frac = moons.length === 1 ? 0.5 : smaM / maxSmaM
		const a = SCENE_MIN + frac * (SCENE_MAX - SCENE_MIN)
		const e = moon.eccentricity
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

		// Periapsis tick (E=0) — solid radial line
		const periPos = orbitPoint(0, a, b, ae, P, Q)
		const periDir = periPos.clone().normalize()
		const periGeo = new THREE.BufferGeometry().setFromPoints([
			periPos.clone().addScaledVector(periDir, -0.04),
			periPos.clone().addScaledVector(periDir, 0.04),
		])
		group.add(
			new THREE.Line(
				periGeo,
				new THREE.LineBasicMaterial({
					color: lineColor,
					transparent: true,
					opacity: 0.55,
				}),
			),
		)

		// Apoapsis tick (E=π) — radial tick, slightly longer than periapsis
		const apoPos = orbitPoint(Math.PI, a, b, ae, P, Q)
		const apoDir = apoPos.clone().normalize()
		const apoGeo = new THREE.BufferGeometry().setFromPoints([
			apoPos.clone().addScaledVector(apoDir, -0.065),
			apoPos.clone().addScaledVector(apoDir, 0.065),
		])
		group.add(
			new THREE.Line(
				apoGeo,
				new THREE.LineBasicMaterial({
					color: lineColor,
					transparent: true,
					opacity: 0.8,
				}),
			),
		)

		// --- Moon body (lit by the scene sun/ambient lights) ---
		const moonR = Math.max(
			0.008,
			(0.035 * (moon.diameterKm / planetRadiusKm)) / (3474 / 6371),
		)
		const moonGeo = new THREE.SphereGeometry(moonR, 8, 6)
		const moonMat = new THREE.MeshStandardMaterial({
			color: 0xcbd5e1,
			roughness: 1,
			metalness: 0,
		})
		const moonMesh = new THREE.Mesh(moonGeo, moonMat)
		group.add(moonMesh)

		// Lat/lon grid lines on moon surface matching the planet grid spacing
		if (showGrid) {
			const R = moonR
			const gridRadius = R * 1.01
			const STEPS = 64
			const gridMat = new THREE.LineBasicMaterial({
				color: moonColor,
				transparent: true,
				opacity: 0.45,
				linewidth: 0.5,
				depthTest: true,
			})
			const addLine = (pts: THREE.Vector3[]) => {
				const g = new THREE.BufferGeometry().setFromPoints(pts)
				moonMesh.add(new THREE.Line(g, gridMat.clone()))
			}
			// Latitude lines at every gridSpacing degrees
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
			// Longitude lines at every gridSpacing degrees
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

	// Tilt the entire group so the equatorial plane appears tilted by the same
	// angle as the planet's axial tilt illusion (sub-solar latitude).
	// The tilt axis is perpendicular to the sun's XY projection, so the north
	// pole tips toward the sun — matching what a real observer would see.
	function setTilt(sx: number, sy: number, sz: number) {
		const tiltAngle = Math.asin(Math.max(-1, Math.min(1, sz)))
		const xyLen = Math.sqrt(sx * sx + sy * sy)
		if (xyLen < 1e-6) {
			group.rotation.set(0, 0, 0)
			return
		}
		group.setRotationFromAxisAngle(
			new THREE.Vector3(-sy / xyLen, sx / xyLen, 0),
			-tiltAngle,
		)
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

	return { group, setDay, setTilt, dispose }
}
