import * as THREE from "three"
import type {
	CreateStarFlareInput,
	UpdateStarFlareInput,
} from "@/ui/genesis/renderer/star-flare/types"

// A zoomed-out star reads as a white-hot core inside a wide soft bloom, as in
// Sangil Lee's solar system simulator (sangillee.com), which gets it from
// an UnrealBloomPass. This fakes that bloom with one additive billboard of
// fixed screen size: its radius is 0.14 of the viewport's half-height (the
// reference's Sun glow spans ~30 px of a ~210 px half-height). It stays lit
// until the star's own disc fills 15% of the half-height, then fades out by
// 40%, where only a close-up of the star's surface is left to show.
const STAR_FLARE_RADIUS = 0.14
const STAR_FLARE_FADE_START = 0.15
const STAR_FLARE_FADE_END = 0.4
const STAR_FLARE_RENDER_ORDER = 5

const flareTextures = new Map<number, THREE.CanvasTexture>()

function flareTexture(color: THREE.Color): THREE.CanvasTexture {
	const key = color.getHex()
	const cached = flareTextures.get(key)
	if (cached) return cached
	const size = 256
	const canvas = document.createElement("canvas")
	canvas.width = size
	canvas.height = size
	const context = canvas.getContext("2d")!
	const r = Math.round(color.r * 255)
	const g = Math.round(color.g * 255)
	const b = Math.round(color.b * 255)
	const gradient = context.createRadialGradient(
		size / 2,
		size / 2,
		0,
		size / 2,
		size / 2,
		size / 2,
	)
	gradient.addColorStop(0, "rgba(255, 255, 255, 1)")
	gradient.addColorStop(0.06, "rgba(255, 255, 255, 1)")
	gradient.addColorStop(0.16, `rgba(${r}, ${g}, ${b}, 0.75)`)
	gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.22)`)
	gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
	context.fillStyle = gradient
	context.fillRect(0, 0, size, size)
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.userData.sharedTexture = true
	flareTextures.set(key, texture)
	return texture
}

function createStarFlare({
	color,
	intensity,
}: CreateStarFlareInput): THREE.Sprite {
	const flare = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: flareTexture(color),
			transparent: true,
			opacity: intensity,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			// Centred inside the star's own sphere, so a depth test would hide
			// the core behind the star's front surface.
			depthTest: false,
			sizeAttenuation: false,
		}),
	)
	flare.userData.peakOpacity = intensity
	flare.renderOrder = STAR_FLARE_RENDER_ORDER
	// Decorative: clicks pass through to the star or whatever is behind.
	flare.raycast = () => {
		// Intentionally inert -- see comment above.
	}
	return flare
}

function updateStarFlare({
	flare,
	camera,
	projectedRadius,
}: UpdateStarFlareInput): void {
	const fade = THREE.MathUtils.clamp(
		(STAR_FLARE_FADE_END - projectedRadius) /
			(STAR_FLARE_FADE_END - STAR_FLARE_FADE_START),
		0,
		1,
	)
	const opacity = fade * (flare.userData.peakOpacity as number)
	flare.visible = opacity > 0
	;(flare.material as THREE.SpriteMaterial).opacity = opacity
	if (!flare.visible) return
	flare.scale.setScalar(
		2 * STAR_FLARE_RADIUS * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2),
	)
}

export const STAR_FLARE = {
	create: createStarFlare,
	update: updateStarFlare,
}
