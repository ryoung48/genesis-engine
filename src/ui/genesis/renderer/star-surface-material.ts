import * as THREE from "three"
import type { SpectralClass } from "@/model/celestial/star/types"
import type { StarGlowMaterialInput } from "@/ui/genesis/renderer/types"

// Hand-authored photosphere palette per spectral class: the fbm mixes
// between `hot` (its brightest granules) and `mid`, then toward `deep` (its
// coolest lanes).
//
// These are chosen for how they LOOK, not for blackbody accuracy. The pale
// classes (O/B/A/F) hold a single hue across all three stops -- matching
// their classification swatch in constants.ts -- and only vary in lightness,
// so the fbm reads as one coloured disc with granule texture rather than the
// dark navy lanes an accuracy-driven ramp produced. `deep` stays at roughly
// 0.4-0.5 of `mid`'s brightness: enough contrast for the granulation to
// show, not so much that the lanes turn to shadow.
//
// Values are raw linear components (the THREE.Color(r, g, b) form, NOT hex),
// matching the article's own (1, 0.4, 0) / (1, 0, 0) convention -- a hex
// literal would be converted from sRGB and land far darker.
//
// `gain` is per class because the tone mapping compresses hard above ~1.0: a
// pale palette at the warm classes' 1.6 lands wholly inside that region and
// flattens to featureless white.
//
// Two orderings are load-bearing and were both inverted at some point, so
// check them if these are retuned: blue cast falls O > B > A > F, and warmth
// (green/red at the darkest lane) falls F > G > K > M.
type StarPalette = {
	hot: THREE.Color
	mid: THREE.Color
	deep: THREE.Color
	gain: number
}

const palette = (
	hot: [number, number, number],
	mid: [number, number, number],
	deep: [number, number, number],
	gain: number,
): StarPalette => ({
	hot: new THREE.Color(...hot),
	mid: new THREE.Color(...mid),
	deep: new THREE.Color(...deep),
	gain,
})

const STAR_PALETTE_BY_CLASS: Partial<Record<SpectralClass, StarPalette>> = {
	// swatch #7cc6ff -- azure, held across all three stops
	O: palette([0.82, 0.93, 1.0], [0.42, 0.68, 1.0], [0.17, 0.35, 0.72], 1.15),
	// swatch #d8eeff -- pale ice blue
	B: palette([0.94, 0.98, 1.0], [0.72, 0.86, 1.0], [0.42, 0.58, 0.85], 1.08),
	// swatch #ffffff -- white with the faintest cool cast in the lanes
	A: palette([1.0, 1.0, 1.0], [0.87, 0.91, 0.98], [0.55, 0.62, 0.78], 1.0),
	// swatch #fffcd3 -- warm ivory, hue kept out of orange/brown
	F: palette([1.0, 1.0, 0.97], [1.0, 0.97, 0.79], [0.66, 0.58, 0.36], 1.05),
	G: palette([1.0, 1.0, 1.0], [1.0, 0.56, 0.14], [1.0, 0.2, 0.0], 1.6),
	K: palette([1.0, 1.0, 1.0], [1.0, 0.34, 0.03], [1.0, 0.06, 0.0], 1.6),
	M: palette([1.0, 0.97, 0.9], [1.0, 0.2, 0.0], [1.0, 0.0, 0.0], 1.6),
	D: palette([1.0, 1.0, 1.0], [0.95, 0.98, 1.0], [0.76, 0.86, 0.97], 1.0),
	NS: palette([1.0, 1.0, 1.0], [0.55, 0.9, 1.0], [0.13, 0.48, 0.75], 1.4),
}

// Giants read as an M-class star scaled up, whatever their spectral class:
// the luminosity class dominates their appearance, so a G-class giant should
// not render as a yellow main-sequence disc.
const GIANT_PALETTE = palette(
	[1.0, 0.95, 0.85],
	[1.0, 0.16, 0.0],
	[0.95, 0.0, 0.0],
	1.55,
)

// Only the ordinary main-sequence classes above ever reach this material --
// remnants and brown dwarfs use their own flat materials -- so this fallback
// is for completeness rather than a case that occurs.
const DEFAULT_STAR_PALETTE = STAR_PALETTE_BY_CLASS.G as StarPalette

// The star's clock runs off the same spin-hours knob that drives gas-giant
// cloud bands and the black-hole accretion disc, so its surface only churns
// when the scene clock actually moves. Hours are a slow unit for this
// shader's own noise rates, hence the multiplier.
const HOURS_TO_SHADER_TIME = 4

// Granulation frequency for a Sol-sized star, and how it tracks stellar
// size. Convection cells are set by photospheric physics, not by the star's
// radius, so a larger star genuinely shows MORE of them across its disc --
// and without that, every star renders an identically-scaled pattern and so
// reads as the same object at a different zoom, whatever its actual radius.
const BASE_NOISE_SCALE = 5
const MIN_NOISE_SCALE = 3
const MAX_NOISE_SCALE = 15
// Giants get a deliberately COARSE surface rather than the very fine one
// their huge diameter would otherwise select. That is both what makes them
// read as "an M-class star, much bigger" instead of a differently-textured
// object, and what really happens: a red giant's convection cells are so
// large that only a handful span the whole visible disc.
const GIANT_NOISE_SCALE = 2.5

// Radius, as a multiple of the star's own, for the corona shell, plus the
// strength it contributes. The article specifies neither -- it gives the
// shader logic only -- so these are tuning values, and the first things to
// reach for if the corona reads too hot or too faint.
//
// The glow radius matters far more than it looks. Its shader is
// pow(dot(viewDir, normal), 4) on a back-facing shell, so the brightness
// arriving just outside the star's limb is fixed by the ratio between the
// two radii, as sqrt(1 - 1/scale^2)^4: 1.3x lands near 0.17 (too faint to
// notice), 1.9x near 0.52, and the 2.6x this once used near 0.73 -- which,
// spread over an annulus wider than the star itself, was the original
// blown-out halo.
export const STAR_GLOW_RADIUS_SCALE = 1.9
export const STAR_GLOW_STRENGTH = 0.55

export type StarSurfaceLayersInput = {
	spectralClass: SpectralClass
	isGiant: boolean
	tint: THREE.Color
	diameterSol: number
}

export type StarSurfaceLayers = {
	surface: THREE.ShaderMaterial
	glow: THREE.ShaderMaterial
	setSpinHours(hours: number): void
}

const STAR_VERTEX_SHADER = `
	varying vec3 vNormalView;
	varying vec3 vPosition;
	varying vec3 vObjectPosition;
	void main() {
		vNormalView = normalize(normalMatrix * normal);
		// The article's own vNormalModel, under a clearer name: the fragment's
		// place on the unrotated sphere. The surface shader samples its noise
		// here rather than in view space, the one deliberate deviation from the
		// article -- a view-space domain is fine for its fixed-camera demo, but
		// in a freely orbited scene it makes the granulation swim across the
		// disc as the camera moves instead of staying fixed to the star.
		vObjectPosition = normalize(position);
		// Direction from the camera to this fragment, in view space -- the
		// sign of its dot with the view normal is what separates front-facing
		// from back-facing geometry in all three fragment shaders below.
		vPosition = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

// Value noise over a 3D lattice, cross-faded between two integer time steps
// so the field churns instead of merely drifting. Sampled in the star's own
// object space, which is what keeps the granulation attached to the sphere
// rather than sliding across it as the camera moves.
const STAR_NOISE_CHUNK = `
	float starRandom(in vec3 st) {
		return fract(sin(dot(st, vec3(12.9898, 78.233, 23.112))) * 12943.145);
	}

	float starNoise(in vec3 pos) {
		vec3 iPos = floor(pos);
		vec3 fPos = fract(pos);

		float iTime = floor(time * 0.2);
		float fTime = fract(time * 0.2);

		float aa = starRandom(iPos + iTime);
		float ab = starRandom(iPos + iTime + vec3(1., 0., 0.));
		float ac = starRandom(iPos + iTime + vec3(0., 1., 0.));
		float ad = starRandom(iPos + iTime + vec3(1., 1., 0.));
		float ae = starRandom(iPos + iTime + vec3(0., 0., 1.));
		float af = starRandom(iPos + iTime + vec3(1., 0., 1.));
		float ag = starRandom(iPos + iTime + vec3(0., 1., 1.));
		float ah = starRandom(iPos + iTime + vec3(1., 1., 1.));

		float ba = starRandom(iPos + (iTime + 1.));
		float bb = starRandom(iPos + (iTime + 1.) + vec3(1., 0., 0.));
		float bc = starRandom(iPos + (iTime + 1.) + vec3(0., 1., 0.));
		float bd = starRandom(iPos + (iTime + 1.) + vec3(1., 1., 0.));
		float be = starRandom(iPos + (iTime + 1.) + vec3(0., 0., 1.));
		float bf = starRandom(iPos + (iTime + 1.) + vec3(1., 0., 1.));
		float bg = starRandom(iPos + (iTime + 1.) + vec3(0., 1., 1.));
		float bh = starRandom(iPos + (iTime + 1.) + vec3(1., 1., 1.));

		vec3 t = smoothstep(0., 1., fPos);
		float tTime = smoothstep(0., 1., fTime);

		return mix(
			mix(
				mix(mix(aa, ab, t.x), mix(ac, ad, t.x), t.y),
				mix(mix(ae, af, t.x), mix(ag, ah, t.x), t.y), t.z),
			mix(
				mix(mix(ba, bb, t.x), mix(bc, bd, t.x), t.y),
				mix(mix(be, bf, t.x), mix(bg, bh, t.x), t.y), t.z), tTime);
	}

	#define STAR_OCTAVES 6

	float starFbm(in vec3 pos, in float sz) {
		float v = 0.0;
		float a = 0.2;
		pos *= sz;

		// Each octave is rotated as well as scaled, and the rotation itself
		// creeps with time -- without it the octaves stay axis-aligned and the
		// fbm shows an obvious lattice grain.
		vec3 angle = vec3(-0.001 * time, 0.0001 * time, 0.0004 * time);
		mat3 rotx = mat3(1, 0, 0,
			0, cos(angle.x), -sin(angle.x),
			0, sin(angle.x), cos(angle.x));
		mat3 roty = mat3(cos(angle.y), 0, sin(angle.y),
			0, 1, 0,
			-sin(angle.y), 0, cos(angle.y));
		mat3 rotz = mat3(cos(angle.z), -sin(angle.z), 0,
			sin(angle.z), cos(angle.z), 0,
			0, 0, 1);

		for (int i = 0; i < STAR_OCTAVES; ++i) {
			v += a * starNoise(pos);
			pos = rotx * roty * rotz * pos * 2.0;
			a *= 0.8;
		}
		return v;
	}

	float starCellEdge(in vec3 pos) {
		vec3 cell = floor(pos);
		vec3 local = fract(pos);
		float nearest = 2.0;
		float second = 2.0;
		for (int x = -1; x <= 1; ++x) {
			for (int y = -1; y <= 1; ++y) {
				for (int z = -1; z <= 1; ++z) {
					vec3 neighbor = vec3(float(x), float(y), float(z));
					vec3 feature = cell + neighbor;
					feature = vec3(
						starRandom(feature),
						starRandom(feature + vec3(19.0)),
						starRandom(feature + vec3(47.0))
					);
					float distanceToFeature = length(neighbor + feature - local);
					if (distanceToFeature < nearest) {
						second = nearest;
						nearest = distanceToFeature;
					} else {
						second = min(second, distanceToFeature);
					}
				}
			}
		}
		return 1.0 - smoothstep(0.015, 0.14, second - nearest);
	}
`

export function buildStarGlowMaterial(
	input: StarGlowMaterialInput,
): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: {
			haloColor: { value: input.tint.clone() },
			strength: { value: input.strength },
		},
		vertexShader: STAR_VERTEX_SHADER,
		fragmentShader: `
			uniform vec3 haloColor;
			uniform float strength;
			varying vec3 vNormalView;
			varying vec3 vPosition;
			void main() {
				float intensity = pow(max(dot(vPosition, vNormalView), 0.), 4.);
				gl_FragColor = vec4(haloColor, intensity * strength);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		side: THREE.BackSide,
	})
}

export function buildStarSurfaceLayers(
	input: StarSurfaceLayersInput,
): StarSurfaceLayers {
	const time = { value: 0 }
	const starPalette = input.isGiant
		? GIANT_PALETTE
		: (STAR_PALETTE_BY_CLASS[input.spectralClass] ?? DEFAULT_STAR_PALETTE)
	const cellularSurface =
		(input.spectralClass === "D" || input.spectralClass === "NS") &&
		!input.isGiant
	const { hot: hotColor, mid: midColor, deep: deepColor } = starPalette
	const noiseScale = cellularSurface
		? input.spectralClass === "NS"
			? 22
			: 32
		: input.isGiant
			? GIANT_NOISE_SCALE
			: Math.min(
					MAX_NOISE_SCALE,
					Math.max(
						MIN_NOISE_SCALE,
						BASE_NOISE_SCALE * Math.sqrt(Math.max(0.01, input.diameterSol)),
					),
				)

	const surface = new THREE.ShaderMaterial({
		uniforms: {
			time,
			hotColor: { value: hotColor },
			midColor: { value: midColor },
			deepColor: { value: deepColor },
			gain: { value: starPalette.gain },
			noiseScale: { value: noiseScale },
			cellularSurface: { value: cellularSurface ? 1 : 0 },
		},
		vertexShader: STAR_VERTEX_SHADER,
		fragmentShader: `
			uniform float time;
			uniform vec3 hotColor;
			uniform vec3 midColor;
			uniform vec3 deepColor;
			uniform float gain;
			uniform float noiseScale;
			uniform float cellularSurface;
			varying vec3 vNormalView;
			varying vec3 vPosition;
			varying vec3 vObjectPosition;

			${STAR_NOISE_CHUNK}

			void main() {
				vec3 st = vObjectPosition;
				if (cellularSurface > 0.5) {
					float mottling = starFbm(st, noiseScale * 0.2);
					float veins = starCellEdge(st * noiseScale);
					vec3 color = mix(deepColor, midColor, smoothstep(0.15, 0.7, mottling));
					color = mix(color, hotColor, veins * 0.85);
					gl_FragColor = vec4(gain * color, 1.0);
					return;
				}

				// Domain warp: q displaces the sample point of the fbm below,
				// which is what turns smooth noise into the curdled granulation
				// pattern a photosphere actually has.
				vec3 q = vec3(0.);
				q.x = starFbm(st, noiseScale);
				q.y = starFbm(st + vec3(1.2, 3.2, 1.52), noiseScale);
				q.z = starFbm(st + vec3(0.02, 0.12, 0.152), noiseScale);

				float n = starFbm(st + q + vec3(1.82, 1.32, 1.09), noiseScale);

				vec3 color = mix(midColor, hotColor, n * n);
				color = mix(color, deepColor, q * 0.7);

				gl_FragColor = vec4(gain * color, 1.);
			}
		`,
	})

	const glow = buildStarGlowMaterial({
		tint: input.tint,
		strength: STAR_GLOW_STRENGTH,
	})

	function setSpinHours(hours: number): void {
		time.value = hours * HOURS_TO_SHADER_TIME
	}

	return { surface, glow, setSpinHours }
}
