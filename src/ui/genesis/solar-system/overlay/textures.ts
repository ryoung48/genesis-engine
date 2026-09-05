import * as THREE from "three"

const GLOW_TEXTURE_SIZE = 128
const textureLoader = new THREE.TextureLoader()
const sharedBodyTextureCache = new Map<string, THREE.Texture>()
let bodyTextureAnisotropy = 1
// Renders a soft white-hot core fading through the star's own color and out
// to transparent — the same core+glow gradient galaxy-gen's system map uses,
// applied here as a camera-facing sprite texture.
export function createStarGlowTexture(hexColor: string): THREE.CanvasTexture {
	const canvas = document.createElement("canvas")
	canvas.width = GLOW_TEXTURE_SIZE
	canvas.height = GLOW_TEXTURE_SIZE
	const ctx = canvas.getContext("2d")
	const center = GLOW_TEXTURE_SIZE / 2
	if (ctx) {
		const gradient = ctx.createRadialGradient(
			center,
			center,
			GLOW_TEXTURE_SIZE * 0.03,
			center,
			center,
			center,
		)
		gradient.addColorStop(0, "#ffffff")
		gradient.addColorStop(0.33, hexColor)
		gradient.addColorStop(0.67, withAlpha(hexColor, 0.3))
		gradient.addColorStop(1, withAlpha(hexColor, 0))
		ctx.fillStyle = gradient
		ctx.fillRect(0, 0, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE)
	}
	const texture = new THREE.CanvasTexture(canvas)
	texture.needsUpdate = true
	return texture
}

/** Records the GPU's maximum anisotropic-filtering level (see
 * buildGenesisSceneSetup, the only caller -- it needs a live renderer to
 * read the capability from) and back-applies it to any texture already
 * cached, since a body texture can be requested before the scene finishes
 * constructing. */
export function configureBodyTextureAnisotropy(maxAnisotropy: number): void {
	bodyTextureAnisotropy = Math.max(1, maxAnisotropy)
	for (const texture of sharedBodyTextureCache.values()) {
		texture.anisotropy = bodyTextureAnisotropy
		texture.needsUpdate = true
	}
}

export function loadBodyTexture(texturePath: string): THREE.Texture {
	const cached = sharedBodyTextureCache.get(texturePath)
	if (cached) return cached
	const texture = textureLoader.load(texturePath)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.anisotropy = bodyTextureAnisotropy
	texture.userData.sharedTexture = true
	sharedBodyTextureCache.set(texturePath, texture)
	return texture
}

export function withAlpha(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16)
	const g = Number.parseInt(hex.slice(3, 5), 16)
	const b = Number.parseInt(hex.slice(5, 7), 16)
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
