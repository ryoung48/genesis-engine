import type { Material } from "three"
import type { ContourField } from "@/ui/genesis/renderer/contours/surface/types"

export type ContourDisplay = {
	visible: boolean
	field: ContourField
}

export type AttachContoursInput = {
	material: Material
	visible: boolean
	fragmentTarget: string
	colorExpression: string
}
