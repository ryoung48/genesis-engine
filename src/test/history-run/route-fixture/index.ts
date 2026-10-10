import { ROUTES } from "@/model/society/infrastructure/trade/routing/network"
import type {
	RouteInputs,
	RouteWorldInput,
} from "@/model/society/infrastructure/trade/routing/types"
import type { RouteFixtureParams } from "@/test/history-run/route-fixture/types"

function create({ sea, landCount }: RouteFixtureParams) {
	const angles = sea
		? [0, 0, 1, 0.3, 0.3]
		: Array.from(Array(landCount).keys(), (i) => i * 0.01)
	const count = angles.length
	const provinces = sea ? 2 : landCount
	const adjacency = Array.from(Array(count).keys(), (i) =>
		[i - 1, i + 1].filter((n) => n >= 0 && n < count),
	)
	const adjOffset = new Int32Array(count + 1)
	for (let i = 0; i < count; i++)
		adjOffset[i + 1] = adjOffset[i] + adjacency[i].length
	const adjList = Int32Array.from(adjacency.flat())
	const world: RouteWorldInput = {
		mesh: {
			r_xyz: Float32Array.from(
				angles.flatMap((angle, i) => {
					const z = sea ? 0 : (i % 2) * 0.002
					const scale = Math.sqrt(1 - z * z)
					return [Math.cos(angle) * scale, Math.sin(angle) * scale, z]
				}),
			),
			adjOffset,
			adjList,
		},
		params: { era: "lateMedieval", planetRadiusKm: 6371 },
		provinces: {
			count: provinces,
			desolate: new Uint8Array(provinces),
			regionProvince: sea
				? Int32Array.from([0, -1, -1, -1, 1])
				: Int32Array.from(Array.from(Array(provinces).keys())),
			adjOffset: Int32Array.from([0, 1, 2]),
			adjList: Int32Array.from([1, 0]),
		},
		nations: { sovereign: new Int32Array(provinces) },
		landmarks: {
			count: sea ? 2 : 1,
			size: Int32Array.from(sea ? [2, 3] : [count]),
			type: new Uint8Array(sea ? 2 : 1),
			regionLandmark: Int32Array.from(
				sea ? [0, 1, 1, 1, 0] : Array(count).fill(0),
			),
		},
		isLand: Uint8Array.from(sea ? [1, 0, 0, 0, 1] : Array(count).fill(1)),
	}
	const inputs: RouteInputs = {
		urbanPopulation: new Float32Array(provinces).fill(2000),
		settlementRegions: Int32Array.from(
			sea ? [0, count - 1] : Array.from(Array(provinces).keys()),
		),
		settlementWaterLandmarks: Int32Array.from(
			sea ? [1, 1] : Array(provinces).fill(-1),
		),
		settlementPortRegions: Int32Array.from(
			sea ? [1, 3] : Array(provinces).fill(-1),
		),
	}
	return { world, inputs, state: ROUTES.createState({ world, inputs }) }
}
export const ROUTE_FIXTURE = { create }
