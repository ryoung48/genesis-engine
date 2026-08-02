import type * as THREE from "three"

export interface MapExportOptions {
	width: number
	centerLongitudeDeg?: number
	onProgress?: (percent: number, label: string) => void
}

export interface ExportRenderTargetLike {
	width?: number
	height?: number
	texture?:
		| {
				colorSpace?: string
		  }
		| Array<{
				colorSpace?: string
		  }>
	dispose: () => void
}

export interface MapExportVisibilityTarget {
	object: THREE.Object3D | null
	visible: boolean
}

export interface MapExportDependencies {
	createRenderTarget?: (width: number, height: number) => ExportRenderTargetLike
	yieldToMainThread?: () => Promise<void>
}

export interface ExportRendererLike {
	capabilities: {
		maxTextureSize: number
	}
	getRenderTarget: () => unknown
	setRenderTarget: (target: unknown | null) => void
	render: (sceneToRender: THREE.Scene, cameraToRender: THREE.Camera) => void
	readRenderTargetPixels: (
		target: unknown,
		x: number,
		y: number,
		width: number,
		height: number,
		buffer: Uint8Array,
	) => void
}
