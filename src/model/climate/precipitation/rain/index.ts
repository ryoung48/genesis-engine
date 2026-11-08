import type { ClimateGeometry } from "@/model/climate/precipitation/rain/types"
import type { SphereMesh } from "@/model/mesh/types"
import { MATH } from "@/model/shared/math/core"

const climateGeometryCache = new WeakMap<SphereMesh, ClimateGeometry>()

function getClimateGeometry(mesh: SphereMesh): ClimateGeometry {
	const cached = climateGeometryCache.get(mesh)
	if (cached) return cached

	const geometry = MATH.getRegionLatLonDegrees(mesh)
	climateGeometryCache.set(mesh, geometry)
	return geometry
}

export const RAIN = {
	getClimateGeometry,
}
