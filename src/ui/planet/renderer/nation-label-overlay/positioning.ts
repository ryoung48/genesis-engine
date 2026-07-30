import * as THREE from "three"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import {
	DEFAULT_LABEL_SCALE_CURVE,
	GLOBE_GROUP_WORLD_QUATERNION,
	GLOBE_LOCAL_CAMERA_QUATERNION,
	GlobeLabelLike,
	LABEL_GLOBE_FONT_GAP_FACTOR,
	LABEL_LEADER_HEIGHT_FACTOR,
	LABEL_LIFT_GLOBE,
	LABEL_LIFT_MAP,
	LABEL_MAP_FONT_GAP_FACTOR,
	LABEL_OFFSET_GLOBE_Y,
	LABEL_OFFSET_MAP_X,
	LABEL_OFFSET_MAP_Y,
	LabelScaleCurve,
	MAP_Z_ELEVATION_FACTOR,
	MIN_LABEL_SCALE,
	TERRAIN_ELEVATION_SCALE,
} from "@/ui/planet/renderer/nation-label-overlay"

export function labelPositionGlobe(
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
	elevationVisible = true,
) {
	const x = r_xyz[3 * region]
	const y = r_xyz[3 * region + 1]
	const z = r_xyz[3 * region + 2]
	const len = Math.sqrt(x * x + y * y + z * z) || 1
	const nx = x / len
	const ny = y / len
	const nz = z / len
	const elev = elevation[region]
	const adj = elevationVisible
		? elev > 0
			? elev * TERRAIN_ELEVATION_SCALE
			: elev * TERRAIN_ELEVATION_SCALE * 0.3
		: 0
	return {
		normal: new THREE.Vector3(nx, ny, nz),
		radius: 1 + adj + LABEL_LIFT_GLOBE,
	}
}

export function labelPositionMap(
	projection: ReturnType<typeof createMapProjection>,
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
	markerRadius: number,
	fontSize: number,
): [number, number, number] {
	const projected = projection.projectCartesian(
		r_xyz[3 * region],
		r_xyz[3 * region + 1],
		r_xyz[3 * region + 2],
	)
	const elev = elevation[region]
	const adj =
		elev > 0
			? elev * TERRAIN_ELEVATION_SCALE
			: elev * TERRAIN_ELEVATION_SCALE * 0.3
	const z = LABEL_LIFT_MAP + adj * MAP_Z_ELEVATION_FACTOR
	const [x, y] = projection.projectRadians(projected.lon, projected.lat, z)
	return [
		x + LABEL_OFFSET_MAP_X,
		y +
			markerRadius +
			fontSize * LABEL_MAP_FONT_GAP_FACTOR +
			LABEL_OFFSET_MAP_Y,
		z,
	]
}

export function orientGlobeLabel(
	label: GlobeLabelLike,
	cameraQuaternion: THREE.Quaternion,
) {
	label.quaternion.copy(cameraQuaternion)
}

// The leader line is a short radial stub (straight out from the surface, like
// the solar terminator's leader stubs). The label itself floats further out,
// nudged tangentially toward the on-screen "up" direction so it reads above
// its marker the same way map-view labels sit above their marker dot instead
// of overlapping it. Bigger/more important names get a taller tangential
// nudge (scaled by font size) so they sit further from their marker.
export function globeLabelStubLength(markerScale: number): number {
	return markerScale * 0.5 + LABEL_OFFSET_GLOBE_Y
}

export function globeLabelTangentOffset(fontSize: number): number {
	return (
		fontSize * LABEL_GLOBE_FONT_GAP_FACTOR +
		fontSize * LABEL_LEADER_HEIGHT_FACTOR
	)
}

// Labels are children of globeGroup, which carries its own rotation (axial
// tilt + day/night spin). Billboarding against camera.quaternion directly
// ignores that parent rotation and produces mis-oriented ("backwards")
// labels once the globe isn't at its identity orientation. Composing with
// the inverse of the group's world quaternion cancels the parent rotation
// so the label's resulting *world* orientation is a true camera billboard.
export function localCameraQuaternion(
	group: THREE.Object3D,
	camera: THREE.PerspectiveCamera,
): THREE.Quaternion {
	group.getWorldQuaternion(GLOBE_GROUP_WORLD_QUATERNION)
	return GLOBE_LOCAL_CAMERA_QUATERNION.copy(GLOBE_GROUP_WORLD_QUATERNION)
		.invert()
		.multiply(camera.quaternion)
}

export function computeLabelScale(
	componentSize: number,
	name: string,
	curve: LabelScaleCurve = DEFAULT_LABEL_SCALE_CURVE,
): number {
	const areaScale = 0.1 + Math.pow(componentSize, curve.exponent) * curve.factor
	const lengthPenalty = Math.max(0.7, 1 - Math.max(0, name.length - 12) * 0.02)
	return THREE.MathUtils.clamp(
		areaScale * lengthPenalty,
		MIN_LABEL_SCALE,
		curve.maxScale,
	)
}

export function updateLabelLeaderLine(
	label: GlobeLabelLike,
	basePosition: THREE.Vector3,
): void {
	const leader = label.userData.leaderLine as THREE.Line | undefined
	if (!leader) return
	const positions = (leader.geometry as THREE.BufferGeometry).attributes
		.position as THREE.BufferAttribute
	positions.setXYZ(0, basePosition.x, basePosition.y, basePosition.z)
	positions.setXYZ(1, label.position.x, label.position.y, label.position.z)
	positions.needsUpdate = true
	leader.geometry.computeBoundingSphere()
}
