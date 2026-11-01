import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export function supportsOceanClimate(
	world: SerializedGenesisWorld | null,
): boolean {
	return (
		world !== null &&
		world.params?.climateModel !== "v1" &&
		world.params?.tideLock?.type !== "solar"
	)
}
