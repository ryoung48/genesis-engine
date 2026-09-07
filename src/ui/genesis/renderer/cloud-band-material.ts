import * as THREE from "three"

export type CloudBandPalette = {
	top: THREE.Color
	bot: THREE.Color
	mid1: THREE.Color
	mid2: THREE.Color
	mid3: THREE.Color
}

/** Builds the fbm cloud-band palette from a single class-swatch colour (the
 * CLASSIFICATION_COLOR hex used for the 2D UI swatch). Every band shares the
 * swatch's exact hue AND saturation -- only lightness varies -- so the body
 * reads as precisely its class colour with no per-body variation and no
 * shift toward a false tint (a brown swatch stays brown rather than going
 * pink). `mid2` is the swatch untouched; the others are pure darker/lighter
 * steps of it. */
export function swatchCloudBandPalette(input: {
	hex: number
}): CloudBandPalette {
	const base = { h: 0, s: 0, l: 0 }
	new THREE.Color(input.hex).getHSL(base)
	const shade = (lightnessScale: number) =>
		new THREE.Color().setHSL(
			base.h,
			base.s,
			Math.min(1, base.l * lightnessScale),
		)
	return {
		top: shade(1.6),
		bot: shade(0.3),
		mid1: shade(0.6),
		mid2: shade(1),
		mid3: shade(1.28),
	}
}

/** Procedural fbm cloud-band material, ported from a Shadertoy-style gas
 * giant shader (see git history). `seed` varies the noise-domain offset per
 * body so multiple bodies don't show identical band placement; `palette` is
 * the class-swatch palette from swatchCloudBandPalette.
 * The pattern is a pure function of object-space position -- no time input,
 * so it never churns or drifts. The body's rotation (sidereal spin, or a
 * fixed facing for a tide-locked body) comes entirely from the mesh
 * quaternion, exactly as it does for a texture-mapped body. */
export function buildCloudBandMaterial(input: {
	seed: number
	palette: CloudBandPalette
}): THREE.MeshStandardMaterial {
	const { seed, palette } = input
	const material = new THREE.MeshStandardMaterial({
		roughness: 1,
		metalness: 0,
	})
	material.onBeforeCompile = (shader) => {
		shader.uniforms.giantSeed = { value: seed }
		shader.uniforms.giantColTop = { value: palette.top }
		shader.uniforms.giantColBot = { value: palette.bot }
		shader.uniforms.giantColMid1 = { value: palette.mid1 }
		shader.uniforms.giantColMid2 = { value: palette.mid2 }
		shader.uniforms.giantColMid3 = { value: palette.mid3 }
		shader.vertexShader = shader.vertexShader
			.replace(
				"#include <common>",
				"#include <common>\nvarying vec3 vGiantObjectPosition;",
			)
			.replace(
				"#include <begin_vertex>",
				"#include <begin_vertex>\nvGiantObjectPosition = position;",
			)
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				`
				#include <common>
				varying vec3 vGiantObjectPosition;
				uniform float giantSeed;
				uniform vec3 giantColTop;
				uniform vec3 giantColBot;
				uniform vec3 giantColMid1;
				uniform vec3 giantColMid2;
				uniform vec3 giantColMid3;
				#define GIANT_NUM_NOISE_OCTAVES 10
				#define GIANT_PLANET_SIZE 0.75

				float giantHash(float p) {
					p = fract(p * 0.011);
					p *= p + 7.5;
					p *= p + p;
					return fract(p);
				}
				float giantNoise(vec3 x) {
					const vec3 step = vec3(110.0, 241.0, 171.0);
					vec3 i = floor(x);
					vec3 f = fract(x);
					float n = dot(i, step);
					vec3 u = f * f * (3.0 - 2.0 * f);
					return mix(
						mix(
							mix(giantHash(n + dot(step, vec3(0.0, 0.0, 0.0))), giantHash(n + dot(step, vec3(1.0, 0.0, 0.0))), u.x),
							mix(giantHash(n + dot(step, vec3(0.0, 1.0, 0.0))), giantHash(n + dot(step, vec3(1.0, 1.0, 0.0))), u.x),
							u.y
						),
						mix(
							mix(giantHash(n + dot(step, vec3(0.0, 0.0, 1.0))), giantHash(n + dot(step, vec3(1.0, 0.0, 1.0))), u.x),
							mix(giantHash(n + dot(step, vec3(0.0, 1.0, 1.0))), giantHash(n + dot(step, vec3(1.0, 1.0, 1.0))), u.x),
							u.y
						),
						u.z
					);
				}
				float giantFbm(vec3 x) {
					float v = 0.0;
					float a = 0.5;
					vec3 shift = vec3(100.0);
					for (int i = 0; i < GIANT_NUM_NOISE_OCTAVES; ++i) {
						v += a * giantNoise(x);
						x = x * 2.0 + shift;
						a *= 0.5;
					}
					return v;
				}
				float giantMax3(vec3 v) { return max(max(v.x, v.y), v.z); }
				vec3 giantCloudColor(vec3 objectPosition, float seed, vec3 colTop, vec3 colBot, vec3 colMid1, vec3 colMid2, vec3 colMid3) {
					vec3 X = objectPosition * GIANT_PLANET_SIZE
						+ vec3(seed * 17.3, seed * 11.7, seed * 29.1);

					vec3 q = vec3(giantFbm(X));
					vec3 r = vec3(giantFbm(X + q));
					float v = giantFbm(X + 5.0 * r);

					vec3 colMid = mix(colMid1, colMid2, clamp(r, 0.0, 1.0));
					colMid = mix(colMid, colMid3, clamp(q, 0.0, 1.0));

					float pos = v * 2.0 - 1.0;
					vec3 color = mix(colMid, colTop, clamp(vec3(pos), 0.0, 1.0));
					color = mix(color, colBot, clamp(vec3(-pos), 0.0, 1.0));
					color = color / giantMax3(color);
					color = (clamp(0.4 * pow(v, 3.0) + pow(v, 2.0) + 0.5 * v, 0.0, 1.0) * 0.9 + 0.1) * color;
					return color;
				}
				`,
			)
			.replace(
				"#include <map_fragment>",
				"diffuseColor.rgb = giantCloudColor(normalize(vGiantObjectPosition), giantSeed, giantColTop, giantColBot, giantColMid1, giantColMid2, giantColMid3);",
			)
	}
	return material
}
