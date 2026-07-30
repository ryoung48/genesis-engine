import * as THREE from "three"
import type { WindArrowData } from "@/model/climate/wind/types"
import {
	ARROW_HEAD_DEG,
	ARROW_HEAD_SPREAD,
	ARROW_SHAFT_DEG,
	createLineSegments,
	DEG2RAD,
	MAP_X_SCALE,
} from "@/ui/planet/renderer/overlay-builders/shared"
import type { GenesisViewMode } from "@/ui/planet/renderer/types"

// sine of the arrowhead half-angle (~30°)

/** Build wind arrows on the globe surface. Each arrow is shaft + V-head as line segments. */
export function buildGlobeWindArrows(
	data: WindArrowData,
	viewMode: GenesisViewMode,
	elevationVisible: boolean,
): THREE.LineSegments | null {
	const radius = elevationVisible ? 1.06 : 1.02
	const shaftRad = ARROW_SHAFT_DEG * DEG2RAD
	const headRad = ARROW_HEAD_DEG * DEG2RAD

	const positions: number[] = []
	const n = data.lat.length

	for (let i = 0; i < n; i++) {
		const latRad = data.lat[i] * DEG2RAD
		const lonRad = data.lon[i] * DEG2RAD
		const u = data.u[i] // east component
		const v = data.v[i] // north component

		const cosLat = Math.cos(latRad)
		const sinLat = Math.sin(latRad)
		const cosLon = Math.cos(lonRad)
		const sinLon = Math.sin(lonRad)

		// Region center on sphere
		const px = radius * cosLat * cosLon
		const py = radius * cosLat * sinLon
		const pz = radius * sinLat

		// East tangent: d(pos)/d(lon), normalized
		const ex = -sinLon
		const ey = cosLon
		// ez = 0

		// North tangent: d(pos)/d(lat), normalized
		const nx = -sinLat * cosLon
		const ny = -sinLat * sinLon
		const nz = cosLat

		// Wind direction vector in 3D
		const wx = u * ex + v * nx
		const wy = u * ey + v * ny
		const wz = v * nz
		const wmag = Math.hypot(wx, wy, wz)
		if (wmag < 1e-9) continue
		const wdx = wx / wmag
		const wdy = wy / wmag
		const wdz = wz / wmag

		// Arrow tip
		const tx = px + wdx * shaftRad
		const ty = py + wdy * shaftRad
		const tz = pz + wdz * shaftRad

		// Perpendicular in the sphere's tangent plane (outward Ã— wind)
		const ox = px / radius
		const oy = py / radius
		const oz = pz / radius
		const perpx = oy * wdz - oz * wdy
		const perpy = oz * wdx - ox * wdz
		const perpz = ox * wdy - oy * wdx
		const pmag = Math.hypot(perpx, perpy, perpz)
		if (pmag < 1e-9) continue
		const pdx = perpx / pmag
		const pdy = perpy / pmag
		const pdz = perpz / pmag

		// Shaft
		positions.push(px, py, pz, tx, ty, tz)

		// Arrowhead base (back from tip by headRad)
		const hbx = tx - wdx * headRad
		const hby = ty - wdy * headRad
		const hbz = tz - wdz * headRad
		const spread = headRad * ARROW_HEAD_SPREAD

		// Left wing
		positions.push(
			tx,
			ty,
			tz,
			hbx + pdx * spread,
			hby + pdy * spread,
			hbz + pdz * spread,
		)
		// Right wing
		positions.push(
			tx,
			ty,
			tz,
			hbx - pdx * spread,
			hby - pdy * spread,
			hbz - pdz * spread,
		)
	}

	return createLineSegments(positions, 0xffffff, 0.75, viewMode === "globe")
}

/** Build wind arrows on the flat map. Uses equirectangular lat/lon coordinates. */
export function buildMapWindArrows(
	data: WindArrowData,
	viewMode: GenesisViewMode,
): THREE.LineSegments | null {
	const shaftRad = ARROW_SHAFT_DEG * DEG2RAD
	const headRad = ARROW_HEAD_DEG * DEG2RAD

	const positions: number[] = []
	const n = data.lat.length
	const z = 0.003

	for (let i = 0; i < n; i++) {
		const latRad = data.lat[i] * DEG2RAD
		const lonRad = data.lon[i] * DEG2RAD
		const u = data.u[i]
		const v = data.v[i]

		const cosLat = Math.cos(latRad)
		if (Math.abs(cosLat) < 0.05) continue // skip within ~3° of poles

		// Map coords of the arrow tail
		const mx = lonRad * MAP_X_SCALE
		const my = latRad * MAP_X_SCALE

		// Arrow tip: account for longitude convergence so apparent length is uniform
		const tx = (lonRad + (u * shaftRad) / cosLat) * MAP_X_SCALE
		const ty = (latRad + v * shaftRad) * MAP_X_SCALE

		// Shaft direction in map space
		const dx = tx - mx
		const dy = ty - my
		const dmag = Math.hypot(dx, dy)
		if (dmag < 1e-9) continue
		const ndx = dx / dmag
		const ndy = dy / dmag
		const perpx = -ndy
		const perpy = ndx

		// Shaft
		positions.push(mx, my, z, tx, ty, z)

		// Arrowhead base
		const headMapLen = headRad * MAP_X_SCALE
		const hbx = tx - ndx * headMapLen
		const hby = ty - ndy * headMapLen
		const spread = headMapLen * ARROW_HEAD_SPREAD

		positions.push(tx, ty, z, hbx + perpx * spread, hby + perpy * spread, z)
		positions.push(tx, ty, z, hbx - perpx * spread, hby - perpy * spread, z)
	}

	return createLineSegments(positions, 0xffffff, 0.75, viewMode === "map")
}
