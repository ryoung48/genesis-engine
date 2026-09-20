import * as THREE from "three"
import { buildCraterMaterial } from "@/ui/genesis/renderer/crater-material"
import {
	BELT_VERTICAL_RATIO,
	TWO_PI,
} from "@/ui/genesis/solar-system/overlay/constants"
import type { AsteroidFieldData } from "@/ui/genesis/solar-system/overlay/types"

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
	// Half the belt's radial (inner-to-outer) span -- scaled off the belt's
	// own orbitRadius by the caller (see BELT_WIDTH_RATIO) rather than a
	// fixed width, since a realistic main-belt-like spread is far wider than
	// a thin fixed ring would be.
	beltHalfWidth: number,
): AsteroidFieldData {
	// Scene orbit radii are packed by rendered size, not real AU (see
	// ORBIT_GAP_STAR_RADII's own doc elsewhere), so a belt close to the star
	// can end up with a far smaller ring area than one further out. Count now
	// scales with the belt's actual annulus area (orbitRadius * beltHalfWidth,
	// proportional to circumference * radial span) rather than orbitRadius
	// alone -- beltHalfWidth now scales with orbitRadius too (BELT_WIDTH_RATIO),
	// so a naive orbitRadius-only count left the now-much-wider band looking
	// sparse: same rock count smeared over several times the area.
	const areaScaledCount =
		orbitRadius * beltHalfWidth * ASTEROID_DENSITY_PER_AREA
	const count = Math.round(
		Math.max(ASTEROID_COUNT_MIN, Math.min(ASTEROID_COUNT_MAX, areaScaledCount)),
	)
	// Keep the 100-rock floor from crowding a compact inner belt. The square
	// root maintains the perceived fill area as the forced count increases.
	const asteroidScaleMultiplier = Math.min(
		1,
		beltHalfWidth / 0.12,
		Math.sqrt(areaScaledCount / count),
	)
	const geometry = new THREE.IcosahedronGeometry(1, 0)
	const material = buildCraterMaterial({
		seed: isOuterZone ? 2 : 1,
		color: isOuterZone ? "#dce7ed" : "#b0b0b0",
		style: isOuterZone ? "snowball" : "cratered",
	})
	material.emissive.setHex(0x2a2a2a)
	material.emissiveIntensity = 0.6
	const mesh = new THREE.InstancedMesh(geometry, material, count)
	const angles = new Float32Array(count)
	const radii = new Float32Array(count)
	const zOffsets = new Float32Array(count)
	const scales = new Float32Array(count)
	const rotationAxes: THREE.Vector3[] = []
	const rotationSpeeds = new Float32Array(count)

	// Real belt density tapers toward the inner/outer edges rather than
	// cutting off sharply -- averaging two uniform samples (a cheap
	// triangular distribution, no extra Math.random() cost worth avoiding)
	// biases rocks toward the belt's own center instead of the flat-uniform
	// spread a single sample would give.
	const beltVerticalHalfSpan = beltHalfWidth * BELT_VERTICAL_RATIO
	const dummy = new THREE.Object3D()
	const color = new THREE.Color()
	for (let i = 0; i < count; i++) {
		angles[i] = Math.random() * TWO_PI
		radii[i] =
			orbitRadius +
			((Math.random() + Math.random() - 1) / 2) * 2 * beltHalfWidth
		zOffsets[i] =
			((Math.random() + Math.random() - 1) / 2) * 2 * beltVerticalHalfSpan
		scales[i] =
			(ASTEROID_MIN_SCALE +
				Math.random() * (ASTEROID_MAX_SCALE - ASTEROID_MIN_SCALE)) *
			asteroidScaleMultiplier
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

// Rocks per unit of belt annulus area (orbitRadius * beltHalfWidth) --
// calibrated so a belt around orbitRadius ~12 (a typical further-out belt,
// beltHalfWidth ~12*0.22 there) lands near ASTEROID_COUNT_MAX, keeping
// rocks-per-unit-area roughly constant across belts of any size instead of
// thinning out as the (now width-scaled) band grows. InstancedMesh rocks are
// cheap enough on the GPU that a several-thousand-instance ceiling costs
// nothing next to the rest of the scene.
const ASTEROID_DENSITY_PER_AREA = 350
const ASTEROID_COUNT_MIN = 100
const ASTEROID_COUNT_MAX = 25000

const ASTEROID_MIN_SCALE = 0.006

const ASTEROID_MAX_SCALE = 0.02
