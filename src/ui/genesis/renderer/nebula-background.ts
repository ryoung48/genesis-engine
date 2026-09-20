import * as THREE from "three"

export const NEBULA_BACKGROUND_RADIUS = 1500

/** Luminance-preserving per-system hue for the nebula backdrop, derived
 * deterministically from the system's own seed so every system reads
 * distinct. Applied in-shader (see uTint/uTintMix), not baked. */
export function nebulaHueForSeed(seed: number): number {
	const hashed = Math.abs(Math.sin(seed * 127.1 + 311.7) * 43758.5453)
	return hashed - Math.floor(hashed)
}

/** Per-system nebula morph (0..20, decorrelated from the hue above by
 * different hash constants). Feeds the shader's own `t` input -- the same
 * value its animation clock used to drive -- so each system freezes a
 * different frame of the authored drift. Only the clouds morph; the
 * sparkle-star grid is computed independently of `t` and stays put. */
export function nebulaMorphForSeed(seed: number): number {
	const hashed = Math.abs(Math.sin(seed * 269.5 + 183.3) * 28001.8384)
	return (hashed - Math.floor(hashed)) * 20.0
}

/** Screen-space nebula backdrop for the solar-system view, ported 1:1 from
 * a Shadertoy nebula shader (fbm clouds + diamond-sparkle starfield).
 * Rendered on a camera-following BackSide sphere inside solarSystemGroup,
 * so it only ever shows behind that view -- never the globe/map views.
 * Writes no depth and draws first, so bodies composite straight over it.
 * Frozen in time (no clock uniform at all) so it costs nothing on idle
 * frames and never fights the demand-driven render scheduler. */
export function buildNebulaBackground(): THREE.Mesh {
	const material = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		uniforms: {
			uResolution: { value: new THREE.Vector2(1, 1) },
			uTint: { value: new THREE.Color(1, 1, 1) },
			uTintMix: { value: 0 },
			uMorph: { value: 0 },
			uZoom: { value: 0 },
			uStyle: { value: new THREE.Vector3(2, 1, 1) },
		},
		vertexShader: `
			void main() {
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			uniform vec2 uResolution;
			uniform vec3 uTint;
			uniform float uTintMix;
			uniform float uMorph;
			uniform float uZoom;
			uniform vec3 uStyle;

			float nebulaMetaDiamond(vec2 p, vec2 pixel, float r) {
				vec2 d = abs(p - pixel);
				return r / (d.x + d.y);
			}

			float nebulaHash(vec2 p) {
				return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
			}

			float nebulaNoise(vec2 p) {
				vec2 i = floor(p);
				vec2 f = fract(p);
				f = f * f * (3.0 - 2.0 * f);
				float a = nebulaHash(i);
				float b = nebulaHash(i + vec2(1.0, 0.0));
				float c = nebulaHash(i + vec2(0.0, 1.0));
				float d = nebulaHash(i + vec2(1.0, 1.0));
				return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
			}

			float nebulaFbm(vec2 p) {
				float value = 0.0;
				float amplitude = 0.5;
				for (int i = 0; i < 6; i++) {
					value += amplitude * nebulaNoise(p);
					p *= 2.0;
					amplitude *= 0.5;
				}
				return value;
			}

			void main() {
				vec2 fragCoord = gl_FragCoord.xy;
				vec2 uv = (2.0 * fragCoord) / uResolution.y;

				vec3 starColor = vec3(0.0);
				vec2 grid = floor(uv);
				for (int y = -1; y <= 1; y++) {
					for (int x = -1; x <= 1; x++) {
						vec2 cell = grid + vec2(float(x), float(y));
						vec2 starPos = cell + vec2(nebulaHash(cell), nebulaHash(cell.yx)) - 0.5;
						float starSize = nebulaHash(cell * 1.5) * 0.01;
						starColor += vec3(1.0, 0.95, 0.8) * nebulaMetaDiamond(uv, starPos, starSize);
					}
				}

				vec2 p = uv * (2.0 + uZoom);

				float t = uMorph;
				float q = nebulaFbm(p - t);
				float r = nebulaFbm(p + q + vec2(1.7, 9.2) + 0.15 * t);
				float f = nebulaFbm(p + r);

				f = pow(f, 3.0);

				vec3 nebulaColor = mix(vec3(0.1, 0.0, 0.2), vec3(0.6, 0.1, 0.5), f * uStyle.x);
				nebulaColor = mix(nebulaColor, vec3(0.9, 0.6, 0.2), length(q) * uStyle.y);
				nebulaColor = mix(nebulaColor, vec3(0.9, 0.9, 0.9), length(r) * uStyle.z);
				nebulaColor = nebulaColor * f * f * f + nebulaColor * f * f + nebulaColor * f;

				vec3 finalColor = nebulaColor + starColor;

				finalColor *= vec3(1.0, 0.9, 1.2);
				vec2 b = fract(10.0 * p);
				p = floor(10.0 * p);
				if (nebulaFbm(vec2(p.x * p.y)) > 0.75)
					finalColor += clamp(vec3(1.0, 0.8, 0.8) * pow((50.0 - 40.0 * nebulaFbm(vec2(p.x + p.y))) * length(b - vec2(0.8 * nebulaFbm(vec2(p.x * p.y)), 0.8 * nebulaFbm(vec2(p.x * p.y + 123.4)))), -1.5), 0.0, 1.0);

				finalColor += vec3(0.5, 0.1, 0.2) * smoothstep(1.0, 0.0, abs(uv.y - 1.0));
				float nebulaLum = dot(finalColor, vec3(0.299, 0.587, 0.114));
				vec3 nebulaTinted = nebulaLum * uTint / max(dot(uTint, vec3(0.299, 0.587, 0.114)), 0.001);
				finalColor = mix(finalColor, nebulaTinted, uTintMix) * 0.5;
				gl_FragColor = vec4(finalColor, 1.0);
			}
		`,
	})
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(NEBULA_BACKGROUND_RADIUS, 32, 24),
		material,
	)
	mesh.frustumCulled = false
	mesh.renderOrder = -1
	return mesh
}

function nebulaMaterial(mesh: THREE.Mesh): THREE.ShaderMaterial {
	return mesh.material as THREE.ShaderMaterial
}

/** Keeps the sky sphere centered on the camera (so it always surrounds the
 * view regardless of zoom). Call once per rendered solar-system frame. */
export function frameNebulaBackground(params: {
	mesh: THREE.Mesh
	camera: THREE.Camera
}): void {
	params.mesh.position.copy(params.camera.position)
}

/** Tints the backdrop toward the calling system's own hue (see
 * nebulaHueForSeed) without changing its brightness -- the tint color is
 * luminance-normalized in-shader, so only the hue carries over. */
export function setNebulaBackgroundSeed(params: {
	mesh: THREE.Mesh
	seed: number
}): void {
	const uniforms = (params.mesh.material as THREE.ShaderMaterial).uniforms
	const tint = new THREE.Color().setHSL(
		nebulaHueForSeed(params.seed),
		0.55,
		0.6,
	)
	uniforms.uTint.value.copy(tint)
	uniforms.uTintMix.value = 0.55
	uniforms.uMorph.value = nebulaMorphForSeed(params.seed)
	const styleHash = (salt: number) => {
		const hashed = Math.abs(Math.sin(params.seed * 127.1 + salt) * 43758.5453)
		return hashed - Math.floor(hashed)
	}
	uniforms.uZoom.value = styleHash(11.3) * 1.5
	uniforms.uStyle.value.set(
		1.0 + styleHash(37.1) * 2.0,
		0.5 + styleHash(71.7),
		0.5 + styleHash(97.9),
	)
}

/** Matches uResolution to the drawing buffer after a resize -- gl_FragCoord
 * is in device pixels, so CSS size alone would skew the aspect. */
export function sizeNebulaBackground(params: {
	mesh: THREE.Mesh
	renderer: THREE.WebGLRenderer
}): void {
	const size = new THREE.Vector2()
	params.renderer.getDrawingBufferSize(size)
	nebulaMaterial(params.mesh).uniforms.uResolution.value.copy(size)
}
