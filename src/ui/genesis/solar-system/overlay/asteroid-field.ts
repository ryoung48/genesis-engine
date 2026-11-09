import * as THREE from "three"
import {
	BELT_VERTICAL_RATIO,
	TWO_PI,
} from "@/ui/genesis/solar-system/overlay/constants"
import type {
	AsteroidFieldData,
	BuildAsteroidFieldInput,
	UpdateAsteroidFieldInput,
} from "@/ui/genesis/solar-system/overlay/types"

// True-size asteroids are invisible at system scale (even Ceres is ~1/150,000
// AU across), so the belt is drawn as fixed-pixel points that read as a
// cloud of material at any zoom.
const ASTEROID_COUNT = 12_000
const ASTEROID_POINT_SIZE_PX = 1.6

export function buildAsteroidField({
	innerRadius,
	outerRadius,
	isOuterZone,
}: BuildAsteroidFieldInput): AsteroidFieldData {
	const centerRadius = (innerRadius + outerRadius) / 2
	const halfWidth = (outerRadius - innerRadius) / 2
	const verticalHalfSpan = halfWidth * BELT_VERTICAL_RATIO
	const angles = new Float32Array(ASTEROID_COUNT)
	const radii = new Float32Array(ASTEROID_COUNT)
	const zOffsets = new Float32Array(ASTEROID_COUNT)
	const positions = new Float32Array(ASTEROID_COUNT * 3)
	const colors = new Float32Array(ASTEROID_COUNT * 3)
	const tint = new THREE.Color(isOuterZone ? "#dce7ed" : "#b0b0b0")
	for (let i = 0; i < ASTEROID_COUNT; i++) {
		// Averaging two uniform samples biases rocks toward the belt's centre,
		// so density tapers toward the edges instead of cutting off sharply.
		angles[i] = Math.random() * TWO_PI
		radii[i] = centerRadius + (Math.random() + Math.random() - 1) * halfWidth
		zOffsets[i] = (Math.random() + Math.random() - 1) * verticalHalfSpan
		const shade = 0.5 + Math.random() * 0.5
		colors[i * 3] = tint.r * shade
		colors[i * 3 + 1] = tint.g * shade
		colors[i * 3 + 2] = tint.b * shade
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
	const points = new THREE.Points(
		geometry,
		new THREE.PointsMaterial({
			size: ASTEROID_POINT_SIZE_PX,
			sizeAttenuation: false,
			vertexColors: true,
			transparent: true,
			opacity: 0.85,
			depthWrite: false,
		}),
	)
	points.frustumCulled = false
	// Decorative: a belt is never a click target.
	points.raycast = () => {
		// Intentionally inert -- see comment above.
	}
	return { points, centerRadius, angles, radii, zOffsets }
}

// Each rock follows Kepler's third law around the belt's own period at its
// centre radius, so the inner edge visibly outpaces the outer edge.
export function updateAsteroidField({
	field,
	day,
	centerPeriodDays,
}: UpdateAsteroidFieldInput): void {
	const position = field.points.geometry.getAttribute(
		"position",
	) as THREE.BufferAttribute
	const array = position.array as Float32Array
	for (let i = 0; i < field.angles.length; i++) {
		const radius = field.radii[i]!
		const period = centerPeriodDays * (radius / field.centerRadius) ** 1.5
		const angle = field.angles[i]! + (TWO_PI * day) / period
		array[i * 3] = radius * Math.cos(angle)
		array[i * 3 + 1] = radius * Math.sin(angle)
		array[i * 3 + 2] = field.zOffsets[i]!
	}
	position.needsUpdate = true
}
