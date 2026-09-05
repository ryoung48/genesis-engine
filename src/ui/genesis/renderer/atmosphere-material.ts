import * as THREE from "three"

export type AtmosphereMaterialInput = {
	color: THREE.Color
	/** Scales the whole rim term. Roughly 1 for an Earth-pressure shell; see
	 * the lighting controller's own pressure curve for the globe view. */
	strength: number
	/** How sharply the haze concentrates against the body's own limb, falling
	 * off to nothing at the shell's outer edge. 0 spreads it evenly across the
	 * whole shell, which is what the globe view has always done -- pow(x, 0)
	 * is 1, so that value reproduces the original flat band exactly. Around
	 * 1.2 reads as air that thins with altitude. */
	limbConcentration: number
}

/** A limb-scattering shell: a back-facing sphere slightly larger than the
 * body, brightest where the surface turns away from the viewer and brighter
 * still on the lit side, so a planet reads as having air on it rather than a
 * hard edge against space.
 *
 * Shared by the globe view (one shell around the simulated world) and the
 * solar-system view (one per body with an atmosphere) rather than existing
 * twice -- the only per-instance differences are the three uniforms.
 *
 * `sunDirection` is in world space and starts pointing +X; both callers
 * overwrite it, the globe from its fixed light and the solar-system view
 * from each body's own direction back to its star.
 *
 * Shells must be rendered BackSide, which `limbConcentration` assumes.
 */
export function buildAtmosphereMaterial(
	input: AtmosphereMaterialInput,
): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: {
			atmosphereColor: { value: input.color.clone() },
			sunDirection: { value: new THREE.Vector3(1, 0, 0) },
			atmosphereStrength: { value: input.strength },
			limbConcentration: { value: input.limbConcentration },
		},
		vertexShader: `
			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;
			void main() {
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPosition.xyz;
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform vec3 atmosphereColor;
			uniform vec3 sunDirection;
			uniform float atmosphereStrength;
			uniform float limbConcentration;
			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;
			void main() {
				vec3 viewDir = normalize(cameraPosition - vWorldPosition);
				// This shell renders BackSide, so every drawn fragment faces away
				// from the camera and this dot is always negative -- its magnitude
				// runs from 0 at the shell's own silhouette up toward 1 behind the
				// body (where the body itself occludes it). Raising it to
				// limbConcentration therefore makes the haze densest against the
				// body's limb and fade outward. Guarded against an exactly-zero
				// base, which pow leaves undefined at exponent 0.
				float grazing = max(abs(dot(viewDir, normalize(vWorldNormal))), 1e-4);
				float rim = pow(grazing, limbConcentration);
				float daylight = smoothstep(-0.15, 0.65, dot(normalize(vWorldNormal), normalize(sunDirection)));
				float alpha = rim * mix(0.03, 0.18, daylight) * atmosphereStrength;
				gl_FragColor = vec4(atmosphereColor, alpha);
			}
		`,
		transparent: true,
		side: THREE.BackSide,
		depthWrite: false,
	})
}
