import type * as THREE from "three"

/** Fits the orthographic camera's view volume to the supplied galaxy extent,
 * preserving the canvas aspect ratio. */
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
