import type * as THREE from "three"
import type { Text } from "troika-three-text"
import type { HeraldryShape } from "@/ui/heraldry/shield/types"

export interface HeraldryOverlayUpdate {
	groups: (THREE.Group | null)[]
	names: readonly string[]
	colors: Float32Array | null
	shape: HeraldryShape
	showHeraldry: boolean
	showNames: boolean
	showScript: boolean
}

export interface HeraldryAttachment {
	label: Text
	mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
}

export interface NationHueParams {
	colors: Float32Array | null
	index: number
}

export interface TextureParams {
	name: string
	hue: number | null
	shape: HeraldryShape
}
