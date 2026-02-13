import { Point } from "@/model/utilities/points/types"

export interface IconDef {
	height: number
	path: string
	opacity: number
}

export type DrawIconParams = {
	ctx: CanvasRenderingContext2D
	img: HTMLImageElement
	icon: IconDef
	sw: number
	sh: number
	point: Point
	bigger?: boolean
}
