import * as THREE from "three"
import type {
	CloudBandMaterialInput,
	CloudBandPalette,
	CloudBandPaletteInput,
} from "@/ui/genesis/renderer/types"

export function swatchCloudBandPalette(
	input: CloudBandPaletteInput,
): CloudBandPalette {
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
		bandWarm: new THREE.Color().setHSL(
			base.h,
			base.s * 0.85,
			0.67,
			THREE.SRGBColorSpace,
		),
		bandCream: new THREE.Color().setHSL(
			base.h,
			Math.max(base.s, 0.35),
			0.78,
			THREE.SRGBColorSpace,
		),
		bandDark: new THREE.Color().setHSL(
			base.h,
			base.s * 0.6,
			0.28,
			THREE.SRGBColorSpace,
		),
	}
}

export function buildCloudBandMaterial(
	input: CloudBandMaterialInput,
): THREE.MeshStandardMaterial {
	const { seed, palette, style } = input
	const material = new THREE.MeshStandardMaterial({
		roughness: 1,
		metalness: 0,
	})
	material.onBeforeCompile = (shader) => {
		shader.uniforms.giantSeed = { value: seed % 24 }
		shader.uniforms.giantBandMode = {
			value: style === "banded" ? 1 : style === "venusian" ? 2 : 0,
		}
		shader.uniforms.giantColTop = { value: palette.top }
		shader.uniforms.giantColBot = { value: palette.bot }
		shader.uniforms.giantColMid1 = { value: palette.mid1 }
		shader.uniforms.giantColMid2 = { value: palette.mid2 }
		shader.uniforms.giantColMid3 = { value: palette.mid3 }
		shader.uniforms.giantBandWarm = { value: palette.bandWarm }
		shader.uniforms.giantBandCream = { value: palette.bandCream }
		shader.uniforms.giantBandDark = { value: palette.bandDark }
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
				uniform float giantBandMode;
				uniform vec3 giantColTop;
				uniform vec3 giantColBot;
				uniform vec3 giantColMid1;
				uniform vec3 giantColMid2;
				uniform vec3 giantColMid3;
				uniform vec3 giantBandWarm;
				uniform vec3 giantBandCream;
				uniform vec3 giantBandDark;
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
				vec3 giantBandedColor(vec3 objectPosition) {
					float textureSeed = mod(giantSeed, 8.0) + giantHash(giantSeed * 0.17 + 13.0) * 0.5;
					vec3 offset = vec3(textureSeed * 17.3, textureSeed * 11.7, textureSeed * 29.1);
					float flow = giantFbm(objectPosition * vec3(2.5, 0.8, 2.5) + offset + vec3(31.0));
					float latitude = objectPosition.y + (flow - 0.5) * 0.11;
					vec3 stretchedPosition = vec3(objectPosition.x * 0.5, latitude * 5.0, objectPosition.z * 0.5);
					vec3 cloudy = giantCloudColor(stretchedPosition, textureSeed, giantColTop, giantColBot, giantColMid1, giantColMid2, giantColMid3);
					float bandFrequency = mix(7.0, 18.0, giantHash(giantSeed * 0.79 + 11.3));
					float bandPhase = giantHash(giantSeed * 0.53 + 37.1) * 6.2831853;
					float bandShape = latitude * bandFrequency + bandPhase + flow * 2.0;
					float broad = 0.5 + 0.42 * sin(bandShape)
						+ 0.08 * sin(bandShape * 2.0 + giantSeed * 0.17);
					vec3 zone = mix(giantBandDark, giantBandWarm, broad);
					zone = mix(zone, giantBandCream, pow(broad, 8.0));
					return mix(zone, cloudy, 0.45);
				}
				vec3 giantVenusColor(vec3 objectPosition) {
					vec3 offset = vec3(giantSeed * 17.3, giantSeed * 11.7, giantSeed * 29.1);
					float latitude = objectPosition.y;
					float poleRadius = sqrt(max(1.0 - latitude * latitude, 0.0001));
					float shear = latitude * 1.4 * poleRadius;
					vec3 shearPosition = vec3(
						objectPosition.x + shear,
						latitude,
						objectPosition.z + shear
					);
					float streaks = giantFbm(shearPosition * vec3(6.0, 1.6, 6.0) + offset);
					float haze = giantFbm(objectPosition * vec3(1.8, 1.0, 1.8) + offset + vec3(45.0));
					float calm = 1.0 - abs(latitude);
					float v = mix(haze, streaks, 0.55 + 0.3 * calm);
					vec3 venusShadow = mix(giantBandWarm, giantBandDark, 0.5);
					vec3 color = mix(venusShadow, giantBandWarm, smoothstep(0.2, 0.55, v));
					color = mix(color, giantBandCream, smoothstep(0.55, 0.9, v));
					return color;
				}
				`,
			)
			.replace(
				"#include <map_fragment>",
				"vec3 giantPosition = normalize(vGiantObjectPosition); diffuseColor.rgb = giantBandMode > 1.5 ? giantVenusColor(giantPosition) : giantBandMode > 0.5 ? giantBandedColor(giantPosition) : giantCloudColor(giantPosition, giantSeed, giantColTop, giantColBot, giantColMid1, giantColMid2, giantColMid3);",
			)
	}
	return material
}
