import * as THREE from "three"

export function loadGlobeCloudTexture(texturePath: string): THREE.Texture {
	const cached = globeCloudTextureCache.get(texturePath)
	if (cached) return cached
	const texture = globeCloudTextureLoader.load(texturePath)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.userData.sharedTexture = true
	// This texture is also sampled by the flat map's cloud shader
	// (cloud-material.ts's createMapCloudMaterial), which computes UV
	// straight from latitude with v=0 at the north pole. THREE's default
	// flipY=true flips the source image vertically on GPU upload (to match
	// WebGL's bottom-left origin), which would put v=0 at the image's south
	// row instead -- exactly a north/south pole swap. Disabling it keeps
	// the texture's v axis matching the app's own north=0 convention, for
	// both this globe sphere (rotated to align poles) and the flat map.
	texture.flipY = false
	globeCloudTextureCache.set(texturePath, texture)
	return texture
}

const globeCloudTextureLoader = new THREE.TextureLoader()

const globeCloudTextureCache = new Map<string, THREE.Texture>()
