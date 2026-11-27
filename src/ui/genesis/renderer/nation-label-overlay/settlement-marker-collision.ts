import * as THREE from "three"
import { CAPITAL_SCALE_MULTIPLIER } from "@/ui/genesis/renderer/settlement-overlay"
import type {
	SettlementLabelCullingParams,
	SettlementMarkerCullingParams,
} from "@/ui/genesis/renderer/types"

const FIXED_PX_RADIUS = 0.75
const SCREEN_SCALE_RESPONSIVENESS = 0.5
const REFERENCE_GLOBE_DISTANCE = 3
const REFERENCE_GLOBE_FOV_DEG = 50
const LABEL_PADDING_PX = 14
const projected = new THREE.Vector3()
const worldPosition = new THREE.Vector3()
const cameraPosition = new THREE.Vector3()

interface MarkerCandidate {
	object: THREE.Object3D
	isCapital: boolean
	priority: number
	x: number
	y: number
	halfSize: number
}

export function createSettlementFrustum(camera: THREE.Camera): THREE.Frustum {
	camera.updateWorldMatrix(true, false)
	return new THREE.Frustum().setFromProjectionMatrix(
		new THREE.Matrix4().multiplyMatrices(
			camera.projectionMatrix,
			camera.matrixWorldInverse,
		),
	)
}

function markerKey(object: THREE.Object3D): string | undefined {
	const id: string | undefined = object.userData.settlementId
	if (id !== undefined)
		return `${id}:${object.userData.settlementWrapOffset ?? 0}`
}

export function applySettlementMarkerCollisionCulling({
	group,
	viewport: { camera, width, height, frustum },
	visibility,
}: SettlementMarkerCullingParams): void {
	if (!group?.visible || width <= 0 || height <= 0) return
	group.updateWorldMatrix(true, false)
	cameraPosition.setFromMatrixPosition(camera.matrixWorld)
	const isMap = camera instanceof THREE.OrthographicCamera
	const reference = isMap
		? height / (camera.top - camera.bottom)
		: height /
			(2 *
				REFERENCE_GLOBE_DISTANCE *
				Math.tan(THREE.MathUtils.degToRad(REFERENCE_GLOBE_FOV_DEG) / 2))
	const perspectiveFactor = isMap
		? 0
		: height /
			(2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.zoom)
	const candidates: MarkerCandidate[] = []
	for (const marker of group.children) {
		marker.visible = true
		const isCapital = Boolean(marker.userData.isCapital)
		const radius = FIXED_PX_RADIUS * (isCapital ? CAPITAL_SCALE_MULTIPLIER : 1)
		worldPosition.copy(marker.position).applyMatrix4(group.matrixWorld)
		const actual = isMap
			? reference * camera.zoom
			: perspectiveFactor / worldPosition.distanceTo(cameraPosition)
		const worldRadius =
			radius / (reference * (actual / reference) ** SCREEN_SCALE_RESPONSIVENESS)
		const sprite = marker instanceof THREE.Sprite
		const baseRadius = marker.userData.baseRadius ?? 1
		marker.scale.setScalar(sprite ? worldRadius * 2 : worldRadius / baseRadius)
		marker.updateWorldMatrix(false, false)
		if (
			sprite
				? !frustum.intersectsSprite(marker)
				: !frustum.intersectsObject(marker)
		)
			continue

		projected.copy(worldPosition).project(camera)
		candidates.push({
			object: marker,
			isCapital,
			priority: marker.userData.settlementPop ?? 0,
			x: (projected.x * 0.5 + 0.5) * width,
			y: (0.5 - projected.y * 0.5) * height,
			halfSize: radius + LABEL_PADDING_PX,
		})
	}

	candidates.sort(
		(a, b) =>
			Number(b.isCapital) - Number(a.isCapital) || b.priority - a.priority,
	)
	const placed: MarkerCandidate[] = []
	for (const candidate of candidates) {
		const visible = !placed.some((other) => {
			const dx = candidate.x - other.x
			const dy = candidate.y - other.y
			return dx * dx + dy * dy < (candidate.halfSize + other.halfSize) ** 2
		})
		candidate.object.visible = visible
		const key = markerKey(candidate.object)
		if (key !== undefined) visibility.set(key, visible)
		if (visible) placed.push(candidate)
	}
}

export function applySettlementLabelCulling({
	group,
	isGlobe,
	visibility,
}: SettlementLabelCullingParams): void {
	if (!group?.visible) return
	for (const label of group.children) {
		const key = markerKey(label)
		if (key === undefined) continue
		label.visible =
			(!isGlobe || label.userData.globeLabelFacingCamera !== false) &&
			visibility.get(key) !== false
	}
}
