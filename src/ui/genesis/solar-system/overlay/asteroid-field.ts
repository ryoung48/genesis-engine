import * as THREE from "three"
import { BELT_WIDTH, TWO_PI } from "@/ui/genesis/solar-system/overlay/constants"
import { loadBodyTexture } from "@/ui/genesis/solar-system/overlay/textures"
import type { AsteroidFieldData } from "@/ui/genesis/solar-system/overlay/types"

const ASTEROID_TEXTURE_PATH =
	"/textures/celestial/generated/asteroids/rocky/1.png"
const ICE_ASTEROID_TEXTURE_PATH =
	"/textures/celestial/generated/asteroids/ice/1.png"

// Scatters a field of small, irregularly-scaled rocks around a belt's ring —
// each on its own randomized circular sub-orbit (slightly jittered radius and
// out-of-plane offset) plus a random tumble, so the belt reads as a lively
// swarm rather than a flat static band.
export function buildAsteroidField(
	orbitRadius: number,
	// Belts never get a real temperature estimate (seismology/index.ts skips
	// it for group "asteroid belt"), so orbital zone is the only signal
	// available to approximate "frozen" -- an outer-zone belt gets the icy
	// variant, everything else the rocky one.
	isOuterZone: boolean,
): AsteroidFieldData {
	// Scene orbit radii are packed by rendered size, not real AU (see
	// ORBIT_GAP_STAR_RADII's own doc elsewhere), so a belt close to the star
	// can end up with a far smaller ring circumference than one further out.
	// A fixed rock count spread over a fixed-width band ignored that entirely
	// -- every belt got the same 900 rocks regardless of ring size, so a
	// small-radius inner belt packed them into a much shorter circumference
	// and looked badly overcrowded while a large-radius outer belt (already
	// hitting the cap below) looked fine. Scaling count by orbitRadius keeps
	// rocks-per-unit-circumference roughly constant across belts instead.
	const count = Math.round(
		Math.min(
			ASTEROID_COUNT_MAX,
			Math.max(ASTEROID_COUNT_MIN, orbitRadius * ASTEROID_DENSITY_PER_RADIUS),
		),
	)
	const geometry = new THREE.IcosahedronGeometry(1, 0)
	// Every instance shares this one texture (loadBodyTexture caches it) --
	// the per-instance vertex color below still multiplies over it so each
	// rock reads as a distinct shade/tint rather than an identical stamp.
	const material = new THREE.MeshStandardMaterial({
		color: 0xb0b0b0,
		map: loadBodyTexture(
			isOuterZone ? ICE_ASTEROID_TEXTURE_PATH : ASTEROID_TEXTURE_PATH,
		),
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

export function updateAsteroidField(
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

// Rocks per unit of scene orbitRadius -- calibrated so a belt around
// orbitRadius ~12 (a typical further-out belt) still lands near the old
// fixed 900-rock count that already looked right there, while a close-in
// belt (small orbitRadius, and thus a much shorter ring circumference) gets
// proportionally fewer instead of the same 900 crammed into a tight ring.
const ASTEROID_DENSITY_PER_RADIUS = 75
const ASTEROID_COUNT_MIN = 120
const ASTEROID_COUNT_MAX = 900

const ASTEROID_MIN_SCALE = 0.006

const ASTEROID_MAX_SCALE = 0.02

const ASTEROID_Z_JITTER = 0.02
