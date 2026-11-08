export const SURFACE_LIGHTING_GLSL = `
	uniform vec3 uAmbient;
	uniform vec3 uSunDirection;
	uniform vec3 uSunLight;

	float sunlightAt(vec3 normal) {
		return max(dot(normalize(normal), normalize(uSunDirection)), 0.0);
	}

	vec3 surfaceLight(float daylight) {
		return uAmbient + uSunLight * daylight;
	}
`
