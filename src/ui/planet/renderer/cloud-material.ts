import * as THREE from "three"

const BOOSTED_ALPHA_MAP_FRAGMENT = `
#ifdef USE_ALPHAMAP

	float cloudAlpha = texture2D( alphaMap, vAlphaMapUv ).g;
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
