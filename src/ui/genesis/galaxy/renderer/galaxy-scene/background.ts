import * as THREE from "three"

/** Soft radial glow representing the galactic core, ported from galaxy-gen's
 * renderer/background.ts. Built relative to local (0,0) -- the caller
 * positions the containing group at the galaxy's dimensions-space center
 * (see create-galaxy-scene.ts's setGalaxy). */
export function buildCoreGlow(innerRadius: number): THREE.Sprite {
	const texSize = 256
	const canvas = document.createElement("canvas")
	canvas.width = texSize
	canvas.height = texSize
	const ctx = canvas.getContext("2d")!
	const half = texSize / 2
	const grad = ctx.createRadialGradient(half, half, 0, half, half, half)
	grad.addColorStop(0, "rgba(255,255,220,1)")
	grad.addColorStop(0.2, "rgba(255,255,200,0.8)")
	grad.addColorStop(0.55, "rgba(255,255,220,0.25)")
	grad.addColorStop(1, "rgba(255,255,255,0)")
	ctx.fillStyle = grad
	ctx.fillRect(0, 0, texSize, texSize)

	const tex = new THREE.CanvasTexture(canvas)
	const mat = new THREE.SpriteMaterial({
		map: tex,
		transparent: true,
		depthWrite: false,
	})
	const sprite = new THREE.Sprite(mat)
	const glowSize = innerRadius * 3
	sprite.scale.set(glowSize, glowSize, 1)
	sprite.position.set(0, 0, -1)
	return sprite
}

/** Faint circle at the outer galaxy radius. */
export function buildRimCircle(outerRadius: number): THREE.Line {
	const segments = 256
	const positions = new Float32Array((segments + 1) * 3)
	for (let i = 0; i <= segments; i++) {
		const a = (i / segments) * Math.PI * 2
		positions[3 * i] = Math.cos(a) * outerRadius
		positions[3 * i + 1] = Math.sin(a) * outerRadius
		positions[3 * i + 2] = 0
	}
	const geo = new THREE.BufferGeometry()
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	const mat = new THREE.LineBasicMaterial({
		color: 0xffffff,
		opacity: 0.2,
		transparent: true,
	})
	return new THREE.Line(geo, mat)
}

/** Faint circle at the inner galaxy radius (galactic core boundary). */
export function buildInnerCircle(innerRadius: number): THREE.Line {
	const segments = 128
	const positions = new Float32Array((segments + 1) * 3)
	for (let i = 0; i <= segments; i++) {
		const a = (i / segments) * Math.PI * 2
		positions[3 * i] = Math.cos(a) * innerRadius
		positions[3 * i + 1] = Math.sin(a) * innerRadius
		positions[3 * i + 2] = 0
	}
	const geo = new THREE.BufferGeometry()
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	const mat = new THREE.LineBasicMaterial({
		color: 0xffffff,
		opacity: 0.15,
		transparent: true,
	})
	return new THREE.Line(geo, mat)
}

/** Procedural spiral-arm/dust-lane nebula shader, ported verbatim from
 * galaxy-gen's renderer/background.ts (fbm noise + arm/dust bands driven
 * only by the galaxy's own inner/outer radii, so it needs no changes for
 * this repo's unconstrained galaxy). */
export function buildSpiralNebula(
	outerRadius: number,
	innerRadius: number,
): THREE.Mesh {
	const extent = outerRadius * 2.42
	const geometry = new THREE.PlaneGeometry(extent, extent, 1, 1)
	const material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		depthTest: false,
		blending: THREE.NormalBlending,
		uniforms: {
			uOuterRadius: { value: outerRadius },
			uInnerRadius: { value: innerRadius },
		},
		vertexShader: `
			varying vec2 vPos;

			void main() {
				vPos = position.xy;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			varying vec2 vPos;

			uniform float uOuterRadius;
			uniform float uInnerRadius;

			float hash(vec2 p) {
				return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
			}

			float noise(vec2 p) {
				vec2 i = floor(p);
				vec2 f = fract(p);
				float a = hash(i);
				float b = hash(i + vec2(1.0, 0.0));
				float c = hash(i + vec2(0.0, 1.0));
				float d = hash(i + vec2(1.0, 1.0));
				vec2 u = f * f * (3.0 - 2.0 * f);
				return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
			}

			float fbm(vec2 p) {
				float value = 0.0;
				float amplitude = 0.5;
				for (int i = 0; i < 6; i++) {
					value += amplitude * noise(p);
					p = p * 2.03 + vec2(3.1, -5.7);
					amplitude *= 0.52;
				}
				return value;
			}

			float ridge(float x) {
				return 1.0 - abs(x * 2.0 - 1.0);
			}

			void main() {
				float r = length(vPos);
				float radial = r / max(uOuterRadius, 1.0);
				if (radial > 1.12) {
					discard;
				}

				float angle = atan(vPos.y, vPos.x);
				vec2 sampleUv = vPos / uOuterRadius;
				float swirl = angle - radial * 7.6;
				float armFieldMajor = 0.5 + 0.5 * cos(swirl * 2.0);
				float armFieldMinor = 0.5 + 0.5 * cos(swirl * 4.0 + fbm(sampleUv * 4.2) * 0.8);
				float armMask = smoothstep(0.58, 0.985, armFieldMajor);
				float armRidges = ridge(fract(swirl / 6.28318 * 2.0 + fbm(sampleUv * 8.0) * 0.06));
				armRidges = smoothstep(0.42, 0.96, armRidges);
				float armBands = mix(armMask, armMask * armRidges, 0.45) + smoothstep(0.78, 0.99, armFieldMinor) * 0.2;

				float dustA = fbm(sampleUv * 3.4 + vec2(4.2, -1.3));
				float dustB = fbm(sampleUv * 7.8 - vec2(2.7, 5.1));
				float dustC = fbm(sampleUv * 12.0 + vec2(-6.0, 3.0));
				float dust = smoothstep(0.34, 0.86, dustA * 0.58 + dustB * 0.28 + dustC * 0.14);
				float dustLanes = 1.0 - smoothstep(0.28, 0.76, fbm(sampleUv * 10.5 + vec2(-3.0, 2.2)));
				float pinkKnots = pow(smoothstep(0.8, 0.97, dustC), 2.0) * armBands;

				float core = exp(-pow(r / max(uInnerRadius * 3.1, 1.0), 2.0));
				float coreBar = exp(-pow(vPos.y / max(uInnerRadius * 1.15, 1.0), 2.0) - pow(vPos.x / max(uInnerRadius * 2.8, 1.0), 2.0));
				float innerFade = smoothstep(0.0, uInnerRadius * 0.35, r);
				float outerFade = 1.0 - smoothstep(uOuterRadius * 0.93, uOuterRadius * 1.12, r);
				float diskPresence = smoothstep(0.01, 1.0, radial);
				float diskFloor = outerFade * smoothstep(0.04, 0.32, radial) * (1.0 - smoothstep(0.97, 1.12, radial));
				float halo = (1.0 - smoothstep(0.86, 1.12, radial)) * smoothstep(0.66, 1.02, radial);
				float armSpread = 0.86 + 0.14 * smoothstep(0.0, 1.0, 1.0 - abs(radial - 0.72));
				float armStrength = armBands * dust * outerFade * innerFade * armSpread * diskPresence;
				float ambientHaze = (0.58 + 0.18 * dust) * outerFade * smoothstep(0.04, 1.0, radial) * 0.42;
				float diskGlow = outerFade * smoothstep(0.08, 1.0, radial) * 0.16;
				float laneCut = mix(1.0, dustLanes, 0.74);

				vec3 coreWarm = vec3(0.98, 0.91, 0.78);
				vec3 coreGold = vec3(0.88, 0.76, 0.56);
				vec3 armBlue = vec3(0.72, 0.78, 0.88);
				vec3 armWhite = vec3(0.9, 0.91, 0.94);
				vec3 hazeBlue = vec3(0.28, 0.4, 0.58);
				vec3 silverDust = vec3(0.62, 0.68, 0.78);
				vec3 dustColor = vec3(0.3, 0.31, 0.34);
				vec3 pink = vec3(0.96, 0.48, 0.68);
				vec3 armTint = mix(armBlue, armWhite, 0.72 + (dustA - 0.5) * 0.06);
				vec3 hazeTint = mix(hazeBlue, silverDust, 0.32 + (dustB - 0.5) * 0.08);

				vec3 color = vec3(0.0);
				color += mix(hazeBlue, silverDust, 0.22) * diskFloor * 1.1;
				color += mix(hazeBlue, silverDust, 0.28) * halo * 0.34;
				color += coreWarm * core * 0.64;
				color += coreGold * coreBar * 0.3;
				color += armTint * armStrength * 1.26;
				color += hazeTint * ambientHaze * 0.88;
				color += mix(hazeBlue, silverDust, 0.2) * diskGlow * 0.42;
				color += pink * pinkKnots * 0.56;
				color *= laneCut;
				color = mix(color, color * 0.28, dustLanes * 0.56);
				color += dustColor * (ambientHaze + armStrength * 0.4) * dustLanes * 0.22;

				float brightness = 0.2 + diskFloor * 0.38 + halo * 0.18 + armStrength * 0.74 + ambientHaze * 0.24 + core * 0.22 + coreBar * 0.08;
				color = normalize(max(color, vec3(0.0001))) * brightness;

				float alpha = 0.06 + diskFloor * 0.28 + halo * 0.16 + core * 0.14 + coreBar * 0.07 + armStrength * 0.62 + ambientHaze * 0.18 + pinkKnots * 0.08;
				alpha *= mix(1.0, 0.72, dustLanes * 0.58);
				alpha *= 1.0 - smoothstep(uOuterRadius * 1.02, uOuterRadius * 1.12, r);
				alpha = clamp(alpha, 0.0, 0.82);

				gl_FragColor = vec4(color, alpha);
			}
		`,
	})

	const mesh = new THREE.Mesh(geometry, material)
	mesh.position.z = -1.25
	return mesh
}
