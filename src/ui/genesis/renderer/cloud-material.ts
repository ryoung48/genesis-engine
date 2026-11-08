import * as THREE from "three"

const BOOSTED_ALPHA_MAP_FRAGMENT = `
#ifdef USE_ALPHAMAP

	// SphereGeometry puts north at v=1, while the photo is uploaded north-first.
	float cloudAlpha = texture2D( alphaMap, vec2( vAlphaMapUv.x, 1.0 - vAlphaMapUv.y ) ).g;
	diffuseColor.a *= clamp(pow(cloudAlpha, 0.62) * 1.2, 0.0, 1.0);

#endif
`

export function boostCloudAlphaMap(
	material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial,
): void {
	material.onBeforeCompile = (shader) => {
		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <alphamap_fragment>",
			BOOSTED_ALPHA_MAP_FRAGMENT,
		)
	}
}
