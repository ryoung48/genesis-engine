import { ROUTES } from "@/model/society/infrastructure/trade/routing/network"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { RoadDisplayParams } from "@/ui/genesis/view/road-display/types"

function of({ world, frame, visible }: RoadDisplayParams) {
	return {
		routes: TRANSPORT.packRoutes(frame.routes),
		network:
			visible && world.provinces
				? TRANSPORT.packNetwork(
						ROUTES.network({
							routes: frame.routes,
							state: world.provinces,
							urbanPopulation: frame.provincePopulationUrban,
						}),
					)
				: null,
	}
}
export const ROAD_DISPLAY = { of }
