import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { Galaxy } from "@/model/celestial/galaxy/types"
import {
	computeGalaxyDensityScale,
	DENSE_GALAXY_SYSTEM_COUNT,
} from "@/ui/genesis/galaxy/renderer/galaxy-scene/density-scale"

// Matches galaxy-gen's renderer/geometry/lanes.ts buildLanesGeometry exactly.
const LANE_COLOR = 0xffffff
const LANE_OPACITY = 0.12
const LANE_WIDTH_PX = 1
const DENSE_LANE_MIN_WIDTH_PX = 1.5

/** One LineSegments2 for every hyperlane pair in Galaxy.lanes -- real
 * screen-space linewidth (via LineMaterial) rather than THREE.LineBasicMaterial's
 * linewidth, which most WebGL drivers ignore and always render at 1px, so
 * density-based thickness scaling (see density-scale.ts) would otherwise be
 * invisible. */
export function buildGalaxyLanes(
	galaxy: Galaxy,
	resolution: readonly [number, number],
): LineSegments2 {
	const { laneCount, lanes, r_xy, numSystems } = galaxy
	const positions = new Float32Array(laneCount * 2 * 3)

	for (let i = 0; i < laneCount; i++) {
		const a = lanes[2 * i]!
		const b = lanes[2 * i + 1]!
		positions[6 * i] = r_xy[2 * a]!
		positions[6 * i + 1] = r_xy[2 * a + 1]!
		positions[6 * i + 2] = 0
		positions[6 * i + 3] = r_xy[2 * b]!
		positions[6 * i + 4] = r_xy[2 * b + 1]!
		positions[6 * i + 5] = 0
	}

	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(positions)
	const densityScaledLaneWidth =
		LANE_WIDTH_PX * computeGalaxyDensityScale(numSystems)
	const laneWidth =
		numSystems > DENSE_GALAXY_SYSTEM_COUNT
			? Math.max(DENSE_LANE_MIN_WIDTH_PX, densityScaledLaneWidth)
			: densityScaledLaneWidth

	const material = new LineMaterial({
		color: LANE_COLOR,
		transparent: true,
		opacity: LANE_OPACITY,
		linewidth: laneWidth,
		resolution: new THREE.Vector2(resolution[0], resolution[1]),
	})

	return new LineSegments2(geometry, material)
}
