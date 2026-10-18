import { HISTORY } from "@/model/history/record"
import type { HistoryState } from "@/model/history/record/types"
import type { PeopleContext } from "@/model/people/cast/types"
import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import { NOBILITY } from "@/model/people/nobility"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

interface ContextParams {
	world: SerializedGenesisWorld | null
	state: HistoryState
}

function of({ world, state }: ContextParams): PeopleContext {
	return {
		geography:
			world?.provinces && world.locations
				? NOBILITY.geographyOf({
						provinceAdjOffset: world.provinces.adjOffset,
						provinceAdjList: world.provinces.adjList,
						locationProvince: world.locations.locationProvince,
						locationCount: world.locations.count,
					})
				: null,
		doctrine:
			world?.religionTypes && world.religionFamilies
				? RELIGION_DOCTRINE.of({
						religionTypes: world.religionTypes,
						religionFamilies: world.religionFamilies,
						seed: world.params.seed,
					})
				: null,
		frameAt: (timeMs) => HISTORY.frameAt({ state, timeMs }),
	}
}

export const PEOPLE_CONTEXT = { of }
