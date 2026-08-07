import * as THREE from "three"

const BOOSTED_ALPHA_MAP_FRAGMENT = `
#ifdef USE_ALPHAMAP

	// SphereGeometry's built-in UV stores v = 1 - (polar parameter), so the
	// pole this globe's rotation.x aligns to the app's north (see
	// scene-setup.ts's globeCloudMesh) lands at v=1, not v=0. The shared
	// cloud texture (textures.ts) is oriented with row 0 =
	// north to match the flat map's own lonLat-based UV formula (v=0 =
	// north there) -- so this globe-only sampler needs its V flipped to
	// match, without touching the shared texture or the mesh rotation
	// (either of which would also affect, respectively, the flat map or
	// the globe's east-west alignment with the terrain).
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

/** Flat map's cloud plane: the terrain map mesh (mesh-builders.ts's
 * buildMapMesh) has no standard "uv" attribute -- it carries per-vertex
 * "lonLat" instead and samples textures with an equirectangular lookup
 * derived from it (see uSatelliteMap there). The cloud plane shares that
 * mesh's position+lonLat buffers, so it needs the same lookup rather than
 * MeshBasicMaterial's built-in alphaMap UV. Density read/boost formula
 * matches boostCloudAlphaMap above for visual parity with the globe. */
export function createMapCloudMaterial(
	placeholderMap: THREE.Texture,
): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		uniforms: {
			uCloudMap: { value: placeholderMap },
		},
		vertexShader: `
			attribute vec2 lonLat;
			varying vec2 vLonLat;
			void main() {
				vLonLat = lonLat;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			uniform sampler2D uCloudMap;
			varying vec2 vLonLat;
			void main() {
				vec2 uv = vec2((vLonLat.x + 3.14159265) / 6.2831853, 0.5 - vLonLat.y / 3.14159265);
				float cloudAlpha = texture2D(uCloudMap, uv).g;
				float alpha = clamp(pow(cloudAlpha, 0.62) * 1.2, 0.0, 1.0);
				gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
			}
		`,
	})
}
