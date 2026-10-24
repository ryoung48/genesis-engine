import type * as THREE from "three"

export type ShaderDeferral =
	| { kind: "stand-in"; color: number; lit: boolean }
	| { kind: "hide" }

export interface ShaderSwap {
	mesh: THREE.Mesh
	real: THREE.Material
	placeholder: THREE.Material | null
}

export interface MarkDeferredInput {
	material: THREE.Material
	deferral: ShaderDeferral
}

export interface CompileDeferredInput {
	renderer: THREE.WebGLRenderer
	camera: THREE.Camera
	scene: THREE.Scene
	swaps: ShaderSwap[]
}
