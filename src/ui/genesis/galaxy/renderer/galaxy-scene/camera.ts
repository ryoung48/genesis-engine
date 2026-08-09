import type * as THREE from "three"

/** Fits the orthographic camera's view volume to a fixed half-height,
 * preserving the canvas aspect ratio. Callers pass the galaxy's own
 * dimensions.h/2 (matching galaxy-gen's fixed HALF_H constant, which is
 * half its canvas height) rather than the playable radius, so the core
 * glow/nebula render at the same proportion of the view as the old repo
 * instead of being zoomed in tight around just the system ring. */
export function fitCameraToHalfHeight({
	camera,
	canvas,
	halfHeight,
}: {
	camera: THREE.OrthographicCamera
	canvas: HTMLCanvasElement
	halfHeight: number
}): void {
	const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
	const halfW = halfHeight * aspect
	camera.left = -halfW
	camera.right = halfW
	camera.top = halfHeight
	camera.bottom = -halfHeight
	camera.updateProjectionMatrix()
}
