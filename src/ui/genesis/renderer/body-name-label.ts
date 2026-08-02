import * as THREE from "three"
import { Text } from "troika-three-text"
import jedarFontUrl from "@/ui/assets/fonts/Jedar.otf"

// Body/moon/star name labels — a leader-line-to-a-billboarded-label idea
// similar in spirit to the globe's solar-terminator/nation-label overlays.
// Rather than a fixed local axis (which read as "sideways" for bodies with
// extreme axial tilt, or for moons nested inside their parent's tilted
// orbit-plane group), the leader always points toward the camera's own
// on-screen "up" — recomputed every frame in updateLabelPlacement — so a
// label reads as sticking out of the top of the body from the viewer's
// perspective, not the body's own (possibly tilted) one.
const LABEL_FONT_SIZE_FACTOR = 0.4
const MIN_LABEL_FONT_SIZE = 0.012
const MAX_LABEL_FONT_SIZE = 0.05
const LABEL_TEXT_COLOR = "#0f172a"
const LABEL_RENDER_ORDER = 1001
const LABEL_LEADER_COLOR = 0xf8fafc
const LABEL_LEADER_OPACITY = 0.55
const LABEL_LEADER_RENDER_ORDER = 1000
// Leader stub extends this many extra body-radii above the surface; the
// label then floats a further fixed gap past the stub tip.
const LABEL_LEADER_STUB_FACTOR = 0.8
const LABEL_GAP = 0.03

// White card/chip behind each label — like a map-pin tooltip — so text
// reads clearly against the star field regardless of what's behind it,
// instead of relying on an outline.
const LABEL_BG_COLOR = 0xffffff
const LABEL_BG_OPACITY = 0.85
const LABEL_BG_PADDING_X = 0.35 // in units of fontSize, each side
const LABEL_BG_PADDING_Y = 0.3
const LABEL_BG_RENDER_ORDER = 1000

function createLabelBackground(): THREE.Mesh {
	const geometry = new THREE.PlaneGeometry(1, 1)
	const material = new THREE.MeshBasicMaterial({
		color: LABEL_BG_COLOR,
		transparent: true,
		opacity: LABEL_BG_OPACITY,
		depthWrite: false,
		side: THREE.DoubleSide,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.renderOrder = LABEL_BG_RENDER_ORDER
	// troika's glyph layout (and thus the real card size fitLabelBackground
	// computes) only resolves asynchronously via label.sync()'s callback —
	// without this, the plane's default 1x1 scale renders as a huge white
	// square for a frame or more (dwarfing the body it's labeling) until
	// that callback fires and shrinks it down to the actual text size.
	mesh.scale.set(0, 0, 0)
	return mesh
}

// Sizes/positions the card from troika's actual computed glyph bounds (via
// its sync callback) rather than guessing from character count — `label` is
// re-synced by positionNameLabel below on every layout pass, so this fires
// again each time fontSize/text changes and keeps the card snug.
function fitLabelBackground(label: Text): void {
	const background = label.userData.labelBackground as THREE.Mesh | undefined
	if (!background) return
	label.sync(() => {
		const bounds = label.textRenderInfo?.blockBounds
		if (!bounds) return
		const [minX, minY, maxX, maxY] = bounds
		const padX = label.fontSize * LABEL_BG_PADDING_X
		const padY = label.fontSize * LABEL_BG_PADDING_Y
		const width = maxX - minX + padX * 2
		const height = maxY - minY + padY * 2
		background.scale.set(width, height, 1)
		background.position.set((minX + maxX) / 2, (minY + maxY) / 2, -0.0001)
	})
}

export function createNameLeaderLine(): THREE.Line {
	const geometry = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(),
		new THREE.Vector3(),
	])
	const material = new THREE.LineBasicMaterial({
		color: LABEL_LEADER_COLOR,
		transparent: true,
		opacity: LABEL_LEADER_OPACITY,
		depthWrite: false,
	})
	const line = new THREE.Line(geometry, material)
	line.renderOrder = LABEL_LEADER_RENDER_ORDER
	line.frustumCulled = false
	return line
}

export function createNameLabel(name: string): Text {
	const text = new Text()
	text.text = name
	text.font = jedarFontUrl
	text.fontWeight = 500
	text.color = LABEL_TEXT_COLOR
	text.anchorX = "center"
	text.anchorY = "bottom"
	text.textRenderingMode = "distanceField"
	text.renderOrder = LABEL_RENDER_ORDER
	text.frustumCulled = false
	const background = createLabelBackground()
	text.userData.labelBackground = background
	text.add(background)
	return text
}

// Sizes a label/background for its current local radius — called both at
// initial build and on every layout pass (sizes can change live, e.g.
// toggling "Realistic Sizes"). Position/orientation are handled separately,
// every frame, by updateLabelPlacement below.
export function sizeNameLabel(label: Text, localRadius: number): void {
	const fontSize = THREE.MathUtils.clamp(
		localRadius * LABEL_FONT_SIZE_FACTOR,
		MIN_LABEL_FONT_SIZE,
		MAX_LABEL_FONT_SIZE,
	)
	label.fontSize = fontSize
	fitLabelBackground(label)
}

/** A fixed identity — shared instead of re-allocating one per translate-only
 * anchor (a body's own bodyGroup, or the star/root group), which never
 * rotates and so needs no parent-rotation cancellation. */
export const IDENTITY_QUATERNION = new THREE.Quaternion()

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const scratchCameraWorldUp = new THREE.Vector3()
const scratchParentInverse = new THREE.Quaternion()
const scratchLocalUp = new THREE.Vector3()
const scratchBase = new THREE.Vector3()
const scratchTip = new THREE.Vector3()

// Re-billboards and repositions a label/leader every frame so the leader
// always points toward the camera's on-screen "up" — not a fixed local
// axis — regardless of the body's own axial tilt or (for moons) the
// rotation of whatever tilted group they're nested inside.
// `parentWorldQuaternion` is that parent's current world rotation (pass
// IDENTITY_QUATERNION for a translate-only anchor); it's used to cancel the
// parent's rotation so the label's actual world-space orientation/direction
// still ends up purely camera-relative.
export function updateLabelPlacement(
	label: Text,
	leader: THREE.Line,
	localRadius: number,
	parentWorldQuaternion: THREE.Quaternion,
	camera: THREE.Camera,
): void {
	scratchCameraWorldUp.copy(WORLD_UP).applyQuaternion(camera.quaternion)
	scratchParentInverse.copy(parentWorldQuaternion).invert()
	scratchLocalUp
		.copy(scratchCameraWorldUp)
		.applyQuaternion(scratchParentInverse)
		.normalize()

	const stubTip = localRadius * (1 + LABEL_LEADER_STUB_FACTOR)
	scratchBase.copy(scratchLocalUp).multiplyScalar(localRadius)
	scratchTip.copy(scratchLocalUp).multiplyScalar(stubTip)
	label.position.copy(scratchLocalUp).multiplyScalar(stubTip + LABEL_GAP)
	label.quaternion.copy(scratchParentInverse).multiply(camera.quaternion)

	const positions = (leader.geometry as THREE.BufferGeometry).attributes
		.position as THREE.BufferAttribute
	positions.setXYZ(0, scratchBase.x, scratchBase.y, scratchBase.z)
	positions.setXYZ(1, scratchTip.x, scratchTip.y, scratchTip.z)
	positions.needsUpdate = true
	leader.geometry.computeBoundingSphere()
}

export type { Text }
