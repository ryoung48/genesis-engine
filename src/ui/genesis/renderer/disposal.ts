import * as THREE from "three"

export function disposeObject3D(
	scene: THREE.Object3D,
	object: THREE.Object3D | null,
) {
	if (!object) return
	scene.remove(object)
	const maybeGeometry = (object as THREE.LineSegments | THREE.Mesh).geometry
	maybeGeometry?.dispose?.()
	const material = (object as THREE.LineSegments | THREE.Mesh).material
	if (Array.isArray(material)) {
		for (const mat of material) mat.dispose()
	} else {
		material?.dispose?.()
	}
}

export function disposeGroup(scene: THREE.Object3D, group: THREE.Group | null) {
	if (!group) return
	scene.remove(group)
	group.traverse((child) => {
		const node = child as THREE.Object3D & {
			geometry?: { dispose(): void }
			material?: { dispose(): void } | Array<{ dispose(): void }>
		}
		node.geometry?.dispose()
		const { material } = node
		if (Array.isArray(material)) {
			for (const entry of material) entry.dispose()
		} else {
			material?.dispose()
		}
	})
}
