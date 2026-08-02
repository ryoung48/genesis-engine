import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

function getProvinceAreaKm2(
	world: SerializedGenesisWorld,
	province: number,
): number {
	const explicitAreaKm2 = world.provinces?.areaKm2?.[province]
	if (Number.isFinite(explicitAreaKm2) && explicitAreaKm2 > 0) {
		return explicitAreaKm2
	}
	const radiusKm = world.params?.planetRadiusKm ?? 6371
	const cellAreaKm2 =
		(4 * Math.PI * radiusKm * radiusKm) / world.mesh.numRegions
	return (world.provinces?.size?.[province] ?? 0) * cellAreaKm2
}

export function getProvincePopulationDensity(
	world: SerializedGenesisWorld,
	province: number,
	population: number,
): number {
	const areaKm2 = getProvinceAreaKm2(world, province)
	return areaKm2 > 0 ? population / areaKm2 : 0
}
