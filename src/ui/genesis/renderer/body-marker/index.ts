import * as THREE from "three"
import type {
	BodyMarkerWorldRadiusInput,
	UpdateBodyMarkerInput,
} from "@/ui/genesis/renderer/body-marker/types"

// A body drawn smaller than a few pixels gets a fixed-size outlined circle
// so it stays findable; the ring fades out as the real sphere outgrows it.
// Sizes are fractions of the viewport's half-height (0.02 is a ~12 px ring
// across in a 600 px tall view), matching how name labels are sized. The
// fade runs from a body radius of 0.008 to 0.06 -- about a 7.5x zoom range,
// so the ring dims gradually instead of popping out over a 2x zoom.
const BODY_MARKER_RADIUS = 0.02
const BODY_MARKER_FADE_START = 0.008
const BODY_MARKER_FADE_END = 0.06
const BODY_MARKER_OPACITY = 0.9
const BODY_MARKER_RENDER_ORDER = 3

let sharedRingTexture: THREE.CanvasTexture | null = null

function ringTexture(): THREE.CanvasTexture {
	if (sharedRingTexture) return sharedRingTexture
	const size = 64
	const canvas = document.createElement("canvas")
	canvas.width = size
	canvas.height = size
	const context = canvas.getContext("2d")!
	context.strokeStyle = "#ffffff"
	context.lineWidth = 6
	context.beginPath()
	context.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2)
	context.stroke()
	sharedRingTexture = new THREE.CanvasTexture(canvas)
	sharedRingTexture.userData.sharedTexture = true
	return sharedRingTexture
}

function createBodyMarker(color: number): THREE.Sprite {
	const marker = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: ringTexture(),
			color,
			transparent: true,
			opacity: 0,
			depthWrite: false,
			sizeAttenuation: false,
		}),
	)
	marker.renderOrder = BODY_MARKER_RENDER_ORDER
	marker.visible = false
	const raycastSprite = marker.raycast.bind(marker)
	// Raycasting ignores `visible`, so a faded-out ring must not catch clicks
	// meant for the sphere or anything behind it.
	marker.raycast = (raycaster, intersects) => {
		if (marker.visible) raycastSprite(raycaster, intersects)
	}
	return marker
}

function updateBodyMarker({
	marker,
	camera,
	projectedRadius,
	visibility,
}: UpdateBodyMarkerInput): void {
	const fade = THREE.MathUtils.clamp(
		(BODY_MARKER_FADE_END - projectedRadius) /
			(BODY_MARKER_FADE_END - BODY_MARKER_FADE_START),
		0,
		1,
	)
	const opacity = fade * visibility * BODY_MARKER_OPACITY
	marker.visible = opacity > 0
	;(marker.material as THREE.SpriteMaterial).opacity = opacity
	if (!marker.visible) return
	const parentScale = marker.parent
		? marker.parent.getWorldScale(scratchParentScale).x
		: 1
	marker.scale.setScalar(
		(2 *
			BODY_MARKER_RADIUS *
			Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) /
			Math.max(parentScale, 1e-12),
	)
}

const scratchParentScale = new THREE.Vector3()

// The ring's radius in world units at `distance` from the camera, so a label
// leader can start at the ring's edge instead of the tiny sphere.
function bodyMarkerWorldRadius({
	camera,
	distance,
}: BodyMarkerWorldRadiusInput): number {
	return (
		BODY_MARKER_RADIUS *
		distance *
		Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
	)
}

export const BODY_MARKER = {
	create: createBodyMarker,
	update: updateBodyMarker,
	worldRadius: bodyMarkerWorldRadius,
}
