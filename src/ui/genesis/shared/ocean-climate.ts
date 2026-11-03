import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export function supportsOceanClimate(
	world: SerializedGenesisWorld | null,
): boolean {
	return (
		world !== null &&
		(world.params?.tideLock?.type === "solar" ||
			world.params?.climateModel !== "v1")
	)
}
