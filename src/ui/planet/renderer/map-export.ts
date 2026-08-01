import * as THREE from "three"
import {
	ExportRendererLike,
	ExportRenderTargetLike,
	MapExportVisibilityTarget,
} from "@/ui/planet/renderer/genesis-scene/types"
import { PngStreamWriter } from "@/ui/planet/renderer/PngStreamWriter"

export function normalizeMapCenterLongitudeDeg(longitudeDeg: number): number {
	return ((((longitudeDeg + 180) % 360) + 360) % 360) - 180
}

function linearChannelToSrgb8(channel: number): number {
	const normalized = THREE.MathUtils.clamp(channel / 255, 0, 1)
	const srgb =
		normalized <= 0.0031308
			? normalized * 12.92
			: 1.055 * Math.pow(normalized, 1 / 2.4) - 0.055
	return Math.round(THREE.MathUtils.clamp(srgb, 0, 1) * 255)
}

export function renderMapExportPng(params: {
	scene: THREE.Scene
	renderer: ExportRendererLike
	camera: THREE.OrthographicCamera
	width: number
	height: number
	onProgress?: (percent: number, label: string) => void
	createRenderTarget: (width: number, height: number) => ExportRenderTargetLike
	yieldToMainThread?: () => Promise<void>
}): Promise<Blob> {
	const {
		scene,
		renderer,
		camera,
		width,
		height,
		onProgress,
		createRenderTarget,
		yieldToMainThread,
	} = params
	const maxTileWidth = Math.max(
		1,
		Math.min(MAP_EXPORT_TILE_CAP, renderer.capabilities.maxTextureSize),
	)
	const previousTarget = renderer.getRenderTarget()
	const previousFrustum = {
		left: camera.left,
		right: camera.right,
		top: camera.top,
		bottom: camera.bottom,
	}

	const pngWriter = new PngStreamWriter(
		width,
		height,
		(rowsCompleted, totalRows) => {
			onProgress?.(
				Math.round((rowsCompleted / totalRows) * 100),
				`Encoding row ${rowsCompleted}/${totalRows}`,
			)
		},
	)

	const renderBands = async () => {
		onProgress?.(0, "Preparing export")
		let bandIndex = 0
		const totalBands = Math.ceil(height / MAP_EXPORT_BAND_HEIGHT)

		for (let y = 0; y < height; y += MAP_EXPORT_BAND_HEIGHT) {
			const bandHeight = Math.min(MAP_EXPORT_BAND_HEIGHT, height - y)
			const bytesPerRow = width * 4
			const bandPixels = new Uint8Array(bandHeight * bytesPerRow)

			for (let x = 0; x < width; x += maxTileWidth) {
				const tileWidth = Math.min(maxTileWidth, width - x)
				const target = createRenderTarget(tileWidth, bandHeight)
				const targetTexture = Array.isArray(target.texture)
					? target.texture[0]
					: target.texture
				if (targetTexture) targetTexture.colorSpace = THREE.LinearSRGBColorSpace
				try {
					camera.left = -2 + (4 * x) / width
					camera.right = -2 + (4 * (x + tileWidth)) / width
					camera.top = 1 - (2 * y) / height
					camera.bottom = 1 - (2 * (y + bandHeight)) / height
					camera.updateProjectionMatrix()
					renderer.setRenderTarget(target)
					renderer.render(scene, camera)
					const pixels = new Uint8Array(tileWidth * bandHeight * 4)
					renderer.readRenderTargetPixels(
						target,
						0,
						0,
						tileWidth,
						bandHeight,
						pixels,
					)
					for (let row = 0; row < bandHeight; row++) {
						const srcRow = bandHeight - row - 1
						for (let col = 0; col < tileWidth; col++) {
							const srcOffset = (srcRow * tileWidth + col) * 4
							const destOffset = (row * width + (x + col)) * 4
							bandPixels[destOffset] = linearChannelToSrgb8(
								pixels[srcOffset] ?? 0,
							)
							bandPixels[destOffset + 1] = linearChannelToSrgb8(
								pixels[srcOffset + 1] ?? 0,
							)
							bandPixels[destOffset + 2] = linearChannelToSrgb8(
								pixels[srcOffset + 2] ?? 0,
							)
							bandPixels[destOffset + 3] = pixels[srcOffset + 3] ?? 255
						}
					}
				} finally {
					renderer.setRenderTarget(previousTarget)
					target.dispose()
				}
			}

			await pngWriter.writeBand(bandPixels, bandHeight)
			bandIndex++
			onProgress?.(
				Math.round((bandIndex / totalBands) * 100),
				`Rendering band ${bandIndex}/${totalBands}`,
			)
			await yieldToMainThread?.()
		}

		return pngWriter.finalize()
	}

	return renderBands().finally(() => {
		camera.left = previousFrustum.left
		camera.right = previousFrustum.right
		camera.top = previousFrustum.top
		camera.bottom = previousFrustum.bottom
		camera.updateProjectionMatrix()
		renderer.setRenderTarget(previousTarget)
	})
}

export function applyMapExportVisibility(
	targets: ReadonlyArray<MapExportVisibilityTarget>,
): () => void {
	const snapshot = new Map<THREE.Object3D, boolean>()
	for (const target of targets) {
		if (!target.object) continue
		snapshot.set(target.object, target.object.visible)
		target.object.visible = target.visible
	}
	return () => {
		for (const [object, visible] of snapshot) {
			object.visible = visible
		}
	}
}

export function addMapSlideClones(object: THREE.Object3D) {
	const clones: THREE.Object3D[] = []
	const cloneL = object.clone()
	const cloneR = object.clone()
	cloneL.visible = true
	cloneR.visible = true
	cloneL.position.x -= MAP_REPEAT_WIDTH
	cloneR.position.x += MAP_REPEAT_WIDTH
	clones.push(cloneL, cloneR)
	for (const clone of clones) {
		object.add(clone)
	}
}

const MAP_REPEAT_WIDTH = 4

const MAP_EXPORT_TILE_CAP = 2048

const MAP_EXPORT_BAND_HEIGHT = 512
