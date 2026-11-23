import type * as THREE from "three"

export type GridPoint = { x: number; y: number }

export type GridLineParams = {
	latitude: number | null
	longitude: number | null
}

export type LabelParams = GridPoint & { text: string }

export type ProjectionParams = {
	point: THREE.Vector3
	copy: number
}
