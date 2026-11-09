import * as THREE from "three"
import { orbitPoint } from "@/ui/genesis/renderer/moon-orbit-overlay"
import type {
	CreateOrbitTrailInput,
	FadeOrbitTrailInput,
	UpdateOrbitTrailInput,
} from "@/ui/genesis/solar-system/overlay/types"

// A thin arc trailing each planet along its orbit, fading from the planet
// back to nothing, as in Sangil Lee's solar system simulator (sangillee.com):
// it shows where a body is headed without ringing the whole system in full
// ellipses. The span is set from the view settings (180 degrees of eccentric
// anomaly, half the orbit, by default); 128 points keep each segment under
// 3 degrees at the full 360, smooth at any zoom.
const ORBIT_TRAIL_POINTS = 128
let trailSpanRad = Math.PI
// Alpha rises linearly, (k / last)^1, from tail to head: a steeper curve left
// the back half of the span too faint to see, so a 180 degree trail read as
// about 90.
const ORBIT_TRAIL_FADE_POWER = 1
// Past a half orbit the fade flattens toward an even line, reaching a fully
// visible closed ring at the full 360 degrees; up to a half orbit it is
// untouched.
const ORBIT_TRAIL_FLAT_FROM_RAD = Math.PI
// A trail is a hint of where a body is headed, so it dims as the camera closes
// on the body: the body's radius going from 1% to 20% of the viewport
// half-height (a speck to a large disc) takes the trail from full to gone.
// Judged by the body's own size rather than its orbit's, so a tiny body keeps
// its trail until the camera is actually near it, and a large moon or far
// planet still fades once approached.
const ORBIT_TRAIL_BODY_FADE_START = 0.01
const ORBIT_TRAIL_BODY_FADE_END = 0.2

function writeTrailAlpha(trail: THREE.Line): void {
	const flatten = THREE.MathUtils.clamp(
		(trailSpanRad - ORBIT_TRAIL_FLAT_FROM_RAD) /
			(2 * Math.PI - ORBIT_TRAIL_FLAT_FROM_RAD),
		0,
		1,
	)
	const fadePower = ORBIT_TRAIL_FADE_POWER * (1 - flatten)
	const color = trail.geometry.getAttribute("color") as THREE.BufferAttribute
	for (let k = 0; k < ORBIT_TRAIL_POINTS; k++) {
		color.setW(
			k,
			trail.userData.peakOpacity * (k / (ORBIT_TRAIL_POINTS - 1)) ** fadePower,
		)
	}
	color.needsUpdate = true
	trail.userData.alphaSpanRad = trailSpanRad
}

function createOrbitTrail({
	color,
	peakOpacity,
}: CreateOrbitTrailInput): THREE.Line {
	const positions = new Float32Array(ORBIT_TRAIL_POINTS * 3)
	const colors = new Float32Array(ORBIT_TRAIL_POINTS * 4)
	const tint = new THREE.Color(color)
	for (let k = 0; k < ORBIT_TRAIL_POINTS; k++) {
		colors[k * 4] = tint.r
		colors[k * 4 + 1] = tint.g
		colors[k * 4 + 2] = tint.b
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4))
	const trail = new THREE.Line(
		geometry,
		new THREE.LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			depthWrite: false,
		}),
	)
	trail.renderOrder = 1
	trail.frustumCulled = false
	trail.userData.peakOpacity = peakOpacity
	writeTrailAlpha(trail)
	return trail
}

function setOrbitTrailSpanDegrees(degrees: number): void {
	trailSpanRad = (degrees * Math.PI) / 180
}

// Rewrites the trail to run from trailSpanRad behind the body up to its
// current eccentric anomaly.
function updateOrbitTrail({
	trail,
	kepler,
	eccentricAnomaly,
}: UpdateOrbitTrailInput): void {
	if (trail.userData.alphaSpanRad !== trailSpanRad) writeTrailAlpha(trail)
	const position = trail.geometry.getAttribute(
		"position",
	) as THREE.BufferAttribute
	for (let k = 0; k < ORBIT_TRAIL_POINTS; k++) {
		const E =
			eccentricAnomaly - trailSpanRad * (1 - k / (ORBIT_TRAIL_POINTS - 1))
		const point = orbitPoint(
			E,
			kepler.a,
			kepler.b,
			kepler.ae,
			kepler.P,
			kepler.Q,
		)
		position.setXYZ(k, point.x, point.y, point.z)
	}
	position.needsUpdate = true
	trail.geometry.computeBoundingSphere()
}

// Measured on a log scale, since each zoom step multiplies the body's
// screen size: every step then dims the trail by about the same amount.
function fadeOrbitTrailForZoom({
	trail,
	bodyScreenRadius,
}: FadeOrbitTrailInput): void {
	const opacity =
		1 -
		THREE.MathUtils.smoothstep(
			Math.log(Math.max(bodyScreenRadius, 1e-6)),
			Math.log(ORBIT_TRAIL_BODY_FADE_START),
			Math.log(ORBIT_TRAIL_BODY_FADE_END),
		)
	trail.visible = opacity > 0
	;(trail.material as THREE.LineBasicMaterial).opacity = opacity
}

export const ORBIT_TRAIL = {
	create: createOrbitTrail,
	setSpanDegrees: setOrbitTrailSpanDegrees,
	update: updateOrbitTrail,
	fadeForZoom: fadeOrbitTrailForZoom,
}
