import type * as THREE from "three"

export interface CreateStarFlareInput {
	color: THREE.Color
	// Peak opacity: dimmer for brown dwarfs, whose glow is mostly infrared.
	intensity: number
}

export interface UpdateStarFlareInput {
	flare: THREE.Sprite
	camera: THREE.PerspectiveCamera
	// The star's drawn radius as a fraction of the viewport's half-height.
	projectedRadius: number
}
