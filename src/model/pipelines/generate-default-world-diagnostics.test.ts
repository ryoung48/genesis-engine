import { describe, expect, it } from "vitest"
import { ROUTE_LAND_MAJOR, ROUTE_SEA } from "@/model/transport/worker-types"
import {
	collectSeaRoutePortDiagnostics,
	selectTimingStages,
} from "./generate-default-world-diagnostics"

describe("collectSeaRoutePortDiagnostics", () => {
	it("reports eligible ports with no sea routes", () => {
		const result = collectSeaRoutePortDiagnostics({
			urbanPopulation: Float32Array.from([7_500, 9_000, 12_000, 20_000, 3_000]),
			settlementRegions: Int32Array.from([10, 11, 12, 13, 14]),
			settlementWaterLandmarks: Int32Array.from([2, 2, 2, -1, 2]),
			settlementPortRegions: Int32Array.from([20, 21, 22, -1, 24]),
			routes: [
				{
					fromProvince: 0,
					toProvince: 1,
					kind: ROUTE_SEA,
					pathRegions: [10, 20, 21, 11],
				},
				{
					fromProvince: 0,
					toProvince: 3,
					kind: ROUTE_LAND_MAJOR,
					pathRegions: [10, 13],
				},
			],
			minPopulation: 5_000,
		})

		expect(result.eligiblePorts).toBe(3)
		expect(result.portsWithSeaRoutes).toBe(2)
		expect(result.missingPorts).toEqual([
			{
				province: 2,
				urbanPopulation: 12_000,
				anchorRegion: 12,
				portRegion: 22,
				waterLandmark: 2,
				seaRouteCount: 0,
			},
		])
	})

	it("filters timing rows by prefix", () => {
		expect(
			selectTimingStages(
				[
					{ Stage: "mesh", ms: "10.0" },
					{ Stage: "initHistory:computeRoutes", ms: "20.0" },
					{ Stage: "computeRoutes:appendSeaRoutes", ms: "30.0" },
				],
				["initHistory:", "computeRoutes:"],
			),
		).toEqual([
			{ Stage: "initHistory:computeRoutes", ms: "20.0" },
			{ Stage: "computeRoutes:appendSeaRoutes", ms: "30.0" },
		])
	})
})
