import * as THREE from "three"
import type {
	AttachEclipseShadowInput,
	BindEclipseUniformsInput,
	EclipseShadowState,
	SetEclipseRingInput,
	SetEclipseSpheresInput,
} from "@/ui/genesis/renderer/eclipse-shadow/types"

// Analytic eclipse shadows: each receiving surface traces from the shaded
// point toward its star and dims direct light where a known sphere (a moon or
// its planet) or its planet's ring is in the way. A shadow map can't resolve
// these bodies -- the system view spans 100 units with bodies ~0.01 across.
const MAX_ECLIPSE_SPHERES = 8
// The drawn star is far larger than real against the orbits, so a penumbra
// from its drawn size would smear every shadow into a faint blob. The edge
// is instead 8% of the caster's own apparent radius either side: a nearby
// caster's shadow (a planet's on its rings, a moon's on its planet) is close
// to sharp, and a wider rim left most of a ring shadow half-lit.
const ECLIPSE_PENUMBRA_FRACTION = 0.08
// A planet's shadow blacks its ring out fully, as in Cassini's views of
// Saturn's night side: the ring is lit only by sunlight.
const RING_SHADOW_FLOOR = 0
// A ring blocks more sunlight than its drawn opacity suggests (light crosses
// it at a slant, through more material), so its shadow on the planet uses
// 1.7x the ring's opacity, capped at fully dark: Saturn's 0.52 casts 88%.
const RING_SHADOW_STRENGTH = 1.7

const SHADOW_DECLARATIONS = /* glsl */ `
	uniform vec3 uEclipseStar;
	uniform vec4 uEclipseSpheres[${MAX_ECLIPSE_SPHERES}];
	uniform int uEclipseSphereCount;
	uniform vec3 uEclipseRingCenter;
	uniform vec3 uEclipseRingNormal;
	uniform vec2 uEclipseRingRadii;
	uniform float uEclipseRingOpacity;
	varying vec3 vEclipseWorld;

	float eclipseLight(vec3 point) {
		vec3 toStar = uEclipseStar - point;
		float starDistance = length(toStar);
		vec3 direction = toStar / max(starDistance, 1e-9);
		float light = 1.0;
		for (int i = 0; i < ${MAX_ECLIPSE_SPHERES}; i++) {
			if (i >= uEclipseSphereCount) break;
			vec3 toCaster = uEclipseSpheres[i].xyz - point;
			float along = dot(toCaster, direction);
			if (along <= 0.0 || along >= starDistance) continue;
			float apparent = uEclipseSpheres[i].w / along;
			float separation = length(toCaster - direction * along) / along;
			light *= smoothstep(
				apparent * ${(1 - ECLIPSE_PENUMBRA_FRACTION).toFixed(2)},
				apparent * ${(1 + ECLIPSE_PENUMBRA_FRACTION).toFixed(2)},
				separation
			);
		}
		if (uEclipseRingRadii.y > 0.0) {
			float facing = dot(direction, uEclipseRingNormal);
			if (abs(facing) > 1e-6) {
				float along = dot(uEclipseRingCenter - point, uEclipseRingNormal) / facing;
				if (along > 0.0 && along < starDistance) {
					float radius = length(point + direction * along - uEclipseRingCenter);
					float inRing =
						smoothstep(uEclipseRingRadii.x * 0.98, uEclipseRingRadii.x * 1.02, radius) *
						(1.0 - smoothstep(uEclipseRingRadii.y * 0.98, uEclipseRingRadii.y * 1.02, radius));
					light *= 1.0 - inRing * min(1.0, uEclipseRingOpacity * ${RING_SHADOW_STRENGTH.toFixed(2)});
				}
			}
		}
		return light;
	}
`

function createEclipseShadowState(): EclipseShadowState {
	return {
		starPosition: new THREE.Vector3(),
		spheres: Array.from(
			{ length: MAX_ECLIPSE_SPHERES },
			() => new THREE.Vector4(),
		),
		sphereCount: 0,
		ringCenter: new THREE.Vector3(),
		ringNormal: new THREE.Vector3(0, 0, 1),
		ringRadii: new THREE.Vector2(0, 0),
		ringOpacity: 0,
	}
}

function bindUniforms({ shader, state }: BindEclipseUniformsInput): void {
	shader.uniforms.uEclipseStar = { value: state.starPosition }
	shader.uniforms.uEclipseSpheres = { value: state.spheres }
	shader.uniforms.uEclipseSphereCount = {
		get value() {
			return state.sphereCount
		},
	}
	shader.uniforms.uEclipseRingCenter = { value: state.ringCenter }
	shader.uniforms.uEclipseRingNormal = { value: state.ringNormal }
	shader.uniforms.uEclipseRingRadii = { value: state.ringRadii }
	shader.uniforms.uEclipseRingOpacity = {
		get value() {
			return state.ringOpacity
		},
	}
	shader.vertexShader = shader.vertexShader
		.replace("void main() {", "varying vec3 vEclipseWorld;\nvoid main() {")
		.replace(
			"#include <project_vertex>",
			"#include <project_vertex>\n\tvEclipseWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
		)
	shader.fragmentShader = shader.fragmentShader.replace(
		"void main() {",
		`${SHADOW_DECLARATIONS}\nvoid main() {`,
	)
}

// For a lit (MeshStandard) surface: scales only direct light, so the night
// side, ambient fill and emissive glow are untouched.
function attachToLitSurface({
	material,
	state,
}: AttachEclipseShadowInput): void {
	// Read before wrapping: three's default key is the hook's own source, so
	// reading it afterwards would give every wrapped material the same key
	// and let differently-shaded materials share one compiled program.
	const baseKey = material.customProgramCacheKey()
	const beforeCompile = material.onBeforeCompile
	material.onBeforeCompile = (shader, renderer) => {
		beforeCompile.call(material, shader, renderer)
		bindUniforms({ shader, state })
		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <lights_fragment_end>",
			`#include <lights_fragment_end>
	float eclipse = eclipseLight(vEclipseWorld);
	reflectedLight.directDiffuse *= eclipse;
	reflectedLight.directSpecular *= eclipse;`,
		)
	}
	material.customProgramCacheKey = () => `${baseKey}|eclipse-lit`
	material.needsUpdate = true
}

// For an unlit (MeshBasic) ring: darkens its colour where its planet blocks
// the star.
function attachToUnlitRing({
	material,
	state,
}: AttachEclipseShadowInput): void {
	const baseKey = material.customProgramCacheKey()
	const beforeCompile = material.onBeforeCompile
	material.onBeforeCompile = (shader, renderer) => {
		beforeCompile.call(material, shader, renderer)
		bindUniforms({ shader, state })
		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <color_fragment>",
			`#include <color_fragment>
	diffuseColor.rgb *= mix(${RING_SHADOW_FLOOR.toFixed(2)}, 1.0, eclipseLight(vEclipseWorld));`,
		)
	}
	material.customProgramCacheKey = () => `${baseKey}|eclipse-ring`
	material.needsUpdate = true
}

function setEclipseSpheres({ state, spheres }: SetEclipseSpheresInput): void {
	state.sphereCount = Math.min(spheres.length, MAX_ECLIPSE_SPHERES)
	for (let i = 0; i < state.sphereCount; i++)
		state.spheres[i]!.copy(spheres[i]!)
}

function setEclipseRing({
	state,
	center,
	normal,
	innerRadius,
	outerRadius,
	opacity,
}: SetEclipseRingInput): void {
	state.ringCenter.copy(center)
	state.ringNormal.copy(normal).normalize()
	state.ringRadii.set(innerRadius, outerRadius)
	state.ringOpacity = opacity
}

function clearEclipseRing(state: EclipseShadowState): void {
	state.ringRadii.set(0, 0)
}

export const ECLIPSE_SHADOW = {
	createState: createEclipseShadowState,
	attachToLitSurface,
	attachToUnlitRing,
	setSpheres: setEclipseSpheres,
	setRing: setEclipseRing,
	clearRing: clearEclipseRing,
}
