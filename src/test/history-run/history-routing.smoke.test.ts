import { expect, it, vi } from "vitest"
import { DISTRIBUTION_ENGINE } from "@/model/history/distribution/engine"
import { NATIONS } from "@/model/history/sim/nations"
import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

it("places distribution ownership once during generation without detailed political assembly", () => {
	const detailed = vi.spyOn(NATIONS, "computeNations")
	const placement = vi.spyOn(PLACEMENT, "placeCountries")
	try {
		const world = GENERATE_WORLD.generateGenesisWorld({
			params: {
				...DEFAULT_WORLD_PARAMS,
				seed: 42,
				numPoints: 2000,
				tideLock: null,
				historyPipeline: "distribution",
			},
		})
		expect(detailed).not.toHaveBeenCalled()
		expect(placement).toHaveBeenCalledTimes(1)
		expect(placement.mock.calls[0][0].policy.kind).toBe("distribution")
		const engine = DISTRIBUTION_ENGINE.create({
			world: world as unknown as SerializedGenesisWorld,
		})
		expect(placement).toHaveBeenCalledTimes(1)
		expect(engine.history.record.minTimeMs).toBe(0)
		expect(engine.history.record.titles).toBeNull()
		expect(engine.history.record.people).toBeNull()
		expect(world.nations?.titles.count).toBe(0)
		expect(world.nations?.assignment).toEqual(engine.territory.owner)
	} finally {
		detailed.mockRestore()
		placement.mockRestore()
	}
})
