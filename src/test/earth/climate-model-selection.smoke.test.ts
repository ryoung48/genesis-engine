import { describe, expect, it } from "vitest"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { TIMING } from "@/model/shared/timing"
import { loadEarthGrayscale } from "@/test/earth/assets"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

function importClimate(tideLock: TideLock | null) {
	const earth = loadEarthGrayscale("earth.png")
	return IMPORT_HEIGHTMAP.importGenesisWorld({
		params: {
			...DEFAULT_WORLD_PARAMS,
			seed: 14963991,
			numPoints: 3000,
			tideLock,
			grayscale: earth.grayscale,
			imageWidth: earth.width,
			imageHeight: earth.height,
		},
	})
}

describe("generation climate", () => {
	it.each([
		false,
		true,
	])("uses v2 monthly fields with solar lock %s", (locked) => {
		const world = importClimate(locked ? { type: "solar", target: 0 } : null)
		expect(
			TIMING.flatten(world.timings ?? []).some(
				(timing) => timing.Stage === "Post: rainfall",
			),
		).toBe(false)
		expect(world.windMonthly.u.length).toBe(12 * world.mesh.numRegions)
		for (const field of [
			world.climate.temperature_monthly,
			world.rainfall.monthly,
			world.oceanCurrents.sstMonthly,
			world.windMonthly.u,
			world.windMonthly.v,
			world.dtr_monthly,
		]) {
			expect(field?.length).toBe(12 * world.mesh.numRegions)
			expect(field?.every(Number.isFinite)).toBe(true)
		}
	}, 120000)
})
