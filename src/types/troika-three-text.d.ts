declare module "troika-three-text" {
	import type { Object3D } from "three"

	export interface TextProps {
		text?: string | null
		font?: string
		fontSize?: number
		fontWeight?: number | string
		color?: string | number
		strokeWidth?: number
		strokeColor?: string | number
		anchorX?: string | number
		anchorY?: string | number
		textRenderingMode?: "distanceField" | "standard"
		renderOrder?: number
		visible?: boolean
		position?: { set(x: number, y: number, z: number): void }
		dispose(): void
		sync(cb?: () => void): void
	}

	export interface TroikaTextRenderInfo {
		/** [minX, minY, maxX, maxY] of the whole text block, in local units. */
		blockBounds: [number, number, number, number]
	}

	export class Text extends Object3D {
		constructor(props?: Partial<TextProps>)
		text: string | null
		font: string
		fontSize: number
		fontWeight: number | string
		color: string | number
		strokeWidth: number
		strokeColor: string | number
		anchorX: string | number
		anchorY: string | number
		textRenderingMode: "distanceField" | "standard"
		renderOrder: number
		visible: boolean
		readonly textRenderInfo: TroikaTextRenderInfo | null
		dispose(): void
		sync(cb?: () => void): void
	}
}
