import type * as THREE from "three"

export interface UpdateBodyMarkerInput {
	marker: THREE.Sprite
	camera: THREE.PerspectiveCamera
	// The body's drawn radius as a fraction of the viewport's half-height.
	projectedRadius: number
	// Extra opacity factor, 0 to hide the marker outright (a moon too close to
	// its planet on screen).
	visibility: number
}

export interface BodyMarkerWorldRadiusInput {
	camera: THREE.PerspectiveCamera
	distance: number
}
