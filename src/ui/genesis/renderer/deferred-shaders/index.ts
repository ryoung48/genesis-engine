import * as THREE from "three"
import type {
	CompileDeferredInput,
	MarkDeferredInput,
	ShaderDeferral,
	ShaderSwap,
} from "@/ui/genesis/renderer/deferred-shaders/types"

const COMPILE_TIMEOUT_MS = 30_000

const compiled = new WeakSet<THREE.Material>()

function placeholderFor(
	deferral: Extract<ShaderDeferral, { kind: "stand-in" }>,
): THREE.Material {
	return deferral.lit
		? new THREE.MeshStandardMaterial({
				color: deferral.color,
				roughness: 1,
				metalness: 0,
			})
		: new THREE.MeshBasicMaterial({ color: deferral.color })
}

function mark(input: MarkDeferredInput) {
	input.material.userData.shaderDeferral = input.deferral
}

function defer(root: THREE.Object3D): ShaderSwap[] {
	const swaps: ShaderSwap[] = []
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return
		const real = object.material
		if (Array.isArray(real) || compiled.has(real)) return
		const deferral = real.userData.shaderDeferral as ShaderDeferral | undefined
		if (!deferral) return
		swaps.push({
			mesh: object,
			real,
			placeholder:
				deferral.kind === "stand-in" ? placeholderFor(deferral) : null,
		})
	})
	for (const swap of swaps) {
		if (swap.placeholder) swap.mesh.material = swap.placeholder
		else swap.mesh.visible = false
	}
	return swaps
}

async function compile(input: CompileDeferredInput) {
	const { renderer, camera, scene, swaps } = input
	const staging = new THREE.Group()
	const staged = new Set<THREE.Material>()
	for (const { mesh, real } of swaps) {
		if (staged.has(real)) continue
		staged.add(real)
		staging.add(new THREE.Mesh(mesh.geometry, real))
	}
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, COMPILE_TIMEOUT_MS)
	})
	try {
		await Promise.race([renderer.compileAsync(staging, camera, scene), timeout])
	} finally {
		clearTimeout(timer)
	}
}

function restore(swaps: ShaderSwap[]) {
	for (const { mesh, real, placeholder } of swaps) {
		mesh.material = real
		mesh.visible = true
		placeholder?.dispose()
		compiled.add(real)
	}
}

export const DEFERRED_SHADERS = { mark, defer, compile, restore }
