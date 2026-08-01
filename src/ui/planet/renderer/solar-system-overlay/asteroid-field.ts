import * as THREE from "three"
import {
	BELT_WIDTH,
	TWO_PI,
} from "@/ui/planet/renderer/solar-system-overlay/constants"
import type { AsteroidFieldData } from "@/ui/planet/renderer/solar-system-overlay/types"

// Scatters a field of small, irregularly-scaled rocks around a belt's ring —
// each on its own randomized circular sub-orbit (slightly jittered radius and
// out-of-plane offset) plus a random tumble, so the belt reads as a lively
// swarm rather than a flat static band.
export function buildAsteroidField(orbitRadius: number): AsteroidFieldData {
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

const ASTEROID_COUNT_PER_BELT = 900

const ASTEROID_MIN_SCALE = 0.006

const ASTEROID_MAX_SCALE = 0.02

const ASTEROID_Z_JITTER = 0.02
