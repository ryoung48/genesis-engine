import * as THREE from "three"

export function loadGlobeCloudTexture(texturePath: string): THREE.Texture {
	const cached = globeCloudTextureCache.get(texturePath)
	if (cached) return cached
	const texture = globeCloudTextureLoader.load(texturePath)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.userData.sharedTexture = true
	globeCloudTextureCache.set(texturePath, texture)
	return texture
}

const globeCloudTextureLoader = new THREE.TextureLoader()

const globeCloudTextureCache = new Map<string, THREE.Texture>()
