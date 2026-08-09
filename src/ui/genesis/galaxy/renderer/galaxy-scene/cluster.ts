import type * as THREE from "three"

export interface ClusterData {
	/** Per-point [cx,cy] system center in world space, length 2*totalPoints. */
	baseCenters: Float32Array
	/** Per-point angle (rad) around its system center -- 0 for single-star
	 * systems. */
	clusterAngles: Float32Array
	/** Per-point 0 (single-star system) or 1 (part of a multi-star system). */
	clusterFactors: Float32Array
	totalPoints: number
}

const CLUSTER_SCREEN_PX = 4
const COLLAPSE_ZOOM = 4.5

/** Keeps multi-star systems' points at a constant screen-space separation
 * regardless of zoom, collapsing them onto their system center below
 * COLLAPSE_ZOOM so a dense galaxy view doesn't show overlapping/jittering
 * dots. Ported from galaxy-gen's renderer/geometry/points.ts
 * updateClusterPositions, generalized to this camera's own frustum height
 * instead of a fixed HALF_H constant. */
export function updateClusterPositions({
	geometry,
	clusterData,
	camera,
	canvasHeightPx,
}: {
	geometry: THREE.BufferGeometry
	clusterData: ClusterData
	camera: THREE.OrthographicCamera
	canvasHeightPx: number
}): void {
	const frustumHeight = camera.top - camera.bottom
	const worldPerPx = frustumHeight / (camera.zoom * Math.max(1, canvasHeightPx))
	const clusterWorld = CLUSTER_SCREEN_PX * worldPerPx
	const t = Math.min(
		1,
		Math.max(0, (camera.zoom - COLLAPSE_ZOOM * 0.5) / (COLLAPSE_ZOOM * 0.5)),
	)

	const pos = geometry.attributes.position!.array as Float32Array
	const { baseCenters, clusterAngles, clusterFactors, totalPoints } =
		clusterData
	for (let p = 0; p < totalPoints; p++) {
		const f = clusterFactors[p]! * t
		pos[3 * p] =
			baseCenters[2 * p]! + f * clusterWorld * Math.cos(clusterAngles[p]!)
		pos[3 * p + 1] =
			baseCenters[2 * p + 1]! + f * clusterWorld * Math.sin(clusterAngles[p]!)
	}
	geometry.attributes.position!.needsUpdate = true
}
