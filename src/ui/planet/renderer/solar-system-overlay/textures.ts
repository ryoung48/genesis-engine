import * as THREE from "three"

const GLOW_TEXTURE_SIZE = 128
const textureLoader = new THREE.TextureLoader()
const sharedBodyTextureCache = new Map<string, THREE.Texture>()
let sharedGrayscaleSunTexture: THREE.CanvasTexture | null = null
let grayscaleSunTextureLoadPromise: Promise<THREE.CanvasTexture> | null = null

// The source photo is naturally orange/yellow. MeshBasicMaterial's `color`
// only multiplies the texture, so tinting it blue (for hot O/B stars) just
// darkens the existing orange rather than actually shifting its hue — the
// orange keeps showing through. Desaturating to grayscale first (keeping only
// luminance, i.e. granulation/limb-darkening detail) lets the spectral-class
// tint fully determine the star's color instead of fighting the photo's hue.
export function loadGrayscaleSunTexture(
	onReady: (texture: THREE.CanvasTexture) => void,
): { cancel(): void } {
	let cancelled = false
	if (sharedGrayscaleSunTexture) {
		onReady(sharedGrayscaleSunTexture)
		return {
			cancel() {
				cancelled = true
			},
		}
	}
	if (!grayscaleSunTextureLoadPromise) {
		grayscaleSunTextureLoadPromise = new Promise((resolve) => {
			textureLoader.load("/sol/2k_sun.jpg", (loaded) => {
				const image = loaded.image as HTMLImageElement
				const canvas = document.createElement("canvas")
				canvas.width = image.width
				canvas.height = image.height
				const ctx = canvas.getContext("2d")
				if (ctx) {
					ctx.drawImage(image, 0, 0)
					const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
					const pixels = data.data
					for (let i = 0; i < pixels.length; i += 4) {
						const luminance =
							0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
						pixels[i] = luminance
						pixels[i + 1] = luminance
						pixels[i + 2] = luminance
					}
					ctx.putImageData(data, 0, 0)
				}
				loaded.dispose()
				const grayTexture = new THREE.CanvasTexture(canvas)
				grayTexture.needsUpdate = true
				grayTexture.userData.sharedTexture = true
				sharedGrayscaleSunTexture = grayTexture
				resolve(grayTexture)
			})
		})
	}
	grayscaleSunTextureLoadPromise.then((texture) => {
		if (cancelled) return
		onReady(texture)
	})
	return {
		cancel() {
			cancelled = true
		},
	}
}

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

export function loadBodyTexture(texturePath: string): THREE.Texture {
	const cached = sharedBodyTextureCache.get(texturePath)
	if (cached) return cached
	const texture = textureLoader.load(texturePath)
	texture.colorSpace = THREE.SRGBColorSpace
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
