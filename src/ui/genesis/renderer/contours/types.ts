import type { Material } from "three"

export type AttachContoursInput = {
	material: Material
	visible: boolean
	fragmentTarget: string
	colorExpression: string
}
