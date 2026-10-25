import { describe, expect, it } from "vitest"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import type { ClimateModel } from "@/model/pipelines/types"
import { TIMING } from "@/model/shared/timing"
import { loadEarthGrayscale } from "@/test/earth/assets"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

function importClimate(climateModel: ClimateModel | undefined) {
	const earth = loadEarthGrayscale("earth.png")
	return IMPORT_HEIGHTMAP.importGenesisWorld({
		params: {
			...DEFAULT_WORLD_PARAMS,
			seed: 14963991,
			numPoints: 3000,
			tideLock: null,
			climateModel,
			grayscale: earth.grayscale,
			imageWidth: earth.width,
			imageHeight: earth.height,
		},
	})
}

describe("generation climate selection", () => {
	it("restores the v1 temperature, wind, currents and rain path", () => {
		const world = importClimate("v1")
		expect(world.params.climateModel).toBe("v1")
		expect(
			TIMING.flatten(world.timings ?? []).some(
				(timing) => timing.Stage === "Post: rainfall",
			),
		).toBe(true)
		expect(world.windMonthly).toBeUndefined()
		for (const field of [
			world.climate.temperature_monthly,
			world.wind.windSpeed,
			world.oceanCurrents.sstMonthly,
			world.rainfall.monthly,
		]) {
			expect(field.length).toBeGreaterThan(0)
			expect(field.every(Number.isFinite)).toBe(true)
			expect(field.some((value) => value !== 0)).toBe(true)
		}
	}, 120000)
	it("uses v2 by default", () => {
		const world = importClimate(undefined)
		expect(
			TIMING.flatten(world.timings ?? []).some(
				(timing) => timing.Stage === "Post: rainfall",
			),
		).toBe(false)
		expect(world.windMonthly?.u.length).toBe(12 * world.mesh.numRegions)
	}, 120000)
})
