import type * as THREE from "three"
import { computeClusterDensityScale } from "@/ui/genesis/galaxy/renderer/galaxy-scene/density-scale"

export interface ClusterData {
	/** Number of systems in the map, used to tighten dense-map companions. */
	numSystems: number
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
const COLLAPSE_ZOOM = 2
const COMPACT_CLUSTER_SEPARATION_RATIO = 0.3

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
	pointSizePx = CLUSTER_SCREEN_PX,
}: {
	geometry: THREE.BufferGeometry
	clusterData: ClusterData
	camera: THREE.OrthographicCamera
	canvasHeightPx: number
	/** [JUSTIFICATION] Callers that do not scale their point size can omit this
	 * value and retain the standard cluster spacing. The star points' own current on-screen pixel size (points.ts's uSize
	 * uniform), when a caller scales that with zoom (see
	 * PortedGalaxyView.tsx) -- separation needs to track it too, otherwise
	 * a fixed CLUSTER_SCREEN_PX stops being enough spacing once the dots
	 * themselves grow past it and start overlapping again. Defaults to
	 * CLUSTER_SCREEN_PX for a caller that keeps points.ts's point size
	 * fixed, matching this function's original behavior. */
	pointSizePx?: number
}): void {
	const frustumHeight = camera.top - camera.bottom
	const worldPerPx = frustumHeight / (camera.zoom * Math.max(1, canvasHeightPx))
	// Separation stays a compact fraction of point size after the zoom
	// transition. The density-scaled floor preserves visibility on dense maps
	// without letting companions drift far apart at close zoom.
	const separationPx = Math.max(
		CLUSTER_SCREEN_PX * computeClusterDensityScale(clusterData.numSystems),
		pointSizePx * COMPACT_CLUSTER_SEPARATION_RATIO,
	)
	const clusterWorld = separationPx * worldPerPx
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
