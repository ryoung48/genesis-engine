import { expect, it, vi } from "vitest"
import { DISTRIBUTION_ENGINE } from "@/model/history/distribution/engine"
import { DISTRIBUTION_STATUS } from "@/model/history/distribution/status"
import { DATE } from "@/model/history/earth/date"
import { NATIONS } from "@/model/history/sim/nations"
import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

it("starts distribution with one stateless origin without detailed political assembly", () => {
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
		expect(placement).not.toHaveBeenCalled()
		const engine = DISTRIBUTION_ENGINE.create({
			world: world as unknown as SerializedGenesisWorld,
		})
		expect(placement).not.toHaveBeenCalled()
		expect(engine.history.record.minTimeMs).toBe(
			DATE.eu4DateToTimeMs("-79999.1.1"),
		)
		expect(engine.history.record.titles).toBeNull()
		expect(world.nations?.titles.count).toBe(0)
		expect(engine.territory.countries.size).toBe(0)
		expect(
			[...engine.territory.owner].filter((owner) =>
				DISTRIBUTION_STATUS.isStateless({ owner }),
			),
		).toHaveLength(1)
	} finally {
		detailed.mockRestore()
		placement.mockRestore()
	}
})
