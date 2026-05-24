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
		dispose(): void
		sync(cb?: () => void): void
	}
}
