import * as THREE from "three"
import type { Text } from "troika-three-text"

export const TERRAIN_ELEVATION_SCALE = 0.04
export const LABEL_LIFT_GLOBE = 0.005
export const LABEL_LIFT_MAP = 0.008
export const MAP_Z_ELEVATION_FACTOR = 0.5

export const LABEL_OFFSET_GLOBE_Y = 0.003
export const LABEL_OFFSET_MAP_X = 0
export const LABEL_OFFSET_MAP_Y = 0.001
export const LABEL_MAP_FONT_GAP_FACTOR = 0.08
export const LABEL_GLOBE_FONT_GAP_FACTOR = 0.04

export const LABEL_FONT_SIZE_GLOBE = 0.0035
export const LABEL_FONT_SIZE_MAP = 0.0044
export const LABEL_OUTLINE_WIDTH = 0.2
export const LABEL_OUTLINE_COLOR = 0x0f172a
export const LABEL_TEXT_COLOR = "#f1f5f9"
export const LABEL_RENDER_ORDER = 1001

export const LABEL_LEADER_COLOR = 0xf8fafc
export const LABEL_LEADER_OPACITY = 0.55
export const LABEL_LEADER_RENDER_ORDER = 1000
export const LABEL_LEADER_HEIGHT_FACTOR = 1.8

export const MIN_LABEL_SCALE = 0.5
export const MAX_LABEL_SCALE = 4.5

export const GLOBE_BASE_POSITION = new THREE.Vector3()
export const GLOBE_CAMERA_LOCAL_POSITION = new THREE.Vector3()
export const GLOBE_TO_CAMERA = new THREE.Vector3()
export const GLOBE_GROUP_WORLD_QUATERNION = new THREE.Quaternion()
export const GLOBE_LOCAL_CAMERA_QUATERNION = new THREE.Quaternion()
export const GLOBE_CAMERA_UP = new THREE.Vector3()
export const GLOBE_PROJECTED_UP = new THREE.Vector3()
export const GLOBE_STUB_TIP = new THREE.Vector3()

// Labels are children of globeGroup, which carries its own rotation (axial
// tilt + day/night spin). Billboarding against camera.quaternion directly
// ignores that parent rotation and produces mis-oriented ("backwards")
// labels once the globe isn't at its identity orientation. Composing with
// the inverse of the group's world quaternion cancels the parent rotation
// so the label's resulting *world* orientation is a true camera billboard.

export interface LabelPool {
	items: Text[]
	leaders: THREE.Line[]
}

export interface NationLabelPools {
	globe: LabelPool
	map: LabelPool
}

export interface LabelScaleCurve {
	exponent: number
	factor: number
	maxScale: number
}

/** Default curve, tuned for the procedural generator's nation sizes. Earth
 * import passes a wider curve (see EARTH_HISTORY_LABEL_SCALE_CURVE below) --
 * real historical province-count distributions are far more skewed (Ming's
 * 113 provinces vs. a 1-province German principality in the same era) than
 * anything the procedural generator produces, so this curve's exponent/cap
 * compressed large real empires together almost indistinguishably (e.g.
 * Vijayanagara's 33 provinces and Ming's 113 both landing near/at the same
 * clamped scale). */
export const DEFAULT_LABEL_SCALE_CURVE: LabelScaleCurve = {
	exponent: 0.55,
	factor: 0.5,
	maxScale: MAX_LABEL_SCALE,
}

/** Lower exponent/factor spread mid-size nations out more before the curve
 * flattens, and a higher cap keeps only genuinely massive empires (a few
 * hundred+ provinces, e.g. the British Empire by 1900) pinned at the max
 * instead of every empire past ~50 provinces looking the same size. */
export const EARTH_HISTORY_LABEL_SCALE_CURVE: LabelScaleCurve = {
	exponent: 0.6,
	factor: 0.32,
	maxScale: 6,
}
export type GlobeLabelLike = THREE.Object3D & {
	visible: boolean
	userData: Record<string, unknown>
}
