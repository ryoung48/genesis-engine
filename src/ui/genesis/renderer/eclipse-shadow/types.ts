import type * as THREE from "three"

// World-space shadow casters for one receiving surface, refreshed each frame.
export interface EclipseShadowState {
	starPosition: THREE.Vector3
	// xyz = sphere centre, w = radius, all in world units.
	spheres: THREE.Vector4[]
	sphereCount: number
	ringCenter: THREE.Vector3
	ringNormal: THREE.Vector3
	// x = inner radius, y = outer radius (world units); both 0 for no ring.
	ringRadii: THREE.Vector2
	ringOpacity: number
}

export interface BindEclipseUniformsInput {
	shader: THREE.WebGLProgramParametersWithUniforms
	state: EclipseShadowState
}

// A ring as a shadow caster, in world units.
export interface EclipseRing {
	center: THREE.Vector3
	normal: THREE.Vector3
	innerRadius: number
	outerRadius: number
	opacity: number
}

// The star, parent-planet sphere and parent ring (null for a ringless
// planet) a moon system's eclipses are traced against, in world units.
export interface UpdateMoonEclipsesInput {
	starPosition: THREE.Vector3
	parentSphere: THREE.Vector4
	parentRing: EclipseRing | null
}

export interface AttachEclipseShadowInput {
	material: THREE.Material
	state: EclipseShadowState
}

export interface SetEclipseSpheresInput {
	state: EclipseShadowState
	spheres: THREE.Vector4[]
}

export interface SetEclipseRingInput extends EclipseRing {
	state: EclipseShadowState
}
