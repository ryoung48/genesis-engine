import * as THREE from "three"
import type { SpectralClass } from "@/model/celestial/star/types"

// Hand-authored photosphere palette per spectral class: the colour the fbm
// mixes between white (its hottest granules) and `deep` (its coolest lanes).
//
// Authored rather than derived from the star's spectral tint. Deriving it
// was tried twice and failed both times: blending toward the tint pushed
// channels past 1.0 and flattened the granulation, and rebuilding from the
// tint's HUE turned G-class stars a sickly yellow-green, because a yellow
// hue at low lightness is olive. A real G photosphere reads orange, so these
// are picked to look right rather than to follow from the tint.
//
// Values are raw linear components (the THREE.Color(r, g, b) form, NOT hex),
// matching the article's own (1, 0.4, 0) / (1, 0, 0) convention -- a hex
// literal would be converted from sRGB and land far darker. G is exactly the
// article's pair.
//
// Every entry pins its DOMINANT channel at 1.0 in both mid and deep, varying
// only the other two. That is the rule that makes the article's G work, and
// breaking it is what made the others muddy: brown is simply dark orange, so
// letting red fall to 0.8 or 0.6 in a warm star's `deep` drags the whole ramp
// through brown as the fbm mixes toward it. Holding the dominant channel at
// full keeps a warm star reading orange-to-red and a hot one blue-to-white,
// with the noise varying saturation rather than muddying hue.
//
// Warmth falls monotonically F > G > K > M by design. An earlier pass had G
// rendering redder than K and barely less red than M, because G kept the
// article's raw (1, 0.4, 0) while K and M were picked independently.
//
// `gain` is per class rather than one shared constant because the tone
// mapping compresses hard above ~1.0: a pale palette multiplied by the warm
// classes' 1.6 lands wholly inside that compressed region, where granulation
// flattens to featureless white -- which is what made A-class stars a blank
// disc. Paler classes therefore use a lower gain; they already sit near white
// and need no lifting to read as bright.
type StarPalette = { mid: THREE.Color; deep: THREE.Color; gain: number }

const palette = (
	mid: [number, number, number],
	deep: [number, number, number],
	gain: number,
): StarPalette => ({
	mid: new THREE.Color(...mid),
	deep: new THREE.Color(...deep),
	gain,
})

const STAR_PALETTE_BY_CLASS: Partial<Record<SpectralClass, StarPalette>> = {
	O: palette([0.18, 0.42, 1.0], [0.0, 0.1, 1.0], 1.15),
	B: palette([0.3, 0.5, 1.0], [0.04, 0.2, 1.0], 1.15),
	// The one entry that does not pin a channel at 1.0: an A-class star is
	// near-white, so it has no dominant channel to hold, and its noise reads
	// as luminance rather than hue.
	A: palette([0.4, 0.48, 0.92], [0.11, 0.22, 0.68], 1.2),
	F: palette([1.0, 0.72, 0.34], [1.0, 0.4, 0.06], 1.4),
	G: palette([1.0, 0.56, 0.14], [1.0, 0.2, 0.0], 1.6),
	K: palette([1.0, 0.34, 0.03], [1.0, 0.06, 0.0], 1.6),
	M: palette([1.0, 0.2, 0.0], [1.0, 0.0, 0.0], 1.6),
}

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
const GLOW_STRENGTH = 0.55

export type StarSurfaceLayersInput = {
	/** Selects the photosphere palette -- see STAR_PALETTE_BY_CLASS. */
	spectralClass: SpectralClass
	/** The star's overall spectral colour, used for the corona halo only. */
	tint: THREE.Color
	/** The star's true diameter in Sol diameters, used only to scale
	 * granulation frequency -- see BASE_NOISE_SCALE. */
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
`

/**
 * A star's photosphere, after Sangil Lee's "Create a realistic sun with
 * shaders". Two of that article's three layers are used:
 *
 * - `surface` is domain-warped fBm (an fBm whose sample point is itself
 *   offset by three more fBms) sampled on the star's own sphere, which is
 *   what produces convection-cell mottling rather than plain cloud noise.
 * - `glow` is a corona shell whose intensity peaks along the view axis, so
 *   the part left visible outside the star's silhouette reads as a halo. It
 *   writes its shape into alpha as the article's shader is written for, then
 *   blends additively, which is safe because a BackSide shell only ever
 *   covers background rather than the star's own surface.
 *
 * The article's third layer, a fresnel rim shell, is deliberately not used.
 * Its outer term peaks exactly where the view direction grazes the surface
 * -- that is, precisely at the shell's own silhouette -- so the layer is
 * brightest at its geometric boundary and then stops dead, drawing a
 * hard-edged ring around the star instead of a rim that falls off. Its inner
 * term has the opposite problem: it peaks at the CENTRE of the disc, laying
 * a flat wash over the whole photosphere that competes with the granulation.
 *
 * The article's single fixed palette is replaced here by one per spectral
 * class (see STAR_PALETTE_BY_CLASS), and its fixed noise frequency by one
 * that tracks stellar size (see BASE_NOISE_SCALE), so class and scale both
 * read instead of every star rendering an identical disc. A G-class star
 * still lands on exactly the article's own colours.
 *
 * The corona is its own mesh because it needs its own geometry scale and
 * face orientation -- see STAR_GLOW_RADIUS_SCALE and the `side` setting
 * below.
 */
export function buildStarSurfaceLayers(
	input: StarSurfaceLayersInput,
): StarSurfaceLayers {
	const time = { value: 0 }
	const tint = input.tint.clone()
	const starPalette =
		STAR_PALETTE_BY_CLASS[input.spectralClass] ?? DEFAULT_STAR_PALETTE
	const { mid: midColor, deep: deepColor } = starPalette
	const noiseScale = Math.min(
		MAX_NOISE_SCALE,
		Math.max(
			MIN_NOISE_SCALE,
			BASE_NOISE_SCALE * Math.sqrt(Math.max(0.01, input.diameterSol)),
		),
	)

	const surface = new THREE.ShaderMaterial({
		uniforms: {
			time,
			hotColor: { value: new THREE.Color(0xffffff) },
			midColor: { value: midColor },
			deepColor: { value: deepColor },
			gain: { value: starPalette.gain },
			noiseScale: { value: noiseScale },
		},
		vertexShader: STAR_VERTEX_SHADER,
		fragmentShader: `
			uniform float time;
			uniform vec3 hotColor;
			uniform vec3 midColor;
			uniform vec3 deepColor;
			uniform float gain;
			uniform float noiseScale;
			varying vec3 vNormalView;
			varying vec3 vPosition;
			varying vec3 vObjectPosition;

			${STAR_NOISE_CHUNK}

			void main() {
				vec3 st = vObjectPosition;

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

	const glow = new THREE.ShaderMaterial({
		uniforms: {
			haloColor: { value: tint.clone() },
			strength: { value: GLOW_STRENGTH },
		},
		vertexShader: STAR_VERTEX_SHADER,
		fragmentShader: `
			uniform vec3 haloColor;
			uniform float strength;
			varying vec3 vNormalView;
			varying vec3 vPosition;
			void main() {
				// Positive only on back-facing geometry, peaking on the view axis
				// -- so on a BackSide shell this is brightest directly behind the
				// star and falls to nothing at the shell's own rim.
				float intensity = pow(max(dot(vPosition, vNormalView), 0.), 4.);
				gl_FragColor = vec4(haloColor, intensity * strength);
			}
		`,
		transparent: true,
		// Additive, unlike the rim shell below: a corona is emitted light, and
		// everything behind it here is starfield or empty space rather than
		// the star's own surface, so there is no granulation for it to wash
		// out -- only background for it to correctly glow over.
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		side: THREE.BackSide,
	})

	function setSpinHours(hours: number): void {
		time.value = hours * HOURS_TO_SHADER_TIME
	}

	return { surface, glow, setSpinHours }
}
