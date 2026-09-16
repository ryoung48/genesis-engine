import * as THREE from "three"
import type { CraterMaterialInput } from "@/ui/genesis/renderer/types"

export function buildCraterMaterial(
	input: CraterMaterialInput,
): THREE.MeshStandardMaterial {
	const surfaceFragmentByStyle: Record<CraterMaterialInput["style"], string> = {
		martian: `
		vec3 craterPosition = normalize(vCraterPosition);
		vec3 terrainPosition = warpedRockPosition(craterPosition);
		float broadTerrain = craterNoise(terrainPosition * 2.6 + vec3(craterSeed * 0.23));
		float middleTerrain = craterNoise(terrainPosition * 6.4 + vec3(craterSeed * 0.41));
		float edgeTerrain = rockFbm(terrainPosition * 10.0 + vec3(craterSeed * 0.57));
		float darkTerrain = smoothstep(0.45, 0.59, broadTerrain * 0.42 + middleTerrain * 0.2 + edgeTerrain * 0.38);
		float dust = rockFbm(craterPosition * 18.0 + vec3(craterSeed * 0.31));
		float relief = rockFbm(craterPosition * 32.0 + vec3(craterSeed * 0.59));
		float craterRelief = craterLayer(CraterLayerInput(craterPosition, 7.0, 0.07, 0.23))
			+ craterLayer(CraterLayerInput(craterPosition, 25.0, 0.1, 0.16)) * 0.55;
		float dustDetail = smoothstep(0.4, 0.6, dust);
		float surfaceShade = clamp(0.89 + dustDetail * 0.1 + (relief - 0.5) * 0.14
			+ craterRelief, 0.48, 1.16);
		vec3 darkRock = craterColor * vec3(0.35, 0.31, 0.31);
		vec3 terrainColor = mix(craterColor, darkRock, darkTerrain * 0.85) * surfaceShade;
		diffuseColor.rgb = terrainColor;
	`,
		snowball: `
		vec3 craterPosition = normalize(vCraterPosition);
		float terrain = craterNoise(craterPosition * 18.0 + vec3(craterSeed * 0.31));
		vec3 fracturePosition = warpedRockPosition(craterPosition);
		float fractureNoise = rockFbm(fracturePosition * 5.5 + vec3(craterSeed * 0.21));
		float fractures = smoothstep(0.86, 0.98, 1.0 - abs(fractureNoise * 2.0 - 1.0));
		float frostPatch = craterNoise(fracturePosition * 2.4 + vec3(craterSeed * 0.53));
		float frostiness = smoothstep(0.3, 0.7, frostPatch);
		float mediumCraters = craterLayer(CraterLayerInput(craterPosition, 9.0, 0.16, 0.18));
		float smallCraters = craterLayer(CraterLayerInput(craterPosition, 20.0, 0.24, 0.22));
		float tinyCraters = craterLayer(CraterLayerInput(craterPosition, 42.0, 0.18, 0.14));
		vec3 dirtyIce = craterColor * vec3(0.62, 0.66, 0.74);
		vec3 brightIce = craterColor * vec3(1.15, 1.18, 1.22);
		vec3 terrainColor = mix(dirtyIce, brightIce, clamp(frostiness + fractures * 0.6, 0.0, 1.0));
		terrainColor = mix(terrainColor, vec3(1.0), fractures * 0.5);
		float shade = clamp(0.92 + (terrain - 0.5) * 0.1
			+ mediumCraters * 0.7 + smallCraters * 0.55 + tinyCraters * 0.4, 0.5, 1.35);
		diffuseColor.rgb = clamp(terrainColor * shade, 0.0, 1.3);
	`,
		meltball: `
		vec3 craterPosition = normalize(vCraterPosition);
		vec3 terrainPosition = warpedRockPosition(craterPosition);
		float broadTerrain = craterNoise(terrainPosition * 2.6 + vec3(craterSeed * 0.23));
		float middleTerrain = craterNoise(terrainPosition * 6.4 + vec3(craterSeed * 0.41));
		float edgeTerrain = rockFbm(terrainPosition * 10.0 + vec3(craterSeed * 0.57));
		float heat = broadTerrain * 0.42 + middleTerrain * 0.2 + edgeTerrain * 0.38;
		float dust = rockFbm(craterPosition * 18.0 + vec3(craterSeed * 0.31));
		float relief = rockFbm(craterPosition * 32.0 + vec3(craterSeed * 0.59));
		float craterRelief = craterLayer(CraterLayerInput(craterPosition, 7.0, 0.07, 0.23))
			+ craterLayer(CraterLayerInput(craterPosition, 25.0, 0.1, 0.16)) * 0.55;
		float dustDetail = smoothstep(0.4, 0.6, dust);
		float surfaceShade = clamp(0.89 + dustDetail * 0.1 + (relief - 0.5) * 0.14
			+ craterRelief, 0.48, 1.16);
		vec3 veryDarkBrown = vec3(0.04, 0.018, 0.01);
		vec3 brown = vec3(0.18, 0.08, 0.045);
		vec3 brownRed = vec3(0.32, 0.09, 0.04);
		vec3 lavaDeepRed = vec3(0.5, 0.05, 0.02);
		vec3 lavaOrange = vec3(0.95, 0.4, 0.05);
		vec3 terrainColor = mix(veryDarkBrown, brown, smoothstep(0.1, 0.4, heat));
		terrainColor = mix(terrainColor, brownRed, smoothstep(0.35, 0.55, heat));
		terrainColor = mix(terrainColor, lavaDeepRed, smoothstep(0.5, 0.68, heat));
		terrainColor = mix(terrainColor, lavaOrange, smoothstep(0.62, 0.85, heat));
		float craterFill = clamp(-craterRelief * 3.0, 0.0, 1.0);
		vec3 shadedTerrain = terrainColor * surfaceShade;
		vec3 craterLava = mix(lavaDeepRed, lavaOrange, craterFill);
		vec3 litSurface = mix(shadedTerrain, craterLava, craterFill);
		diffuseColor.rgb = clamp(litSurface, 0.0, 1.4);
	`,
		cratered: `
		vec3 craterPosition = normalize(vCraterPosition);
		float terrain = craterNoise(craterPosition * 18.0 + vec3(craterSeed * 0.31));
		vec3 mariaPosition = warpedRockPosition(craterPosition);
		float fineTerrain = rockFbm(craterPosition * 35.0 + vec3(craterSeed * 0.47));
		float grainTerrain = rockFbm(craterPosition * 75.0 + vec3(craterSeed * 0.63));
		float broadTerrain = craterNoise(mariaPosition * 2.2 + vec3(craterSeed * 0.21));
		float midTerrain = craterNoise(mariaPosition * 4.6 + vec3(craterSeed * 0.43));
		float detailTerrain = craterNoise(mariaPosition * 8.5 + vec3(craterSeed * 0.55));
		float maria = smoothstep(0.34, 0.66, broadTerrain * 0.55 + midTerrain * 0.3 + detailTerrain * 0.15);
		float mediumCraters = craterLayer(CraterLayerInput(craterPosition, 9.0, 0.16 - maria * 0.05, 0.22));
		float smallCraters = craterLayer(CraterLayerInput(craterPosition, 20.0, 0.26 - maria * 0.07, 0.3));
		float tinyCraters = craterLayer(CraterLayerInput(craterPosition, 42.0, 0.2 - maria * 0.04, 0.18));
		float microCraters = craterLayer(CraterLayerInput(craterPosition, 85.0, 0.14, 0.1));
		float shade = clamp(0.9 + (terrain - 0.5) * 0.24 + (fineTerrain - 0.5) * 0.12
			+ (grainTerrain - 0.5) * 0.1 + (1.0 - maria) * 0.08 - maria * 0.27
			+ mediumCraters * 0.9 + smallCraters * 0.75 + tinyCraters * 0.5
			+ microCraters * 0.35, 0.08, 1.35);
		diffuseColor.rgb = craterColor * shade;
	`,
	}
	const surfaceFragment = surfaceFragmentByStyle[input.style]
	const material = new THREE.MeshStandardMaterial({
		roughness: 1,
		metalness: 0,
	})
	material.customProgramCacheKey = () => input.style
	material.onBeforeCompile = (shader) => {
		shader.uniforms.craterSeed = { value: input.seed }
		shader.uniforms.craterColor = { value: new THREE.Color(input.color) }
		shader.vertexShader = shader.vertexShader
			.replace(
				"#include <common>",
				"#include <common>\nvarying vec3 vCraterPosition;",
			)
			.replace(
				"#include <begin_vertex>",
				"#include <begin_vertex>\nvCraterPosition = position;",
			)
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				`
				#include <common>
				varying vec3 vCraterPosition;
				uniform float craterSeed;
				uniform vec3 craterColor;

				struct CraterLayerInput {
					vec3 position;
					float scale;
					float presence;
					float depth;
				};

				float craterHash(vec3 p) {
					return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
				}

				vec3 craterHash3(vec3 p) {
					return vec3(
						craterHash(p),
						craterHash(p + vec3(19.1, 4.7, 31.3)),
						craterHash(p + vec3(43.7, 17.3, 9.2))
					);
				}

				float craterNoise(vec3 p) {
					vec3 cell = floor(p);
					vec3 f = fract(p);
					vec3 u = f * f * (3.0 - 2.0 * f);
					return mix(
						mix(mix(craterHash(cell), craterHash(cell + vec3(1.0, 0.0, 0.0)), u.x),
							mix(craterHash(cell + vec3(0.0, 1.0, 0.0)), craterHash(cell + vec3(1.0, 1.0, 0.0)), u.x), u.y),
						mix(mix(craterHash(cell + vec3(0.0, 0.0, 1.0)), craterHash(cell + vec3(1.0, 0.0, 1.0)), u.x),
							mix(craterHash(cell + vec3(0.0, 1.0, 1.0)), craterHash(cell + vec3(1.0, 1.0, 1.0)), u.x), u.y),
						u.z
					);
				}

				float rockFbm(vec3 p) {
					float value = 0.0;
					float amplitude = 0.5;
					for (int i = 0; i < 5; i++) {
						value += craterNoise(p) * amplitude;
						p = p * 2.0 + vec3(17.1, 29.7, 43.3);
						amplitude *= 0.5;
					}
					return value / 0.96875;
				}

				vec3 warpedRockPosition(vec3 p) {
					vec3 warp = vec3(
						craterNoise(p * 3.3 + vec3(craterSeed * 0.17)),
						craterNoise(p * 3.3 + vec3(craterSeed * 0.29 + 12.4)),
						craterNoise(p * 3.3 + vec3(craterSeed * 0.41 + 27.1))
					);
					return p + (warp - 0.5) * 0.32;
				}

				float craterLayer(CraterLayerInput layer) {
					vec3 samplePoint = layer.position * layer.scale;
					vec3 baseCell = floor(samplePoint);
					float relief = 0.0;
					for (int x = -1; x <= 1; x++) {
						for (int y = -1; y <= 1; y++) {
							for (int z = -1; z <= 1; z++) {
								vec3 cell = baseCell + vec3(float(x), float(y), float(z));
								vec3 identity = cell + vec3(craterSeed * 0.13, craterSeed * 0.37, craterSeed * 0.19);
								if (craterHash(identity + vec3(7.0)) > layer.presence) continue;
								vec3 center = cell + craterHash3(identity);
								float radius = mix(0.15, 0.5, craterHash(identity + vec3(13.0)));
								vec3 displacement = samplePoint - center;
								float distanceFromCenter = length(displacement) / radius;
								float bowl = 1.0 - smoothstep(0.2, 0.85, distanceFromCenter);
								float rim = smoothstep(0.82, 0.96, distanceFromCenter)
									* (1.0 - smoothstep(1.0, 1.12, distanceFromCenter));
								relief += rim * 0.15 - bowl * layer.depth;
							}
						}
					}
					return relief;
				}
				`,
			)
			.replace("#include <map_fragment>", surfaceFragment)
	}
	return material
}
