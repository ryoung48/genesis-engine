import type { BufferGeometry, Material } from "three"

export type AttachContoursInput = {
	material: Material
	visible: boolean
	fragmentTarget: string
	colorExpression: string
}

export type ContourAttributesInput = {
	geometry: BufferGeometry
	controls: Float32Array
}
