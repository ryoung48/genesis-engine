import * as THREE from "three"
import {
	GLOBE_CAMERA_LOCAL_POSITION,
	GLOBE_CAMERA_UP,
	GLOBE_GROUP_WORLD_QUATERNION,
	GLOBE_PROJECTED_UP,
	GLOBE_STUB_TIP,
	GLOBE_TO_CAMERA,
	type GlobeLabelLike,
} from "@/ui/genesis/renderer/nation-label-overlay/constants"
import {
	localCameraQuaternion,
	orientGlobeLabel,
	updateLabelLeaderLine,
} from "@/ui/genesis/renderer/nation-label-overlay/positioning"

// The leader line is a short radial stub (straight out from the surface, like
// the solar terminator's leader stubs). The label itself floats further out,
// nudged tangentially toward the on-screen "up" direction so it reads above
// its marker the same way map-view labels sit above their marker dot instead
// of overlapping it. Bigger/more important names get a taller tangential
// nudge (scaled by font size) so they sit further from their marker.

export function updateGlobeLabelPosition(
	label: GlobeLabelLike,
	cameraUp: THREE.Vector3,
): void {
	const normal = label.userData.globeNormal as THREE.Vector3 | undefined
	const basePosition = label.userData.globeBasePosition as
		| THREE.Vector3
		| undefined
	const stubLength = label.userData.globeLeaderStubLength as number | undefined
	const tangentOffset = label.userData.globeLabelTangentOffset as
		| number
		| undefined
	if (!normal || !basePosition || stubLength == null || tangentOffset == null)
		return

	const stubTip = GLOBE_STUB_TIP.copy(basePosition).addScaledVector(
		normal,
		stubLength,
	)

	GLOBE_PROJECTED_UP.copy(cameraUp).addScaledVector(
		normal,
		-cameraUp.dot(normal),
	)
	if (GLOBE_PROJECTED_UP.lengthSq() < 1e-8) {
		label.position.copy(stubTip)
	} else {
		GLOBE_PROJECTED_UP.normalize()
		label.position
			.copy(stubTip)
			.addScaledVector(GLOBE_PROJECTED_UP, tangentOffset)
	}
	updateLabelLeaderLine(label, basePosition)
}

export function isGlobeLabelVisible(
	label: GlobeLabelLike,
	cameraPosition: THREE.Vector3,
): boolean {
	const normal = label.userData.globeNormal as THREE.Vector3 | undefined
	const basePosition = label.userData.globeBasePosition as
		| THREE.Vector3
		| undefined
	if (!normal || !basePosition) return false

	return GLOBE_TO_CAMERA.copy(cameraPosition).sub(basePosition).dot(normal) > 0
}

export function updateGlobeLabelOrientations(
	group: THREE.Group | null,
	camera: THREE.PerspectiveCamera,
	cullingEnabled = false,
) {
	if (!group) return
	camera.getWorldPosition(GLOBE_CAMERA_LOCAL_POSITION)
	group.worldToLocal(GLOBE_CAMERA_LOCAL_POSITION)
	group.getWorldQuaternion(GLOBE_GROUP_WORLD_QUATERNION)

	const lastCameraQuaternion = group.userData.globeCameraQuaternion as
		| THREE.Quaternion
		| undefined
	const lastGroupQuaternion = group.userData.globeGroupWorldQuaternion as
		| THREE.Quaternion
		| undefined
	const lastCameraPosition = group.userData.globeCameraPosition as
		| THREE.Vector3
		| undefined
	const rotationChanged =
		!lastCameraQuaternion ||
		lastCameraQuaternion.angleTo(camera.quaternion) > 1e-8 ||
		!lastGroupQuaternion ||
		lastGroupQuaternion.angleTo(GLOBE_GROUP_WORLD_QUATERNION) > 1e-8
	const positionChanged =
		!lastCameraPosition ||
		lastCameraPosition.distanceToSquared(GLOBE_CAMERA_LOCAL_POSITION) > 1e-12

	if (!rotationChanged && !positionChanged) return

	if (lastCameraQuaternion) {
		lastCameraQuaternion.copy(camera.quaternion)
	} else {
		group.userData.globeCameraQuaternion = camera.quaternion.clone()
	}
	if (lastGroupQuaternion) {
		lastGroupQuaternion.copy(GLOBE_GROUP_WORLD_QUATERNION)
	} else {
		group.userData.globeGroupWorldQuaternion =
			GLOBE_GROUP_WORLD_QUATERNION.clone()
	}
	if (lastCameraPosition) {
		lastCameraPosition.copy(GLOBE_CAMERA_LOCAL_POSITION)
	} else {
		group.userData.globeCameraPosition = GLOBE_CAMERA_LOCAL_POSITION.clone()
	}
	const localCamQuat = localCameraQuaternion(group, camera)
	GLOBE_CAMERA_UP.set(0, 1, 0).applyQuaternion(localCamQuat)
	for (const child of group.children) {
		if (child.type === "Line") continue
		const label = child as GlobeLabelLike
		const visible = cullingEnabled
			? isGlobeLabelVisible(label, GLOBE_CAMERA_LOCAL_POSITION)
			: true

		const leader = label.userData.leaderLine as THREE.Line | undefined
		if (leader) leader.visible = visible

		label.visible = visible
		if (!visible) continue

		updateGlobeLabelPosition(label, GLOBE_CAMERA_UP)
		orientGlobeLabel(label, localCamQuat)
	}
}
